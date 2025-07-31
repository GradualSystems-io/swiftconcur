}
```

### 10. GitHub Marketplace Configuration

#### App Manifest (github-app-manifest.json)
```json
{
  "name": "SwiftConcur CI",
  "url": "https://swiftconcur.dev",
  "hook_attributes": {
    "url": "https://api.swiftconcur.dev/api/marketplace/webhook"
  },
  "redirect_url": "https://swiftconcur.dev/auth/callback",
  "callback_urls": [
    "https://swiftconcur.dev/auth/callback"
  ],
  "public": true,
  "default_permissions": {
    "checks": "write",
    "contents": "read",
    "issues": "write",
    "metadata": "read",
    "pull_requests": "write"
  },
  "default_events": [
    "check_run",
    "check_suite",
    "pull_request",
    "push",
    "marketplace_purchase"
  ],
  "has_multiple_plans": true
}
```

#### Marketplace Listing (marketplace-listing.md)
```markdown
# SwiftConcur CI

## Tagline
Track Swift 6 concurrency warnings before they reach production

## Description
SwiftConcur CI automatically detects and tracks Swift concurrency issues in your CI/CD pipeline, including:

- **Actor isolation violations** - Catch unsafe cross-actor references
- **Sendable conformance issues** - Identify types that aren't thread-safe
- **Data races** - Find potential race conditions before they cause crashes
- **Performance regressions** - Monitor concurrency-related performance issues

### Key Features

#### 🤖 AI-Powered Summaries (Pro & Enterprise)
Get intelligent summaries of your warnings with actionable recommendations powered by GPT-4.

#### 📊 Historical Trends
Track warning trends over time to ensure your codebase is improving, not regressing.

#### 🔔 Team Notifications
Get alerts in Slack, Microsoft Teams, or email when new issues are introduced.

#### 🎯 Quality Gates
Set thresholds and fail builds when critical concurrency issues are detected.

#### 📈 Public Badges
Show your commitment to thread safety with embeddable status badges.

### Getting Started

1. Install from GitHub Marketplace
2. Add the GitHub Action to your workflow:
   ```yaml
   - uses: swiftconcur/swiftconcur-ci@v1
     with:
       api-key: ${{ secrets.SWIFTCONCUR_API_KEY }}
       scheme: 'YourScheme'
   ```
3. View results in your dashboard at swiftconcur.dev

### Pricing

- **Free**: Perfect for open source projects
- **Pro ($12/repo/month)**: For professional developers and small teams
- **Enterprise**: Custom pricing for large organizations

## Support & Documentation

- 📚 [Documentation](https://docs.swiftconcur.dev)
- 💬 [Community Forum](https://community.swiftconcur.dev)
- 📧 [Email Support](mailto:support@swiftconcur.dev)

## Categories
- Continuous Integration
- Code Quality
- Swift
```

### 11. Testing

#### Marketplace Webhook Tests (tests/marketplace-webhook.test.ts)
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { POST } from '@/app/api/marketplace/webhook/route';
import crypto from 'crypto';

function generateSignature(body: string, secret: string): string {
  return `sha256=${crypto.createHmac('sha256', secret).update(body).digest('hex')}`;
}

describe('Marketplace Webhook Handler', () => {
  const secret = 'test-webhook-secret';
  process.env.GITHUB_WEBHOOK_SECRET = secret;
  
  beforeEach(() => {
    // Reset database state
  });
  
  it('handles purchase event correctly', async () => {
    const event = {
      action: 'purchased',
      marketplace_purchase: {
        account: { id: 123, login: 'testorg', type: 'Organization' },
        plan: { 
          id: 1002, 
          name: 'pro',
          monthly_price_in_cents: 1200,
        },
        billing_cycle: 'monthly',
        next_billing_date: '2024-02-01',
        on_free_trial: false,
      },
    };
    
    const body = JSON.stringify(event);
    const request = new Request('http://localhost/api/marketplace/webhook', {
      method: 'POST',
      body,
      headers: {
        'Content-Type': 'application/json',
        'X-Hub-Signature-256': generateSignature(body, secret),
        'X-GitHub-Delivery': 'test-delivery-id',
      },
    });
    
    const response = await POST(request);
    expect(response.status).toBe(200);
    
    const responseData = await response.json();
    expect(responseData.received).toBe(true);
  });
  
  it('rejects invalid signatures', async () => {
    const request = new Request('http://localhost/api/marketplace/webhook', {
      method: 'POST',
      body: JSON.stringify({ action: 'purchased' }),
      headers: {
        'X-Hub-Signature-256': 'invalid-signature',
      },
    });
    
    const response = await POST(request);
    expect(response.status).toBe(401);
  });
  
  it('handles plan downgrades', async () => {
    const event = {
      action: 'changed',
      marketplace_purchase: {
        account: { id: 123, login: 'testorg' },
        plan: { id: 1001, name: 'free' }, // Downgrade to free
      },
      previous_marketplace_purchase: {
        plan: { id: 1002, name: 'pro' },
      },
    };
    
    const body = JSON.stringify(event);
    const request = new Request('http://localhost/api/marketplace/webhook', {
      method: 'POST',
      body,
      headers: {
        'X-Hub-Signature-256': generateSignature(body, secret),
      },
    });
    
    const response = await POST(request);
    expect(response.status).toBe(200);
  });
});
```

### 12. Deployment Checklist

- [ ] **Database Setup**
  - [ ] Run billing tables migration
  - [ ] Verify indexes are created
  - [ ] Test RLS policies

- [ ] **GitHub App Configuration**
  - [ ] Create GitHub App with manifest
  - [ ] Configure webhook URL
  - [ ] Set webhook secret
  - [ ] Submit for Marketplace review

- [ ] **Environment Variables**
  - [ ] `GITHUB_WEBHOOK_SECRET`
  - [ ] `GITHUB_APP_NAME`
  - [ ] `NEXT_PUBLIC_GITHUB_APP_NAME`

- [ ] **API Endpoints**
  - [ ] Deploy marketplace webhook handler
  - [ ] Test plan check endpoint
  - [ ] Verify usage tracking

- [ ] **Testing**
  - [ ] Test purchase flow
  - [ ] Test plan changes
  - [ ] Test cancellations
  - [ ] Test usage limits

- [ ] **Documentation**
  - [ ] API key generation guide
  - [ ] GitHub Action setup
  - [ ] Billing FAQ
  - [ ] Upgrade guides

## Metrics & Monitoring

### Key Metrics to Track
```typescript
// lib/billing/metrics.ts
export async function trackBillingMetrics() {
  const supabase = createClient();
  
  // Monthly Recurring Revenue (MRR)
  const { data: mrr } = await supabase
    .from('subscriptions')
    .select('plan_id')
    .eq('status', 'active');
  
  // Conversion Rate (Free to Paid)
  const { data: totalRepos } = await supabase
    .from('repos')
    .select('count');
  
  const { data: paidRepos } = await supabase
    .from('repos')
    .select('count')
    .neq('tier', 'free');
  
  // Churn Rate
  const { data: churned } = await supabase
    .from('subscriptions')
    .select('count')
    .eq('status', 'cancelled')
    .gte('cancelled_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
  
  return {
    mrr: calculateMRR(mrr),
    conversionRate: (paidRepos.count / totalRepos.count) * 100,
    churnRate: (churned.count / paidRepos.count) * 100,
  };
}
```

## Post-Launch Optimizations

1. **Usage-Based Pricing**: Consider per-warning pricing for high-volume users
2. **Team Plans**: Separate seat-based pricing from repository limits
3. **Annual Discounts**: Offer 20% off for annual commitments
4. **Referral Program**: Incentivize growth with account credits
5. **Enterprise Features**: Custom contracts, SLAs, dedicated support

## Success Criteria

- 5% free-to-paid conversion rate within 3 months
- <5% monthly churn rate
- 50+ paying customers in first 6 months
- $1000+ MRR by month 3
- 4.5+ star rating on GitHub Marketplace
```

### 9. Billing Page (app/(dashboard)/billing/page.tsx)
```tsx
import { createClient } from '@/lib/supabase/server';
import { PLANS } from '@/lib/billing/plans';
import { getUsageStats } from '@/lib/billing/usage';
import { PlanCard } from '@/components/billing/PlanCard';
import { UsageChart } from '@/components/billing/UsageChart';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ExternalLink, CreditCard } from 'lucide-react';

export default async function BillingPage() {
  const supabase = createClient();
  
  // Get current user and their repo
  const { data: { user } } = await supabase.auth.getUser();
  
  // For now, assume one repo per user (adjust for multi-repo support)
  const { data: repo } = await supabase
    .from('repos')
    .select(`
      *,
      subscriptions (*)
    `)
    .single();
  
  if (!repo) {
    return <div>No repository found</div>;
  }
  
  const currentPlan = repo.tier || 'free';
  const subscription = repo.subscriptions?.[0];
  
  // Get usage statistics
  const usage = await getUsageStats(repo.id);
  
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Billing & Usage</h1>
        <p className="text-muted-foreground mt-2">
          Manage your subscription and monitor usage
        </p>
      </div>
      
      {/* Current Plan Summary */}
      <div className="rounded-lg border bg-card p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold">
              Current Plan: {PLANS[currentPlan].displayName}
            </h2>
            <p className="text-muted-foreground mt-1">
              {subscription?.status === 'active' 
                ? `Next billing date: ${new Date(subscription.next_billing_date).toLocaleDateString()}`
                : 'No active subscription'
              }
            </p>
          </div>
          <Button variant="outline" asChild>
            <a 
              href={`https://github.com/marketplace/${process.env.NEXT_PUBLIC_GITHUB_APP_NAME}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <CreditCard className="w-4 h-4 mr-2" />
              Manage on GitHub
              <ExternalLink className="w-4 h-4 ml-2" />
            </a>
          </Button>
        </div>
      </div>
      
      {/* Usage Statistics */}
      <div>
        <h2 className="text-2xl font-semibold mb-4">Current Usage</h2>
        <UsageChart usage={usage} periodEnd={usage.period.end} />
      </div>
      
      {/* Upgrade Prompt for Free Users */}
      {currentPlan === 'free' && (
        <Alert>
          <AlertDescription>
            <strong>Unlock AI-powered summaries and advanced features!</strong>
            <br />
            Upgrade to Pro for AI summaries, Slack integration, and 12-month warning history.
          </AlertDescription>
        </Alert>
      )}
      
      {/* Available Plans */}
      <div>
        <h2 className="text-2xl font-semibold mb-4">Available Plans</h2>
        <div className="grid gap-6 md:grid-cols-3">
          {Object.values(PLANS).map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              currentPlan={plan.id === currentPlan}
              popular={plan.id === 'pro'}
              onSelect={() => {
                window.location.href = `https://github.com/marketplace/${process.env.NEXT_PUBLIC_GITHUB_APP_NAME}`;
              }}
            />
          ))}
        </div>
      </div>
      
      {/* FAQ Section */}
      <div className="mt-12">
        <h2 className="text-2xl font-semibold mb-4">Frequently Asked Questions</h2>
        <div className="space-y-4">
          <div>
            <h3 className="font-medium">How does billing work?</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Billing is handled through GitHub Marketplace. You'll be charged monthly based on your selected plan.
            </p>
          </div>
          <div>
            <h3 className="font-medium">Can I change plans anytime?</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Yes! You can upgrade or downgrade your plan anytime through GitHub Marketplace. Changes take effect immediately.
            </p>
          </div>
          <div>
            <h3 className="font-medium">What happens if I exceed my limits?</h3>
            <p className="text-sm text-muted-foreground mt-1">
              The GitHub Action will continue to work but won't send data to the dashboard. You'll see a message suggesting an upgrade.
            </p>
          </div>
          <div>
            <h3 className="font-medium">Do you offer annual billing?</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Not yet, but we're planning to add annual billing with a discount in the future.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
```

#### Usage Chart Component (components/billing/UsageChart.tsx)
```tsx
'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { AlertTriangle, TrendingUp, Package } from 'lucide-react';

interface UsageData {
  warnings: { used: number; limit: number; percentage: number };
  apiCalls: { used: number; limit: number; percentage: number };
  exports: { used: number; limit: number };
}

interface UsageChartProps {
  usage: UsageData;
  periodEnd: Date;
}

export function UsageChart({ usage, periodEnd }: UsageChartProps) {
  const daysRemaining = Math.ceil((periodEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  
  const getProgressColor = (percentage: number) => {
    if (percentage >= 90) return 'bg-red-500';
    if (percentage >= 75) return 'bg-yellow-500';
    return 'bg-green-500';
  };
  
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            Warnings Processed
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {usage.warnings.used.toLocaleString()}
            <span className="text-sm font-normal text-muted-foreground">
              / {usage.warnings.limit.toLocaleString()}
            </span>
          </div>
          <Progress 
            value={usage.warnings.percentage} 
            className="mt-2"
            indicatorClassName={getProgressColor(usage.warnings.percentage)}
          />
          <p className="text-xs text-muted-foreground mt-1">
            {usage.warnings.percentage}% of monthly limit
          </p>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            API Calls
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {usage.apiCalls.used}
            <span className="text-sm font-normal text-muted-foreground">
              / {usage.apiCalls.limit}/hr
            </span>
          </div>
          <Progress 
            value={usage.apiCalls.percentage} 
            className="mt-2"
            indicatorClassName={getProgressColor(usage.apiCalls.percentage)}
          />
          <p className="text-xs text-muted-foreground mt-1">
            Resets hourly
          </p>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <Package className="w-4 h-4" />
            Billing Period
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {daysRemaining} days
          </div>
          <p className="text-sm text-muted-foreground">
            remaining in period
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            Resets {periodEnd.toLocaleDateString()}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}# Phase 5: GitHub Marketplace & Billing - Enhanced Implementation Guide

## Overview
Implement GitHub Marketplace integration with subscription management, usage tracking, and billing enforcement. Transform SwiftConcur CI into a monetizable SaaS product with clear plan tiers and usage limits.

## Plans & Pricing

| Plan | Price | Quota | Features |
|------|-------|-------|----------|
| Free | $0 | 500 warnings/mo, 1 private repo | Dashboard, annotations |
| Pro | $12/repo/mo | 20k warnings/mo | AI summary, trend charts, Slack, 12-month history |
| Enterprise | Contact | Unlimited | SSO, audit logs, SOC-2 report, priority SLA |

## Architecture

```
GitHub Marketplace ─┐
                   ▼
          Webhook Events ──► API Handler
                              │
                              ▼
                         Supabase DB
                              │
                              ▼
                    Plan Enforcement Logic
                              │
                              ▼
                   Feature Access Control
```

## Implementation Structure

```
billing/
├── api/
│   ├── marketplace/
│   │   ├── webhook/
│   │   │   └── route.ts      # GitHub Marketplace webhook handler
│   │   └── setup/
│   │       └── route.ts      # Initial marketplace setup
│   ├── billing/
│   │   ├── check/
│   │   │   └── route.ts      # Plan validation endpoint
│   │   └── usage/
│   │       └── route.ts      # Usage reporting endpoint
│   └── stripe/              # Future: Direct billing option
│       └── webhook/
│           └── route.ts
├── lib/
│   ├── billing/
│   │   ├── plans.ts         # Plan definitions & limits
│   │   ├── usage.ts         # Usage tracking logic
│   │   ├── enforcement.ts   # Plan enforcement
│   │   └── events.ts        # Event handlers
│   └── github/
│       └── marketplace.ts   # GitHub Marketplace API
├── middleware/
│   └── planCheck.ts        # Plan verification middleware
├── components/
│   └── billing/
│       ├── PlanCard.tsx
│       ├── UsageChart.tsx
│       └── UpgradePrompt.tsx
└── database/
    └── migrations/
        └── 004_billing_tables.sql
```

## Database Schema

### 1. Billing Tables (database/migrations/004_billing_tables.sql)
```sql
-- GitHub Marketplace plans mapping
CREATE TABLE marketplace_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    github_plan_id INTEGER UNIQUE NOT NULL,
    internal_plan_id TEXT NOT NULL, -- 'free', 'pro', 'enterprise'
    name TEXT NOT NULL,
    price_monthly_cents INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default plans
INSERT INTO marketplace_plans (github_plan_id, internal_plan_id, name, price_monthly_cents) VALUES
(1001, 'free', 'Free', 0),
(1002, 'pro', 'Pro', 1200),
(1003, 'enterprise', 'Enterprise', 9900);

-- Customer subscriptions
CREATE TABLE subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    repo_id UUID REFERENCES repos(id) NOT NULL UNIQUE,
    github_account_id INTEGER NOT NULL,
    github_account_login TEXT NOT NULL,
    plan_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('active', 'cancelled', 'pending', 'past_due')),
    started_at TIMESTAMPTZ NOT NULL,
    cancelled_at TIMESTAMPTZ,
    next_billing_date TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Usage tracking with period-based structure
CREATE TABLE usage_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    repo_id UUID REFERENCES repos(id) NOT NULL,
    metric_name TEXT NOT NULL CHECK (metric_name IN ('warnings_processed', 'api_calls', 'exports')),
    quantity INTEGER NOT NULL DEFAULT 0,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(repo_id, metric_name, period_start)
);

-- Billing events audit log
CREATE TABLE billing_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    repo_id UUID REFERENCES repos(id),
    event_type TEXT NOT NULL,
    event_data JSONB NOT NULL,
    github_delivery_id TEXT UNIQUE,
    processed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Usage limits cache (for fast enforcement)
CREATE TABLE usage_limits (
    repo_id UUID REFERENCES repos(id) PRIMARY KEY,
    warnings_limit INTEGER NOT NULL,
    api_calls_limit INTEGER NOT NULL,
    current_warnings INTEGER NOT NULL DEFAULT 0,
    current_api_calls INTEGER NOT NULL DEFAULT 0,
    period_start DATE NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_subscriptions_github_account ON subscriptions(github_account_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
CREATE INDEX idx_usage_records_repo_period ON usage_records(repo_id, period_start);
CREATE INDEX idx_billing_events_repo ON billing_events(repo_id);
CREATE INDEX idx_billing_events_type ON billing_events(event_type);

-- Function to increment usage atomically
CREATE OR REPLACE FUNCTION increment_usage(
    p_repo_id UUID,
    p_metric_name TEXT,
    p_quantity INTEGER DEFAULT 1
) RETURNS void AS $$
DECLARE
    v_period_start DATE;
    v_period_end DATE;
BEGIN
    -- Calculate current billing period
    v_period_start := DATE_TRUNC('month', CURRENT_DATE)::DATE;
    v_period_end := (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month - 1 day')::DATE;
    
    -- Upsert usage record
    INSERT INTO usage_records (repo_id, metric_name, quantity, period_start, period_end)
    VALUES (p_repo_id, p_metric_name, p_quantity, v_period_start, v_period_end)
    ON CONFLICT (repo_id, metric_name, period_start)
    DO UPDATE SET 
        quantity = usage_records.quantity + p_quantity,
        updated_at = NOW();
    
    -- Update cache if warnings
    IF p_metric_name = 'warnings_processed' THEN
        UPDATE usage_limits
        SET current_warnings = current_warnings + p_quantity,
            updated_at = NOW()
        WHERE repo_id = p_repo_id AND period_start = v_period_start;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update repo tier on subscription change
CREATE OR REPLACE FUNCTION update_repo_tier() RETURNS TRIGGER AS $$
BEGIN
    UPDATE repos
    SET tier = NEW.plan_id
    WHERE id = NEW.repo_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER subscription_tier_sync
    AFTER INSERT OR UPDATE ON subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION update_repo_tier();
```

## Plan Configuration

### 2. Plan Definitions (lib/billing/plans.ts)
```typescript
export interface PlanLimits {
  warningsPerMonth: number | 'unlimited';
  apiCallsPerHour: number;
  exportSizeGB: number;
  repositories: number | 'unlimited';
  teamMembers: number | 'unlimited';
  retentionDays: number;
}
```

### 7. Plan Enforcement in GitHub Action

#### Updated action.yml
```yaml
name: 'SwiftConcur CI'
description: 'Track Swift concurrency warnings in your CI/CD pipeline'
author: 'SwiftConcur'

branding:
  icon: 'alert-triangle'
  color: 'orange'

inputs:
  github-token:
    description: 'GitHub token for PR comments'
    required: true
    default: ${{ github.token }}
  
  api-key:
    description: 'SwiftConcur API key for your repository'
    required: false
  
  scheme:
    description: 'Xcode scheme to build'
    required: true
  
  workspace:
    description: 'Path to .xcworkspace file'
    required: false
  
  project:
    description: 'Path to .xcodeproj file'
    required: false
  
  fail-on-warnings:
    description: 'Fail the build if warnings are found'
    required: false
    default: 'false'
  
  threshold:
    description: 'Maximum number of warnings before failing'
    required: false
    default: '0'

outputs:
  warning-count:
    description: 'Total number of warnings found'
  
  critical-count:
    description: 'Number of critical warnings'
  
  report-url:
    description: 'URL to the full report'

runs:
  using: 'docker'
  image: 'Dockerfile'
  env:
    GITHUB_TOKEN: ${{ inputs.github-token }}
    SWIFTCONCUR_API_KEY: ${{ inputs.api-key }}
    INPUT_SCHEME: ${{ inputs.scheme }}
    INPUT_WORKSPACE: ${{ inputs.workspace }}
    INPUT_PROJECT: ${{ inputs.project }}
    INPUT_FAIL_ON_WARNINGS: ${{ inputs.fail-on-warnings }}
    INPUT_THRESHOLD: ${{ inputs.threshold }}
```

#### Updated entrypoint.sh
```bash
#!/bin/bash
set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🔍 SwiftConcur CI - Swift Concurrency Warning Tracker"
echo "===================================================="

# Check if we're on a paid plan (API key provided)
if [ -n "$SWIFTCONCUR_API_KEY" ]; then
  echo -e "${YELLOW}🔐 Validating subscription...${NC}"
  
  PLAN_RESPONSE=$(curl -s -w "\n%{http_code}" \
    -H "Authorization: Bearer $SWIFTCONCUR_API_KEY" \
    "$SWIFTCONCUR_API_URL/api/billing/check")
  
  HTTP_CODE=$(echo "$PLAN_RESPONSE" | tail -n 1)
  RESPONSE_BODY=$(echo "$PLAN_RESPONSE" | head -n -1)
  
  if [ "$HTTP_CODE" -eq 402 ]; then
    REASON=$(echo "$RESPONSE_BODY" | jq -r '.reason')
    UPGRADE_URL=$(echo "$RESPONSE_BODY" | jq -r '.upgrade_url')
    echo -e "${RED}❌ Plan limit exceeded: $REASON${NC}"
    echo -e "${YELLOW}📈 Upgrade your plan at: $UPGRADE_URL${NC}"
    exit 1
  elif [ "$HTTP_CODE" -eq 429 ]; then
    echo -e "${RED}❌ Rate limit exceeded${NC}"
    echo "$RESPONSE_BODY" | jq
    exit 1
  elif [ "$HTTP_CODE" -ne 200 ]; then
    echo -e "${RED}❌ Failed to validate subscription${NC}"
    exit 1
  fi
  
  PLAN=$(echo "$RESPONSE_BODY" | jq -r '.plan')
  echo -e "${GREEN}✅ Subscription validated: $PLAN plan${NC}"
else
  echo -e "${YELLOW}ℹ️  Running in free tier mode (no API key provided)${NC}"
  echo "   To unlock AI summaries and advanced features, add your API key"
fi

# Run the Swift concurrency analysis
echo -e "\n${YELLOW}🏗️  Building project and analyzing warnings...${NC}"

# ... rest of the existing build logic ...

# If API key is provided, send results to API
if [ -n "$SWIFTCONCUR_API_KEY" ]; then
  echo -e "\n${YELLOW}📤 Sending results to SwiftConcur...${NC}"
  
  UPLOAD_RESPONSE=$(curl -s -w "\n%{http_code}" \
    -X POST \
    -H "Authorization: Bearer $SWIFTCONCUR_API_KEY" \
    -F "warnings.json=@$WARNINGS_FILE" \
    "$SWIFTCONCUR_API_URL/v1/warnings")
  
  HTTP_CODE=$(echo "$UPLOAD_RESPONSE" | tail -n 1)
  
  if [ "$HTTP_CODE" -eq 202 ]; then
    RUN_ID=$(echo "$UPLOAD_RESPONSE" | head -n -1 | jq -r '.id')
    echo -e "${GREEN}✅ Results uploaded successfully${NC}"
    echo -e "📊 View full report: $SWIFTCONCUR_APP_URL/run/$RUN_ID"
    echo "report-url=$SWIFTCONCUR_APP_URL/run/$RUN_ID" >> "$GITHUB_OUTPUT"
  else
    echo -e "${RED}❌ Failed to upload results${NC}"
  fi
fi

# ... rest of the script ...
```

### 8. Billing Dashboard Components

#### Plan Card Component (components/billing/PlanCard.tsx)
```tsx
'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, X, Sparkles } from 'lucide-react';
import { Plan } from '@/lib/billing/plans';

interface PlanCardProps {
  plan: Plan;
  currentPlan: boolean;
  popular?: boolean;
  onSelect: () => void;
}

export function PlanCard({ plan, currentPlan, popular, onSelect }: PlanCardProps) {
  const features = [
    {
      name: 'Private Repositories',
      included: plan.features.privateRepos,
    },
    {
      name: 'AI-Powered Summaries',
      included: plan.features.aiSummaries,
      highlight: true,
    },
    {
      name: 'Slack Integration',
      included: plan.features.slackIntegration,
    },
    {
      name: 'Warning History',
      value: plan.limits.retentionDays === 'unlimited' 
        ? 'Unlimited' 
        : `${plan.limits.retentionDays} days`,
      included: true,
    },
    {
      name: 'Monthly Warning Limit',
      value: plan.limits.warningsPerMonth === 'unlimited'
        ? 'Unlimited'
        : plan.limits.warningsPerMonth.toLocaleString(),
      included: true,
    },
    {
      name: 'SSO & Audit Logs',
      included: plan.features.sso,
    },
    {
      name: 'Priority Support',
      included: plan.features.prioritySupport,
    },
  ];
  
  return (
    <Card className={`relative ${currentPlan ? 'ring-2 ring-primary' : ''}`}>
      {popular && (
        <Badge className="absolute -top-3 left-1/2 -translate-x-1/2">
          Most Popular
        </Badge>
      )}
      
      <CardHeader>
        <CardTitle className="text-2xl">{plan.displayName}</CardTitle>
        <CardDescription>
          {plan.id === 'free' && 'Perfect for getting started'}
          {plan.id === 'pro' && 'Best for growing teams'}
          {plan.id === 'enterprise' && 'Advanced features for organizations'}
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-6">
        <div className="text-center">
          <span className="text-4xl font-bold">
            ${plan.priceMonthly / 100}
          </span>
          <span className="text-muted-foreground">/month</span>
        </div>
        
        <ul className="space-y-2">
          {features.map((feature) => (
            <li key={feature.name} className="flex items-start gap-2">
              {feature.included ? (
                <Check className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
              ) : (
                <X className="w-5 h-5 text-muted-foreground/50 mt-0.5 flex-shrink-0" />
              )}
              <span className={`text-sm ${!feature.included && 'text-muted-foreground/50'}`}>
                {feature.value || feature.name}
                {feature.highlight && feature.included && (
                  <Sparkles className="w-4 h-4 text-yellow-500 inline ml-1" />
                )}
              </span>
            </li>
          ))}
        </ul>
        
        <Button
          onClick={onSelect}
          variant={currentPlan ? 'outline' : popular ? 'default' : 'secondary'}
          className="w-full"
          disabled={currentPlan}
        >
          {currentPlan ? 'Current Plan' : 'Select Plan'}
        </Button>
      </CardContent>
    </Card>
  );
}
```

### 6. Plan Check Endpoint (app/api/billing/check/route.ts)
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { checkUsageLimit } from '@/lib/billing/usage';
import { PLANS } from '@/lib/billing/plans';

export async function GET(request: NextRequest) {
  try {
    // Extract API key from Authorization header
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Missing API key' }, { status: 401 });
    }
    
    const apiKey = authHeader.substring(7);
    const supabase = createClient();
    
    // Validate API key and get repo
    const { data: token } = await supabase
      .from('api_tokens')
      .select('repo_id, repos(id, tier)')
      .eq('token', apiKey)
      .single();
    
    if (!token) {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
    }
    
    const repoId = token.repo_id;
    const planId = token.repos.tier;
    
    // Check warnings limit
    const warningsCheck = await checkUsageLimit(repoId, 'warnings_processed', 0);
    
    if (!warningsCheck.allowed) {
      return NextResponse.json({
        valid: false,
        reason: `Monthly warning limit exceeded (${warningsCheck.current}/${warningsCheck.limit})`,
        upgrade_url: warningsCheck.upgradeUrl,
        limits: {
          warnings: warningsCheck,
        },
      }, { status: 402 }); // Payment Required
    }
    
    // Check API calls limit (hourly)
    const apiCheck = await checkUsageLimit(repoId, 'api_calls', 0);
    
    if (!apiCheck.allowed) {
      return NextResponse.json({
        valid: false,
        reason: `Hourly API call limit exceeded (${apiCheck.current}/${apiCheck.limit})`,
        upgrade_url: apiCheck.upgradeUrl,
        limits: {
          apiCalls: apiCheck,
        },
      }, { status: 429 }); // Too Many Requests
    }
    
    return NextResponse.json({
      valid: true,
      plan: planId,
      limits: {
        warnings: warningsCheck,
        apiCalls: apiCheck,
      },
    });
    
  } catch (error) {
    console.error('Plan check error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
```

### 5. Usage Tracking (lib/billing/usage.ts)
```typescript
import { createClient } from '@/lib/supabase/server';
import { PLANS } from './plans';

export async function initializeUsageLimits(repoId: string, planId: string) {
  const supabase = createClient();
  const plan = PLANS[planId];
  
  if (!plan) return;
  
  const periodStart = new Date();
  periodStart.setDate(1); // First day of month
  
  await supabase
    .from('usage_limits')
    .upsert({
      repo_id: repoId,
      warnings_limit: typeof plan.limits.warningsPerMonth === 'number' 
        ? plan.limits.warningsPerMonth 
        : 999999,
      api_calls_limit: plan.limits.apiCallsPerHour,
      current_warnings: 0,
      current_api_calls: 0,
      period_start: periodStart.toISOString().split('T')[0],
      updated_at: new Date().toISOString(),
    });
}

export async function checkUsageLimit(
  repoId: string,
  metric: 'warnings_processed' | 'api_calls',
  increment: number = 1
): Promise<{ allowed: boolean; limit: number; current: number; upgradeUrl?: string }> {
  const supabase = createClient();
  
  // Get current usage and limits
  const { data: limits } = await supabase
    .from('usage_limits')
    .select('*')
    .eq('repo_id', repoId)
    .single();
  
  if (!limits) {
    return { allowed: false, limit: 0, current: 0 };
  }
  
  const metricMap = {
    warnings_processed: 'warnings',
    api_calls: 'api_calls',
  };
  
  const limitField = `${metricMap[metric]}_limit`;
  const currentField = `current_${metricMap[metric]}`;
  
  const limit = limits[limitField];
  const current = limits[currentField];
  
  if (current + increment > limit) {
    return {
      allowed: false,
      limit,
      current,
      upgradeUrl: `https://github.com/marketplace/${process.env.NEXT_PUBLIC_GITHUB_APP_NAME}`,
    };
  }
  
  return { allowed: true, limit, current };
}

export async function incrementUsage(
  repoId: string,
  metric: 'warnings_processed' | 'api_calls' | 'exports',
  quantity: number = 1
): Promise<void> {
  const supabase = createClient();
  
  // Call the database function
  await supabase.rpc('increment_usage', {
    p_repo_id: repoId,
    p_metric_name: metric,
    p_quantity: quantity,
  });
}

export async function getUsageStats(repoId: string): Promise<{
  period: { start: Date; end: Date };
  warnings: { used: number; limit: number; percentage: number };
  apiCalls: { used: number; limit: number; percentage: number };
  exports: { used: number; limit: number };
}> {
  const supabase = createClient();
  
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
    .eq('repo_id', repoId)
    .eq('period_start', periodStart.toISOString().split('T')[0]);
  
  // Get limits
  const { data: limits } = await supabase
    .from('usage_limits')
    .select('*')
    .eq('repo_id', repoId)
    .single();
  
  const warningsUsed = usage?.find(u => u.metric_name === 'warnings_processed')?.quantity || 0;
  const apiCallsUsed = usage?.find(u => u.metric_name === 'api_calls')?.quantity || 0;
  const exportsUsed = usage?.find(u => u.metric_name === 'exports')?.quantity || 0;
  
  return {
    period: { start: periodStart, end: periodEnd },
    warnings: {
      used: warningsUsed,
      limit: limits?.warnings_limit || 0,
      percentage: Math.round((warningsUsed / (limits?.warnings_limit || 1)) * 100),
    },
    apiCalls: {
      used: apiCallsUsed,
      limit: limits?.api_calls_limit || 0,
      percentage: Math.round((apiCallsUsed / (limits?.api_calls_limit || 1)) * 100),
    },
    exports: {
      used: exportsUsed,
      limit: 10, // Fixed limit for now
    },
  };
}
```

### 4. Event Handlers (lib/billing/events.ts)
```typescript
import { createClient } from '@/lib/supabase/server';
import { getPlanByGitHubId, PLANS } from './plans';
import { initializeUsageLimits } from './usage';

export async function handlePurchase(event: MarketplaceEvent) {
  const supabase = createClient();
  const plan = getPlanByGitHubId(event.marketplace_purchase.plan.id);
  
  if (!plan) {
    throw new Error(`Unknown plan ID: ${event.marketplace_purchase.plan.id}`);
  }
  
  // Create or get repository
  let { data: repo } = await supabase
    .from('repos')
    .select('id')
    .eq('name', event.marketplace_purchase.account.login)
    .single();
  
  if (!repo) {
    const { data: newRepo } = await supabase
      .from('repos')
      .insert({
        name: event.marketplace_purchase.account.login,
        tier: plan.id,
      })
      .select()
      .single();
    repo = newRepo;
  }
  
  // Create subscription
  await supabase.from('subscriptions').insert({
    repo_id: repo!.id,
    github_account_id: event.marketplace_purchase.account.id,
    github_account_login: event.marketplace_purchase.account.login,
    plan_id: plan.id,
    status: 'active',
    started_at: new Date().toISOString(),
    next_billing_date: event.marketplace_purchase.next_billing_date,
  });
  
  // Initialize usage limits for the billing period
  await initializeUsageLimits(repo!.id, plan.id);
  
  // Send welcome notification
  await sendWelcomeNotification(event.marketplace_purchase.account.login, plan);
  
  console.log(`✅ New subscription: ${event.marketplace_purchase.account.login} on ${plan.displayName}`);
}

export async function handlePlanChange(event: MarketplaceEvent) {
  const supabase = createClient();
  const newPlan = getPlanByGitHubId(event.marketplace_purchase.plan.id);
  
  if (!newPlan) {
    throw new Error(`Unknown plan ID: ${event.marketplace_purchase.plan.id}`);
  }
  
  // Get repository
  const { data: repo } = await supabase
    .from('repos')
    .select('id, tier')
    .eq('name', event.marketplace_purchase.account.login)
    .single();
  
  if (!repo) {
    throw new Error(`Repository not found: ${event.marketplace_purchase.account.login}`);
  }
  
  const oldPlan = PLANS[repo.tier];
  
  // Update subscription
  await supabase
    .from('subscriptions')
    .update({
      plan_id: newPlan.id,
      updated_at: new Date().toISOString(),
    })
    .eq('repo_id', repo.id);
  
  // Handle downgrades
  if (isDowngrade(oldPlan, newPlan)) {
    await enforceDowngrade(repo.id, oldPlan, newPlan);
  }
  
  // Update usage limits
  await initializeUsageLimits(repo.id, newPlan.id);
  
  console.log(`✅ Plan changed: ${event.marketplace_purchase.account.login} from ${oldPlan.displayName} to ${newPlan.displayName}`);
}

export async function handleCancellation(event: MarketplaceEvent) {
  const supabase = createClient();
  
  // Get repository
  const { data: repo } = await supabase
    .from('repos')
    .select('id')
    .eq('name', event.marketplace_purchase.account.login)
    .single();
  
  if (!repo) {
    console.warn(`Repository not found for cancellation: ${event.marketplace_purchase.account.login}`);
    return;
  }
  
  // Update subscription status
  await supabase
    .from('subscriptions')
    .update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('repo_id', repo.id);
  
  // Downgrade to free plan
  await supabase
    .from('repos')
    .update({ tier: 'free' })
    .eq('id', repo.id);
  
  // Enforce free tier limits
  await enforceDowngrade(repo.id, PLANS[repo.tier], PLANS.free);
  
  console.log(`✅ Subscription cancelled: ${event.marketplace_purchase.account.login}`);
}

function isDowngrade(oldPlan: Plan, newPlan: Plan): boolean {
  return oldPlan.priceMonthly > newPlan.priceMonthly;
}

async function enforceDowngrade(repoId: string, oldPlan: Plan, newPlan: Plan) {
  const supabase = createClient();
  
  // Reduce data retention if needed
  if (typeof newPlan.limits.retentionDays === 'number') {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - newPlan.limits.retentionDays);
    
    // Delete old runs
    await supabase
      .from('runs')
      .delete()
      .eq('repo_id', repoId)
      .lt('created_at', cutoffDate.toISOString());
  }
  
  // Note: Repository limits are enforced at the organization level
  // since one GitHub account can have multiple repos
}

async function sendWelcomeNotification(accountLogin: string, plan: Plan) {
  // TODO: Implement email/notification service
  console.log(`Welcome email would be sent to ${accountLogin} for ${plan.displayName} plan`);
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
  githubPlanId: number;
  name: string;
  displayName: string;
  priceMonthly: number; // in cents
  limits: PlanLimits;
  features: PlanFeatures;
}

export const PLANS: Record<string, Plan> = {
  free: {
    id: 'free',
    githubPlanId: 1001,
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
    githubPlanId: 1002,
    name: 'pro',
    displayName: 'Pro',
    priceMonthly: 1200, // $12
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
    githubPlanId: 1003,
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

export function getPlanByGitHubId(githubPlanId: number): Plan | undefined {
  return Object.values(PLANS).find(plan => plan.githubPlanId === githubPlanId);
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
```

### 3. GitHub Marketplace Webhook Handler (app/api/marketplace/webhook/route.ts)
```typescript
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createClient } from '@/lib/supabase/server';
import { getPlanByGitHubId } from '@/lib/billing/plans';
import { 
  handlePurchase, 
  handlePlanChange, 
  handleCancellation 
} from '@/lib/billing/events';

interface MarketplacePurchase {
  account: {
    id: number;
    login: string;
    type: 'User' | 'Organization';
  };
  billing_cycle: 'monthly' | 'yearly';
  unit_count: number;
  on_free_trial: boolean;
  free_trial_ends_on: string | null;
  next_billing_date: string;
  plan: {
    id: number;
    name: string;
    description: string;
    monthly_price_in_cents: number;
    yearly_price_in_cents: number;
    price_model: string;
    has_free_trial: boolean;
    unit_name: string | null;
    bullets: string[];
  };
}

interface MarketplaceEvent {
  action: 'purchased' | 'changed' | 'cancelled' | 'pending_change' | 'pending_change_cancelled';
  effective_date?: string;
  sender: {
    id: number;
    login: string;
  };
  marketplace_purchase: MarketplacePurchase;
  previous_marketplace_purchase?: MarketplacePurchase;
}

export async function POST(request: NextRequest) {
  try {
    // Verify webhook signature
    const body = await request.text();
    const signature = request.headers.get('X-Hub-Signature-256');
    const deliveryId = request.headers.get('X-GitHub-Delivery');
    
    if (!verifyWebhookSignature(body, signature, process.env.GITHUB_WEBHOOK_SECRET!)) {
      console.error('Invalid webhook signature');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const event: MarketplaceEvent = JSON.parse(body);
    const supabase = createClient();
    
    // Log all events for audit trail
    await supabase.from('billing_events').insert({
      event_type: `marketplace_${event.action}`,
      event_data: event,
      github_delivery_id: deliveryId,
    });
    
    // Process event based on action
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
        // Log pending changes but don't process until effective
        console.log(`Pending change for ${event.marketplace_purchase.account.login}`);
        break;
        
      case 'pending_change_cancelled':
        // Log cancellation of pending change
        console.log(`Pending change cancelled for ${event.marketplace_purchase.account.login}`);
        break;
        
      default:
        console.warn('Unknown marketplace action:', event.action);
    }
    
    return NextResponse.json({ received: true }, { status: 200 });
    
  } catch (error) {
    console.error('Marketplace webhook error:', error);
    return NextResponse.json(
      { error: 'Internal server error' }, 
      { status: 500 }
    );
  }
}

function verifyWebhookSignature(
  body: string,
  signature: string | null,
  secret: string
): boolean {
  if (!signature) return false;
  
  const expectedSignature = `sha256=${crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('hex')}`;
  
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}