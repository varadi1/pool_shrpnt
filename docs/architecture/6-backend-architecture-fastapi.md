# 6) Backend Architecture (FastAPI)

**Layers**

- **API** (routers) → **Service** (business rules) → **Repository** (DB) → **Integrations** (Graph/SP clients) → **Jobs** (Celery tasks).

**Core modules**

- **Provisioning**: Teams/Channel creation, SP drive & folder tree create, ACL application. Idempotence with **idempotency keys** per EM.
- **Templates**: CRUD, version, diff; publish/rollback; no retro‑apply.
- **RBAC/Permissions**: role×folder rules; inheritance + exceptions; effective access calculations.
- **Locks**: rule config, scheduled transitions (T windows), manual lock/unlock, CR unlock (auto re‑lock).
- **Users & Guests**: invite, group assign, revoke; status poll.
- **Reports/Audit**: who‑can‑access‑what, user→folders, lock timeline; CSV/XLSX exports.
- **Notifications**: event → templated email/Teams; de‑dup, delivery status.

**Cross‑cutting**: structured logging (JSON), correlation id, metrics, OpenAPI, request validation, feature flags (env‑based), rate‑limit/backoff adapters for Graph.

---
