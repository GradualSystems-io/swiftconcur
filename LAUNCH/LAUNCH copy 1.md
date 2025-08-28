Day 0 (today): lock scope & baseline
	•	Write your MVP contract (1 page): PR check comment + dashboard trends + 1-repo free tier + Stripe checkout. Everything else = post-launch.
	•	Create LAUNCH.md at repo root with this checklist pasted in.
	•	Tag last green commit: v0.1.0-rc1 so you can always roll back.
	•	Turn off non-essential workflows (keep build/test only).
	•	Create “launch” branch for work you’ll ship in the next 12 days.

⸻

Day 1: PR check output that sells the value
	•	Ensure parser returns: total build time, delta vs baseline, count of actor-isolation warnings, new since last PR, and top 3 offenders (file:line).
	•	Format PR comment (tight, skimmable):
	•	Title + emoji
	•	“⏱ Build 18m (+12%) vs baseline”
	•	“⚠️ 6 actor-isolation warnings (3 new): A.swift:42, …”
	•	“🔗 Details → Dashboard”
	•	Add status check (success/warn/fail thresholds configurable).
	•	Save a golden PR screenshot for landing page/demo.

Definition of done: one PR on a sample repo shows the comment exactly as you want customers to see it.

⸻

Day 2: Dashboard “must-haves”
	•	Repo list + last 30 analyses.
	•	Build duration chart (sparkline) & warnings trend.
	•	“New since baseline” section with file:line links.
	•	Link back to the originating PR/commit.
	•	Add a /status JSON endpoint (uptime target 99.9).

DoD: Demo repo shows data within 2–3s; no console errors.

⸻

Day 3: Observability & stability
	•	Add Sentry (API + dashboard).
	•	Add request IDs + structured logs (API).
	•	Latency/parse-time histogram (simple metrics).
	•	Rate limiting/backoff on webhooks.
	•	Hard cap + graceful truncation message for very large logs.

DoD: You can trace a failing request end-to-end in Sentry.

⸻

Day 4: Privacy, data handling, deletion
	•	Config flag: don’t persist logs (process in-memory) or retain <24h.
	•	Build Delete-my-data endpoint + admin button.
	•	Draft Privacy page (plain-English): no source code stored, log retention, data isolation.
	•	Add Data Processing Addendum template in /legal/ (for later sharing).

DoD: Hitting the delete endpoint removes all org data and returns 200.

⸻

Day 5: Pricing & billing (Stripe)
	•	Create Products/Prices in Stripe:
	•	Free (1 repo, 200 builds/mo, 7-day history)
	•	Team $49 (10 repos, 10k builds/mo, 90-day)
	•	Growth $199 (org-wide, 1-yr, priority support)
	•	Implement Stripe Checkout + Customer Portal.
	•	Gate features by plan (repo count, history window).
	•	14-day free trial; show remaining days in UI.

DoD: You can upgrade/downgrade your own test org and see limits enforced.

⸻

Day 6: GitHub install & Action
	•	Publish/verify gradualsystems-io/swiftconcur-action@v1.
	•	Generate one-file workflow snippet for docs.
	•	Token flow: SWIFTCONCUR_TOKEN env + repo/Org ID mapping.
	•	Support local CLI parity (prints shareable URL).

DoD: Fresh repo installs the Action and sees a PR comment in <5 minutes.

⸻

Day 7: Landing page + docs
	•	Landing (Vercel): hero, 10-sec GIF of PR comment, “How it works (3 steps)”, pricing, privacy, CTA buttons (Install / Try sample).
	•	Docs (/docs): Quickstart (GitHub), CLI usage, FAQ, Troubleshooting.
	•	Changelog page + public Roadmap (Now/Next/Later).
	•	Add favicon, OpenGraph image, basic SEO (title/desc, sitemap).

DoD: A stranger can install from the homepage without contacting you.

⸻

Day 8: Support & comms
	•	Set up support@gradualsystems.io with SPF/DKIM/DMARC.
	•	In-app “Report issue” with build ID + email prefilled.
	•	Saved replies: onboarding, billing, bug report template.
	•	Simple NPS thumbs-up/down on PR comment (“Was this helpful?” → link to feedback).

DoD: You receive a test support email with all context auto-attached.

⸻

Day 9: Marketplace + compliance basics
	•	GitHub Marketplace listing: description, screenshots, pricing tiers, keywords (swift, xcode, concurrency, build time).
	•	Terms of Service (short), Refund policy (14-day), Privacy (from Day 4). (Not legal advice; keep it simple & honest.)
	•	Public Status page (even a JSON view + UptimeRobot).
	•	Verify cookie/banner if you use analytics.

DoD: Listing submitted; links from landing page point to legal pages.

⸻

Day 10: Demo & content
	•	Record 2-min demo video: install → PR → dashboard.
	•	Write 1 blog post: “Actor-isolation warnings: what they mean & how to burn them down” with real examples.
	•	Add sample repo (intentionally includes warnings, long build) with a ready workflow.

DoD: You can watch the demo end-to-end and it mirrors the current UI.

⸻

Day 11: Outreach machinery
	•	Build lead list (≥100): iOS leads/dev-infra at seed–Series B.
	•	Personalize 20/day messages (email/LinkedIn/X). Use this:
“We analyze xcodebuild logs to surface actor-isolation warnings & build-time regressions in your PR checks. No source stored; logs ephemeral. Install in ~2 minutes. Want me to enable it on a sample PR so you can see the comment?”
	•	Post in: iOS Dev Weekly submission, r/iOSProgramming launch thread, relevant Discord/Slack groups.
	•	Add a “Founders note” on landing: why you built this.

DoD: 20 personalized messages sent; 2 community posts live.

⸻

Day 12: Ship & measure
	•	Flip “public” switches: marketplace listing, pricing on site, demo live.
	•	Instrument key events: install, first_analysis, pr_comment_view, dashboard_view, subscribe.
	•	Create a daily metrics doc (7-day rolling): installs, activations (PR analyzed), DAU, conversions, top errors.
	•	Set up weekly email to yourself: “What did users do/struggle with?”

DoD: First user can self-serve from homepage → PR comment → dashboard → paid.

⸻

Post-launch (backlog to pull when you have signal)
	•	Enterprise: SSO request waitlist, DPA on request, on-prem roadmap page.
	•	Non-blocking sec scans (Trivy/cargo-audit) that comment on PRs but don’t fail builds.
	•	Perf budgets and coverage (if customers ask).
	•	Deeper insights: flaky test detector, module build hot-spots, time-to-first-test.

⸻

Working notes / pro tips
	•	Keep PR comment sacred: it is the product for 80% of users.
	•	Prefer boring tech over cleverness (especially around billing/auth).
	•	Measure daily; change one thing at a time.
	•	If you get stuck >2 hours on any task, skip and keep momentum—you can backfill later.
