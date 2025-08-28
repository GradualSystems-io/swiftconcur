
Day 5: Pricing & billing (Stripe)
Owner: Aaron
Timebox: 1 day
Dependencies: Stripe account/keys; webhook endpoint; plan matrix

Checklist
- [ ] Create Products/Prices in Stripe:
  - Free (1 repo, 200 builds/mo, 7-day history)
  - Team $49 (10 repos, 10k builds/mo, 90-day)
  - Growth $199 (org-wide, 1-yr, priority support)
- [ ] Implement Stripe Checkout + Customer Portal
- [ ] Gate features by plan (repo count, history window)
- [ ] 14-day free trial; show remaining days in UI

Success criteria: You can upgrade/downgrade your own test org and see limits enforced.
