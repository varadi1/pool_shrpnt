# 4) Identity & Access (Azure AD / MSAL)

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
