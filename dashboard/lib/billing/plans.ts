export interface PlanLimits {
  warningsPerMonth: number | 'unlimited';
  apiCallsPerHour: number;
  exportSizeGB: number;
  repositories: number | 'unlimited';
  teamMembers: number | 'unlimited';
  retentionDays: number | 'unlimited';
}

export interface PlanFeatures {
  privateRepos: boolean;
  aiSummaries: boolean;
  slackIntegration: boolean;
  teamsIntegration: boolean;
  customWebhooks: boolean;
  sso: boolean;
  auditLogs: boolean;
  prioritySupport: boolean;
  sla: boolean;
}

export interface Plan {
  id: string;
  stripePriceId: string | null; // Stripe Price ID for subscriptions
  stripeProductId: string | null; // Stripe Product ID
  name: string;
  displayName: string;
  priceMonthly: number; // in cents
  limits: PlanLimits;
  features: PlanFeatures;
  popular?: boolean;
}

export const PLANS: Record<string, Plan> = {
  free: {
    id: 'free',
    stripePriceId: null, // Free plan doesn't need Stripe
    stripeProductId: null,
    name: 'free',
    displayName: 'Free',
    priceMonthly: 0,
    limits: {
      warningsPerMonth: 500,
      apiCallsPerHour: 10,
      exportSizeGB: 1,
      repositories: 1,
      teamMembers: 1,
      retentionDays: 7,
    },
    features: {
      privateRepos: false,
      aiSummaries: false,
      slackIntegration: false,
      teamsIntegration: false,
      customWebhooks: false,
      sso: false,
      auditLogs: false,
      prioritySupport: false,
      sla: false,
    },
  },
  pro: {
    id: 'pro',
    stripePriceId: process.env.STRIPE_PRO_PRICE_ID || 'price_pro_placeholder',
    stripeProductId: process.env.STRIPE_PRO_PRODUCT_ID || 'prod_pro_placeholder',
    name: 'pro',
    displayName: 'Pro',
    priceMonthly: 1200, // $12
    popular: true,
    limits: {
      warningsPerMonth: 20000,
      apiCallsPerHour: 100,
      exportSizeGB: 10,
      repositories: 10,
      teamMembers: 5,
      retentionDays: 365,
    },
    features: {
      privateRepos: true,
      aiSummaries: true,
      slackIntegration: true,
      teamsIntegration: true,
      customWebhooks: true,
      sso: false,
      auditLogs: false,
      prioritySupport: false,
      sla: false,
    },
  },
  enterprise: {
    id: 'enterprise',
    stripePriceId: process.env.STRIPE_ENTERPRISE_PRICE_ID || 'price_enterprise_placeholder',
    stripeProductId: process.env.STRIPE_ENTERPRISE_PRODUCT_ID || 'prod_enterprise_placeholder',
    name: 'enterprise',
    displayName: 'Enterprise',
    priceMonthly: 9900, // $99
    limits: {
      warningsPerMonth: 'unlimited',
      apiCallsPerHour: 1000,
      exportSizeGB: 100,
      repositories: 'unlimited',
      teamMembers: 'unlimited',
      retentionDays: 'unlimited',
    },
    features: {
      privateRepos: true,
      aiSummaries: true,
      slackIntegration: true,
      teamsIntegration: true,
      customWebhooks: true,
      sso: true,
      auditLogs: true,
      prioritySupport: true,
      sla: true,
    },
  },
};

export function getPlanByStripePrice(stripePriceId: string): Plan | undefined {
  return Object.values(PLANS).find(plan => plan.stripePriceId === stripePriceId);
}

export function canAccessFeature(
  planId: string,
  feature: keyof PlanFeatures
): boolean {
  const plan = PLANS[planId];
  return plan?.features[feature] || false;
}

export function withinLimit(
  planId: string,
  metric: keyof PlanLimits,
  current: number
): boolean {
  const plan = PLANS[planId];
  if (!plan) return false;
  
  const limit = plan.limits[metric];
  return limit === 'unlimited' || current < limit;
}

export function getUpgradeUrl(currentPlan: string): string {
  if (currentPlan === 'free') {
    return '/billing?upgrade=pro';
  } else if (currentPlan === 'pro') {
    return '/billing?upgrade=enterprise';
  }
  return '/billing';
}