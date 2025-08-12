import { createClient } from '@/lib/supabase/server';

export interface GitHubMarketplacePlan {
  id: number;
  name: string;
  display_name: string;
  description: string;
  monthly_price_in_cents: number;
  yearly_price_in_cents: number;
  price_model: string;
  has_free_trial: boolean;
  unit_name: string | null;
  bullets: string[];
}

export interface GitHubMarketplaceAccount {
  id: number;
  login: string;
  type: 'User' | 'Organization';
  avatar_url?: string;
}

export interface GitHubMarketplaceSubscription {
  id: string;
  github_account_id: number;
  github_login: string;
  plan_id: string;
  billing_cycle: 'monthly' | 'yearly';
  status: string;
  unit_count: number;
  on_free_trial: boolean;
  free_trial_ends_on?: string;
  current_period_end: string;
  created_at: string;
}

// Get GitHub Marketplace plans
export const GITHUB_MARKETPLACE_PLANS: Record<number, GitHubMarketplacePlan> = {
  1001: {
    id: 1001,
    name: 'free',
    display_name: 'Free',
    description: 'Perfect for open source projects',
    monthly_price_in_cents: 0,
    yearly_price_in_cents: 0,
    price_model: 'flat_rate',
    has_free_trial: false,
    unit_name: null,
    bullets: [
      '500 warnings per month',
      '1 private repository',
      '7-day warning history',
      'Basic dashboard',
      'GitHub PR comments',
      'Community support'
    ]
  },
  1002: {
    id: 1002,
    name: 'pro',
    display_name: 'Pro',
    description: 'Best for growing teams',
    monthly_price_in_cents: 1200,
    yearly_price_in_cents: 12000,
    price_model: 'per_unit',
    has_free_trial: true,
    unit_name: 'repository',
    bullets: [
      '20,000 warnings per month',
      'Up to 10 private repositories',
      '12-month warning history',
      'AI-powered summaries',
      'Slack & Teams integration',
      'Trend analysis charts',
      'Custom webhooks',
      'Email support'
    ]
  },
  1003: {
    id: 1003,
    name: 'enterprise',
    display_name: 'Enterprise',
    description: 'Advanced features for organizations',
    monthly_price_in_cents: 9900,
    yearly_price_in_cents: 99000,
    price_model: 'per_unit',
    has_free_trial: true,
    unit_name: 'organization',
    bullets: [
      'Unlimited warnings',
      'Unlimited repositories',
      'Unlimited warning history',
      'SSO integration',
      'Audit logs',
      'Priority support',
      'SLA guarantees',
      'Custom contracts',
      'Dedicated support'
    ]
  }
};

export function getGitHubPlanByID(githubPlanId: number): GitHubMarketplacePlan | undefined {
  return GITHUB_MARKETPLACE_PLANS[githubPlanId];
}

export function mapGitHubPlanToInternal(githubPlanId: number): string {
  const plan = getGitHubPlanByID(githubPlanId);
  return plan?.name || 'free';
}

// Check if user has GitHub Marketplace subscription
export async function getUserGitHubSubscription(userId: string): Promise<GitHubMarketplaceSubscription | null> {
  const supabase = createClient();
  
  try {
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select(`
        id,
        github_account_id,
        plan_id,
        billing_cycle,
        status,
        unit_count,
        on_free_trial,
        free_trial_ends_on,
        current_period_end,
        created_at,
        github_accounts!inner(github_login)
      `)
      .eq('user_id', userId)
      .eq('billing_provider', 'github_marketplace')
      .eq('status', 'active')
      .single();
    
    if (!subscription) {
      return null;
    }
    
    return {
      id: subscription.id,
      github_account_id: subscription.github_account_id,
      github_login: (subscription.github_accounts as any).github_login,
      plan_id: subscription.plan_id,
      billing_cycle: subscription.billing_cycle,
      status: subscription.status,
      unit_count: subscription.unit_count,
      on_free_trial: subscription.on_free_trial,
      free_trial_ends_on: subscription.free_trial_ends_on,
      current_period_end: subscription.current_period_end,
      created_at: subscription.created_at,
    };
    
  } catch (error) {
    console.error('Error getting GitHub subscription:', error);
    return null;
  }
}

// Get GitHub account by ID
export async function getGitHubAccount(githubAccountId: number): Promise<GitHubMarketplaceAccount | null> {
  const supabase = createClient();
  
  try {
    const { data: account } = await supabase
      .from('github_accounts')
      .select('*')
      .eq('github_account_id', githubAccountId)
      .single();
    
    if (!account) {
      return null;
    }
    
    return {
      id: account.github_account_id,
      login: account.github_login,
      type: account.account_type,
      avatar_url: account.avatar_url,
    };
    
  } catch (error) {
    console.error('Error getting GitHub account:', error);
    return null;
  }
}

// Get all GitHub Marketplace subscriptions for analytics
export async function getGitHubMarketplaceMetrics() {
  const supabase = createClient();
  
  try {
    // Total active subscriptions
    const { count: totalSubscriptions } = await supabase
      .from('subscriptions')
      .select('*', { count: 'exact', head: true })
      .eq('billing_provider', 'github_marketplace')
      .eq('status', 'active');
    
    // Subscriptions by plan
    const { data: planBreakdown } = await supabase
      .from('subscriptions')
      .select('plan_id')
      .eq('billing_provider', 'github_marketplace')
      .eq('status', 'active');
    
    // Monthly Recurring Revenue (MRR) from GitHub Marketplace
    const { data: mrrData } = await supabase
      .from('subscriptions')
      .select('plan_id, unit_count, billing_cycle')
      .eq('billing_provider', 'github_marketplace')
      .eq('status', 'active');
    
    const mrr = mrrData?.reduce((total, sub) => {
      const plan = Object.values(GITHUB_MARKETPLACE_PLANS).find(p => p.name === sub.plan_id);
      if (plan) {
        const monthlyPrice = sub.billing_cycle === 'yearly' 
          ? plan.yearly_price_in_cents / 12 
          : plan.monthly_price_in_cents;
        return total + (monthlyPrice * sub.unit_count);
      }
      return total;
    }, 0) || 0;
    
    // Recent purchases (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const { count: recentPurchases } = await supabase
      .from('github_marketplace_purchases')
      .select('*', { count: 'exact', head: true })
      .eq('action', 'purchased')
      .gte('created_at', thirtyDaysAgo.toISOString());
    
    // Trial conversion rate
    const { count: trialsStarted } = await supabase
      .from('subscriptions')
      .select('*', { count: 'exact', head: true })
      .eq('billing_provider', 'github_marketplace')
      .eq('on_free_trial', true);
    
    const { count: trialsConverted } = await supabase
      .from('subscriptions')
      .select('*', { count: 'exact', head: true })
      .eq('billing_provider', 'github_marketplace')
      .eq('status', 'active')
      .eq('on_free_trial', false);
    
    return {
      totalSubscriptions: totalSubscriptions || 0,
      planBreakdown: planBreakdown?.reduce((acc, sub) => {
        acc[sub.plan_id] = (acc[sub.plan_id] || 0) + 1;
        return acc;
      }, {} as Record<string, number>) || {},
      mrr: Math.round(mrr / 100), // Convert cents to dollars
      recentPurchases: recentPurchases || 0,
      trialConversionRate: trialsStarted ? (trialsConverted || 0) / trialsStarted * 100 : 0,
    };
    
  } catch (error) {
    console.error('Error getting GitHub Marketplace metrics:', error);
    return {
      totalSubscriptions: 0,
      planBreakdown: {},
      mrr: 0,
      recentPurchases: 0,
      trialConversionRate: 0,
    };
  }
}

// Validate GitHub Marketplace webhook payload
export function validateGitHubMarketplacePayload(payload: any): boolean {
  if (!payload.action || !payload.marketplace_purchase) {
    return false;
  }
  
  const purchase = payload.marketplace_purchase;
  
  // Required fields
  const requiredFields = ['account', 'plan', 'billing_cycle'];
  for (const field of requiredFields) {
    if (!purchase[field]) {
      return false;
    }
  }
  
  // Validate account
  if (!purchase.account.id || !purchase.account.login || !purchase.account.type) {
    return false;
  }
  
  // Validate plan
  if (!purchase.plan.id || !purchase.plan.name) {
    return false;
  }
  
  // Validate billing cycle
  if (!['monthly', 'yearly'].includes(purchase.billing_cycle)) {
    return false;
  }
  
  return true;
}

// Get GitHub Marketplace upgrade URL
export function getGitHubMarketplaceUpgradeUrl(githubAppName: string): string {
  return `https://github.com/marketplace/${githubAppName}`;
}

// Check if plan supports feature (GitHub Marketplace version)
export function gitHubPlanSupportsFeature(planId: string, feature: string): boolean {
  // Map features to plans that support them
  const featureMap: Record<string, string[]> = {
    'private_repos': ['pro', 'enterprise'],
    'ai_summaries': ['pro', 'enterprise'],
    'slack_integration': ['pro', 'enterprise'],
    'teams_integration': ['pro', 'enterprise'],
    'custom_webhooks': ['pro', 'enterprise'],
    'sso': ['enterprise'],
    'audit_logs': ['enterprise'],
    'priority_support': ['enterprise'],
    'sla': ['enterprise'],
  };
  
  return featureMap[feature]?.includes(planId) || false;
}