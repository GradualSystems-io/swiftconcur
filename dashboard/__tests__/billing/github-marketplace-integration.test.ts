import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import {
  getUserGitHubSubscription,
  getGitHubAccount,
  getGitHubMarketplaceMetrics,
  getGitHubPlanByID,
  mapGitHubPlanToInternal,
  validateGitHubMarketplacePayload,
  gitHubPlanSupportsFeature,
} from '@/lib/billing/github-marketplace';

// Mock Supabase
const mockSupabase = {
  from: jest.fn(() => mockSupabase),
  select: jest.fn(() => mockSupabase),
  eq: jest.fn(() => mockSupabase),
  single: jest.fn(() => mockSupabase),
  in: jest.fn(() => mockSupabase),
  gte: jest.fn(() => mockSupabase),
};

jest.mock('@/lib/supabase/server', () => ({
  createClient: () => mockSupabase,
}));

describe('GitHub Marketplace Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  
  describe('getUserGitHubSubscription', () => {
    it('returns GitHub subscription for user', async () => {
      const mockSubscription = {
        id: 'sub_123',
        github_account_id: 12345,
        plan_id: 'pro',
        billing_cycle: 'monthly',
        status: 'active',
        unit_count: 1,
        on_free_trial: false,
        free_trial_ends_on: null,
        current_period_end: '2024-02-01T00:00:00Z',
        created_at: '2024-01-01T00:00:00Z',
        github_accounts: { github_login: 'testorg' },
      };
      
      mockSupabase.single.mockResolvedValueOnce({
        data: mockSubscription,
        error: null,
      });
      
      const result = await getUserGitHubSubscription('user_123');
      
      expect(result).toEqual({
        id: 'sub_123',
        github_account_id: 12345,
        github_login: 'testorg',
        plan_id: 'pro',
        billing_cycle: 'monthly',
        status: 'active',
        unit_count: 1,
        on_free_trial: false,
        free_trial_ends_on: null,
        current_period_end: '2024-02-01T00:00:00Z',
        created_at: '2024-01-01T00:00:00Z',
      });
      
      expect(mockSupabase.eq).toHaveBeenCalledWith('user_id', 'user_123');
      expect(mockSupabase.eq).toHaveBeenCalledWith('billing_provider', 'github_marketplace');
      expect(mockSupabase.eq).toHaveBeenCalledWith('status', 'active');
    });
    
    it('returns null when no subscription found', async () => {
      mockSupabase.single.mockResolvedValueOnce({
        data: null,
        error: null,
      });
      
      const result = await getUserGitHubSubscription('user_456');
      expect(result).toBeNull();
    });
    
    it('handles database errors gracefully', async () => {
      mockSupabase.single.mockRejectedValueOnce(new Error('Database error'));
      
      const result = await getUserGitHubSubscription('user_789');
      expect(result).toBeNull();
    });
  });
  
  describe('getGitHubAccount', () => {
    it('returns GitHub account by ID', async () => {
      const mockAccount = {
        github_account_id: 12345,
        github_login: 'testorg',
        account_type: 'Organization',
        avatar_url: 'https://avatars.githubusercontent.com/u/12345',
      };
      
      mockSupabase.single.mockResolvedValueOnce({
        data: mockAccount,
        error: null,
      });
      
      const result = await getGitHubAccount(12345);
      
      expect(result).toEqual({
        id: 12345,
        login: 'testorg',
        type: 'Organization',
        avatar_url: 'https://avatars.githubusercontent.com/u/12345',
      });
    });
    
    it('returns null when account not found', async () => {
      mockSupabase.single.mockResolvedValueOnce({
        data: null,
        error: null,
      });
      
      const result = await getGitHubAccount(99999);
      expect(result).toBeNull();
    });
  });
  
  describe('getGitHubMarketplaceMetrics', () => {
    it('calculates metrics correctly', async () => {
      // Mock total subscriptions count
      mockSupabase.select
        .mockResolvedValueOnce({ count: 42, data: null, error: null })
        .mockResolvedValueOnce({
          data: [
            { plan_id: 'pro' },
            { plan_id: 'pro' },
            { plan_id: 'enterprise' },
            { plan_id: 'free' },
          ],
          error: null,
        })
        .mockResolvedValueOnce({
          data: [
            { plan_id: 'pro', unit_count: 2, billing_cycle: 'monthly' },
            { plan_id: 'enterprise', unit_count: 1, billing_cycle: 'yearly' },
          ],
          error: null,
        })
        .mockResolvedValueOnce({ count: 5, data: null, error: null }) // recent purchases
        .mockResolvedValueOnce({ count: 10, data: null, error: null }) // trials started
        .mockResolvedValueOnce({ count: 7, data: null, error: null }); // trials converted
      
      const metrics = await getGitHubMarketplaceMetrics();
      
      expect(metrics.totalSubscriptions).toBe(42);
      expect(metrics.planBreakdown).toEqual({
        pro: 2,
        enterprise: 1,
        free: 1,
      });
      expect(metrics.recentPurchases).toBe(5);
      expect(metrics.trialConversionRate).toBe(70); // 7/10 * 100
      
      // MRR calculation: (2 * $12) + (1 * $99/12) = $24 + $8.25 = $32.25
      expect(metrics.mrr).toBe(32);
    });
    
    it('handles database errors gracefully', async () => {
      mockSupabase.select.mockRejectedValue(new Error('Database error'));
      
      const metrics = await getGitHubMarketplaceMetrics();
      
      expect(metrics).toEqual({
        totalSubscriptions: 0,
        planBreakdown: {},
        mrr: 0,
        recentPurchases: 0,
        trialConversionRate: 0,
      });
    });
  });
  
  describe('Plan utilities', () => {
    it('gets GitHub plan by ID', () => {
      const plan = getGitHubPlanByID(1002);
      expect(plan?.name).toBe('pro');
      expect(plan?.display_name).toBe('Pro');
      expect(plan?.monthly_price_in_cents).toBe(1200);
    });
    
    it('returns undefined for invalid plan ID', () => {
      const plan = getGitHubPlanByID(9999);
      expect(plan).toBeUndefined();
    });
    
    it('maps GitHub plan to internal plan ID', () => {
      expect(mapGitHubPlanToInternal(1001)).toBe('free');
      expect(mapGitHubPlanToInternal(1002)).toBe('pro');
      expect(mapGitHubPlanToInternal(1003)).toBe('enterprise');
      expect(mapGitHubPlanToInternal(9999)).toBe('free'); // fallback
    });
  });
  
  describe('Payload validation', () => {
    it('validates correct marketplace payload', () => {
      const validPayload = {
        action: 'purchased',
        marketplace_purchase: {
          account: {
            id: 12345,
            login: 'testorg',
            type: 'Organization',
          },
          plan: {
            id: 1002,
            name: 'pro',
          },
          billing_cycle: 'monthly',
        },
      };
      
      expect(validateGitHubMarketplacePayload(validPayload)).toBe(true);
    });
    
    it('rejects payload without action', () => {
      const invalidPayload = {
        marketplace_purchase: {
          account: { id: 123, login: 'test', type: 'User' },
          plan: { id: 1001, name: 'free' },
          billing_cycle: 'monthly',
        },
      };
      
      expect(validateGitHubMarketplacePayload(invalidPayload)).toBe(false);
    });
    
    it('rejects payload without marketplace_purchase', () => {
      const invalidPayload = {
        action: 'purchased',
      };
      
      expect(validateGitHubMarketplacePayload(invalidPayload)).toBe(false);
    });
    
    it('rejects payload with invalid billing cycle', () => {
      const invalidPayload = {
        action: 'purchased',
        marketplace_purchase: {
          account: { id: 123, login: 'test', type: 'User' },
          plan: { id: 1001, name: 'free' },
          billing_cycle: 'weekly', // Invalid
        },
      };
      
      expect(validateGitHubMarketplacePayload(invalidPayload)).toBe(false);
    });
    
    it('rejects payload with missing account fields', () => {
      const invalidPayload = {
        action: 'purchased',
        marketplace_purchase: {
          account: { id: 123 }, // Missing login and type
          plan: { id: 1001, name: 'free' },
          billing_cycle: 'monthly',
        },
      };
      
      expect(validateGitHubMarketplacePayload(invalidPayload)).toBe(false);
    });
  });
  
  describe('Feature access', () => {
    it('correctly identifies plan features', () => {
      expect(gitHubPlanSupportsFeature('free', 'private_repos')).toBe(false);
      expect(gitHubPlanSupportsFeature('pro', 'private_repos')).toBe(true);
      expect(gitHubPlanSupportsFeature('pro', 'ai_summaries')).toBe(true);
      expect(gitHubPlanSupportsFeature('pro', 'sso')).toBe(false);
      expect(gitHubPlanSupportsFeature('enterprise', 'sso')).toBe(true);
      expect(gitHubPlanSupportsFeature('enterprise', 'audit_logs')).toBe(true);
    });
    
    it('returns false for unknown features', () => {
      expect(gitHubPlanSupportsFeature('pro', 'unknown_feature')).toBe(false);
    });
    
    it('returns false for unknown plans', () => {
      expect(gitHubPlanSupportsFeature('unknown_plan', 'ai_summaries')).toBe(false);
    });
  });
});