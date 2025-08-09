# 22) Epikek (MVP)

## EP-01 — Sablonmotor & Provisioning (SharePoint/Teams)

**Cél:** Standard mappastruktúrák és Teams/SharePoint erőforrások automatikus, idempotens létrehozása.\
**Value/KPI:** +Sebesség (10 perc/EM), −hibák, indulási átfutás 2 óra.\
**Scope:** sablonverziózás, diff/rollback; névkonvenciók; idempotens újrafuttatás; több partner és rész (A/B/C); Teams csoport+csatorna és SP-tár csatolás.\
**Nem scope:** fejlett workflow, külső ERP integráció.\
**Kapcsolódó US:** US-01, US-02, US-03.\
**DoD:** 1 EM teljes provisioning ≤10 perc; sablon publikálás nem írja felül a korábbi EM-eket; audit események keletkeznek; retry/backoff Graph 429-nél.\
**Függőségek:** Azure app reg, engedélyek (S0); RBAC (EP-02).\
**Becslés:** 2 sprint (S1–S2).\
**Kockázat:** Graph/SharePoint throttling → queue+backoff.

## EP-02 — RBAC, öröklés és kivételek (beleértve Pénzügyi szegregációt)

**Cél:** Szerepkör-alapú, mappa-szintű jogosultsági mátrix érvényesítése, kivételek kezelése.\
**Value/KPI:** −hibák, compliance.\
**Scope:** mátrix motor; öröklés megszakítása érzékeny mappáknál; „Pénzügyi” és „NEÜ-only” szegregáció; PM manuális zárolás.\
**Nem scope:** DLP/IRM.\
**Kapcsolódó US:** US-03, US-04, US-06.\
**DoD:** Mátrix egységteszt-fedettség ≥90%; privilege-escalation negatív tesztek; manuális lock a UI-ból működik és auditált.\
**Függőségek:** EP-01 alap mappák.\
**Becslés:** 1,5 sprint (S2–S3).\
**Kockázat:** bonyolult kivétel-kezelés → szabály-ütközés detektor.

## EP-03 — Időzárak & CR-feloldás

**Cél:** T-értesítések és időalapú zárolások, CR alapú ideiglenes feloldás.\
**Value/KPI:** határidő-fegyelem, kevesebb manuális admin.\
**Scope:** T−3/−1/T+0 értesítések; T+1–7 ablakok; T+8 ReadOnly; 48h CR-unlock auto visszazárással; kézi lock/unlock.\
**Kapcsolódó US:** US-05, US-08.\
**DoD:** időzített jobok megbízhatósága ≥99%; minden állapotváltás auditált; értesítések kézbesítési arány ≥98%.\
**Függőségek:** EP-02 RBAC, EP-08 értesítési csatornák.\
**Becslés:** 1 sprint (S3).\
**Kockázat:** időzítők driftje → idempotens, re-entrant jobok.

## EP-04 — Vendég-hozzáférés & Identity (Azure AD B2B)

**Cél:** Partnerek meghívása, csoporttagság, lejáratás és visszavonás.\
**Scope:** meghívó flow, csoport-hozzárendelés, visszavonás, lejárati szabály; hibakezelés és audit.\
**Kapcsolódó US:** US-07.\
**DoD:** vendég meghívás → hozzáférés ≤15 perc; revoke realtime (<1 perc) SP/Teams szinten; audit teljes.\
**Függőségek:** EP-01, EP-02.\
**Becslés:** 0,5 sprint (S3).\
**Kockázat:** partner IT policy eltérések → előzetes on-boarding guide.

## EP-05 — Admin/PM UI (web)

**Cél:** Egyablakos admin felület provisioninghez, sablon- és jogosultságkezeléshez.\
**Scope:** Dashboard, Új Megrendelés űrlap, Sablonkezelő (diff/rollback), Jogosultságkezelő, Audit nézet.\
**Kapcsolódó US:** US-01, US-02, US-03.\
**DoD:** fő oldalak <3s betöltés; 0 P1 accessibility hiba; beépített validációk; OpenAPI-alapú kliens.\
**Függőségek:** EP-01–EP-02 API-k.\
**Becslés:** 1,5 sprint (S1–S2).\
**Kockázat:** scope creep → Figma wireframe + design freeze.

## EP-06 — Riportok & Audit

**Cél:** Ki-mihez fér hozzá és ki-mit csinált kérdések megválaszolása; exportok.\
**Scope:** kétirányú hozzáférési riport (mappa→felhasználók, user/csoport→mappák), zárolási események, feltöltési készültség, CSV/XLSX.\
**Kapcsolódó US:** US-09.\
**DoD:** riportok ≤15 perc; CSV/XLSX egyezik a képernyőn látottal; audit log retention 7 év.\
**Függőségek:** EP-02, EP-03.\
**Becslés:** 1 sprint (S4).\
**Kockázat:** nagy lekérdezések → indexelés, denormalizált nézetek.

## EP-07 — Archiválás & Verziózás

**Cél:** Retention policy és verziókezelés üzemeltethetően.\
**Scope:** 90 nap/1 év/7 év szabály; max verziószám; zip-archív; visszaállítási folyamat.\
**Kapcsolódó US:** US-10.\
**DoD:** időzített archiv futások; visszaállítás ≤1 munkanap; dokumentált eljárás.\
**Nyitott döntés:** max verzió 5 vs 10 (PRD-ben eltérés) → döntés szükséges.\
**Függőségek:** EP-01, EP-06.\
**Becslés:** 0,5 sprint (S4).\
**Kockázat:** SP limitációk → előzetes terheléses teszt.

## EP-08 — Értesítések & Kommunikáció

**Cél:** E-mail/Teams értesítések ütemezetten és esemény-alapon.\
**Scope:** T-értesítések, provisioning siker/hiba, zárolási változások; sablonosítható üzenetek; kézbesítés monitorozás.\
**Kapcsolódó US:** US-03, US-05, US-08.\
**DoD:** kézbesítési arány ≥98%; duplikált értesítések elkerülése (de-dup).\
**Függőségek:** EP-03.\
**Becslés:** 0,5 sprint (S3).\
**Kockázat:** spam-szűrők → SPF/DKIM/DMARC beállítások (O365).

## EP-09 — Megfigyelhetőség & Üzemeltetés

**Cél:** Metrikák, logok, riasztások működő ügyeleti képpel.\
**Scope:** metrikák (provision idő, 429 arány, queue latency), strukturált log, trace-id, riasztások.\
**Kapcsolódó US/NFR:** NFR, §14.\
**DoD:** alap dashboardok; P1 riasztások beállítva; runbook-ok.\
**Függőségek:** EP-01–EP-08.\
**Becslés:** 0,5 sprint (S5).\
**Kockázat:** fals pozitív riasztások → zajszűrés szabályok.

## EP-10 — Biztonság & Compliance

**Cél:** AuthN/AuthZ, titokkezelés, audit, GDPR megfelelés.\
**Scope:** MSAL, Key Vault, least-privilege app permissionek, PII-minimalizálás, vendég monitorozás.\
**Kapcsolódó NFR:** §15.\
**DoD:** engedély-review jegyzőkönyv; sérülékenység-scan 0 kritikus; audit-log ellenőrzés.\
**Függőségek:** EP-02, EP-04.\
**Becslés:** folyamatos (S0–S5).\
**Kockázat:** jogosultság-szivárgás → rendszeres access review.

## 22.11) Sprint-kiosztás (tervezet)

| Sprint | Epik(ek)                                                              |
| ------ | --------------------------------------------------------------------- |
| S0     | EP-10 (alap), EP-01 előkészítés (app reg, engedélyek)                 |
| S1     | EP-01 (provisioning alap), EP-05 (UI alap)                            |
| S2     | EP-01 (befejezés), EP-05 (UI), EP-02 (RBAC alap)                      |
| S3     | EP-02 (befejezés), EP-03 (időzár), EP-08 (értesítések), EP-04 (guest) |
| S4     | EP-06 (riport), EP-07 (archív)                                        |
| S5     | EP-09 (megfigyelhetőség), keményítés, pilot előkészítés               |

## 22.12) Követhetőség (US → Epik)

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
