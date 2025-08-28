Day 4: Privacy, data handling, deletion
Owner: Aaron
Timebox: 1 day
Dependencies: DB access; auth in place; config flags wiring

Checklist
- [ ] Config flag: don't persist logs (process in-memory) or retain <24h
- [ ] Build Delete-my-data endpoint + admin button
- [ ] Draft Privacy page (plain-English): no source code stored, log retention, data isolation
- [ ] Add Data Processing Addendum template in /legal/ (for later sharing)

Success criteria: Hitting the delete endpoint removes all org data and returns 200.
