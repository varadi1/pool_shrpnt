# poolDRV — Full‑Stack Architecture v0.1

> **Scope lock:** This architecture **implements** the MVP scope, tech stack, and decisions already defined in the PRD. It does **not** change requirements or introduce new scope; it refines them into buildable architecture.

---

## 1) Architecture Principles

- **PRD‑first**: no scope creep; map every component to PRD epics/stories.
- **Least privilege**: app‑only Graph permissions; scoped SP/Teams access.
- **Idempotent & resilient**: all provisioning/lock jobs re‑entrant; retries & backoff.
- **Observe everything**: metrics, logs, audit are first‑class.
- **Monorepo**: shared types/contracts, single CI/CD.

---

## 2) System Context & Actors

**Actors**: NEÜ Admin, NEÜ PM, NEÜ QA, Partner Admin, Partner Szakértő, Finance (read‑heavy), System Scheduler.

**External**: Microsoft Graph (Teams/Groups/Users/Sites/Drives), SharePoint Online, Azure AD (MSAL), Email/Teams notifications.

**High‑level**

```
[Browser (Admin/PM)] → Frontend (React+MSAL) → Backend API (FastAPI)
                                  ↓                        ↓
                             Azure AD (OIDC)           Worker (Celery)
                                  ↓                        ↓
                             Graph API / SP          Job Queue (Redis)
                                                       PostgreSQL
```

---

## 3) Workloads / Services (Monorepo)

- **web/** — React 18 + TS + Fluent UI + MSAL + React Query + Vite
- **api/** — FastAPI (Python 3.11+), pydantic, SQLAlchemy, Uvicorn
- **worker/** — Celery workers for provisioning/locking/notifications
- **scheduler/** — Celery beat (periodic) + lock runner
- **libs/** — shared models, API client (OpenAPI‑generated), policy/rules
- **ops/** — docker-compose.\*, infra IaC snippets, GitHub Actions workflows

---

## 4) Identity & Access (Azure AD / MSAL)

- **Auth flow (Frontend):** SPA uses **MSAL** to authenticate users (single‑tenant). Acquire **ID token** for UI and **access token** for backend (custom API scope).
- **Auth flow (Backend):**
  - Validates SPA bearer with **JWT** (issuer: tenant, audience: custom API app‑reg).
  - For background tasks, uses **client credentials** (app‑only) to call Graph.
  - For user‑initiated Graph actions where user context is needed (rare), use **OBO** (on‑behalf‑of) to exchange SPA token for Graph token.
- **App registrations:**
  - **poolDRV API** (expose scope: `api://pooldrv/.default` or named `api://pooldrv/access`); audience used by SPA.
  - **poolDRV Daemon** (client‑credentials for Graph & SP).
- **Graph permissions (proposed minimal, app‑only; confirm in tenant review):** `Group.ReadWrite.All`, `Directory.Read.All`, `Sites.ReadWrite.All`, `Files.ReadWrite.All`, `User.Read.All`, `Team.ReadBasic.All` (subset may shift; treat as minimum viable set).
- **Token lifetimes:** defaults; backend caches app tokens in memory with proactive refresh.
- **RBAC mapping:** Azure AD groups map to app roles (`NEU_Admin`, `NEU_PM`, `Partner_Admin`, `Expert`, `NEU`\_QA). Backend enforces via policy engine.

---

## 5) Frontend Architecture (React)

- **Routing:** React Router; routes per PRD/UX (Dashboard, Contracts, Orders, Templates, Users/Groups, Permissions, Folders, Reports, Audit, Settings).
- **State/data:** React Query for server state; no local mutation beyond forms.
- **UI kit:** Fluent UI; a11y (WCAG 2.2 AA target); keyboard‑first flows; chips for lock states (T−3/−1/T+0/T+8, CR active).
- **MSAL:** login redirect; role claims → UI guards. Silent token renewal.
- **Error handling:** toast + correlation id; 429 banner with retry‑after.
- **Generated client:** OpenAPI generator syncs types/endpoints.

---

## 6) Backend Architecture (FastAPI)

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

## 7) Data Model (PostgreSQL 15)

**Key tables** (aligned with PRD):

- `contract`, `partner_company`, `order_em` (EM), `sp_site`, `sp_drive`
- `folder_template`, `folder_instance`, `permission_assignment`
- `role`, `group`, `membership`
- `lock_rule` (per EM), `lock_state` (derived/applied)
- `audit_log` (immutable), `report_job`, `notification_job`

**Notes**

- Keep **desired state** for permissions/locks; reconcilers compare desired vs actual.
- Index heavy report queries; consider **materialized views** for access reports.

---

## 8) API Surface (examples)

- `POST /api/contracts` · `GET /api/contracts`
- `POST /api/orders` · `POST /api/orders/{id}/provision`
- `PUT /api/locks/rules/{emId}` · `POST /api/locks/manual`
- `POST /api/locks/cr/open` · `POST /api/locks/cr/close`
- `GET /api/folders/tree` · `GET /api/permissions/effective`
- `POST /api/groups` · `PUT /api/groups/{id}/members`
- `POST /api/guests` · `GET /api/guests/status`
- `GET /api/reports/access` (mode: folder|principal) · `GET /api/reports/locks`

**Errors**: 4xx field errors; 429 retry‑after; 5xx with correlation id. All mutating endpoints emit **audit events**.

---

## 9) Scheduler & Job Model (Celery)

- **Periodic** (every 15m): lock evaluator → apply transitions (T−3/−1/T+0/T+8), CR expiries.
- **Queues**: `provisioning`, `locks`, `notifications`, `reports` with fair dispatch; concurrency tuned; per‑queue backoff strategy.
- **Idempotence**: dedupe on `(emId, op, scope, tsWindow)`; distributed lock to avoid overlap.
- **Failure policy**: retry w/ exponential backoff; poison‑message DLQ metric + alert; compensating runs.

---

## 10) Microsoft 365 Integrations (Graph / SharePoint)

- **Teams/Groups**: create team or bind to existing; create channel(s) if required; attach SharePoint doc library.
- **SharePoint**: create folder trees from templates; break/restore inheritance on sensitive nodes; apply role assignments; versioning policy; retention hooks (per PRD).
- **Permissions**: app‑only writes to ACLs; expert uploads via Teams/SharePoint UI (no app content proxying).
- **Rate limits**: exponential backoff; jitter; batch where available; nightly heavy ops windows.

---

## 11) Notifications

- **Events**: `deadline.reminder (T−3, T−1, T+0)`, `lock.state.changed`, `locks.cr.opened/closed`, `provision.succeeded/failed`.
- **Channels**: Email (O365) and Teams messages; templates in DB; de‑dup within 24h for identical event+recipient.

---

## 12) Observability & Audit

- **Metrics**: provision time, Graph call success/429 rate, retries, queue latency, lock job durations, export durations.
- **Logs**: JSON; correlation id per request/job; shipped to central store.
- **Audit**: immutable table; events for templates, provisioning, locks (manual/CR/scheduled), users/guests, reports, notifications.
- **Alerts**: failed provision, repeated 429, missed scheduler window, notification failure spike.

---

## 13) Security & Compliance

- **Secrets**: Azure Key Vault; no secrets in repo; env injection at deploy time.
- **Data**: PII minimal; tenant/user IDs where required; audit retention 7 years.
- **App roles**: enforced server‑side; front‑end hides only for UX.
- **Hardening**: HTTPS everywhere; CSP; dependency scanning; vulnerability gates in CI.

---

## 14) Infrastructure & Environments (Azure)

- **Containerization**: `api`, `worker`, `scheduler`, `web` (static build served by reverse proxy), `db` (Postgres 15), `redis`.
- **Runtime (MVP)**: Azure **Linux VM** running **Docker Compose** (staging/prod), behind Azure Application Gateway (TLS). Alternative later: Azure Container Apps/AKS (unchanged app images).
- **Networking**: VNet + NSG; outbound to Graph/SharePoint; restricted inbound (HTTPs only via gateway).
- **Storage/DB**: Azure‑managed Postgres Flexible Server; backups + PITR enabled.
- **Artifacts**: Azure Container Registry (ACR); images built by GitHub Actions.
- **DNS**: custom domain; managed TLS certificates.

**Environments**: `dev` (sandbox tenant) · `staging` · `pilot` · `prod`. Feature flags via env.

---

## 15) CI/CD (GitHub Actions)

- **Pipelines**: lint/test → build images → push to ACR → deploy (SSH or runner on VM) → run DB migrations → warmup health checks.
- **Quality gates**: unit/integration tests; OpenAPI drift check; dependency audit; container scan.

---

## 16) A11y & Performance Targets (from PRD)

- Pages <3s @ P95 (100‑row tables); effective permissions <2s @ depth ≤6.
- Keyboard‑only completion for both wizards; no P1 a11y issues.

---

## 17) Mapping to PRD Epics

- **EP‑01** Provisioning → provisioning module + worker + Graph/SP clients.
- **EP‑02** RBAC → policy engine + permissions reconcilers.
- **EP‑03** Locks/CR → lock rules, scheduler, jobs.
- **EP‑04** Guests → users/guests module + Graph; lifecycle.
- **EP‑05** Admin/PM UI → React routes/components per UX brief.
- **EP‑06** Reports/Audit → report jobs + exports.
- **EP‑07** Archive/Versioning → SP policies + scheduled housekeeping.
- **EP‑08** Notifications → notification service + templates.
- **EP‑09** Observability → metrics/logs/alerts plumbing.
- **EP‑10** Security/Compliance → authZ/authN, KV, scans.

---

## 18) Open Decisions (require confirmation; PRD remains authoritative)

1. **Exact Graph permission set** (minimize vs operational practicality).
2. **Teams channel strategy** (one team per contract vs per EM) — PRD asks to decide.
3. **Max version count** for SP libraries (5 vs 10) — flagged in PRD.
4. **Runtime target** post‑pilot (keep VM+Compose vs move to ACA/AKS).

---

## 19) Risks & Mitigations

- Graph/SharePoint throttling → robust backoff + idempotent jobs + off‑peak heavy ops.
- Complex exceptions in RBAC → conflict detector + effective access preview.
- Scheduler drift → re‑entrant jobs with desired‑state reconciliation.
- Partner IT policy variability → early onboarding guide + guest domain allowlist.

---

## 20) Appendix — Sequence Sketches (text)

**New EM Provision**

1. PM fills wizard → `POST /api/orders` → queue `provision.em`
2. Worker creates Team/Channel (opt), SP library folders, applies ACLs
3. Audit emitted; UI polls status; success toast

**T+0,1..8 Auto‑lock**

1. Scheduler scans EMs → compute state transitions
2. Queue `locks.apply` → SP permission changes → audit + notifications
3. CR expiry tasks re‑lock when due

*End of v0.1*

