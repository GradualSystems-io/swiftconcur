import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/stripe/checkout/route';

// Mock Stripe
const mockStripe = {
  checkout: {
    sessions: {
      create: jest.fn(),
    },
  },
};

jest.mock('@/lib/stripe', () => ({
  stripe: mockStripe,
  createStripeCustomer: jest.fn(),
}));

// Mock Supabase
const mockSupabase = {
  auth: {
    getUser: jest.fn(),
  },
  from: jest.fn(() => mockSupabase),
  select: jest.fn(() => mockSupabase),
  eq: jest.fn(() => mockSupabase),
  single: jest.fn(() => mockSupabase),
  insert: jest.fn(() => mockSupabase),
  in: jest.fn(() => mockSupabase),
};

jest.mock('@/lib/supabase/server', () => ({
  createClient: () => mockSupabase,
}));

describe('Stripe Checkout API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NEXT_PUBLIC_APP_URL = 'https://test.com';
  });
  
  it('creates checkout session for authenticated user', async () => {
    // Mock authenticated user
    mockSupabase.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: 'user_123', email: 'test@example.com' } },
      error: null,
    });
    
    // Mock existing customer
    mockSupabase.single
      .mockResolvedValueOnce({
        data: { stripe_customer_id: 'cus_existing' },
        error: null,
      })
      .mockResolvedValueOnce({
        data: null, // No existing subscription
        error: null,
      });
    
    // Mock Stripe checkout session creation
    mockStripe.checkout.sessions.create.mockResolvedValueOnce({
      id: 'cs_test_123',
      url: 'https://checkout.stripe.com/pay/cs_test_123',
    });
    
    const request = new NextRequest('http://localhost/api/stripe/checkout', {
      method: 'POST',
      body: JSON.stringify({
        planId: 'pro',
        successUrl: 'https://test.com/success',
        cancelUrl: 'https://test.com/cancel',
      }),
      headers: { 'Content-Type': 'application/json' },
    });
    
    const response = await POST(request);
    expect(response.status).toBe(200);
    
    const responseData = await response.json();
    expect(responseData.sessionId).toBe('cs_test_123');
    expect(responseData.url).toBe('https://checkout.stripe.com/pay/cs_test_123');
    
    // Verify Stripe session creation parameters
    expect(mockStripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: 'cus_existing',
        mode: 'subscription',
        line_items: [{
          price: expect.any(String),
          quantity: 1,
        }],
        metadata: {
          userId: 'user_123',
          planId: 'pro',
        },
        subscription_data: {
          metadata: {
            userId: 'user_123',
            planId: 'pro',
          },
        },
        allow_promotion_codes: true,
        billing_address_collection: 'required',
      })
    );
  });
  
  it('creates new Stripe customer if none exists', async () => {
    const { createStripeCustomer } = require('@/lib/stripe');
    
    // Mock authenticated user
    mockSupabase.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: 'user_456', email: 'newuser@example.com' } },
      error: null,
    });
    
    // Mock no existing customer
    mockSupabase.single
      .mockResolvedValueOnce({
        data: null,
        error: null,
      })
      .mockResolvedValueOnce({
        data: null, // No existing subscription
        error: null,
      });
    
    // Mock Stripe customer creation
    createStripeCustomer.mockResolvedValueOnce({
      id: 'cus_new_123',
    });
    
    mockStripe.checkout.sessions.create.mockResolvedValueOnce({
      id: 'cs_test_456',
      url: 'https://checkout.stripe.com/pay/cs_test_456',
    });
    
    const request = new NextRequest('http://localhost/api/stripe/checkout', {
      method: 'POST',
      body: JSON.stringify({ planId: 'pro' }),
      headers: { 'Content-Type': 'application/json' },
    });
    
    await POST(request);
    
    // Verify new customer was created
    expect(createStripeCustomer).toHaveBeenCalledWith(
      'newuser@example.com',
      'user_456',
      { plan: 'pro' }
    );
    
    // Verify customer record was stored
    expect(mockSupabase.insert).toHaveBeenCalledWith({
      user_id: 'user_456',
      stripe_customer_id: 'cus_new_123',
      email: 'newuser@example.com',
    });
  });
  
  it('rejects unauthenticated requests', async () => {
    // Mock unauthenticated user
    mockSupabase.auth.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: { message: 'Not authenticated' },
    });
    
    const request = new NextRequest('http://localhost/api/stripe/checkout', {
      method: 'POST',
      body: JSON.stringify({ planId: 'pro' }),
      headers: { 'Content-Type': 'application/json' },
    });
    
    const response = await POST(request);
    expect(response.status).toBe(401);
    
    const responseData = await response.json();
    expect(responseData.error).toBe('Unauthorized');
  });
  
  it('rejects invalid plan IDs', async () => {
    mockSupabase.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: 'user_123', email: 'test@example.com' } },
      error: null,
    });
    
    const request = new NextRequest('http://localhost/api/stripe/checkout', {
      method: 'POST',
      body: JSON.stringify({ planId: 'invalid_plan' }),
      headers: { 'Content-Type': 'application/json' },
    });
    
    const response = await POST(request);
    expect(response.status).toBe(400);
    
    const responseData = await response.json();
    expect(responseData.error).toBe('Invalid plan');
  });
  
  it('prevents checkout for users with existing subscription', async () => {
    mockSupabase.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: 'user_123', email: 'test@example.com' } },
      error: null,
    });
    
    // Mock existing customer
    mockSupabase.single
      .mockResolvedValueOnce({
        data: { stripe_customer_id: 'cus_existing' },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { // Existing active subscription
          id: 'sub_existing',
          status: 'active',
          plan_id: 'pro',
        },
        error: null,
      });
    
    const request = new NextRequest('http://localhost/api/stripe/checkout', {
      method: 'POST',
      body: JSON.stringify({ planId: 'enterprise' }),
      headers: { 'Content-Type': 'application/json' },
    });
    
    const response = await POST(request);
    expect(response.status).toBe(400);
    
    const responseData = await response.json();
    expect(responseData.error).toBe('User already has an active subscription');
  });
  
  it('handles Stripe API errors gracefully', async () => {
    mockSupabase.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: 'user_123', email: 'test@example.com' } },
      error: null,
    });
    
    mockSupabase.single
      .mockResolvedValueOnce({
        data: { stripe_customer_id: 'cus_existing' },
        error: null,
      })
      .mockResolvedValueOnce({
        data: null, // No existing subscription
        error: null,
      });
    
    // Mock Stripe error
    mockStripe.checkout.sessions.create.mockRejectedValueOnce(
      new Error('Stripe API error')
    );
    
    const request = new NextRequest('http://localhost/api/stripe/checkout', {
      method: 'POST',
      body: JSON.stringify({ planId: 'pro' }),
      headers: { 'Content-Type': 'application/json' },
    });
    
    const response = await POST(request);
    expect(response.status).toBe(500);
    
    const responseData = await response.json();
    expect(responseData.error).toBe('Failed to create checkout session');
  });
  
  it('uses default URLs when not provided', async () => {
    mockSupabase.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: 'user_123', email: 'test@example.com' } },
      error: null,
    });
    
    mockSupabase.single
      .mockResolvedValueOnce({
        data: { stripe_customer_id: 'cus_existing' },
        error: null,
      })
      .mockResolvedValueOnce({
        data: null,
        error: null,
      });
    
    mockStripe.checkout.sessions.create.mockResolvedValueOnce({
      id: 'cs_test',
      url: 'https://checkout.stripe.com/pay/cs_test',
    });
    
    const request = new NextRequest('http://localhost/api/stripe/checkout', {
      method: 'POST',
      body: JSON.stringify({ planId: 'pro' }),
      headers: { 'Content-Type': 'application/json' },
    });
    
    await POST(request);
    
    expect(mockStripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        success_url: 'https://test.com/billing?success=true',
        cancel_url: 'https://test.com/billing?canceled=true',
      })
    );
  });
});
/** @jest-environment node */
