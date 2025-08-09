# 1) Architecture Principles

- **PRD‑first**: no scope creep; map every component to PRD epics/stories.
- **Least privilege**: app‑only Graph permissions; scoped SP/Teams access.
- **Idempotent & resilient**: all provisioning/lock jobs re‑entrant; retries & backoff.
- **Observe everything**: metrics, logs, audit are first‑class.
- **Monorepo**: shared types/contracts, single CI/CD.

---
