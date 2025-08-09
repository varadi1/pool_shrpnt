# 5) Frontend Architecture (React)

- **Routing:** React Router; routes per PRD/UX (Dashboard, Contracts, Orders, Templates, Users/Groups, Permissions, Folders, Reports, Audit, Settings).
- **State/data:** React Query for server state; no local mutation beyond forms.
- **UI kit:** Fluent UI; a11y (WCAG 2.2 AA target); keyboard‑first flows; chips for lock states (T−3/−1/T+0/T+8, CR active).
- **MSAL:** login redirect; role claims → UI guards. Silent token renewal.
- **Error handling:** toast + correlation id; 429 banner with retry‑after.
- **Generated client:** OpenAPI generator syncs types/endpoints.

---
