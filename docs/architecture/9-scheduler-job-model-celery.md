# 9) Scheduler & Job Model (Celery)

- **Periodic** (every 15m): lock evaluator → apply transitions (T−3/−1/T+0/T+8), CR expiries.
- **Queues**: `provisioning`, `locks`, `notifications`, `reports` with fair dispatch; concurrency tuned; per‑queue backoff strategy.
- **Idempotence**: dedupe on `(emId, op, scope, tsWindow)`; distributed lock to avoid overlap.
- **Failure policy**: retry w/ exponential backoff; poison‑message DLQ metric + alert; compensating runs.

---
