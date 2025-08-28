Day 3: Observability & stability
Owner: Aaron
Timebox: 1 day
Dependencies: Sentry DSN; logging framework; API deployed locally

Checklist
- [ ] Add Sentry (API + dashboard)
- [ ] Add request IDs + structured logs (API)
- [ ] Latency/parse-time histogram (simple metrics)
- [ ] Rate limiting/backoff on webhooks
- [ ] Hard cap + graceful truncation message for very large logs

Success criteria: You can trace a failing request end-to-end in Sentry.
