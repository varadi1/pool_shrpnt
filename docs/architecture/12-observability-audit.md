# 12) Observability & Audit

- **Metrics**: provision time, Graph call success/429 rate, retries, queue latency, lock job durations, export durations.
- **Logs**: JSON; correlation id per request/job; shipped to central store.
- **Audit**: immutable table; events for templates, provisioning, locks (manual/CR/scheduled), users/guests, reports, notifications.
- **Alerts**: failed provision, repeated 429, missed scheduler window, notification failure spike.

---
