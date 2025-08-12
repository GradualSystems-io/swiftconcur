import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { stripe } from '@/lib/stripe';

export async function POST(request: NextRequest) {
  const supabase = createClient();
  
  try {
    // Security: Verify user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const { action } = await request.json();
    
    // Get user's active subscription
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .in('status', ['active', 'trialing', 'past_due'])
      .single();
    
    if (!subscription) {
      return NextResponse.json(
        { error: 'No active subscription found' },
        { status: 404 }
      );
    }
    
    switch (action) {
      case 'cancel':
        return await handleCancelSubscription(subscription.stripe_subscription_id);
        
      case 'reactivate':
        return await handleReactivateSubscription(subscription.stripe_subscription_id);
        
      case 'portal':
        return await createCustomerPortalSession(subscription.stripe_customer_id);
        
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
    
  } catch (error) {
    console.error('Billing management error:', error);
    return NextResponse.json(
      { error: 'Failed to manage billing' },
      { status: 500 }
    );
  }
}

async function handleCancelSubscription(subscriptionId: string) {
  try {
    // Cancel at period end to avoid immediate loss of access
    const subscription = await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true,
    });
    
    return NextResponse.json({
      success: true,
      message: 'Subscription will be canceled at the end of the current billing period',
      cancelAt: new Date(subscription.current_period_end * 1000),
    });
    
  } catch (error) {
    console.error('Failed to cancel subscription:', error);
    return NextResponse.json(
      { error: 'Failed to cancel subscription' },
      { status: 500 }
    );
  }
}

async function handleReactivateSubscription(subscriptionId: string) {
  try {
    // Remove the cancellation
    const subscription = await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: false,
    });
    
    return NextResponse.json({
      success: true,
      message: 'Subscription reactivated successfully',
    });
    
  } catch (error) {
    console.error('Failed to reactivate subscription:', error);
    return NextResponse.json(
      { error: 'Failed to reactivate subscription' },
      { status: 500 }
    );
  }
}

async function createCustomerPortalSession(customerId: string) {
  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${process.env.NEXT_PUBLIC_APP_URL}/billing`,
    });
    
    return NextResponse.json({
      success: true,
      url: session.url,
    });
    
  } catch (error) {
    console.error('Failed to create portal session:', error);
    return NextResponse.json(
      { error: 'Failed to create portal session' },
      { status: 500 }
    );
  }
}