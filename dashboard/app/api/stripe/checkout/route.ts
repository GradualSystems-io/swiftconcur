import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getStripe, createStripeCustomer } from '@/lib/stripe';
import { PLANS } from '@/lib/billing/plans';

export async function POST(request: NextRequest) {
  const supabase = createClient();
  
  try {
    // Security: Verify user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const { planId, successUrl, cancelUrl } = await request.json();
    
    // Security: Validate plan ID
    const plan = PLANS[planId];
    if (!plan || !plan.stripePriceId) {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
    }
    
    // Get or create Stripe customer
    let { data: customerRecord } = await supabase
      .from('stripe_customers')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .single();
    
    let customerId: string;
    
    if (!customerRecord) {
      // Create new Stripe customer
      const stripeCustomer = await createStripeCustomer(
        user.email!,
        user.id,
        { plan: planId }
      );
      customerId = stripeCustomer.id;
      
      // Store customer record
      await supabase.from('stripe_customers').insert({
        user_id: user.id,
        stripe_customer_id: customerId,
        email: user.email!,
      });
    } else {
      customerId = customerRecord.stripe_customer_id;
    }
    
    // Check if user already has an active subscription
    const { data: existingSubscription } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .in('status', ['active', 'trialing'])
      .single();
    
    if (existingSubscription) {
      return NextResponse.json(
        { error: 'User already has an active subscription' },
        { status: 400 }
      );
    }
    
    // Create checkout session
    const session = await getStripe().checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [
        {
          price: plan.stripePriceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: successUrl || `${process.env.NEXT_PUBLIC_APP_URL}/billing?success=true`,
      cancel_url: cancelUrl || `${process.env.NEXT_PUBLIC_APP_URL}/billing?canceled=true`,
      allow_promotion_codes: true,
      billing_address_collection: 'required',
      metadata: {
        userId: user.id,
        planId: planId,
      },
      subscription_data: {
        metadata: {
          userId: user.id,
          planId: planId,
        },
      },
    });
    
    return NextResponse.json({ sessionId: session.id, url: session.url });
    
  } catch (error) {
    console.error('Checkout session creation error:', error);
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}