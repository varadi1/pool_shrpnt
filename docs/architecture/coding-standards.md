# poolDRV — Kódolási Szabványok v1.0

> **Kötelező érvényű szabálykönyv** a poolDRV projekthez. A dokumentum a **PRD**, a **Projekt Brief** és az **Architecture v0.1** alapján készült. Ha ellentmondás van, a PRD és az Architecture a forrásigazság. **A tech stack tartalom külön dokumentumba került: „poolDRV — Tech Stack v1.0”.** Ez a fájl kizárólag a szabályokat és eljárásokat tartalmazza.

---

## 1) Repozitórium és mappastruktúra

```
/ (monorepo gyökér)
  ├─ web/           # Frontend SPA
  ├─ api/           # Backend szolgáltatás
  ├─ worker/        # Háttérfolyamatok
  ├─ scheduler/     # Időzített feladatok
  ├─ libs/          # Megosztott típusok, kliens SDK
  ├─ ops/           # Infrastruktúra, compose, CI/CD
  ├─ docs/          # PRD, brief, architecture, standards
  └─ tools/         # Fejlesztői szkriptek, hookok
```

- **Kötelező fájlok**: `README.md`, `CONTRIBUTING.md`, `CODEOWNERS`, `SECURITY.md`, `docs/`.
- **OpenAPI**: az `api/` gyökérben generált `openapi.json` + kliens `libs/` alatt.

---

## 2) Branch‑elés, commit és PR szabályok

- **Trunk‑based**: rövid élettartamú feature branchek (`feat/<rövid-leírás>`).
- **Conventional Commits**: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`, `build:`; breaking változás: `BREAKING CHANGE:` lábjegyzet.
- **PR követelmények**:
  - max \~400 sor nettó diff; nagyobb változás bontandó.
  - legalább **1 reviewer** + zöld CI.
  - PR sablon kötelező (cél, AC, érintett story, kockázat, rollback terv).
  - Link az érintett OpenAPI változáshoz és DB migrációhoz.
- **Release**: **SemVer** tag (pl. `v0.3.0`), changelog generálás, image tag = git SHA.

---

## 3) Kódformázás, lint és statikus elemzés

- **EditorConfig**: LF sorvég, UTF‑8, 2 szóköz (TS/JS/JSON/YAML), 4 szóköz (Python), final newline.
- **TypeScript/JS**: Prettier + ESLint (typescript‑eslint, import‑order, react/recommended).
- **Python**: Black (`line-length 100`) + Ruff (flake8 szabályok) + isort.
- **YAML/JSON**: sort‑keys a gép által olvasott fájloknál; kézi sorrend csak indokolt esetben.
- **Pre‑commit** kötelező a repo‑ban (minták lejjebb). A CI is futtatja.

**Minták**

`.editorconfig`

```ini
root = true
[*]
end_of_line = lf
insert_final_newline = true
charset = utf-8
trim_trailing_whitespace = true

[*.{js,ts,tsx,json,yml,yaml}]
indent_style = space
indent_size = 2

[*.py]
indent_style = space
indent_size = 4
```

`.pre-commit-config.yaml`

```yaml
repos:
  - repo: https://github.com/psf/black
    rev: 24.4.2
    hooks: [{id: black}]
  - repo: https://github.com/astral-sh/ruff-pre-commit
    rev: v0.5.0
    hooks: [{id: ruff}, {id: ruff-format}]
  - repo: https://github.com/pycqa/isort
    rev: 5.13.2
    hooks: [{id: isort}]
  - repo: https://github.com/pre-commit/mirrors-prettier
    rev: v4.0.0-alpha.8
    hooks: [{id: prettier}]
  - repo: https://github.com/zricethezav/gitleaks
    rev: v8.18.2
    hooks: [{id: gitleaks}]
```

---

## 4) Névkonvenciók

- **Fájlok/Modulok**: `kebab-case.tsx` (komponensek), `snake_case.py` (Python modulok).
- **Komponensek/Osztályok**: PascalCase; egy komponens/fájl.
- **TS típusok**: PascalCase interfészek (`Contract`, `OrderEm`), `I` előtag **tilos**.
- **API útvonalak**: többes szám (`/api/contracts`), erőforrás/azonosító (`/api/orders/{id}/provision`).
- **DB**: kisbetű + aláhúzás (`order_em`, `folder_template`), idegen kulcs: `<table>_id`.
- **Környezeti változók**: `POOLDRV_*` prefix.

---

## 5) Hibakezelés, válaszmodellek, idempotencia

- **API hibák**: 4xx mezőszintű hibaobjektum; 429 esetén `Retry-After` visszaadás; 5xx mindenhol korrelációs azonosító.
- **Idempotencia**: minden Graph/SP módosítás kap **idempotency keyt** (pl. `(emId, op, scope, tsWindow)`).
- **Visszatérési modellek**: ISO‑8601 időpontok UTC‑ben; decimális számok ne stringben; boolean ne legyen "0/1".
- **Pagináció**: `?page`/`?pageSize` vagy `?cursor`; nagy listákhoz cursor ajánlott.

---

## 6) Naplózás és megfigyelhetőség

- **Strukturált log** (JSON) minden szolgáltatásban; mezők: `ts`, `level`, `service`, `correlation_id`, `actor`, `route`, `status`, `duration_ms`.
- **Korreláció**: front‑end `x-correlation-id` → backend/worker örökíti. Ha nincs, generálunk.
- **Metrikák**: provisioning idő, Graph 429 arány, queue latency, lock job idők, export idők.
- **Titok**: tokenek/PII **soha** ne jelenjen meg logban.

---

## 7) Biztonság és megfelelőség

- **Auth**: Azure AD OIDC; SPA → backend saját API scope; backend → Graph app‑only / OBO.
- **Token kezelés**: RS256/RS512; **aud/iss** ellenőrzés; óra‑eltérés ≤ 5 perc; tokent logolni **tilos**.
- **RBAC**: szerveroldali enforcement; FE csak rejt/elrejt.
- **Jogosultságok**: Graph alkalmazásjogok minimális készlete (tenant review során véglegesítve).
- **Titkok**: Key Vault; `.env` fájl helyben, gietárba **nem** kerül; `.env.example` kötelező.
- **Könyvtár‑frissítés**: Dependabot/pyup; sebezhetőség esetén hotfix branch.

---

## 8) Microsoft 365 integrációs szabályok

- **Create‑or‑get**: erőforrásokat (Team, Channel, Site, könyvtár, mappa) mindig idempotensen kezeljük (név/ID ellenőrzés újralétrehozás előtt).
- **SharePoint ACL**: öröklés megtörése csak szabály szerint; érzékeny almappák expliciten.
- **Rate limit**: exponenciális backoff + jitter; 429/503 tiszteletben; nagy műveletek éjszakai ablakban.
- **Névkonvenciók**: Team/Channel/mappa neveket PRD szerinti sémában (év, rész A/B/C, partner rövidítés).
- **Fájltartalom**: alkalmazás **nem** tárol dokumentumtartalmat; csak SharePoint‑ban létező fájlokra hivatkozunk.

---

## 9) Adatbázis szabályok

- **Migrációk**: Alembic verziózott migráció; kézi SQL prodba **tilos**.
- **Korlátozások**: minden FK + `NOT NULL` ahol lehetséges; egyedi indexek üzleti kulcsokra.
- **Audit**: `audit_log` **változtathatatlan**; törlés helyett állapotváltás a fő entitásoknál (archiválás).
- **Indexelés**: riportokhoz célzott indexek; szükség esetén materializált nézetek.

---

## 10) Háttérfeladatok

- **Queue‑k**: `provisioning`, `locks`, `notifications`, `reports`.
- **Idempotencia**: deduplikáció `(emId, op, scope, tsWindow)` kulcson; disztribuált zár.
- **Hibapolitika**: exponenciális visszavárakozás; DLQ metrika + riasztás; kompenzáló futtatások.
- **Konfiguráció**: újrapróbálkozási plafon/backoff ne legyen mágikus szám; env‑ből konfigurálható.

---

## 11) Frontend szabványok

- **Auth**: redirect flow; silent renew; tokenek sessionStorage‑ban; Graph hívás **nem** a FE‑ből (mindig az API‑n át).
- **Állapot**: szerverállapot React Query; lokális állapot komponens‑szintű; globális csak indokolt.
- **Űrlapok**: kontrollált komponensek; hibák mező alatt; submit gomb disable, amíg érvénytelen.
- **Hibák**: toast + részletek panel; korrelációs ID megjelenítése.
- **A11y**: WCAG 2.2 AA; fókuszkezelés; billentyűzet‑first.
- **Teljesítmény**: táblák lapozása; 100 sor P95 < 3s; memoization ésszel.

---

## 12) Backend szabványok

- **Aszinkron** endpointok; kliens oldali hívások időkorlátokkal.
- **Rétegek**: Router → Service → Repository → Integrációk → Jobs. Kereszthivatkozás tiltott.
- **Validáció**: Pydantic modellek (request/response); kötelező mezők és típusok.
- **Hibák**: `HTTPException` következetesen; logban ok + kontextus.
- **OpenAPI**: minden endpoint dokumentált; verziózás `v1` prefixszel, breaking csak új verzióban.
- **Időzóna/nyelv**: backend UTC; nyelvi feliratok FE‑ben.

---

## 13) Tesztelés

- **Piramid**: unit → integráció → **kontraktus** (Graph/SharePoint) → E2E.
- **Coverage cél**: backend **≥ 80%** line, kritikus modulok **≥ 90%**; frontend **≥ 70%**.
- **Eszközök**: pytest, coverage; Vitest + React Testing Library; Playwright E2E.
- **Kontraktus**: sandbox tenant; throttling/rate‑limit szimuláció; idempotens újrafuttatás.
- **Mockolás**: csak indokolt; a valódi API viselkedésének modellezése preferált.
- **Build ellenőrzés**: OpenAPI drift check (kliens generálás PR‑ban), DB migráció dry‑run CI‑ben.

---

## 14) CI/CD minőségkapuk

1. Lint & format (TS/ESLint, Prettier; Black/Ruff/isort).
2. Egység‑ és integrációs tesztek; Playwright smoke.
3. OpenAPI generálás + típus‑ellenőrzés a kliensre.
4. Container build + image‑scan (trivy/grype) + secrets‑scan (gitleaks).
5. Alembic migráció **dry‑run** staging ellen.
6. Deploy staging → egészségügyi ellenőrzés → manuális jóváhagyás → prod.

---

## 15) Teljesítmény és A11y célok

- **UI**: P95 < 3s (100 soros tábláknál); hatékony jogkalkuláció ≤ 2s mélység ≤ 6 esetén.
- **Háttér**: EM provisioning ≤ 10 perc; lock átállások percenkénti ütemezés tolerancia ±2 perc.
- **A11y**: nincs P1 hiba; wizardok billentyűzettel végigjárhatók.

---

## 16) Dokumentáció és ADR

- **ADR** minden nem triviális döntésről (`docs/adr/0001-...md`).
- **Konfiguráció**: `.env.example` karbantartva; szolgáltatások README‑jeiben futtatási utasítás.
- **Kódkomment**: Python docstring, TS‑doc a publikus függvényekhez/típusokhoz.

---

## 17) Biztonsági ellenőrzőlista (PR/Release)

-

---

## 18) Kódreview ellenőrzőlista

-

---

## 19) Környezetek és adatok

- **Fejlesztői tenant** és dedikált **SharePoint dev site** használata; prod tenanton manuális teszt **tilos**.
- **Seed**: mintaadatok a sandboxhoz; vendég domain allowlist a PRD szerint.
- **Feature flag**: env‑alapú; új funkció csak kikapcsolható állapotban kerül prodba.

---

## 20) Példák — minta parancsok

**Backend (api/)**

```bash
uv run pytest -q
uvicorn api.main:app --reload
alembic upgrade head
```

**Frontend (web/)**

```bash
npm ci
npm run lint && npm run typecheck && npm run build
npm run test
```

---

*Vége — v1.0*

