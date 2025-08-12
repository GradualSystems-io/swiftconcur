# SwiftConcur Dual Billing System

## Overview

SwiftConcur now supports both **Stripe** and **GitHub Marketplace** billing systems, giving customers flexibility in how they pay for the service. This dual billing approach allows you to capture different market segments and leverage both platforms' strengths.

## Architecture

### Billing Providers

1. **Stripe** (Direct Billing)
   - Credit card payments
   - Instant activation
   - Full control over pricing
   - Custom billing cycles
   - Direct customer relationship

2. **GitHub Marketplace**
   - GitHub-integrated billing
   - Organization purchasing
   - GitHub's trust and security
   - Marketplace discoverability
   - Enterprise procurement friendly

### Database Design

The system uses a unified database schema that supports both billing providers:

```sql
-- Subscriptions table supports both providers
ALTER TABLE subscriptions ADD COLUMN billing_provider TEXT DEFAULT 'stripe' 
  CHECK (billing_provider IN ('stripe', 'github_marketplace'));

-- GitHub-specific fields
ALTER TABLE subscriptions ADD COLUMN github_account_id INTEGER;
ALTER TABLE subscriptions ADD COLUMN billing_cycle TEXT;

-- GitHub accounts table
CREATE TABLE github_accounts (
  github_account_id INTEGER UNIQUE,
  github_login TEXT,
  account_type TEXT -- 'User' or 'Organization'
);
```

## Implementation Details

### Webhook Processing

Both billing providers use secure webhook processing:

#### Stripe Webhooks (`/api/stripe/webhook`)
- Signature verification with `STRIPE_WEBHOOK_SECRET`
- Handles subscription lifecycle events
- Updates subscription status in real-time
- Integrates with Stripe's robust retry logic

#### GitHub Marketplace Webhooks (`/api/github/marketplace/webhook`)
- Signature verification with `GITHUB_WEBHOOK_SECRET`
- Processes marketplace purchase events
- Handles organization billing
- Supports free trials and plan changes

### Security Features

#### Authentication & Authorization
- Row Level Security (RLS) policies protect all billing data
- User ownership verification for all operations
- API key validation for external integrations
- Comprehensive audit logging

#### Payment Security
- **Stripe**: PCI DSS Level 1 compliant processing
- **GitHub**: Leverages GitHub's security infrastructure
- No payment data stored in application database
- Encrypted webhook communications

#### Data Protection
- Sensitive data redaction in logs
- Input validation for all billing operations
- Rate limiting on billing endpoints
- GDPR and privacy compliance features

### Plan Management

#### Unified Plan Structure
```typescript
interface Plan {
  id: string; // 'free', 'pro', 'enterprise'
  stripePriceId?: string; // For Stripe billing
  features: PlanFeatures;
  limits: PlanLimits;
}
```

#### Feature Access Control
```typescript
// Unified feature checking
const hasFeature = await canUserAccessFeature(userId, 'ai_summaries');

// Provider-specific checks
const stripeAccess = canAccessFeature(planId, feature);
const githubAccess = gitHubPlanSupportsFeature(planId, feature);
```

### Usage Tracking

#### Real-time Enforcement
- Atomic usage increments prevent race conditions
- Plan limits enforced before processing
- Graceful degradation when limits exceeded
- Usage resets automatically each billing period

#### Metrics Collection
```typescript
// Common interface for both providers
interface UsageStats {
  warnings: { used: number; limit: number; percentage: number };
  apiCalls: { used: number; limit: number; percentage: number };
  exports: { used: number; limit: number };
}
```

## User Experience

### Billing Page Features

#### Provider Selection
- Clear comparison of Stripe vs GitHub Marketplace
- Recommendation based on user type (individual vs organization)
- Feature parity across both providers

#### Subscription Management
- **Stripe**: Integrated subscription management with cancellation/reactivation
- **GitHub**: Redirect to GitHub Marketplace for management
- Unified status display regardless of provider

#### Usage Visualization
- Real-time usage charts
- Plan utilization metrics
- Upgrade prompts when approaching limits

### Plan Selection Flow

1. **Free Users**: Choose between Stripe and GitHub Marketplace
2. **Stripe Flow**: Direct checkout with immediate activation
3. **GitHub Flow**: Redirect to GitHub Marketplace for installation

## Configuration

### Environment Variables

```bash
# Stripe Configuration
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRO_PRICE_ID=price_...
STRIPE_ENTERPRISE_PRICE_ID=price_...

# GitHub Marketplace Configuration
GITHUB_WEBHOOK_SECRET=your-webhook-secret
NEXT_PUBLIC_GITHUB_APP_NAME=swiftconcur-ci

# App Configuration
NEXT_PUBLIC_APP_URL=https://your-domain.com
```

### Database Migration

Run both migration files in order:
1. `004_billing_tables.sql` - Core billing infrastructure
2. `005_github_marketplace.sql` - GitHub Marketplace extensions

## GitHub App Setup

### 1. Create GitHub App

Use the provided manifest file:
```bash
# Upload github-app/app-manifest.json to GitHub
# Configure webhook URL: https://your-domain.com/api/github/marketplace/webhook
```

### 2. Marketplace Listing

- Use `github-app/marketplace-listing.md` for app description
- Configure pricing plans from `github-app/pricing-plans.json`
- Set up webhook endpoints and permissions

### 3. Plan Configuration

Map GitHub plan IDs to internal plan names:
```sql
INSERT INTO github_marketplace_plans (github_plan_id, internal_plan_id, name) VALUES
(1001, 'free', 'Free'),
(1002, 'pro', 'Pro'),
(1003, 'enterprise', 'Enterprise');
```

## Testing Strategy

### Unit Tests
- Webhook signature verification
- Plan mapping and feature access
- Usage tracking and limits
- Database functions

### Integration Tests
- End-to-end subscription flows
- Webhook event processing
- UI components with both providers
- Error handling and edge cases

### Security Tests
- Authentication bypass attempts
- Webhook replay attacks
- Input validation
- Rate limiting effectiveness

## Monitoring & Analytics

### Key Metrics

#### Business Metrics
```typescript
interface BillingMetrics {
  stripe: {
    totalSubscriptions: number;
    mrr: number;
    churnRate: number;
  };
  github: {
    totalSubscriptions: number;
    mrr: number;
    trialConversionRate: number;
  };
  combined: {
    totalRevenue: number;
    customerLifetimeValue: number;
    providerSplit: { stripe: number; github: number };
  };
}
```

#### Operational Metrics
- Webhook delivery success rates
- Payment failure rates
- API response times
- Database performance

### Alerting

Set up monitoring for:
- Failed webhook deliveries
- Payment processing errors
- Usage limit violations
- Security incidents

## Deployment Checklist

### Pre-deployment
- [ ] Configure both Stripe and GitHub webhook endpoints
- [ ] Set up environment variables
- [ ] Run database migrations
- [ ] Test webhook signatures
- [ ] Verify plan mappings

### Production Deployment
- [ ] Deploy application with billing routes
- [ ] Configure webhook endpoints in production
- [ ] Test both payment flows
- [ ] Monitor webhook delivery
- [ ] Verify usage tracking

### Post-deployment
- [ ] Monitor billing metrics
- [ ] Test customer upgrade/downgrade flows
- [ ] Verify data synchronization
- [ ] Check security logs

## Troubleshooting

### Common Issues

#### Webhook Failures
```bash
# Check webhook delivery logs
curl -H "Authorization: Bearer $GITHUB_TOKEN" \
  https://api.github.com/app/hook/deliveries

# Verify signatures
# Check GITHUB_WEBHOOK_SECRET matches GitHub App settings
```

#### Subscription Sync Issues
```sql
-- Check subscription status
SELECT * FROM subscriptions WHERE billing_provider = 'github_marketplace';

-- Verify plan mappings
SELECT * FROM github_marketplace_plans;

-- Check recent events
SELECT * FROM billing_events WHERE billing_provider = 'github_marketplace' 
ORDER BY created_at DESC LIMIT 10;
```

#### Usage Tracking Problems
```sql
-- Check usage limits
SELECT * FROM usage_limits WHERE repo_id = 'your-repo-id';

-- Verify usage records
SELECT * FROM usage_records WHERE subscription_id = 'your-sub-id';
```

## Future Enhancements

### Planned Features
1. **Multi-provider Support**: Allow switching between providers
2. **Enterprise Features**: Custom contracts and pricing
3. **Usage-based Billing**: Per-warning pricing tiers
4. **Partner Programs**: Revenue sharing with integrators

### Technical Improvements
1. **Webhook Reliability**: Enhanced retry logic and dead letter queues
2. **Real-time Updates**: WebSocket notifications for billing changes
3. **Advanced Analytics**: Customer segmentation and cohort analysis
4. **API Versioning**: Backward-compatible billing API evolution

## Support

### Documentation
- [Stripe Setup Guide](./STRIPE_SETUP.md)
- [GitHub App Configuration](./github-app/)
- [API Documentation](./app/api/)

### Testing
- Comprehensive test suite in `__tests__/billing/`
- GitHub Marketplace webhook testing
- Stripe webhook simulation

### Monitoring
- Billing event audit logs
- Real-time usage tracking
- Security incident detection

This dual billing system provides maximum flexibility while maintaining security and reliability across both payment platforms.