# PRD — NEÜ poolDRV (SharePoint Mappastruktúra Kezelő) — **MVP** v0.1

> **Termék:** poolDRV — SharePoint/Teams mappastruktúra és jogosultság-automatizáció
>
> **Szervezet:** NEÜ Zrt\
> **Készítette:** PM (John)\
> **Dátum:** 2025-08-08\
> **Állapot:** Vázlat (egyeztetésre)

---

## 0) Változásnapló

- **v0.1 (2025-08-08):** Első PRD vázlat a projekt- és mappastruktúra-brief alapján; MVP scope, user story-k, F/NFR, RBAC, API/DB váz, ütemterv, elfogadási kritériumok.
- **v0.1a (2025-08-08):** MVP epikek hozzáadva, sprint-kiosztás és függőségek.
- **v0.1b (2025-08-08):** EP-03 (Időzárak & CR-feloldás) részletes story-k és Gherkin AC-k hozzáadva.

---

## 1) Háttér és Koncepció

A **poolDRV** egy hibrid admin-eszköz és Teams-integráció, amely a NEÜ Zrt keretszerződéses beszerzési folyamataihoz illeszkedő, **standardizált mappastruktúrák** és **jogosultságok** automatikus létrehozását és karbantartását végzi. Cél: manuális hibák csökkentése, átfutási idő rövidítése, **auditálhatóság**, és a **M365 E3** ökoszisztéma (SharePoint Online, Teams, Graph API) jobb kihasználása.

**Kiinduló helyzet:** havonta 5–10 (cél: 15–20) új megrendelés; 3 rész (A/B/C) × 3–5 partner; jelentős admin-terhelés; manuális mappakezelés és hozzáférés-állítás; eltérő érzékenységű almappák; határidőhöz kötött zárolások.

---

## 2) Célok és KPI-k

**Üzleti célok (MVP):**

- Admin-idő **−70%** (4–6 óráról 1–2 órára / hét)
- Hibaarány **−90%** (2–3/hó → 0–1/hó)
- Projektindítás (mappastruktúra) **2 nap → 2 óra**
- M365 funkcióhasználat bővülése (Teams/SharePoint advanced)

**KPI-k:**

- Mappastruktúra generálás: **< 10 perc/projekt**
- Jogosultság-módosítás: **< 15 perc**
- Riport generálás: **< 15 perc**
- Rendelkezésre állás: **≥ 99.5%**
- Felhasználói hibák: **< 1/hó**

---

## 3) Felhasználók, szerepek, personák

**Szerepek:** NEÜ Admin, NEÜ PM, NEÜ QA, Partner Admin, Partner Szakértő.\
**Personák röviden:**

- *NEÜ Admin*: központi admin, sablonok, jogosultság, audit.
- *NEÜ PM*: megrendelések indítása, nyomonkövetés.
- *NEÜ QA*: ellenőrzés, zárolás, minőségbiztosítás.
- *Partner Admin*: saját cég mappái, szakértők kezelése.
- *Partner Szakértő*: feltöltések határidőig, visszajelzés.

---

## 4) Scope

### 4.1 In-scope (MVP)

1. **Szerződésenként/partnerenként** standardizált mappastruktúra **automatikus létrehozása** előre definiált sablonból (rész A/B/C, cég-mappák, EM mappák).
2. **RBAC** és mappa-szintű engedélyek beállítása (öröklődés + kivételek; időalapú zárolás).
3. **Teams csoport** létrehozás és életciklus-kezelés (névkonvenció, archíválás), SharePoint tár publikálása Teamsben.
4. **Admin UI**: mappalétrehozás/lezárás, sablon-karbantartás, felhasználó/csoport kezelés, audit megtekintés.
5. **Deadlines & Locking**: automatizált mappazárolás T+8 nap, teljesítési határidőnél eredménytermék zárolás, CR-alapú ideiglenes feloldás.
6. **Riportok**: alap hozzáférés- és használati riportok, zárolási események.
7. **Nincs tartalom-cache** (Redis csak session/broker Celery-hez).

### 4.2 Out-of-scope (MVP)

- Mobil app; külső ERP/Dynamics/Outlook integráció; ML/Blockchain; kiterjesztett workflow engine; fejlett DLP/IRM.

---

## 5) Felhasználói történetek (top 10) és elfogadási kritériumok

### US-01 — Adminként új **megrendeléshez** (EM) teljes mappastruktúrát hozok létre

**AC:**

- Sikeres létrehozás **< 10 perc** alatt;
- Rész (A/B/C), partner(ek), határidők, naming-konvenció paraméterezhető;
- Létrehozott mappák és engedélyek megjelennek a **Teams** csatornán belül;
- Audit napló: ki, mikor, mit hozott létre.

### US-02 — Adminként **sablonokat** tudok szerkeszteni és verziózni

**AC:**

- Új sablon publikálása nem érinti visszamenőleg a már létrejött EM-eket;
- Sablon diff megtekinthető;
- Rollback gomb;
- Kötelező mezők validálása.

### US-03 — PM-ként tudok új megrendeléshez sablon alapján mappákat létrehozni, partner céget társítani

**AC:**

- Hozzáférek a poolDRV webes felületéhez is;
- Szerződésekhez, amikhez van jogom tudok új megrendelést bejegyezni;
- A megrendelésekhez rendelt sablonokból tudok mappákat létrehozni;
- Ki tudom választani a szerződéshez hozzárendelt partner cégek közül, hogy melyik láthatja az EM-et;
- Manuálisan tudok zárolni mappákat, hogy a partner cégeknek csak olvasási joga legyen.

### US-04 — Partner Adminként a **saját cég mappáit** teljes joggal érem el

**AC:**

- Nem férek hozzá a poolDRV webes felületéhez, csak a teams csoportot látom, ahova hozzáadtak;
- Csak a saját cég „CEG\_XX” szekciója látszik és csak azok a szerződések és megrendelések, amelyhez hozzá vagyok adva;
- Hiába vagyok hozzáadva egy szerződéshez, ha nem vagyok még a megrendeléshez is hozzáadva, akkor nem látok mást, csak azokat a megrendeléseket, amikhez én is hozzá lettem adva;
- A megrendeléssel kapcsolatban minden partneri mappát látok;
- EM mappák automatikusan megjelennek;
- Jogosultságok öröklődnek/öröklés megtörhető az érzékeny almappáknál.

### US-05 — Szakértőként **feltöltök** dokumentumot a határidőig

**AC:**

- Nem férek hozzá a poolDRV webes felületéhez, csak a teams csoportot látom, ahova hozzáadtak;
- „Aktív\_Verzio” mappába írás a határidőig;
- Nem látok minden partneri mappát, csak a megrendelés szakmai részeivel kapcsolatosakat;
- Verziónapló automatikus;
- Határidőkor zárolás (csak olvasás), hibaüzenet és értesítés.

### US-06 — Pénzügyesként láthatom a megrendelés pénzügyi részeit is

**AC:**

- TIG, szerződések érzékenyebb részeihez is hozzáférek;
- A szakmai mappákhoz csak olvasási jogom van;
- Nem férek hozzá a poolDRV webes felületéhez, csak a teams csoportot látom.

### US-07 — Adminként **vendég felhasználókat** kezelek

**AC:**

- Azure AD B2B guest lifecycle: meghívás, csoportba sorolás, visszavonás;
- Audit trail minden változásról;
- Hibakezelés Graph-rate limit esetén retry-val.

### US-08 — Adminként **időalapú zárolás** szabályait konfigurálom

**AC:**

- T+0..T+n ablakok paraméterezhetőek, konkrét dátum / óra is beállítható;
- Kivétel (CR) esetén ideiglenes feloldás (48 óra) automatikus visszazárral.

### US-09 — Adminként **riportokat** generálok

**AC:**

- Elérés- és módosítási napló aggregálása;
- Tudok olyan riportot generálni, hogy melyik mappához pontosan ki fér hozzá, milyen jogosultsággal;
- Tudok olyan riportot generálni, hogy melyik személy, vagy csoport milyen mappákhoz fér hozzá;
- Zárolási események;
- Szakértői feltöltési készültség;
- CSV/XLSX export.

### US-10 — Adminként **archiválom** a lezárt szerződéseket, azok összes EM-jével

**AC:**

- 90 nap/1 év/7 év szabály szerinti mozgatás;
- Max 5 verzió tárolás, régebbiek zip archívba;
- Visszaállítás / export kérése ticket alapján.

---

## 6) Funkcionális követelmények (F)

1. **Sablonmotor**: szerződés/rész/cég/EM szintű sablonok; névkonvenciók (EM\_YYYY\_XXX\_YYYYMMDD).
2. **Tömeges létrehozás**: batch SP mappák + csoportok + engedélyek (idempotens, újrafuttatható).
3. **RBAC & öröklés**: szerep×mappa×művelet mátrix; kivételek érzékeny almappákra; időalapú transzíciók.
4. **Teams integráció**: csoportok csatornáihoz dokumentumtár csatolás; vendéghozzáférés szabályozása.
5. **Deadlines/Locking**: Dátum / óra szerint partner mappák ReadOnly; teljesítési határidőkor eredménytermék zárolás; CR esetén ideiglenes unlock.
6. **Audit & Riport**: minden kritikus művelet naplózása, időbélyeg, actor, objektum; dashboard és export.
7. **Admin UI**: létrehozás/lezárás, sablon szerkesztő, felhasználó- és csoportkezelés, audit-megtekintés.
8. **Értesítések**: EM mappák megnyitása, T−3/−1 és T+0 értesítési ütemezés (e-mail/Teams).
9. **Archiválás & verziózás**: max 10 verzió; régebbiek zip; retention policy (90 nap/1 év/7 év).

---

## 7) Nem-funkcionális követelmények (NFR)

- **Teljesítmény:** <3s oldalbetöltés; mappastruktúra <10s létrehozás (per EM, tipikus).
- **Megbízhatóság:** ≥99.5% uptime; retry/backoff Graph-limitnél; idempotens jobok.
- **Biztonság:** Azure AD auth (MSAL) + JWT; least-privilege; audit log; GDPR.
- **Skálázhatóság:** havi +1 új szerződés; havi 20 EM; 15 egyidejű felhasználó; később horizontális bővíthetőség.
- **Megfigyelhetőség:** metrikák, strukturált log, trace azonosító, riasztások.
- **Karbantarthatóság:** monorepo; kódstandard; CI/CD; infra as code (Docker Compose).

---

## 8) RBAC & jogosultság (összefoglaló)

**Mappa-szintű jogosultság mátrix** a szerepkörök szerint, kivételekkel (NEÜ-only mappa, Pénzügyi mappa, VEGLEGES zárolt mappák).\
**Időalapú váltások:** T+0 kiadás → T+1..5 feltöltés (teljes) → T+6..7 hiánypótlás (korlátozott) → T+8 ReadOnly; eredménytermékek a teljesítési határidőnél zárolódnak; CR feloldás 48h.

> A részletes táblázatos mátrix és timeline az *Függelék A–B*-ben.

---

## 9) Információ-architektúra & névkonvenciók (részletek)

- **Főszerkezet:** `NEU_Keretmegallapodas_YYYY` → `00_BELSO_NEU_ONLY`, `RESZ_A/B/C`.
- **Cégmappák:** `CEG_XX_<CegNev>`; csak adott cég + NEÜ.
- **EM mappák:** `EM_YYYY_XXX_YYYYMMDD` + belső könyvtárstruktúra (Szakértők, Megrendelés, Útmutatók, Eredménytermékek, Teljesítés).
- **Fájlnevek:** szakértői, eredménytermék, jelentés, CR konvenciók (példákkal).
- **Verziózás:** automatikus; max 10 verzió; archív.

---

## 10) Integrációk

- **Microsoft Graph API**: Users, Groups, Teams, Sites/Drives, Email.
- **SharePoint REST**: mappák, engedélyek, verziózás.
- **Teams API**: csoport/csatorna és dokumentumtár kapcsolás.

**Rate limit stratégia:** exponential backoff, idempotencia, queue-olt batch műveletek (Celery), sandbox tenant tesztre.

---

## 11) Architektúra & technológiai keretek

- **Frontend:** React 18 + TS; **Fluent UI**; MSAL; React Router; React Query; Vite.
- **Backend:** FastAPI; PostgreSQL 15 (docker konténerben); Celery; Redis (session/broker (docker konténerben)); OpenAPI/Swagger.
- **Infra:** Azure; Docker + Docker Compose; Azure Key Vault; GitHub Actions.
- **Repo:** monorepo (frontend+backend egyben).

---

## 12) API vázlat (példák)

- `POST /api/orders` — új EM létrehozás (param: rész, partner, határidők, sablonVerzió).
- `POST /api/orders/{id}/provision` — mappák, csoportok, engedélyek létrehozása (async job).
- `POST /api/templates` — sablon CRUD.
- `POST /api/locks/apply` — időalapú zárolás futtatása.
- `GET /api/reports/access` — hozzáférési riport.
- `POST /api/users/invite` — guest meghívás+csoporthozzárendelés.

**Hibamodel:** 4xx validáció; 429 retry-after; 5xx fallback és riasztás.

---

## 13) Adatmodell vázlat

**Táblák (példa):**

- `contract` (id, year, part[A/B/C], name)
- `partner_company` (id, name, code)
- `order_em` (id, code, date, part\_id, partner\_id, deadline\_dates, state)
- `sp_site` / `sp_drive` (id, url, team\_id)
- `folder_template` / `folder_instance` (id, template\_ref, path, role\_rules)
- `role` / `group` / `membership` (id, type, scope)
- `permission_assignment` (folder\_id, role\_id, op[read/write/create/delete...])
- `lock_rule` (folder\_id, start/end, type)
- `audit_log` (ts, actor, action, target, meta)

---

## 14) Telemetria, naplózás, riport

- **Metrikák:** létrehozási idő, Graph hívások sikerrátája, retry szám, queue latency, felhasználói hibák, zárolási események.
- **Log:** strukturált JSON, trace-id; audit külön index.
- **Riasztás:** sikertelen provision, 429 túllépés, zárolás-futás kimaradása.

---

## 15) Biztonság & Compliance

- Azure AD auth; legalacsonyabb jogosultság; titkok Key Vault-ban;
- Audit log 7 év; PII minimális; vendég-hozzáférés monitorozás;
- DLP/IRM: out-of-scope MVP, de O365 policy-k tiszteletben tartása.

---

## 16) Migráció & seed

- **Development**: dedikált SP site; sandbox tenant; seed sablonok;
- **Pilot**: 1 rész + 2–3 partner + 3–5 EM;
- **Prod**: skálázott rollout.

---

## 17) Ütemezés & mérföldkövek (3–4 hónap)

- **Sprint 0 (2 hét):** Azure app reg, repo/CI, alap skeleton, Graph/SharePoint PoC.
- **S1–S2 (4 hét):** Sablonmotor + provisioning (mappák/csoportok/ACL); Admin UI (alap).
- **S3 (2 hét):** Deadlines/locking + értesítések; RBAC kivételek.
- **S4 (2 hét):** Audit/riport + archiválás/verziózás.
- **S5 (2 hét):** Stabilizáció, perf, biztonság; Pilot előkészítés.
- **Pilot (2 hét):** 1 teljes ciklus; KPI mérés; Go/No-Go.

**Függőségek:** Azure AD admin hozzáférés; Graph/Teams/SharePoint engedélyezések.

---

## 18) Kockázatok & mitigáció

- **Graph/SharePoint throttling:** queue + backoff + idempotencia; off-peak időzítés.
- **Felhasználói ellenállás:** change mgmt, oktatóanyagok, GYIK videók, pilot championok.
- **SP limitációk:** mappa/fájl limitek előzetes tesztje; struktúra optimalizálás.
- **Partner IT policy eltérések:** korai IT-egyeztetés, vendég-házirend dokumentálása.

---

## 19) Elfogadási feltételek (Definition of Done — MVP)

- 3 szerződés × ≥3 partner sablonjai implementálva;
- 1 teljes EM-ciklus **végigautomatizálva** (létrehozás → feltöltés  → zárolás → archiv);
- Időalapú zárak és CR-feloldás működik;
- Audit/riport teljességi ellenőrzés;
- Nulla kritikus biztonsági incidens a pilot alatt;
- Admin időráfordítás **≥50%** csökkenés pilotban.

---

## 20) Tesztelési stratégia

- **Kontraktteszt** Graph/SharePoint/Teams végpontokra;
- **Integrációs/E2E** provisioning-re és locking-ra;
- **Perf**: batch EM létrehozás;
- **Rate limit** szimuláció;
- **RBAC** jogosultság-mátrix fedettség.

---

## 21) Nyitott kérdések

1. Vendégfelhasználók teljes lifecycle-je: auto-expire? grace period?
2. CR-áramlás részletei (jóváhagyási lánc, értesítések).
3. Teams csatornastratégia (egy csoport/EM vagy szerződés/cég szint?).
4. Archívum fizikai helye és visszaállítás folyamata.
5. Jelentések pontos metrikái és felelősei.

---

## 22) Epikek (MVP)

### EP-01 — Sablonmotor & Provisioning (SharePoint/Teams)

**Cél:** Standard mappastruktúrák és Teams/SharePoint erőforrások automatikus, idempotens létrehozása.\
**Value/KPI:** +Sebesség (10 perc/EM), −hibák, indulási átfutás 2 óra.\
**Scope:** sablonverziózás, diff/rollback; névkonvenciók; idempotens újrafuttatás; több partner és rész (A/B/C); Teams csoport+csatorna és SP-tár csatolás.\
**Nem scope:** fejlett workflow, külső ERP integráció.\
**Kapcsolódó US:** US-01, US-02, US-03.\
**DoD:** 1 EM teljes provisioning ≤10 perc; sablon publikálás nem írja felül a korábbi EM-eket; audit események keletkeznek; retry/backoff Graph 429-nél.\
**Függőségek:** Azure app reg, engedélyek (S0); RBAC (EP-02).\
**Becslés:** 2 sprint (S1–S2).\
**Kockázat:** Graph/SharePoint throttling → queue+backoff.

### EP-02 — RBAC, öröklés és kivételek (beleértve Pénzügyi szegregációt)

**Cél:** Szerepkör-alapú, mappa-szintű jogosultsági mátrix érvényesítése, kivételek kezelése.\
**Value/KPI:** −hibák, compliance.\
**Scope:** mátrix motor; öröklés megszakítása érzékeny mappáknál; „Pénzügyi” és „NEÜ-only” szegregáció; PM manuális zárolás.\
**Nem scope:** DLP/IRM.\
**Kapcsolódó US:** US-03, US-04, US-06.\
**DoD:** Mátrix egységteszt-fedettség ≥90%; privilege-escalation negatív tesztek; manuális lock a UI-ból működik és auditált.\
**Függőségek:** EP-01 alap mappák.\
**Becslés:** 1,5 sprint (S2–S3).\
**Kockázat:** bonyolult kivétel-kezelés → szabály-ütközés detektor.

### EP-03 — Időzárak & CR-feloldás

**Cél:** T-értesítések és időalapú zárolások, CR alapú ideiglenes feloldás.\
**Value/KPI:** határidő-fegyelem, kevesebb manuális admin.\
**Scope:** T−3/−1/T+0 értesítések; T+1–7 ablakok; T+8 ReadOnly; 48h CR-unlock auto visszazárással; kézi lock/unlock.\
**Kapcsolódó US:** US-05, US-08.\
**DoD:** időzített jobok megbízhatósága ≥99%; minden állapotváltás auditált; értesítések kézbesítési arány ≥98%.\
**Függőségek:** EP-02 RBAC, EP-08 értesítési csatornák.\
**Becslés:** 1 sprint (S3).\
**Kockázat:** időzítők driftje → idempotens, re-entrant jobok.

### EP-04 — Vendég-hozzáférés & Identity (Azure AD B2B)

**Cél:** Partnerek meghívása, csoporttagság, lejáratás és visszavonás.\
**Scope:** meghívó flow, csoport-hozzárendelés, visszavonás, lejárati szabály; hibakezelés és audit.\
**Kapcsolódó US:** US-07.\
**DoD:** vendég meghívás → hozzáférés ≤15 perc; revoke realtime (<1 perc) SP/Teams szinten; audit teljes.\
**Függőségek:** EP-01, EP-02.\
**Becslés:** 0,5 sprint (S3).\
**Kockázat:** partner IT policy eltérések → előzetes on-boarding guide.

### EP-05 — Admin/PM UI (web)

**Cél:** Egyablakos admin felület provisioninghez, sablon- és jogosultságkezeléshez.\
**Scope:** Dashboard, Új Megrendelés űrlap, Sablonkezelő (diff/rollback), Jogosultságkezelő, Audit nézet.\
**Kapcsolódó US:** US-01, US-02, US-03.\
**DoD:** fő oldalak <3s betöltés; 0 P1 accessibility hiba; beépített validációk; OpenAPI-alapú kliens.\
**Függőségek:** EP-01–EP-02 API-k.\
**Becslés:** 1,5 sprint (S1–S2).\
**Kockázat:** scope creep → Figma wireframe + design freeze.

### EP-06 — Riportok & Audit

**Cél:** Ki-mihez fér hozzá és ki-mit csinált kérdések megválaszolása; exportok.\
**Scope:** kétirányú hozzáférési riport (mappa→felhasználók, user/csoport→mappák), zárolási események, feltöltési készültség, CSV/XLSX.\
**Kapcsolódó US:** US-09.\
**DoD:** riportok ≤15 perc; CSV/XLSX egyezik a képernyőn látottal; audit log retention 7 év.\
**Függőségek:** EP-02, EP-03.\
**Becslés:** 1 sprint (S4).\
**Kockázat:** nagy lekérdezések → indexelés, denormalizált nézetek.

### EP-07 — Archiválás & Verziózás

**Cél:** Retention policy és verziókezelés üzemeltethetően.\
**Scope:** 90 nap/1 év/7 év szabály; max verziószám; zip-archív; visszaállítási folyamat.\
**Kapcsolódó US:** US-10.\
**DoD:** időzített archiv futások; visszaállítás ≤1 munkanap; dokumentált eljárás.\
**Nyitott döntés:** max verzió 5 vs 10 (PRD-ben eltérés) → döntés szükséges.\
**Függőségek:** EP-01, EP-06.\
**Becslés:** 0,5 sprint (S4).\
**Kockázat:** SP limitációk → előzetes terheléses teszt.

### EP-08 — Értesítések & Kommunikáció

**Cél:** E-mail/Teams értesítések ütemezetten és esemény-alapon.\
**Scope:** T-értesítések, provisioning siker/hiba, zárolási változások; sablonosítható üzenetek; kézbesítés monitorozás.\
**Kapcsolódó US:** US-03, US-05, US-08.\
**DoD:** kézbesítési arány ≥98%; duplikált értesítések elkerülése (de-dup).\
**Függőségek:** EP-03.\
**Becslés:** 0,5 sprint (S3).\
**Kockázat:** spam-szűrők → SPF/DKIM/DMARC beállítások (O365).

### EP-09 — Megfigyelhetőség & Üzemeltetés

**Cél:** Metrikák, logok, riasztások működő ügyeleti képpel.\
**Scope:** metrikák (provision idő, 429 arány, queue latency), strukturált log, trace-id, riasztások.\
**Kapcsolódó US/NFR:** NFR, §14.\
**DoD:** alap dashboardok; P1 riasztások beállítva; runbook-ok.\
**Függőségek:** EP-01–EP-08.\
**Becslés:** 0,5 sprint (S5).\
**Kockázat:** fals pozitív riasztások → zajszűrés szabályok.

### EP-10 — Biztonság & Compliance

**Cél:** AuthN/AuthZ, titokkezelés, audit, GDPR megfelelés.\
**Scope:** MSAL, Key Vault, least-privilege app permissionek, PII-minimalizálás, vendég monitorozás.\
**Kapcsolódó NFR:** §15.\
**DoD:** engedély-review jegyzőkönyv; sérülékenység-scan 0 kritikus; audit-log ellenőrzés.\
**Függőségek:** EP-02, EP-04.\
**Becslés:** folyamatos (S0–S5).\
**Kockázat:** jogosultság-szivárgás → rendszeres access review.

### 22.11) Sprint-kiosztás (tervezet)

| Sprint | Epik(ek)                                                              |
| ------ | --------------------------------------------------------------------- |
| S0     | EP-10 (alap), EP-01 előkészítés (app reg, engedélyek)                 |
| S1     | EP-01 (provisioning alap), EP-05 (UI alap)                            |
| S2     | EP-01 (befejezés), EP-05 (UI), EP-02 (RBAC alap)                      |
| S3     | EP-02 (befejezés), EP-03 (időzár), EP-08 (értesítések), EP-04 (guest) |
| S4     | EP-06 (riport), EP-07 (archív)                                        |
| S5     | EP-09 (megfigyelhetőség), keményítés, pilot előkészítés               |

### 22.12) Követhetőség (US → Epik)

- US-01 → EP-01, EP-05
- US-02 → EP-01, EP-05
- US-03 → EP-01, EP-02, EP-05, EP-08
- US-04 → EP-02
- US-05 → EP-03, EP-08
- US-06 → EP-02
- US-07 → EP-04
- US-08 → EP-03, EP-08
- US-09 → EP-06
- US-10 → EP-07

---

## 23) Story-k — EP-03 (Időzárak & CR-feloldás)

> **Cél:** Időalapú zárolások és CR feloldások végfelhasználói és üzemeltetési nézőpontból teljeskörűen működjenek (UI + backend + időzített jobok + audit + értesítés).\
> **Érintett szekciók:** §6.5, §8, §10, §12, §14, §22 EP-03/EP-08.

### ST-03-01 — Időzár-szabályok konfigurálása (Admin UI)

**Leírás:** Adminként szerződés/EM szinten be tudom állítani a zárolási időablakokat és kivételeket.\
**Mezők:** `deadline_datetime`, `upload_full_window_days` (alap: 5), `remediation_window_days` (alap: 2), `readonly_from_days` (alap: 8), `cr_unlock_hours` (alap: 48), érintett mappacsoportok: *Szakértők*, *Eredménytermékek*.\
**Validáció:** dátum/idő kötelező; ablakok >0; readonly\_from > (full+remediation).\
**AC:**

- Mentés után a szabály az adott EM-re azonnal érvényes;
- Hibás mezők esetén inline hibaüzenet;
- API: `PUT /api/locks/rules/{emId}` idempotens;
- Audit event: `LOCK_RULE_UPDATED` a mezők diffjével.

### ST-03-02 — Ütemezett zárolás futtatása (Scheduler)

**Leírás:** Rendszer 15 percenként kiértékeli az aktív EM-eket és alkalmazza az állapotváltásokat.\
**AC (Gherkin):**

Given EM X határidő T 2025-09-15 16:00
And upload_full_window_days=5, remediation_window_days=2, readonly_from_days=8
When most 2025-09-23 00:00
Then a 'Szakértők' mappák állapota 'ReadOnly'
And 'Eredménytermékek' a teljesítési határidőn zárolva

További AC: idempotens végrehajtás; konkurens futás kizárása (distributed lock); részleges hiba esetén retry/backoff; metrikák gyűjtése.\
**API/Job:** `POST /api/locks/apply` (belső), Celery task `locks.apply(emId)`.

### ST-03-03 — Manuális zárolás / zárolás feloldás (PM UI)

**Leírás:** PM bármikor kézzel zárolhat/feloldhat mappacsoportokat EM szinten (pl. határidő előtt).\
**AC:**

- PM kiválasztja: *Szakértők* vagy *Eredménytermékek*;
- „Ok megadása” kötelező;
- Művelet ≤1 perc alatt érvényesül SP/Teams oldalon;
- Audit: `MANUAL_LOCK_APPLIED` / `MANUAL_LOCK_RELEASED` okkal;
- Jogosultság-mátrix tiszteletben tartása (EP-02).\
  **API:** `POST /api/locks/manual` payload: `{emId, scope, action, reason}`.

### ST-03-04 — CR alapú ideiglenes feloldás (48 óra auto visszazárás)

**Leírás:** Admin/PM CR-t rögzít, amely adott *scope*-ra (mappacsoport) ideiglenes írást enged 48 órára, majd automatikusan visszazár.\
**AC (Gherkin):**

Given a 'ReadOnly' állapotú 'Szakértők' mappacsoport EM Y alatt
When CR feloldás indul 2025-10-01 09:00 48 órára
Then 09:05-ig a mappák írhatók
And 2025-10-03 09:00-kor automatikusan újra 'ReadOnly'
And minden művelet auditált: CR_OPENED, CR_EXPIRES, CR_CLOSED

**Megjegyzés (MVP):** külön jóváhagyási lánc nincs; a CR-t Admin/PM indíthatja.\
**API:** `POST /api/locks/cr/open`, `POST /api/locks/cr/close`.

### ST-03-05 — Értesítések a zárolási életciklusban

**Leírás:** T−3, T−1, T+0 időpontokban és minden lock/unlock eseménynél értesítés (e-mail + Teams).\
**AC:**

- Címzettek: érintett Partner Adminok/Szakértők + NEÜ PM;
- Üzenet sablonból generálódik;
- Kézbesítés státusz visszajelentés (EP-08);
- De-dup: ugyanazon eseményre 24 órán belül nincs duplikáció;
- Audit: `NOTIFICATION_SENT` metaadatokkal.\
  **API:** event bus: `lock.state.changed`, `lock.cr.opened`, `deadline.reminder` → EP-08 notification service.

### ST-03-06 — Audit & Riport integráció

**Leírás:** Minden állapotváltás, manuális/CR művelet és ütemezett futás naplózva; riportozható.\
**AC:**

- `audit_log` táblában megjelennek a fenti események részletes metával (emId, scope, actor, from→to, ts);
- Riport: „Zárolási események” nézet szűréssel (idő, EM, partner).

### ST-03-07 — Hibatűrés és visszaállás

**Leírás:** Graph/SharePoint hiba vagy throttling esetén a lock műveletek biztonságos újrapróbálása.\
**AC:**

- 429 esetén exponential backoff, max 5 retry;
- 3 egymást követő sikertelenség → riasztás (EP-09) és „degraded” állapot log;
- Részleges érvényesülés esetén kompenzáló futás 15 percen belül;
- State store-ban (DB) a kívánt állapot megőrzése, amíg a tényleges állapot szinkronba nem kerül.

### DoR / DoD (EP-03 story-k)

**DoR:** véglegesített mappacsoport-definíciók; érintett szerepkörök; értesítési sablonok v0; teszt tenant elérhető.\
**DoD:** zöld integrációs/E2E tesztek; metrikák gyűjtése; audit események látszanak a riportban; kézikönyv frissítve.

---

## Függelék A — Jogosultsági mátrix (rövidített példa) — Jogosultsági mátrix (rövidített példa)

| Mappa                | NEÜ Admin | NEÜ PM  | Cég Admin                 | Szakértő | NEÜ QA  |
| -------------------- | --------- | ------- | ------------------------- | -------- | ------- |
| 00\_BELSO\_NEU\_ONLY | Teljes    | Olvasás | –                         | –        | –       |
| KOZOS\_SABLONOK      | Teljes    | Teljes  | Olvasás                   | –        | Olvasás |
| CEG\_XX              | Teljes    | Olvasás | **Teljes (csak saját)**   | –        | Olvasás |
| 01\_Szakertok        | Teljes    | Olvasás | Teljes (T+8 után olvasás) | Olvasás  | –       |
| 02\_Megrendeles      | Teljes    | Olvasás | Olvasás                   | –        | –       |
| 03\_Utmutatok        | Írás      | Írás    | Olvasás                   | Olvasás  | –       |
| 04\_EREDMENYTERMEKEK | Teljes    | Olvasás | Teljes (határidőig)       | –        | Írás    |
| 05\_Teljesites       | Teljes    | Teljes  | Olvasás                   | –        | Olvasás |

---

## Függelék B — Időalapú transzíciók

T+0: EM kiadás
T+1–5: Szakértők feltöltése (teljes)
T+6–7: Hiánypótlás (korlátozott)
T+8: Automatikus zárolás (read-only)
Teljesítési határidő: Eredménytermék zárolás
Határidő után: csak CR-rel módosítható (48h feloldás)



---

## Függelék C — Fájlnévképzési példák

- `Kovacs_Janos_CV_20250101.pdf`
- `ET_001_Tanulmany_v2.3_20250215.docx`
- `CR_2025_001_Kerelem.pdf`

---

## Függelék D — UI flow-k (vázlat)

1. **Admin Dashboard** → Aktív EM-ek, zárolások, értesítések, riportok.
2. **Új Megrendelés** → Űrlap (rész/partner/határidők/sablon) → `Provision` job indítása → státusz.
3. **Sablonok** → lista, diff, rollback, publikálás.
4. **Jogosultságok** → csoportok, felhasználók, kivételek.
5. **Audit** → keresés/szűrés, export.

---

## Függelék E — Rollout

- Pilot → iteráció → fokozatos bővítés rész/cég szerint; change mgmt: GYIK, oktatóvideók, mintadokumentumok.
