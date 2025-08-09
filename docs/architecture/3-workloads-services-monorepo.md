# 3) Workloads / Services (Monorepo)

- **web/** — React 18 + TS + Fluent UI + MSAL + React Query + Vite
- **api/** — FastAPI (Python 3.11+), pydantic, SQLAlchemy, Uvicorn
- **worker/** — Celery workers for provisioning/locking/notifications
- **scheduler/** — Celery beat (periodic) + lock runner
- **libs/** — shared models, API client (OpenAPI‑generated), policy/rules
- **ops/** — docker-compose.\*, infra IaC snippets, GitHub Actions workflows

---
