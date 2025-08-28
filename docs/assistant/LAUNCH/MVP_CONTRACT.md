MVP Contract (SwiftConcur v0.1.0)

Owner: Aaron
Timebox: 1 day
Purpose: Define the minimal, valuable product to ship within 12 days.

In-Scope (must ship)
- PR Check Comment:
  - Shows build duration and delta vs baseline
  - Shows total actor-isolation warnings and new vs baseline
  - Lists top 3 offenders as file:line
  - Includes link to Dashboard details
  - Status check reflects thresholds (success/warn/fail)
- Dashboard (Must-haves):
  - Repo list with last 30 analyses
  - Build duration sparkline and warnings trend
  - “New since baseline” section with file:line links
  - Link back to originating PR/commit
- Plans & Billing (Free + Checkout):
  - Free tier: 1 repo, 200 builds/mo, 7-day history
  - Stripe Checkout + Customer Portal live
  - Feature gating by plan (repo count, history window)

Out-of-Scope (post-launch)
- Advanced insights (flaky tests, hotspots, etc.)
- Long-term history retention > 90 days
- SSO/Enterprise features and on-prem
- Deep performance budgets/coverage integrations
- Non-blocking security scans in PRs

Non-Goals
- Perfect design polish; aim for clear and functional
- Full marketplace automation; manual steps acceptable

Success Criteria
- Fresh repo installs the Action and sees a PR comment < 5 minutes
- Dashboard loads in < 2 seconds with data and trends
- Stripe flow completes: free → checkout → portal

Acceptance Checks
- Open PR on sample repo shows comment with required fields
- Dashboard page shows latest 30 analyses with trends and links
- Plan enforcement works for free tier limits
- Stripe test customer can upgrade/downgrade successfully

Risks & Mitigations
- Build logs too large: hard cap + graceful truncation
- Noisy warnings: baseline comparison + filters
- CI variance: clear error handling and retries

Dependencies
- GitHub Action runtime ready (Dockerfile, entrypoint, action.yml)
- Parser outputs metrics used in comment and dashboard
- Backend endpoints and DB schema support trends and gating
- Stripe keys configured; webhooks reachable
