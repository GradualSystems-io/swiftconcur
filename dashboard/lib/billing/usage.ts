import { createClient } from '@/lib/supabase/server';
import { PLANS } from './plans';

export interface UsageCheck {
  allowed: boolean;
  current: number;
  limit: number;
  upgradeUrl?: string;
}

export interface UsageStats {
  period: { start: Date; end: Date };
  warnings: { used: number; limit: number; percentage: number };
  apiCalls: { used: number; limit: number; percentage: number };
  exports: { used: number; limit: number };
}

export async function initializeUsageLimits(
  subscriptionId: string, 
  planId: string
): Promise<void> {
  const supabase = createClient();
  const plan = PLANS[planId];
  
  if (!plan) {
    throw new Error(`Invalid plan ID: ${planId}`);
  }
  
  const periodStart = new Date();
  periodStart.setDate(1); // First day of month
  
  const warningsLimit = typeof plan.limits.warningsPerMonth === 'number' 
    ? plan.limits.warningsPerMonth 
    : 999999; // Large number for "unlimited"
  
  await supabase
    .from('usage_limits')
    .upsert({
      subscription_id: subscriptionId,
      warnings_limit: warningsLimit,
      api_calls_limit: plan.limits.apiCallsPerHour,
      current_warnings: 0,
      current_api_calls: 0,
      period_start: periodStart.toISOString().split('T')[0],
      updated_at: new Date().toISOString(),
    });
}

export async function checkUsageLimit(
  subscriptionId: string,
  metric: 'warnings_processed' | 'api_calls',
  increment: number = 1
): Promise<UsageCheck> {
  const supabase = createClient();
  
  try {
    // Get current usage and limits with security check
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('user_id, plan_id')
      .eq('id', subscriptionId)
      .single();
    
    if (!subscription) {
      return { allowed: false, current: 0, limit: 0 };
    }
    
    // Security: Verify user owns this subscription
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || user.id !== subscription.user_id) {
      throw new Error('Unauthorized access to subscription');
    }
    
    const { data: limits } = await supabase
      .from('usage_limits')
      .select('*')
      .eq('subscription_id', subscriptionId)
      .single();
    
    if (!limits) {
      return { allowed: false, current: 0, limit: 0 };
    }
    
    const metricMap = {
      warnings_processed: 'warnings',
      api_calls: 'api_calls',
    } as const;
    
    const limitField = `${metricMap[metric]}_limit` as const;
    const currentField = `current_${metricMap[metric]}` as const;
    
    const limit = limits[limitField];
    const current = limits[currentField];
    
    if (current + increment > limit) {
      return {
        allowed: false,
        current,
        limit,
        upgradeUrl: `/billing?upgrade=true&reason=${metric}_limit_exceeded`,
      };
    }
    
    return { allowed: true, current, limit };
    
  } catch (error) {
    console.error('Error checking usage limit:', error);
    return { allowed: false, current: 0, limit: 0 };
  }
}

export async function incrementUsage(
  subscriptionId: string,
  metric: 'warnings_processed' | 'api_calls' | 'exports',
  quantity: number = 1
): Promise<UsageCheck> {
  const supabase = createClient();
  
  try {
    // Security: Use stored procedure for atomic operation
    const { data, error } = await supabase.rpc('increment_usage', {
      p_subscription_id: subscriptionId,
      p_metric_name: metric,
      p_quantity: quantity,
    });
    
    if (error) {
      throw error;
    }
    
    if (!data || data.length === 0) {
      return { allowed: false, current: 0, limit: 0 };
    }
    
    const result = data[0];
    return {
      allowed: result.allowed,
      current: result.current_usage,
      limit: result.limit_value,
      upgradeUrl: result.allowed ? undefined : `/billing?upgrade=true&reason=${metric}_limit_exceeded`,
    };
    
  } catch (error) {
    console.error('Error incrementing usage:', error);
    throw new Error('Failed to update usage metrics');
  }
}

export async function getUsageStats(subscriptionId: string): Promise<UsageStats> {
  const supabase = createClient();
  
  try {
    // Security: Verify user owns this subscription
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('user_id')
      .eq('id', subscriptionId)
      .single();
    
    if (!subscription) {
      throw new Error('Subscription not found');
    }
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || user.id !== subscription.user_id) {
      throw new Error('Unauthorized access to subscription');
    }
    
    // Get current period
    const periodStart = new Date();
    periodStart.setDate(1);
    const periodEnd = new Date(periodStart);
    periodEnd.setMonth(periodEnd.getMonth() + 1);
    periodEnd.setDate(0);
    
    // Get usage data
    const { data: usage } = await supabase
      .from('usage_records')
      .select('*')
      .eq('subscription_id', subscriptionId)
      .eq('period_start', periodStart.toISOString().split('T')[0]);
    
    // Get limits
    const { data: limits } = await supabase
      .from('usage_limits')
      .select('*')
      .eq('subscription_id', subscriptionId)
      .single();
    
    const warningsUsed = usage?.find(u => u.metric_name === 'warnings_processed')?.quantity || 0;
    const apiCallsUsed = usage?.find(u => u.metric_name === 'api_calls')?.quantity || 0;
    const exportsUsed = usage?.find(u => u.metric_name === 'exports')?.quantity || 0;
    
    const warningsLimit = limits?.warnings_limit || 0;
    const apiCallsLimit = limits?.api_calls_limit || 0;
    
    return {
      period: { start: periodStart, end: periodEnd },
      warnings: {
        used: warningsUsed,
        limit: warningsLimit,
        percentage: warningsLimit > 0 ? Math.round((warningsUsed / warningsLimit) * 100) : 0,
      },
      apiCalls: {
        used: apiCallsUsed,
        limit: apiCallsLimit,
        percentage: apiCallsLimit > 0 ? Math.round((apiCallsUsed / apiCallsLimit) * 100) : 0,
      },
      exports: {
        used: exportsUsed,
        limit: 10, // Fixed limit for now
      },
    };
    
  } catch (error) {
    console.error('Error getting usage stats:', error);
    throw new Error('Failed to retrieve usage statistics');
  }
}

export async function canUserAccessFeature(
  userId: string,
  feature: string
): Promise<boolean> {
  const supabase = createClient();
  
  try {
    // Get user's active subscription
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('plan_id')
      .eq('user_id', userId)
      .eq('status', 'active')
      .single();
    
    if (!subscription) {
      // No subscription = free tier
      return PLANS.free.features[feature as keyof typeof PLANS.free.features] || false;
    }
    
    const plan = PLANS[subscription.plan_id];
    if (!plan) {
      return false;
    }
    
    return plan.features[feature as keyof typeof plan.features] || false;
    
  } catch (error) {
    console.error('Error checking feature access:', error);
    return false;
  }
}

export async function getUserSubscription(userId: string) {
  const supabase = createClient();
  
  try {
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active')
      .single();
    
    return subscription;
  } catch (error) {
    console.error('Error getting user subscription:', error);
    return null;
  }
}