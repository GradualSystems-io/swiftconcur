Day 1: PR check output that sells the value
Owner: Aaron
Timebox: 1 day
Dependencies: Parser exposes metrics; GitHub token/secrets set; sample repo with PR

Checklist
- [ ] Ensure parser returns: total build time, delta vs baseline, count of actor-isolation warnings, new since last PR, and top 3 offenders (file:line)
- [ ] Format PR comment (tight, skimmable):
  - Title + emoji
  - "⏱ Build 18m (+12%) vs baseline"
  - "⚠️ 6 actor-isolation warnings (3 new): A.swift:42, …"
  - "🔗 Details → Dashboard"
- [ ] Add status check (success/warn/fail thresholds configurable)
- [ ] Save a golden PR screenshot for landing page/demo

Success criteria: one PR on a sample repo shows the comment exactly as you want customers to see it.
