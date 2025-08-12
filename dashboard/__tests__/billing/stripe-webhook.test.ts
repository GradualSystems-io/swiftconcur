import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/stripe/webhook/route';
import crypto from 'crypto';

// Mock Stripe
jest.mock('stripe', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    webhooks: {
      constructEvent: jest.fn(),
    },
  })),
}));

// Mock Supabase
const mockSupabase = {
  from: jest.fn(() => mockSupabase),
  insert: jest.fn(() => Promise.resolve({ data: null, error: null })),
  update: jest.fn(() => Promise.resolve({ data: null, error: null })),
  select: jest.fn(() => mockSupabase),
  eq: jest.fn(() => mockSupabase),
  single: jest.fn(() => Promise.resolve({ data: null, error: null })),
  upsert: jest.fn(() => Promise.resolve({ data: null, error: null })),
};

jest.mock('@/lib/supabase/server', () => ({
  createClient: () => mockSupabase,
}));

jest.mock('@/lib/stripe', () => ({
  verifyStripeWebhook: jest.fn(),
}));

jest.mock('@/lib/billing/usage', () => ({
  initializeUsageLimits: jest.fn(),
}));

function generateTestSignature(body: string, secret: string): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const payload = `${timestamp}.${body}`;
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return `t=${timestamp},v1=${signature}`;
}

describe('Stripe Webhook Handler', () => {
  const secret = 'whsec_test_secret';
  process.env.STRIPE_WEBHOOK_SECRET = secret;
  
  beforeEach(() => {
    jest.clearAllMocks();
  });
  
  it('processes customer.subscription.created event correctly', async () => {
    const event = {
      id: 'evt_test_123',
      type: 'customer.subscription.created',
      data: {
        object: {
          id: 'sub_test_123',
          customer: 'cus_test_123',
          status: 'active',
          current_period_start: 1640995200, // 2022-01-01
          current_period_end: 1643673600,   // 2022-02-01
          cancel_at_period_end: false,
          canceled_at: null,
          items: {
            data: [{
              price: {
                id: 'price_pro_test',
              },
            }],
          },
        },
      },
    };
    
    const body = JSON.stringify(event);
    const signature = generateTestSignature(body, secret);
    
    // Mock customer lookup
    mockSupabase.single.mockResolvedValueOnce({
      data: { user_id: 'user_123' },
      error: null,
    });
    
    // Mock subscription creation
    mockSupabase.single.mockResolvedValueOnce({
      data: { id: 'sub_uuid_123' },
      error: null,
    });
    
    const request = new NextRequest('http://localhost/api/stripe/webhook', {
      method: 'POST',
      body,
      headers: {
        'Content-Type': 'application/json',
        'stripe-signature': signature,
      },
    });
    
    const { verifyStripeWebhook } = require('@/lib/stripe');
    verifyStripeWebhook.mockReturnValue(event);
    
    const response = await POST(request);
    expect(response.status).toBe(200);
    
    const responseData = await response.json();
    expect(responseData.received).toBe(true);
  });
  
  it('rejects invalid signatures', async () => {
    const request = new NextRequest('http://localhost/api/stripe/webhook', {
      method: 'POST',
      body: JSON.stringify({ type: 'customer.subscription.created' }),
      headers: {
        'stripe-signature': 'invalid-signature',
      },
    });
    
    const { verifyStripeWebhook } = require('@/lib/stripe');
    verifyStripeWebhook.mockImplementation(() => {
      throw new Error('Webhook signature verification failed');
    });
    
    const response = await POST(request);
    expect(response.status).toBe(500);
  });
  
  it('handles subscription updates correctly', async () => {
    const event = {
      id: 'evt_test_456',
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_test_123',
          customer: 'cus_test_123',
          status: 'active',
          current_period_start: 1640995200,
          current_period_end: 1643673600,
          cancel_at_period_end: true,
          canceled_at: 1643673600,
          items: {
            data: [{
              price: {
                id: 'price_pro_test',
              },
            }],
          },
        },
      },
    };
    
    const body = JSON.stringify(event);
    const signature = generateTestSignature(body, secret);
    
    // Mock existing subscription lookup
    mockSupabase.single.mockResolvedValueOnce({
      data: { 
        id: 'sub_uuid_123',
        plan_id: 'pro',
        user_id: 'user_123',
      },
      error: null,
    });
    
    const request = new NextRequest('http://localhost/api/stripe/webhook', {
      method: 'POST',
      body,
      headers: {
        'stripe-signature': signature,
      },
    });
    
    const { verifyStripeWebhook } = require('@/lib/stripe');
    verifyStripeWebhook.mockReturnValue(event);
    
    const response = await POST(request);
    expect(response.status).toBe(200);
    
    // Verify subscription was updated
    expect(mockSupabase.update).toHaveBeenCalledWith(
      expect.objectContaining({
        cancel_at_period_end: true,
        status: 'active',
      })
    );
  });
  
  it('handles subscription cancellation', async () => {
    const event = {
      id: 'evt_test_789',
      type: 'customer.subscription.deleted',
      data: {
        object: {
          id: 'sub_test_123',
          status: 'canceled',
        },
      },
    };
    
    const body = JSON.stringify(event);
    const signature = generateTestSignature(body, secret);
    
    const request = new NextRequest('http://localhost/api/stripe/webhook', {
      method: 'POST',
      body,
      headers: {
        'stripe-signature': signature,
      },
    });
    
    const { verifyStripeWebhook } = require('@/lib/stripe');
    verifyStripeWebhook.mockReturnValue(event);
    
    const response = await POST(request);
    expect(response.status).toBe(200);
    
    // Verify subscription was marked as canceled
    expect(mockSupabase.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'canceled',
        canceled_at: expect.any(String),
      })
    );
  });
  
  it('logs all events for audit trail', async () => {
    const event = {
      id: 'evt_test_audit',
      type: 'customer.created',
      data: { object: { id: 'cus_test' } },
    };
    
    const body = JSON.stringify(event);
    const signature = generateTestSignature(body, secret);
    
    const request = new NextRequest('http://localhost/api/stripe/webhook', {
      method: 'POST',
      body,
      headers: {
        'stripe-signature': signature,
      },
    });
    
    const { verifyStripeWebhook } = require('@/lib/stripe');
    verifyStripeWebhook.mockReturnValue(event);
    
    await POST(request);
    
    // Verify event was logged
    expect(mockSupabase.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        stripe_event_id: 'evt_test_audit',
        event_type: 'customer.created',
        processing_status: 'pending',
      })
    );
    
    // Verify event was marked as processed
    expect(mockSupabase.update).toHaveBeenCalledWith({
      processing_status: 'processed',
    });
  });
  
  it('handles payment failures correctly', async () => {
    const event = {
      id: 'evt_test_payment_failed',
      type: 'invoice.payment_failed',
      data: {
        object: {
          subscription: 'sub_test_123',
          id: 'in_test_failed',
        },
      },
    };
    
    const body = JSON.stringify(event);
    const signature = generateTestSignature(body, secret);
    
    const request = new NextRequest('http://localhost/api/stripe/webhook', {
      method: 'POST',
      body,
      headers: {
        'stripe-signature': signature,
      },
    });
    
    const { verifyStripeWebhook } = require('@/lib/stripe');
    verifyStripeWebhook.mockReturnValue(event);
    
    const response = await POST(request);
    expect(response.status).toBe(200);
    
    // Verify subscription was marked as past_due
    expect(mockSupabase.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'past_due',
      })
    );
  });
});