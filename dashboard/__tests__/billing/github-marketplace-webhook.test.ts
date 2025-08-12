import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/github/marketplace/webhook/route';
import crypto from 'crypto';

// Mock Supabase
const mockSupabase = {
  from: jest.fn(() => mockSupabase),
  insert: jest.fn(() => Promise.resolve({ data: null, error: null })),
  update: jest.fn(() => Promise.resolve({ data: null, error: null })),
  select: jest.fn(() => mockSupabase),
  eq: jest.fn(() => mockSupabase),
  single: jest.fn(() => mockSupabase),
  rpc: jest.fn(() => Promise.resolve({ data: 'sub_123', error: null })),
};

jest.mock('@/lib/supabase/server', () => ({
  createClient: () => mockSupabase,
}));

jest.mock('@/lib/billing/usage', () => ({
  initializeUsageLimits: jest.fn(),
}));

function generateGitHubSignature(body: string, secret: string): string {
  return `sha256=${crypto.createHmac('sha256', secret).update(body).digest('hex')}`;
}

describe('GitHub Marketplace Webhook Handler', () => {
  const secret = 'test-github-webhook-secret';
  process.env.GITHUB_WEBHOOK_SECRET = secret;
  
  beforeEach(() => {
    jest.clearAllMocks();
  });
  
  it('processes marketplace purchase event correctly', async () => {
    const event = {
      action: 'purchased',
      marketplace_purchase: {
        account: {
          id: 12345,
          login: 'testorg',
          type: 'Organization',
          avatar_url: 'https://avatars.githubusercontent.com/u/12345',
        },
        plan: {
          id: 1002,
          name: 'pro',
          description: 'Pro plan',
          monthly_price_in_cents: 1200,
          yearly_price_in_cents: 12000,
          price_model: 'per_unit',
          has_free_trial: true,
          unit_name: 'repository',
          bullets: ['20k warnings/month', 'AI summaries'],
        },
        billing_cycle: 'monthly',
        unit_count: 1,
        on_free_trial: false,
        free_trial_ends_on: null,
        next_billing_date: '2024-02-01T00:00:00Z',
      },
      sender: {
        id: 12345,
        login: 'testorg',
      },
    };
    
    const body = JSON.stringify(event);
    const signature = generateGitHubSignature(body, secret);
    
    const request = new NextRequest('http://localhost/api/github/marketplace/webhook', {
      method: 'POST',
      body,
      headers: {
        'Content-Type': 'application/json',
        'x-hub-signature-256': signature,
        'x-github-delivery': 'test-delivery-id',
        'x-github-event': 'marketplace_purchase',
      },
    });
    
    const response = await POST(request);
    expect(response.status).toBe(200);
    
    const responseData = await response.json();
    expect(responseData.received).toBe(true);
    
    // Verify event was logged
    expect(mockSupabase.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        billing_provider: 'github_marketplace',
        event_type: 'marketplace_purchased',
        github_delivery_id: 'test-delivery-id',
        processing_status: 'pending',
      })
    );
    
    // Verify subscription sync was called
    expect(mockSupabase.rpc).toHaveBeenCalledWith('sync_github_subscription', {
      p_github_account_id: 12345,
      p_github_login: 'testorg',
      p_account_type: 'Organization',
      p_github_plan_id: 1002,
      p_action: 'purchased',
      p_billing_cycle: 'monthly',
      p_unit_count: 1,
      p_next_billing_date: '2024-02-01T00:00:00Z',
      p_on_free_trial: false,
      p_free_trial_ends_on: null,
    });
  });
  
  it('rejects invalid signatures', async () => {
    const request = new NextRequest('http://localhost/api/github/marketplace/webhook', {
      method: 'POST',
      body: JSON.stringify({ action: 'purchased' }),
      headers: {
        'x-hub-signature-256': 'invalid-signature',
        'x-github-event': 'marketplace_purchase',
      },
    });
    
    const response = await POST(request);
    expect(response.status).toBe(401);
  });
  
  it('ignores non-marketplace events', async () => {
    const event = { action: 'opened' };
    const body = JSON.stringify(event);
    const signature = generateGitHubSignature(body, secret);
    
    const request = new NextRequest('http://localhost/api/github/marketplace/webhook', {
      method: 'POST',
      body,
      headers: {
        'x-hub-signature-256': signature,
        'x-github-event': 'pull_request',
      },
    });
    
    const response = await POST(request);
    expect(response.status).toBe(200);
    
    // Should not process subscription sync
    expect(mockSupabase.rpc).not.toHaveBeenCalled();
  });
  
  it('handles plan change events', async () => {
    const event = {
      action: 'changed',
      marketplace_purchase: {
        account: { id: 12345, login: 'testorg', type: 'Organization' },
        plan: { id: 1003, name: 'enterprise' },
        billing_cycle: 'monthly',
        unit_count: 1,
        on_free_trial: false,
        free_trial_ends_on: null,
        next_billing_date: '2024-02-01T00:00:00Z',
      },
      previous_marketplace_purchase: {
        account: { id: 12345, login: 'testorg', type: 'Organization' },
        plan: { id: 1002, name: 'pro' },
        billing_cycle: 'monthly',
        unit_count: 1,
      },
    };
    
    const body = JSON.stringify(event);
    const signature = generateGitHubSignature(body, secret);
    
    const request = new NextRequest('http://localhost/api/github/marketplace/webhook', {
      method: 'POST',
      body,
      headers: {
        'x-hub-signature-256': signature,
        'x-github-delivery': 'change-delivery-id',
        'x-github-event': 'marketplace_purchase',
      },
    });
    
    const response = await POST(request);
    expect(response.status).toBe(200);
    
    // Verify subscription change was processed
    expect(mockSupabase.rpc).toHaveBeenCalledWith('sync_github_subscription', {
      p_github_account_id: 12345,
      p_github_login: 'testorg',
      p_account_type: 'Organization',
      p_github_plan_id: 1003,
      p_action: 'changed',
      p_billing_cycle: 'monthly',
      p_unit_count: 1,
      p_next_billing_date: '2024-02-01T00:00:00Z',
      p_on_free_trial: false,
      p_free_trial_ends_on: null,
    });
  });
  
  it('handles cancellation events', async () => {
    const event = {
      action: 'cancelled',
      marketplace_purchase: {
        account: { id: 12345, login: 'testorg', type: 'Organization' },
        plan: { id: 1002, name: 'pro' },
        billing_cycle: 'monthly',
        unit_count: 1,
      },
    };
    
    const body = JSON.stringify(event);
    const signature = generateGitHubSignature(body, secret);
    
    const request = new NextRequest('http://localhost/api/github/marketplace/webhook', {
      method: 'POST',
      body,
      headers: {
        'x-hub-signature-256': signature,
        'x-github-delivery': 'cancel-delivery-id',
        'x-github-event': 'marketplace_purchase',
      },
    });
    
    const response = await POST(request);
    expect(response.status).toBe(200);
    
    // Verify subscription cancellation was processed
    expect(mockSupabase.rpc).toHaveBeenCalledWith('sync_github_subscription', {
      p_github_account_id: 12345,
      p_github_login: 'testorg',
      p_account_type: 'Organization',
      p_github_plan_id: 1002,
      p_action: 'cancelled',
      p_billing_cycle: 'monthly',
      p_unit_count: 1,
    });
  });
  
  it('handles free trial purchases', async () => {
    const event = {
      action: 'purchased',
      marketplace_purchase: {
        account: { id: 67890, login: 'trialing-user', type: 'User' },
        plan: { id: 1002, name: 'pro' },
        billing_cycle: 'monthly',
        unit_count: 1,
        on_free_trial: true,
        free_trial_ends_on: '2024-02-15T00:00:00Z',
        next_billing_date: '2024-02-15T00:00:00Z',
      },
    };
    
    const body = JSON.stringify(event);
    const signature = generateGitHubSignature(body, secret);
    
    const request = new NextRequest('http://localhost/api/github/marketplace/webhook', {
      method: 'POST',
      body,
      headers: {
        'x-hub-signature-256': signature,
        'x-github-delivery': 'trial-delivery-id',
        'x-github-event': 'marketplace_purchase',
      },
    });
    
    const response = await POST(request);
    expect(response.status).toBe(200);
    
    // Verify trial subscription was created
    expect(mockSupabase.rpc).toHaveBeenCalledWith('sync_github_subscription', {
      p_github_account_id: 67890,
      p_github_login: 'trialing-user',
      p_account_type: 'User',
      p_github_plan_id: 1002,
      p_action: 'purchased',
      p_billing_cycle: 'monthly',
      p_unit_count: 1,
      p_next_billing_date: '2024-02-15T00:00:00Z',
      p_on_free_trial: true,
      p_free_trial_ends_on: '2024-02-15T00:00:00Z',
    });
  });
  
  it('handles pending change events', async () => {
    const event = {
      action: 'pending_change',
      effective_date: '2024-02-01T00:00:00Z',
      marketplace_purchase: {
        account: { id: 12345, login: 'testorg', type: 'Organization' },
        plan: { id: 1003, name: 'enterprise' },
        billing_cycle: 'monthly',
        unit_count: 1,
      },
    };
    
    const body = JSON.stringify(event);
    const signature = generateGitHubSignature(body, secret);
    
    const request = new NextRequest('http://localhost/api/github/marketplace/webhook', {
      method: 'POST',
      body,
      headers: {
        'x-hub-signature-256': signature,
        'x-github-delivery': 'pending-delivery-id',
        'x-github-event': 'marketplace_purchase',
      },
    });
    
    const response = await POST(request);
    expect(response.status).toBe(200);
    
    // Pending changes should only be logged, not processed
    expect(mockSupabase.insert).toHaveBeenCalled();
    expect(mockSupabase.rpc).not.toHaveBeenCalled();
  });
  
  it('marks failed events appropriately', async () => {
    const event = {
      action: 'purchased',
      marketplace_purchase: {
        account: { id: 12345, login: 'testorg', type: 'Organization' },
        plan: { id: 1002, name: 'pro' },
        billing_cycle: 'monthly',
        unit_count: 1,
      },
    };
    
    // Mock database error
    mockSupabase.rpc.mockRejectedValueOnce(new Error('Database error'));
    
    const body = JSON.stringify(event);
    const signature = generateGitHubSignature(body, secret);
    
    const request = new NextRequest('http://localhost/api/github/marketplace/webhook', {
      method: 'POST',
      body,
      headers: {
        'x-hub-signature-256': signature,
        'x-github-delivery': 'error-delivery-id',
        'x-github-event': 'marketplace_purchase',
      },
    });
    
    const response = await POST(request);
    expect(response.status).toBe(500);
    
    // Verify event was marked as failed
    expect(mockSupabase.update).toHaveBeenCalledWith({
      processing_status: 'failed',
    });
  });
});