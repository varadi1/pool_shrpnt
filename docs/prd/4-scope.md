# 4) Scope

## 4.1 In-scope (MVP)

1. **Szerződésenként/partnerenként** standardizált mappastruktúra **automatikus létrehozása** előre definiált sablonból (rész A/B/C, cég-mappák, EM mappák).
2. **RBAC** és mappa-szintű engedélyek beállítása (öröklődés + kivételek; időalapú zárolás).
3. **Teams csoport** létrehozás és életciklus-kezelés (névkonvenció, archíválás), SharePoint tár publikálása Teamsben.
4. **Admin UI**: mappalétrehozás/lezárás, sablon-karbantartás, felhasználó/csoport kezelés, audit megtekintés.
5. **Deadlines & Locking**: automatizált mappazárolás T+8 nap, teljesítési határidőnél eredménytermék zárolás, CR-alapú ideiglenes feloldás.
6. **Riportok**: alap hozzáférés- és használati riportok, zárolási események.
7. **Nincs tartalom-cache** (Redis csak session/broker Celery-hez).

## 4.2 Out-of-scope (MVP)

- Mobil app; külső ERP/Dynamics/Outlook integráció; ML/Blockchain; kiterjesztett workflow engine; fejlett DLP/IRM.

---
