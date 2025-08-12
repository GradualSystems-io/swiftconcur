# Stripe Billing Setup Guide

This guide will help you set up Stripe for secure payment processing in SwiftConcur.

## Prerequisites

1. **Stripe Account**: Create a Stripe account at [stripe.com](https://stripe.com)
2. **Supabase Project**: Ensure your Supabase project is configured with the billing tables

## 1. Stripe Dashboard Configuration

### Create Products and Prices

In your Stripe Dashboard, create the following products:

#### Pro Plan
1. Go to **Products** → **Add Product**
2. Set name: "SwiftConcur Pro"
3. Set price: $12.00 USD, recurring monthly
4. Copy the Price ID (starts with `price_`) and Product ID (starts with `prod_`)

#### Enterprise Plan  
1. Go to **Products** → **Add Product**
2. Set name: "SwiftConcur Enterprise"
3. Set price: $99.00 USD, recurring monthly
4. Copy the Price ID and Product ID

### Configure Webhooks

1. Go to **Developers** → **Webhooks**
2. Click **Add endpoint**
3. Set URL: `https://your-domain.com/api/stripe/webhook`
4. Select events to send:
   - `customer.created`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
5. Copy the **Signing secret** (starts with `whsec_`)

## 2. Environment Variables

Add these variables to your `.env.local` file:

```bash
# Stripe Configuration
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Stripe Product/Price IDs
STRIPE_PRO_PRODUCT_ID=prod_...
STRIPE_PRO_PRICE_ID=price_...
STRIPE_ENTERPRISE_PRODUCT_ID=prod_...
STRIPE_ENTERPRISE_PRICE_ID=price_...

# App URLs
NEXT_PUBLIC_APP_URL=https://your-domain.com
```

## 3. Database Migration

Run the billing tables migration:

```sql
-- Execute the contents of database/migrations/004_billing_tables.sql
-- in your Supabase SQL editor
```

## 4. Testing Setup

### Test Mode Configuration

For development, use Stripe's test mode:

1. Toggle to **Test mode** in Stripe Dashboard
2. Use test API keys (they start with `sk_test_` and `pk_test_`)
3. Use test webhook endpoint for local development

### Local Development Webhook Testing

1. Install Stripe CLI: `brew install stripe/stripe-cli/stripe`
2. Login: `stripe login`
3. Forward events to local server:
   ```bash
   stripe listen --forward-to localhost:3000/api/stripe/webhook
   ```
4. Use the webhook secret from the CLI output

### Test Cards

Use these test card numbers:
- **Success**: `4242 4242 4242 4242`
- **Decline**: `4000 0000 0000 0002`
- **Authentication Required**: `4000 0025 0000 3155`

## 5. Security Best Practices

### API Key Security
- **Never commit API keys** to version control
- Use test keys in development, live keys only in production
- Rotate keys regularly
- Use environment variables for all keys

### Webhook Security
- **Always verify webhook signatures** (implemented in our webhook handler)
- Use HTTPS endpoints only
- Implement idempotency for webhook processing
- Log all webhook events for audit trails

### Customer Data Protection
- Store minimal customer data
- Use Stripe Customer Portal for self-service
- Implement proper access controls with RLS policies
- Regular security audits

## 6. Production Deployment

### Before Going Live

1. **Switch to Live Mode** in Stripe Dashboard
2. Update environment variables with live keys
3. Configure live webhook endpoint
4. Test the complete flow with a real payment
5. Set up monitoring and alerts

### Required Stripe Settings

1. **Enable Customer Portal** in Stripe Dashboard
2. **Configure tax settings** if applicable
3. **Set up business information** for invoices
4. **Enable dispute protection** (optional)

### Monitoring

Monitor these metrics:
- Successful vs failed payments
- Subscription churn rate
- Webhook delivery status
- API error rates

## 7. Development Workflow

### Testing Payment Flows

```bash
# Test subscription creation
curl -X POST http://localhost:3000/api/stripe/checkout \
  -H "Content-Type: application/json" \
  -d '{"planId": "pro"}'

# Test webhook processing
stripe trigger customer.subscription.created
```

### Database Verification

After successful payment:
```sql
-- Check customer creation
SELECT * FROM stripe_customers WHERE email = 'test@example.com';

-- Check subscription status  
SELECT * FROM subscriptions WHERE status = 'active';

-- Verify usage limits
SELECT * FROM usage_limits;
```

## 8. Troubleshooting

### Common Issues

1. **Webhook signature verification fails**
   - Check webhook secret matches environment variable
   - Ensure raw body is used for verification
   - Verify endpoint URL is correct

2. **Customer not found errors**
   - Ensure customer is created before subscription
   - Check user ID metadata is set correctly
   - Verify RLS policies allow access

3. **Payment failures**
   - Check Stripe logs for detailed error messages
   - Verify customer has valid payment method
   - Test with different test cards

### Debug Mode

Enable debug logging by setting:
```bash
STRIPE_DEBUG=true
```

## 9. Support and Documentation

- [Stripe Documentation](https://stripe.com/docs)
- [Stripe API Reference](https://stripe.com/docs/api)
- [Webhook Testing Guide](https://stripe.com/docs/webhooks/test)
- [Test Card Numbers](https://stripe.com/docs/testing#cards)

## 10. Compliance

Our implementation follows:
- **PCI DSS compliance** (through Stripe)
- **GDPR requirements** (customer data protection)
- **SOC 2 Type II** standards (security controls)
- **3D Secure** authentication (for EU compliance)