# Phase 5: GitHub Marketplace & Billing - Detailed Implementation Guide

## Overview
Implement GitHub Marketplace integration with subscription management, usage tracking, and billing enforcement. This phase transforms SwiftConcur CI into a monetizable SaaS product.

## Architecture

```
GitHub Marketplace → Webhook Events → API Handler
                                          ↓
                                    Supabase DB
                                          ↓
                              Plan Enforcement Logic
                                          ↓
                                 Feature Access Control
```

## Implementation Structure

```
billing/
├── api/
│   ├── marketplace/
│   │   ├── webhook.ts         # GitHub Marketplace webhook handler
│   │   ├── setup.ts           # Initial setup endpoint
│   │   └── events/
│   │       ├── purchase.ts    # Handle new purchases
│   │       ├── change.ts      # Handle plan changes
│   │       └── cancellation.ts # Handle cancellations
│   ├── usage/
│   │   ├── track.ts           # Usage tracking
│   │   └── report.ts          # Usage reporting to GitHub
│   └── billing/
│       ├── enforce.ts         # Plan enforcement
│       └── status.ts          # Billing status check
├── lib/
│   ├── plans.ts              # Plan definitions
│   ├── limits.ts             # Usage limits
│   └── github-marketplace.ts  # GitHub Marketplace API
├── middleware/
│   ├── plan-check.ts         # Plan verification middleware
│   └── usage-limit.ts        # Usage limiting middleware
└── database/
    └── migrations/
        └── billing-tables.sql
```

## Database Schema Updates

### 1. Billing Tables (database/migrations/billing-tables.sql)
```sql
-- Subscription plans
CREATE TABLE subscription_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    github_plan_id INTEGER UNIQUE NOT NULL,
    name TEXT NOT NULL,
    price_monthly INTEGER NOT NULL, -- in cents
    features JSONB NOT NULL,
    limits JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Customer subscriptions
CREATE TABLE subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id) NOT NULL,
    github_account_id INTEGER NOT NULL,
    plan_id UUID REFERENCES subscription_plans(id) NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('active', 'cancelled', 'pending', 'past_due')),
    started_at TIMESTAMP NOT NULL,
    cancelled_at TIMESTAMP,
    next_billing_date TIMESTAMP,
    github_subscription_id INTEGER UNIQUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Usage tracking
CREATE TABLE usage_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id) NOT NULL,
    repo_id UUID REFERENCES repositories(id),
    metric_name TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    recorded_at TIMESTAMP DEFAULT NOW(),
    billing_period_start TIMESTAMP NOT NULL,
    billing_period_end TIMESTAMP NOT NULL
);

-- Billing events log
CREATE TABLE billing_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id) NOT NULL,
    event_type TEXT NOT NULL,
    event_data JSONB NOT NULL,
    github_delivery_id TEXT,
    processed_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_subscriptions_org_id ON subscriptions(org_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
CREATE INDEX idx_usage_records_org_period ON usage_records(org_id, billing_period_start);
CREATE INDEX idx_billing_events_org_id ON billing_events(org_id);

-- RLS Policies
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their org's subscription" ON subscriptions
    FOR SELECT USING (org_id IN (
        SELECT org_id FROM organization_members WHERE user_id = auth.uid()
    ));

CREATE POLICY "Users can view their org's usage" ON usage_records
    FOR SELECT USING (org_id IN (
        SELECT org_id FROM organization_members WHERE user_id = auth.uid()
    ));
```

## Plan Definitions

### 2. Plan Configuration (lib/plans.ts)
```typescript
export interface Plan {
  id: string;
  githubPlanId: number;
  name: string;
  displayName: string;
  price: {
    monthly: number;
    currency: string;
  };
  features: {
    repositories: number | 'unlimited';
    privateRepos: boolean;
    teamMembers: number | 'unlimited';
    warningHistory: number; // days
    aiSummaries: boolean;
    customIntegrations: boolean;
    prioritySupport: boolean;
    sso: boolean;
  };
  limits: {
    buildsPerMonth: number | 'unlimited';
    apiCallsPerHour: number;
    exportSizeGB: number;
  };
}

export const PLANS: Record<string, Plan> = {
  free: {
    id: 'free',
    githubPlanId: 1001,
    name: 'free',
    displayName: 'Free',
    price: { monthly: 0, currency: 'USD' },
    features: {
      repositories: 1,
      privateRepos: false,
      teamMembers: 1,
      warningHistory: 7,
      aiSummaries: false,
      customIntegrations: false,
      prioritySupport: false,
      sso: false,
    },
    limits: {
      buildsPerMonth: 100,
      apiCallsPerHour: 10,
      exportSizeGB: 1,
    },
  },
  pro: {
    id: 'pro',
    githubPlanId: 1002,
    name: 'pro',
    displayName: 'Pro',
    price: { monthly: 1900, currency: 'USD' }, // $19/month
    features: {
      repositories: 10,
      privateRepos: true,
      teamMembers: 5,
      warningHistory: 30,
      aiSummaries: true,
      customIntegrations: true,
      prioritySupport: false,
      sso: false,
    },
    limits: {
      buildsPerMonth: 1000,
      apiCallsPerHour: 100,
      exportSizeGB: 10,
    },
  },
  enterprise: {
    id: 'enterprise',
    githubPlanId: 1003,
    name: 'enterprise',
    displayName: 'Enterprise',
    price: { monthly: 9900, currency: 'USD' }, // $99/month
    features: {
      repositories: 'unlimited',
      privateRepos: true,
      teamMembers: 'unlimited',
      warningHistory: 365,
      aiSummaries: true,
      customIntegrations: true,
      prioritySupport: true,
      sso: true,
    },
    limits: {
      buildsPerMonth: 'unlimited',
      apiCallsPerHour: 1000,
      exportSizeGB: 100,
    },
  },
};

export function getPlanByGitHubId(githubPlanId: number): Plan | undefined {
  return Object.values(PLANS).find(plan => plan.githubPlanId === githubPlanId);
}

export function isPlanFeatureEnabled(
  planId: string,
  feature: keyof Plan['features']
): boolean {
  const plan = PLANS[planId];
  if (!plan) return false;
  
  const value = plan.features[feature];
  return value === true || value === 'unlimited' || (typeof value === 'number' && value > 0);
}
```

### 3. GitHub Marketplace Webhook Handler (api/marketplace/webhook.ts)
```typescript
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { handlePurchase } from './events/purchase';
import { handlePlanChange } from './events/change';
import { handleCancellation } from './events/cancellation';
import { createClient } from '@/lib/supabase/server';

interface MarketplaceEvent {
  action: 'purchased' | 'changed' | 'cancelled' | 'pending_change' | 'pending_change_cancelled';
  marketplace_purchase: {
    account: {
      id: number;
      login: string;
      type: string;
    };
    billing_cycle: 'monthly' | 'yearly';
    plan: {
      id: number;
      name: string;
      description: string;
      monthly_price_in_cents: number;
      yearly_price_in_cents: number;
      bullets: string[];
    };
    next_billing_date?: string;
    on_free_trial: boolean;
    free_trial_ends_on?: string;
  };
  previous_marketplace_purchase?: any;
}

export async function POST(request: NextRequest) {
  try {
    // Verify webhook signature
    const body = await request.text();
    const signature = request.headers.get('X-Hub-Signature-256');
    
    if (!verifyWebhookSignature(body, signature, process.env.GITHUB_WEBHOOK_SECRET!)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }
    
    const event: MarketplaceEvent = JSON.parse(body);
    const deliveryId = request.headers.get('X-GitHub-Delivery');
    
    // Log event
    const supabase = createClient();
    await supabase.from('billing_events').insert({
      org_id: await getOrgIdFromGitHubAccount(event.marketplace_purchase.account.id),
      event_type: `marketplace_${event.action}`,
      event_data: event,
      github_delivery_id: deliveryId,
    });
    
    // Handle different event types
    switch (event.action) {
      case 'purchased':
        await handlePurchase(event);
        break;
      case 'changed':
        await handlePlanChange(event);
        break;
      case 'cancelled':
        await handleCancellation(event);
        break;
      case 'pending_change':
        // Log but don't process until actual change
        console.log('Pending change recorded');
        break;
      case 'pending_change_cancelled':
        // Log cancellation of pending change
        console.log('Pending change cancelled');
        break;
      default:
        console.warn('Unknown marketplace action:', event.action);
    }
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Marketplace webhook error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

function verifyWebhookSignature(
  body: string,
  signature: string | null,
  secret: string
): boolean {
  if (!signature) return false;
  
  const hmac = crypto.createHmac('sha256', secret);
  const digest = 'sha256=' + hmac.update(body).digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(digest)
  );
}

async function getOrgIdFromGitHubAccount(githubAccountId: number): Promise<string> {
  const supabase = createClient();
  const { data } = await supabase
    .from('organizations')
    .select('id')
    .eq('github_id', githubAccountId)
    .single();
  
  return data?.id;
}
```

### 4. Purchase Handler (api/marketplace/events/purchase.ts)
```typescript
import { createClient } from '@/lib/supabase/server';
import { getPlanByGitHubId } from '@/lib/plans';
import { sendWelcomeEmail } from '@/lib/email';

export async function handlePurchase(event: MarketplaceEvent) {
  const supabase = createClient();
  const plan = getPlanByGitHubId(event.marketplace_purchase.plan.id);
  
  if (!plan) {
    throw new Error(`Unknown plan ID: ${event.marketplace_purchase.plan.id}`);
  }
  
  // Create or update organization
  const { data: org } = await supabase
    .from('organizations')
    .upsert({
      github_id: event.marketplace_purchase.account.id,
      name: event.marketplace_purchase.account.login,
      plan: plan.id,
    })
    .select()
    .single();
  
  // Create subscription record
  await supabase.from('subscriptions').insert({
    org_id: org.id,
    github_account_id: event.marketplace_purchase.account.id,
    plan_id: plan.id,
    status: 'active',
    started_at: new Date().toISOString(),
    next_billing_date: event.marketplace_purchase.next_billing_date,
    github_subscription_id: Date.now(), // GitHub doesn't provide this in webhooks
  });
  
  // Initialize usage records
  await initializeUsageRecords(org.id);
  
  // Send welcome email
  await sendWelcomeEmail({
    organization: event.marketplace_purchase.account.login,
    plan: plan.displayName,
  });
  
  console.log(`New subscription: ${org.name} on ${plan.displayName} plan`);
}

async function initializeUsageRecords(orgId: string) {
  const supabase = createClient();
  const now = new Date();
  const billingPeriodStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const billingPeriodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  
  await supabase.from('usage_records').insert([
    {
      org_id: orgId,
      metric_name: 'builds',
      quantity: 0,
      billing_period_start: billingPeriodStart.toISOString(),
      billing_period_end: billingPeriodEnd.toISOString(),
    },
    {
      org_id: orgId,
      metric_name: 'api_calls',
      quantity: 0,
      billing_period_start: billingPeriodStart.toISOString(),
      billing_period_end: billingPeriodEnd.toISOString(),
    },
  ]);
}
```

### 5. Plan Change Handler (api/marketplace/events/change.ts)
```typescript
export async function handlePlanChange(event: MarketplaceEvent) {
  const supabase = createClient();
  const newPlan = getPlanByGitHubId(event.marketplace_purchase.plan.id);
  const oldPlan = event.previous_marketplace_purchase
    ? getPlanByGitHubId(event.previous_marketplace_purchase.plan.id)
    : null;
  
  if (!newPlan) {
    throw new Error(`Unknown plan ID: ${event.marketplace_purchase.plan.id}`);
  }
  
  // Get organization
  const { data: org } = await supabase
    .from('organizations')
    .select('id')
    .eq('github_id', event.marketplace_purchase.account.id)
    .single();
  
  // Update organization plan
  await supabase
    .from('organizations')
    .update({ plan: newPlan.id })
    .eq('id', org.id);
  
  // Update subscription
  await supabase
    .from('subscriptions')
    .update({
      plan_id: newPlan.id,
      updated_at: new Date().toISOString(),
    })
    .eq('org_id', org.id)
    .eq('status', 'active');
  
  // Handle downgrades
  if (oldPlan && isDowngrade(oldPlan, newPlan)) {
    await handleDowngrade(org.id, oldPlan, newPlan);
  }
  
  console.log(`Plan change: ${org.id} from ${oldPlan?.displayName} to ${newPlan.displayName}`);
}

function isDowngrade(oldPlan: Plan, newPlan: Plan): boolean {
  return oldPlan.price.monthly > newPlan.price.monthly;
}

async function handleDowngrade(orgId: string, oldPlan: Plan, newPlan: Plan) {
  const supabase = createClient();
  
  // Check repository limits
  if (typeof newPlan.features.repositories === 'number') {
    const { count } = await supabase
      .from('repositories')
      .select('*', { count: 'exact' })
      .eq('org_id', orgId)
      .eq('is_active', true);
    
    if (count && count > newPlan.features.repositories) {
      // Deactivate excess repositories (keep most recent)
      const { data: repos } = await supabase
        .from('repositories')
        .select('id')
        .eq('org_id', orgId)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .range(newPlan.features.repositories, count);
      
      if (repos) {
        await supabase
          .from('repositories')
          .update({ is_active: false })
          .in('id', repos.map(r => r.id));
      }
    }
  }
}
```

### 6. Usage Tracking Middleware (middleware/usage-limit.ts)
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { PLANS } from '@/lib/plans';

export async function usageLimitMiddleware(
  request: NextRequest,
  metricName: 'builds' | 'api_calls' | 'exports'
) {
  const supabase = createClient();
  
  // Get user's organization
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  const { data: member } = await supabase
    .from('organization_members')
    .select('org_id')
    .eq('user_id', user.id)
    .single();
  
  if (!member) {
    return NextResponse.json({ error: 'No organization' }, { status: 403 });
  }
  
  // Get organization's plan
  const { data: org } = await supabase
    .from('organizations')
    .select('plan')
    .eq('id', member.org_id)
    .single();
  
  const plan = PLANS[org.plan];
  if (!plan) {
    return NextResponse.json({ error: 'Invalid plan' }, { status: 500 });
  }
  
  // Check usage limits
  const now = new Date();
  const billingPeriodStart = new Date(now.getFullYear(), now.getMonth(), 1);
  
  const { data: usage } = await supabase
    .from('usage_records')
    .select('quantity')
    .eq('org_id', member.org_id)
    .eq('metric_name', metricName)
    .gte('billing_period_start', billingPeriodStart.toISOString())
    .single();
  
  const currentUsage = usage?.quantity || 0;
  const limit = getLimit(plan, metricName);
  
  if (limit !== 'unlimited' && currentUsage >= limit) {
    return NextResponse.json({
      error: 'Usage limit exceeded',
      limit,
      current: currentUsage,
      upgrade_url: `https://github.com/marketplace/${process.env.GITHUB_APP_NAME}`,
    }, { status: 429 });
  }
  
  // Increment usage
  await incrementUsage(member.org_id, metricName);
}

function getLimit(plan: Plan, metric: string): number | 'unlimited' {
  switch (metric) {
    case 'builds':
      return plan.limits.buildsPerMonth;
    case 'api_calls':
      return plan.limits.apiCallsPerHour;
    case 'exports':
      return plan.limits.exportSizeGB;
    default:
      return 0;
  }
}

async function incrementUsage(orgId: string, metricName: string) {
  const supabase = createClient();
  const now = new Date();
  const billingPeriodStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const billingPeriodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  
  // Upsert usage record
  await supabase.rpc('increment_usage', {
    p_org_id: orgId,
    p_metric_name: metricName,
    p_quantity: 1,
    p_period_start: billingPeriodStart.toISOString(),
    p_period_end: billingPeriodEnd.toISOString(),
  });
}
```

### 7. Plan Enforcement in Action (Update action.yml)
```yaml
name: 'SwiftConcur CI'
# ... existing configuration ...

inputs:
  # ... existing inputs ...
  api-key:
    description: 'SwiftConcur API key for plan validation'
    required: false

runs:
  using: 'docker'
  image: 'Dockerfile'
  env:
    GITHUB_TOKEN: ${{ inputs.github-token }}
    SWIFTCONCUR_API_KEY: ${{ inputs.api-key }}
```

### 8. Updated Entrypoint Script (entrypoint.sh)
```bash
#!/bin/bash
# ... existing code ...

# Check plan limits if API key provided
if [ -n "$SWIFTCONCUR_API_KEY" ]; then
  echo -e "${YELLOW}🔐 Checking plan limits...${NC}"
  
  PLAN_CHECK=$(curl -s -H "Authorization: Bearer $SWIFTCONCUR_API_KEY" \
    "$SWIFTCONCUR_API_URL/api/billing/check")
  
  if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Failed to check plan limits${NC}"
    exit 1
  fi
  
  PLAN_VALID=$(echo "$PLAN_CHECK" | jq -r '.valid')
  if [ "$PLAN_VALID" != "true" ]; then
    REASON=$(echo "$PLAN_CHECK" | jq -r '.reason')
    UPGRADE_URL=$(echo "$PLAN_CHECK" | jq -r '.upgrade_url')
    echo -e "${RED}❌ Plan limit exceeded: $REASON${NC}"
    echo -e "${YELLOW}Upgrade at: $UPGRADE_URL${NC}"
    exit 1
  fi
fi

# ... rest of the script ...
```

### 9. Billing Dashboard Component (components/billing/PlanCard.tsx)
```tsx
'use client';

import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Check, X } from 'lucide-react';
import { Plan } from '@/lib/plans';

interface PlanCardProps {
  plan: Plan;
  currentPlan: boolean;
  onSelect: () => void;
}

export function PlanCard({ plan, currentPlan, onSelect }: PlanCardProps) {
  const features = [
    {
      name: 'Repositories',
      value: plan.features.repositories === 'unlimited' 
        ? 'Unlimited' 
        : `Up to ${plan.features.repositories}`,
      included: true,
    },
    {
      name: 'Private Repos',
      included: plan.features.privateRepos,
    },
    {
      name: 'Team Members',
      value: plan.features.teamMembers === 'unlimited'
        ? 'Unlimited'
        : `Up to ${plan.features.teamMembers}`,
      included: true,
    },
    {
      name: 'AI Summaries',
      included: plan.features.aiSummaries,
    },
    {
      name: 'SSO',
      included: plan.features.sso,
    },
    {
      name: 'Priority Support',
      included: plan.features.prioritySupport,
    },
  ];
  
  return (
    <Card className={`p-6 ${currentPlan ? 'ring-2 ring-blue-500' : ''}`}>
      <div className="text-center mb-6">
        <h3 className="text-2xl font-bold">{plan.displayName}</h3>
        <div className="mt-4">
          <span className="text-4xl font-bold">
            ${plan.price.monthly / 100}
          </span>
          <span className="text-gray-600">/month</span>
        </div>
      </div>
      
      <ul className="space-y-3 mb-6">
        {features.map((feature) => (
          <li key={feature.name} className="flex items-center">
            {feature.included ? (
              <Check className="w-5 h-5 text-green-500 mr-2" />
            ) : (
              <X className="w-5 h-5 text-gray-400 mr-2" />
            )}
            <span className={feature.included ? '' : 'text-gray-400'}>
              {feature.value || feature.name}
            </span>
          </li>
        ))}
      </ul>
      
      <Button
        onClick={onSelect}
        variant={currentPlan ? 'outline' : 'default'}
        className="w-full"
        disabled={currentPlan}
      >
        {currentPlan ? 'Current Plan' : 'Select Plan'}
      </Button>
    </Card>
  );
}
```

### 10. Billing Page (app/(dashboard)/billing/page.tsx)
```tsx
import { createClient } from '@/lib/supabase/server';
import { PLANS } from '@/lib/plans';
import { PlanCard } from '@/components/billing/PlanCard';
import { UsageChart } from '@/components/billing/UsageChart';
import { Card } from '@/components/ui/Card';

export default async function BillingPage() {
  const supabase = createClient();
  
  // Get current subscription
  const { data: { user } } = await supabase.auth.getUser();
  const { data: member } = await supabase
    .from('organization_members')
    .select('org_id')
    .eq('user_id', user?.id)
    .single();
  
  const { data: org } = await supabase
    .from('organizations')
    .select('*, subscriptions(*)')
    .eq('id', member?.org_id)
    .single();
  
  const currentPlan = org?.plan || 'free';
  
  // Get usage data
  const now = new Date();
  const billingPeriodStart = new Date(now.getFullYear(), now.getMonth(), 1);
  
  const { data: usage } = await supabase
    .from('usage_records')
    .select('*')
    .eq('org_id', member?.org_id)
    .gte('billing_period_start', billingPeriodStart.toISOString());
  
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Billing & Usage</h1>
        <p className="text-gray-600 mt-2">
          Manage your subscription and monitor usage
        </p>
      </div>
      
      {/* Current Plan */}
      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-4">Current Plan</h2>
        <div className="flex justify-between items-center">
          <div>
            <p className="text-2xl font-bold">
              {PLANS[currentPlan].displayName}
            </p>
            <p className="text-gray-600">
              ${PLANS[currentPlan].price.monthly / 100}/month
            </p>
          </div>
          <a
            href={`https://github.com/marketplace/${process.env.NEXT_PUBLIC_GITHUB_APP_NAME}`}
            className="text-blue-600 hover:underline"
          >
            Manage on GitHub →
          </a>
        </div>
      </Card>
      
      {/* Usage */}
      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-4">Current Usage</h2>
        <UsageChart usage={usage} plan={PLANS[currentPlan]} />
      </Card>
      
      {/* Available Plans */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Available Plans</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {Object.values(PLANS).map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              currentPlan={plan.id === currentPlan}
              onSelect={() => {
                window.location.href = `https://github.com/marketplace/${process.env.NEXT_PUBLIC_GITHUB_APP_NAME}`;
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
```

## GitHub Marketplace Setup

### 1. App Manifest (github-app-manifest.json)
```json
{
  "name": "SwiftConcur CI",
  "description": "Detect and track Swift concurrency warnings",
  "url": "https://swiftconcur.dev",
  "hook_attributes": {
    "url": "https://api.swiftconcur.dev/api/marketplace/webhook"
  },
  "redirect_url": "https://swiftconcur.dev/auth/callback",
  "public": true,
  "default_permissions": {
    "checks": "write",
    "contents": "read",
    "issues": "write",
    "pull_requests": "write"
  },
  "default_events": [
    "check_run",
    "check_suite",
    "pull_request",
    "marketplace_purchase"
  ]
}
```

### 2. Marketplace Listing Configuration
```yaml
# .github/marketplace/listing.yml
name: SwiftConcur CI
tagline: Track Swift concurrency warnings in CI/CD
description: |
  SwiftConcur CI automatically detects actor isolation violations, 
  Sendable conformance issues, and data races in your Swift code.
  
  Features:
  - Real-time warning detection
  - AI-powered summaries
  - Historical trends
  - Team collaboration
  
categories:
  - continuous-integration
  - code-quality
  
pricing_model: FREEMIUM

support_links:
  documentation: https://docs.swiftconcur.dev
  support: https://support.swiftconcur.dev
  terms_of_service: https://swiftconcur.dev/terms
  privacy_policy: https://swiftconcur.dev/privacy
```

## Testing

### 1. Marketplace Webhook Testing
```typescript
// tests/marketplace-webhook.test.ts
import { describe, it, expect } from 'vitest';
import { POST } from '@/app/api/marketplace/webhook/route';

describe('Marketplace Webhook', () => {
  it('handles purchase event', async () => {
    const event = {
      action: 'purchased',
      marketplace_purchase: {
        account: { id: 123, login: 'testorg' },
        plan: { id: 1002, name: 'pro' },
      },
    };
    
    const request = new Request('http://localhost/api/marketplace/webhook', {
      method: 'POST',
      body: JSON.stringify(event),
      headers: {
        'X-Hub-Signature-256': generateSignature(JSON.stringify(event)),
      },
    });
    
    const response = await POST(request);
    expect(response.status).toBe(200);
  });
});
```

## Deployment Checklist

- [ ] Database migrations applied
- [ ] Environment variables configured
- [ ] GitHub App created and configured
- [ ] Marketplace listing submitted
- [ ] Webhook endpoints tested
- [ ] Usage tracking implemented
- [ ] Plan enforcement working
- [ ] Billing page accessible
- [ ] Documentation updated
- [ ] Support channels ready

## Success Metrics

1. **Conversion Rate**: Free to paid conversion
2. **Churn Rate**: Monthly cancellations
3. **ARPU**: Average revenue per user
4. **Feature Adoption**: Usage of premium features
5. **Support Tickets**: Related to billing

## Post-Launch Improvements

1. **Annual Billing**: Offer discounted annual plans
2. **Usage-Based Pricing**: Pay per build options
3. **Team Plans**: Separate seats from repository limits
4. **Custom Enterprise**: Negotiated contracts
5. **Referral Program**: Incentivize growth