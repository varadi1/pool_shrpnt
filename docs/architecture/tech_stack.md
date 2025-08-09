# poolDRV — Tech Stack v1.0

> **Források:** PRD, Projekt Brief, Architecture v0.1. **Scope lock:** csak az ezekben rögzített technológiák/MVP. Nincs scope bővítés.

---

## 1) Összefoglaló

Monorepóban fejlesztett, konténerizált, Microsoft 365‑re épülő rendszer. SPA frontend (React + MSAL) → saját backend API (FastAPI) → Microsoft Graph/SharePoint integrációk. Háttérmunkák Celery‑vel; PostgreSQL az állapotért.

---

## 2) Frontend

- **Keretrendszer**: React 18 + TypeScript
- **UI készlet**: Fluent UI 9
- **Routing**: React Router v6
- **Adatkezelés**: React Query v5
- **Űrlap/állapot**: kontrollált komponensek, minimális globális állapot
- **Build**: Vite 5
- **Auth**: MSAL (SPA redirect flow, single‑tenant)
- **Node.js**: 20 LTS
- **Tesztelés**: Vitest + React Testing Library + Playwright (smoke/E2E)

---

## 3) Backend (API)

- **Nyelv**: Python 3.11
- **Keretrendszer**: FastAPI (async)
- **Adatmodellezés**: Pydantic v2
- **ORM**: SQLAlchemy 2
- **Migráció**: Alembic
- **HTTP kliens**: httpx (timeout + retry/backoff adapter)
- **ASGI szerver**: Uvicorn
- **OpenAPI**: automatikus specifikáció; TS kliens generálás a monorepó `libs/` mappájába
- **Tesztelés**: pytest (+ pytest‑asyncio), coverage

---

## 4) Háttérfolyamatok

- **Task queue**: Celery 5
- **Üzenetközvetítő/Ütemező**: Redis 7 + Celery beat
- **Queue‑k**: `provisioning`, `locks`, `notifications`, `reports`

---

## 5) Adatbázis

- **RDBMS**: PostgreSQL 15 (Azure Database for PostgreSQL Flexible Server)
- **Sémák/táblák**: PRD/Architecture szerint (`order_em`, `folder_template`, `permission_assignment`, `audit_log`, stb.)

---

## 6) Identitás és jogosultság (Azure AD / Entra ID)

- **Folyamatok**
  - **SPA → Backend**: MSAL‑lal szerzett access token a **poolDRV API** alkalmazásregisztráció saját scope‑jára
  - **Backend → Graph**: app‑only **client credentials** (daemon); felhasználói kontextusnál **OBO** (On‑Behalf‑Of)
- **App regisztrációk**
  - `poolDRV API` — saját API scope (`api://pooldrv/access`) a SPA számára
  - `poolDRV Daemon` — Graph/SharePoint műveletekhez (client credentials)
- **Minimális Graph jogkörök (app‑only, tenant review során véglegesítendő)**
  - `Group.ReadWrite.All`, `Directory.Read.All`, `Sites.ReadWrite.All`, `Files.ReadWrite.All`, `User.Read.All`, `Team.ReadBasic.All`
- **OIDC/Graph végpontok (minták)**
  - OIDC config: `https://login.microsoftonline.com/<tenantId>/v2.0/.well-known/openid-configuration`
  - Authorize: `https://login.microsoftonline.com/<tenantId>/oauth2/v2.0/authorize`
  - Token: `https://login.microsoftonline.com/<tenantId>/oauth2/v2.0/token`
  - Microsoft Graph: `https://graph.microsoft.com/`

---

## 7) Integrációk (Microsoft 365)

- **Teams/Groups**: csapat és csatorna létrehozás/kapcsolás
- **SharePoint Online**: dokumentumtárak, mappafa, ACL alkalmazás (öröklés törése a szükséges pontokon)
- **Dokumentumtartalom**: az alkalmazás nem tárol dokumentumokat; hivatkozás SharePoint‑ban létező fájlokra

---

## 8) Infrastruktúra és üzemeltetés (Azure)

- **Konténerizáció**: Docker (külön image: `web`, `api`, `worker`, `scheduler`)
- **Orkesztráció (MVP)**: Docker Compose **Azure Linux VM**‑en
- **Hálózat**: Azure Application Gateway (TLS), VNet, NSG, csak HTTPS bejövő forgalom
- **Adattárolás**: Azure‑kezelt PostgreSQL (PITR backup), Redis 7
- **Titokkezelés**: Azure Key Vault
- **Artifactok**: Azure Container Registry (ACR)
- **CI/CD**: GitHub Actions (build → scan → push → deploy → migráció)
- **DNS/TLS**: egyedi domain, kezelt tanúsítványok

---

## 9) Megfigyelhetőség

- **Logolás**: strukturált JSON logok, korrelációs azonosító végigvezetve
- **Metrikák**: queue latency, retry/429 arány, provisioning idő, lock‑futások ideje
- **Riasztások**: sikertelen provisioning, ismétlődő 429, ütemező csúszás, értesítés‑hiba tüskék

---

## 10) Környezetek

- `dev` (sandbox tenant), `staging`, `pilot`, `prod`
- Feature flag‑elés környezetváltozókkal; konfiguráció `.env`‑ből (prod titkok KV‑ből)

---

## 11) Verziózás és támogatási mátrix

| Komponens          | Cél verzió | Megjegyzés |
|--------------------|------------|------------|
| Node.js            | 20 LTS     | FE toolchain |
| React              | 18.x       | SPA |
| TypeScript         | 5.x        | strict mode |
| Vite               | 5.x        | build |
| Fluent UI          | 9.x        | UX kit |
| Python             | 3.11.x     | API/worker |
| FastAPI            | 0.11x      | async API |
| SQLAlchemy         | 2.x        | ORM |
| Pydantic           | 2.x        | modellek |
| Celery             | 5.x        | queue/beat |
| Redis              | 7.x        | broker/cache |
| PostgreSQL         | 15.x       | DB |

- **Pinelés**: minden konténer és könyvtár verzió fixálva (nincs `latest`).
- **SemVer**: kiadások címkézése (`vMAJOR.MINOR.PATCH`).

---

## 12) Monorepó és eszközök

- **Struktúra**: `web/`, `api/`, `worker/`, `scheduler/`, `libs/`, `ops/`, `docs/`, `tools/`
- **Kliens generálás**: OpenAPI → TypeScript SDK a `libs/` alá
- **Statikus ellenőrzés**: ESLint/Prettier (FE), Black/Ruff/isort (BE)
- **Sérülékenység‑szken**: trivy/grype (image), gitleaks (titok)

---

*Vége — v1.0*

