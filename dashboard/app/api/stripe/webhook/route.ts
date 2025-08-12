import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@/lib/supabase/server';
import { verifyStripeWebhook } from '@/lib/stripe';
import { getPlanByStripePrice } from '@/lib/billing/plans';
import { initializeUsageLimits } from '@/lib/billing/usage';

// Get webhook secret with runtime validation
function getWebhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error('STRIPE_WEBHOOK_SECRET is required');
  }
  return secret;
}

export async function POST(request: NextRequest) {
  const supabase = createClient();
  
  try {
    // Get the raw body for signature verification
    const body = await request.text();
    const signature = request.headers.get('stripe-signature');
    
    // Security: Verify webhook signature
    const event = verifyStripeWebhook(body, signature, getWebhookSecret());
    
    // Security: Log all events for audit trail
    await supabase.from('billing_events').insert({
      stripe_event_id: event.id,
      event_type: event.type,
      event_data: event,
      processing_status: 'pending',
    });
    
    console.log(`Processing Stripe webhook: ${event.type} (${event.id})`);
    
    // Process event based on type
    switch (event.type) {
      case 'customer.subscription.created':
        await handleSubscriptionCreated(event);
        break;
        
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event);
        break;
        
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event);
        break;
        
      case 'invoice.payment_succeeded':
        await handlePaymentSucceeded(event);
        break;
        
      case 'invoice.payment_failed':
        await handlePaymentFailed(event);
        break;
        
      case 'customer.created':
        await handleCustomerCreated(event);
        break;
        
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }
    
    // Mark event as processed
    await supabase
      .from('billing_events')
      .update({ processing_status: 'processed' })
      .eq('stripe_event_id', event.id);
    
    return NextResponse.json({ received: true }, { status: 200 });
    
  } catch (error) {
    console.error('Stripe webhook error:', error);
    
    // Mark event as failed if we can identify it
    if (error instanceof Error && 'id' in error) {
      await supabase
        .from('billing_events')
        .update({ processing_status: 'failed' })
        .eq('stripe_event_id', (error as any).id);
    }
    
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    );
  }
}

async function handleCustomerCreated(event: Stripe.Event) {
  const customer = event.data.object as Stripe.Customer;
  const supabase = createClient();
  
  // Security: Only process if customer has metadata with user ID
  if (!customer.metadata?.userId || !customer.email) {
    console.warn('Customer created without required metadata or email');
    return;
  }
  
  try {
    await supabase.from('stripe_customers').upsert({
      user_id: customer.metadata.userId,
      stripe_customer_id: customer.id,
      email: customer.email,
      updated_at: new Date().toISOString(),
    });
    
    console.log(`Created customer record for user ${customer.metadata.userId}`);
  } catch (error) {
    console.error('Failed to create customer record:', error);
    throw error;
  }
}

async function handleSubscriptionCreated(event: Stripe.Event) {
  const subscription = event.data.object as Stripe.Subscription;
  const supabase = createClient();
  
  try {
    // Get customer to find user ID
    const { data: customer } = await supabase
      .from('stripe_customers')
      .select('user_id')
      .eq('stripe_customer_id', subscription.customer as string)
      .single();
    
    if (!customer) {
      throw new Error(`Customer not found: ${subscription.customer}`);
    }
    
    // Get plan information from price ID
    const priceId = subscription.items.data[0]?.price?.id;
    if (!priceId) {
      throw new Error('No price ID found in subscription');
    }
    
    const plan = getPlanByStripePrice(priceId);
    if (!plan) {
      throw new Error(`Unknown price ID: ${priceId}`);
    }
    
    // Create subscription record
    const { data: newSubscription } = await supabase
      .from('subscriptions')
      .insert({
        user_id: customer.user_id,
        stripe_subscription_id: subscription.id,
        stripe_customer_id: subscription.customer as string,
        plan_id: plan.id,
        status: subscription.status,
        current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
        current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
        cancel_at_period_end: subscription.cancel_at_period_end,
        canceled_at: subscription.canceled_at ? new Date(subscription.canceled_at * 1000).toISOString() : null,
      })
      .select()
      .single();
    
    if (!newSubscription) {
      throw new Error('Failed to create subscription record');
    }
    
    // Initialize usage limits for the billing period
    await initializeUsageLimits(newSubscription.id, plan.id);
    
    console.log(`✅ New subscription created: ${customer.user_id} on ${plan.displayName}`);
    
  } catch (error) {
    console.error('Failed to handle subscription creation:', error);
    throw error;
  }
}

async function handleSubscriptionUpdated(event: Stripe.Event) {
  const subscription = event.data.object as Stripe.Subscription;
  const supabase = createClient();
  
  try {
    // Get current subscription record
    const { data: currentSub } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('stripe_subscription_id', subscription.id)
      .single();
    
    if (!currentSub) {
      console.warn(`Subscription not found: ${subscription.id}`);
      return;
    }
    
    // Get new plan information if price changed
    const priceId = subscription.items.data[0]?.price?.id;
    let newPlanId = currentSub.plan_id;
    
    if (priceId) {
      const plan = getPlanByStripePrice(priceId);
      if (plan && plan.id !== currentSub.plan_id) {
        newPlanId = plan.id;
        console.log(`Plan changed from ${currentSub.plan_id} to ${newPlanId}`);
      }
    }
    
    // Update subscription record
    await supabase
      .from('subscriptions')
      .update({
        plan_id: newPlanId,
        status: subscription.status,
        current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
        current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
        cancel_at_period_end: subscription.cancel_at_period_end,
        canceled_at: subscription.canceled_at ? new Date(subscription.canceled_at * 1000).toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq('stripe_subscription_id', subscription.id);
    
    // If plan changed, update usage limits
    if (newPlanId !== currentSub.plan_id) {
      await initializeUsageLimits(currentSub.id, newPlanId);
    }
    
    console.log(`✅ Subscription updated: ${subscription.id}`);
    
  } catch (error) {
    console.error('Failed to handle subscription update:', error);
    throw error;
  }
}

async function handleSubscriptionDeleted(event: Stripe.Event) {
  const subscription = event.data.object as Stripe.Subscription;
  const supabase = createClient();
  
  try {
    // Update subscription status to canceled
    await supabase
      .from('subscriptions')
      .update({
        status: 'canceled',
        canceled_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('stripe_subscription_id', subscription.id);
    
    console.log(`✅ Subscription canceled: ${subscription.id}`);
    
  } catch (error) {
    console.error('Failed to handle subscription deletion:', error);
    throw error;
  }
}

async function handlePaymentSucceeded(event: Stripe.Event) {
  const invoice = event.data.object as Stripe.Invoice;
  
  if (invoice.subscription) {
    console.log(`✅ Payment succeeded for subscription: ${invoice.subscription}`);
    // Could implement notification logic here
  }
}

async function handlePaymentFailed(event: Stripe.Event) {
  const invoice = event.data.object as Stripe.Invoice;
  const supabase = createClient();
  
  if (invoice.subscription) {
    try {
      // Update subscription status
      await supabase
        .from('subscriptions')
        .update({
          status: 'past_due',
          updated_at: new Date().toISOString(),
        })
        .eq('stripe_subscription_id', invoice.subscription as string);
      
      console.log(`❌ Payment failed for subscription: ${invoice.subscription}`);
      // Could implement notification logic here
      
    } catch (error) {
      console.error('Failed to handle payment failure:', error);
      throw error;
    }
  }
}