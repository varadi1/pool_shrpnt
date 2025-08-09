# 19) Risks & Mitigations

- Graph/SharePoint throttling → robust backoff + idempotent jobs + off‑peak heavy ops.
- Complex exceptions in RBAC → conflict detector + effective access preview.
- Scheduler drift → re‑entrant jobs with desired‑state reconciliation.
- Partner IT policy variability → early onboarding guide + guest domain allowlist.

---
