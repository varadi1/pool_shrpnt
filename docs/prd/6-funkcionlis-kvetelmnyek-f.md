# 6) Funkcionális követelmények (F)

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
