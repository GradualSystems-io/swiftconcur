Implement GitHub Marketplace integration:

1. Webhook handler for marketplace events:
   - Purchase, cancellation, plan changes
   - Sync with internal user database
   - Enable/disable features based on plan

2. Plan enforcement:
   - Free tier: 1 public repo
   - Paid tier: Unlimited private repos
   - Enterprise: SAML SSO + priority support

3. Usage tracking and limits
4. Grace period handling
5. Integration tests for billing scenarios