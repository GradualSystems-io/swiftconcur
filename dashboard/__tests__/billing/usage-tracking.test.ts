import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { 
  checkUsageLimit, 
  incrementUsage, 
  getUsageStats,
  canUserAccessFeature,
  getUserSubscription
} from '@/lib/billing/usage';

// Mock Supabase
const mockSupabase = {
  from: jest.fn(() => mockSupabase),
  select: jest.fn(() => mockSupabase),
  eq: jest.fn(() => mockSupabase),
  single: jest.fn(() => mockSupabase),
  rpc: jest.fn(() => mockSupabase),
  auth: {
    getUser: jest.fn(() => Promise.resolve({ 
      data: { user: { id: 'test_user_id' } }, 
      error: null 
    })),
  },
};

jest.mock('@/lib/supabase/server', () => ({
  createClient: () => mockSupabase,
}));

describe('Usage Tracking', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  
  describe('checkUsageLimit', () => {
    it('allows usage within limits', async () => {
      // Mock subscription ownership verification
      mockSupabase.single
        .mockResolvedValueOnce({
          data: { user_id: 'test_user_id', plan_id: 'pro' },
          error: null,
        })
        .mockResolvedValueOnce({
          data: {
            warnings_limit: 1000,
            current_warnings: 500,
            api_calls_limit: 100,
            current_api_calls: 25,
          },
          error: null,
        });
      
      const result = await checkUsageLimit('sub_123', 'warnings_processed', 10);
      
      expect(result.allowed).toBe(true);
      expect(result.current).toBe(500);
      expect(result.limit).toBe(1000);
      expect(result.upgradeUrl).toBeUndefined();
    });
    
    it('blocks usage when limit exceeded', async () => {
      mockSupabase.single
        .mockResolvedValueOnce({
          data: { user_id: 'test_user_id', plan_id: 'free' },
          error: null,
        })
        .mockResolvedValueOnce({
          data: {
            warnings_limit: 500,
            current_warnings: 495,
            api_calls_limit: 10,
            current_api_calls: 8,
          },
          error: null,
        });
      
      const result = await checkUsageLimit('sub_123', 'warnings_processed', 10);
      
      expect(result.allowed).toBe(false);
      expect(result.current).toBe(495);
      expect(result.limit).toBe(500);
      expect(result.upgradeUrl).toContain('warnings_processed_limit_exceeded');
    });
    
    it('blocks unauthorized access', async () => {
      // Mock unauthorized user
      mockSupabase.auth.getUser.mockResolvedValueOnce({
        data: { user: { id: 'different_user_id' } },
        error: null,
      });
      
      mockSupabase.single.mockResolvedValueOnce({
        data: { user_id: 'test_user_id', plan_id: 'pro' },
        error: null,
      });
      
      await expect(checkUsageLimit('sub_123', 'warnings_processed', 1))
        .rejects.toThrow('Unauthorized access to subscription');
    });
    
    it('handles subscription not found', async () => {
      mockSupabase.single.mockResolvedValueOnce({
        data: null,
        error: null,
      });
      
      const result = await checkUsageLimit('nonexistent_sub', 'warnings_processed', 1);
      
      expect(result.allowed).toBe(false);
      expect(result.current).toBe(0);
      expect(result.limit).toBe(0);
    });
  });
  
  describe('incrementUsage', () => {
    it('successfully increments usage within limits', async () => {
      mockSupabase.rpc.mockResolvedValueOnce({
        data: [{
          allowed: true,
          current_usage: 510,
          limit_value: 1000,
        }],
        error: null,
      });
      
      const result = await incrementUsage('sub_123', 'warnings_processed', 10);
      
      expect(result.allowed).toBe(true);
      expect(result.current).toBe(510);
      expect(result.limit).toBe(1000);
      expect(mockSupabase.rpc).toHaveBeenCalledWith('increment_usage', {
        p_subscription_id: 'sub_123',
        p_metric_name: 'warnings_processed',
        p_quantity: 10,
      });
    });
    
    it('rejects increment when limit would be exceeded', async () => {
      mockSupabase.rpc.mockResolvedValueOnce({
        data: [{
          allowed: false,
          current_usage: 500,
          limit_value: 500,
        }],
        error: null,
      });
      
      const result = await incrementUsage('sub_123', 'warnings_processed', 1);
      
      expect(result.allowed).toBe(false);
      expect(result.upgradeUrl).toContain('warnings_processed_limit_exceeded');
    });
    
    it('handles database errors gracefully', async () => {
      mockSupabase.rpc.mockResolvedValueOnce({
        data: null,
        error: { message: 'Database error' },
      });
      
      await expect(incrementUsage('sub_123', 'warnings_processed', 1))
        .rejects.toThrow('Failed to update usage metrics');
    });
  });
  
  describe('getUsageStats', () => {
    it('returns comprehensive usage statistics', async () => {
      // Mock subscription ownership verification
      mockSupabase.single
        .mockResolvedValueOnce({
          data: { user_id: 'test_user_id' },
          error: null,
        })
        .mockResolvedValueOnce({
          data: {
            warnings_limit: 1000,
            api_calls_limit: 100,
          },
          error: null,
        });
      
      // Mock usage records
      mockSupabase.select.mockResolvedValueOnce({
        data: [
          { metric_name: 'warnings_processed', quantity: 750 },
          { metric_name: 'api_calls', quantity: 45 },
          { metric_name: 'exports', quantity: 3 },
        ],
        error: null,
      });
      
      const stats = await getUsageStats('sub_123');
      
      expect(stats.warnings.used).toBe(750);
      expect(stats.warnings.limit).toBe(1000);
      expect(stats.warnings.percentage).toBe(75);
      
      expect(stats.apiCalls.used).toBe(45);
      expect(stats.apiCalls.limit).toBe(100);
      expect(stats.apiCalls.percentage).toBe(45);
      
      expect(stats.exports.used).toBe(3);
      expect(stats.exports.limit).toBe(10);
      
      expect(stats.period.start).toBeInstanceOf(Date);
      expect(stats.period.end).toBeInstanceOf(Date);
    });
    
    it('handles missing usage data', async () => {
      mockSupabase.single
        .mockResolvedValueOnce({
          data: { user_id: 'test_user_id' },
          error: null,
        })
        .mockResolvedValueOnce({
          data: {
            warnings_limit: 500,
            api_calls_limit: 10,
          },
          error: null,
        });
      
      // No usage records found
      mockSupabase.select.mockResolvedValueOnce({
        data: null,
        error: null,
      });
      
      const stats = await getUsageStats('sub_123');
      
      expect(stats.warnings.used).toBe(0);
      expect(stats.warnings.percentage).toBe(0);
      expect(stats.apiCalls.used).toBe(0);
      expect(stats.apiCalls.percentage).toBe(0);
      expect(stats.exports.used).toBe(0);
    });
  });
  
  describe('canUserAccessFeature', () => {
    it('grants access for valid subscription features', async () => {
      mockSupabase.single.mockResolvedValueOnce({
        data: { plan_id: 'pro' },
        error: null,
      });
      
      const hasAccess = await canUserAccessFeature('user_123', 'aiSummaries');
      
      expect(hasAccess).toBe(true);
    });
    
    it('denies access for features not in plan', async () => {
      mockSupabase.single.mockResolvedValueOnce({
        data: { plan_id: 'free' },
        error: null,
      });
      
      const hasAccess = await canUserAccessFeature('user_123', 'aiSummaries');
      
      expect(hasAccess).toBe(false);
    });
    
    it('defaults to free tier for users without subscription', async () => {
      mockSupabase.single.mockResolvedValueOnce({
        data: null,
        error: null,
      });
      
      const hasAccess = await canUserAccessFeature('user_123', 'privateRepos');
      
      expect(hasAccess).toBe(false); // Free tier doesn't have private repos
    });
  });
  
  describe('getUserSubscription', () => {
    it('returns active subscription for user', async () => {
      const mockSubscription = {
        id: 'sub_123',
        plan_id: 'pro',
        status: 'active',
        stripe_subscription_id: 'sub_stripe_123',
      };
      
      mockSupabase.single.mockResolvedValueOnce({
        data: mockSubscription,
        error: null,
      });
      
      const subscription = await getUserSubscription('user_123');
      
      expect(subscription).toEqual(mockSubscription);
      expect(mockSupabase.eq).toHaveBeenCalledWith('user_id', 'user_123');
      expect(mockSupabase.eq).toHaveBeenCalledWith('status', 'active');
    });
    
    it('returns null for users without active subscription', async () => {
      mockSupabase.single.mockResolvedValueOnce({
        data: null,
        error: null,
      });
      
      const subscription = await getUserSubscription('user_123');
      
      expect(subscription).toBeNull();
    });
  });
});