# 23) Story-k — EP-03 (Időzárak & CR-feloldás)

> **Cél:** Időalapú zárolások és CR feloldások végfelhasználói és üzemeltetési nézőpontból teljeskörűen működjenek (UI + backend + időzített jobok + audit + értesítés).\
> **Érintett szekciók:** §6.5, §8, §10, §12, §14, §22 EP-03/EP-08.

## ST-03-01 — Időzár-szabályok konfigurálása (Admin UI)

**Leírás:** Adminként szerződés/EM szinten be tudom állítani a zárolási időablakokat és kivételeket.\
**Mezők:** `deadline_datetime`, `upload_full_window_days` (alap: 5), `remediation_window_days` (alap: 2), `readonly_from_days` (alap: 8), `cr_unlock_hours` (alap: 48), érintett mappacsoportok: *Szakértők*, *Eredménytermékek*.\
**Validáció:** dátum/idő kötelező; ablakok >0; readonly\_from > (full+remediation).\
**AC:**

- Mentés után a szabály az adott EM-re azonnal érvényes;
- Hibás mezők esetén inline hibaüzenet;
- API: `PUT /api/locks/rules/{emId}` idempotens;
- Audit event: `LOCK_RULE_UPDATED` a mezők diffjével.

## ST-03-02 — Ütemezett zárolás futtatása (Scheduler)

**Leírás:** Rendszer 15 percenként kiértékeli az aktív EM-eket és alkalmazza az állapotváltásokat.\
**AC (Gherkin):**

Given EM X határidő T 2025-09-15 16:00
And upload_full_window_days=5, remediation_window_days=2, readonly_from_days=8
When most 2025-09-23 00:00
Then a 'Szakértők' mappák állapota 'ReadOnly'
And 'Eredménytermékek' a teljesítési határidőn zárolva

További AC: idempotens végrehajtás; konkurens futás kizárása (distributed lock); részleges hiba esetén retry/backoff; metrikák gyűjtése.\
**API/Job:** `POST /api/locks/apply` (belső), Celery task `locks.apply(emId)`.

## ST-03-03 — Manuális zárolás / zárolás feloldás (PM UI)

**Leírás:** PM bármikor kézzel zárolhat/feloldhat mappacsoportokat EM szinten (pl. határidő előtt).\
**AC:**

- PM kiválasztja: *Szakértők* vagy *Eredménytermékek*;
- „Ok megadása” kötelező;
- Művelet ≤1 perc alatt érvényesül SP/Teams oldalon;
- Audit: `MANUAL_LOCK_APPLIED` / `MANUAL_LOCK_RELEASED` okkal;
- Jogosultság-mátrix tiszteletben tartása (EP-02).\
  **API:** `POST /api/locks/manual` payload: `{emId, scope, action, reason}`.

## ST-03-04 — CR alapú ideiglenes feloldás (48 óra auto visszazárás)

**Leírás:** Admin/PM CR-t rögzít, amely adott *scope*-ra (mappacsoport) ideiglenes írást enged 48 órára, majd automatikusan visszazár.\
**AC (Gherkin):**

Given a 'ReadOnly' állapotú 'Szakértők' mappacsoport EM Y alatt
When CR feloldás indul 2025-10-01 09:00 48 órára
Then 09:05-ig a mappák írhatók
And 2025-10-03 09:00-kor automatikusan újra 'ReadOnly'
And minden művelet auditált: CR_OPENED, CR_EXPIRES, CR_CLOSED

**Megjegyzés (MVP):** külön jóváhagyási lánc nincs; a CR-t Admin/PM indíthatja.\
**API:** `POST /api/locks/cr/open`, `POST /api/locks/cr/close`.

## ST-03-05 — Értesítések a zárolási életciklusban

**Leírás:** T−3, T−1, T+0 időpontokban és minden lock/unlock eseménynél értesítés (e-mail + Teams).\
**AC:**

- Címzettek: érintett Partner Adminok/Szakértők + NEÜ PM;
- Üzenet sablonból generálódik;
- Kézbesítés státusz visszajelentés (EP-08);
- De-dup: ugyanazon eseményre 24 órán belül nincs duplikáció;
- Audit: `NOTIFICATION_SENT` metaadatokkal.\
  **API:** event bus: `lock.state.changed`, `lock.cr.opened`, `deadline.reminder` → EP-08 notification service.

## ST-03-06 — Audit & Riport integráció

**Leírás:** Minden állapotváltás, manuális/CR művelet és ütemezett futás naplózva; riportozható.\
**AC:**

- `audit_log` táblában megjelennek a fenti események részletes metával (emId, scope, actor, from→to, ts);
- Riport: „Zárolási események” nézet szűréssel (idő, EM, partner).

## ST-03-07 — Hibatűrés és visszaállás

**Leírás:** Graph/SharePoint hiba vagy throttling esetén a lock műveletek biztonságos újrapróbálása.\
**AC:**

- 429 esetén exponential backoff, max 5 retry;
- 3 egymást követő sikertelenség → riasztás (EP-09) és „degraded” állapot log;
- Részleges érvényesülés esetén kompenzáló futás 15 percen belül;
- State store-ban (DB) a kívánt állapot megőrzése, amíg a tényleges állapot szinkronba nem kerül.

## DoR / DoD (EP-03 story-k)

**DoR:** véglegesített mappacsoport-definíciók; érintett szerepkörök; értesítési sablonok v0; teszt tenant elérhető.\
**DoD:** zöld integrációs/E2E tesztek; metrikák gyűjtése; audit események látszanak a riportban; kézikönyv frissítve.

---
