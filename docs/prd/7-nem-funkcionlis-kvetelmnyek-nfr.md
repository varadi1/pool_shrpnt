# 7) Nem-funkcionális követelmények (NFR)

- **Teljesítmény:** <3s oldalbetöltés; mappastruktúra <10s létrehozás (per EM, tipikus).
- **Megbízhatóság:** ≥99.5% uptime; retry/backoff Graph-limitnél; idempotens jobok.
- **Biztonság:** Azure AD auth (MSAL) + JWT; least-privilege; audit log; GDPR.
- **Skálázhatóság:** havi +1 új szerződés; havi 20 EM; 15 egyidejű felhasználó; később horizontális bővíthetőség.
- **Megfigyelhetőség:** metrikák, strukturált log, trace azonosító, riasztások.
- **Karbantarthatóság:** monorepo; kódstandard; CI/CD; infra as code (Docker Compose).

---
