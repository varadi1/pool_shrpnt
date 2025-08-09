# 2) System Context & Actors

**Actors**: NEÜ Admin, NEÜ PM, NEÜ QA, Partner Admin, Partner Szakértő, Finance (read‑heavy), System Scheduler.

**External**: Microsoft Graph (Teams/Groups/Users/Sites/Drives), SharePoint Online, Azure AD (MSAL), Email/Teams notifications.

**High‑level**

```
[Browser (Admin/PM)] → Frontend (React+MSAL) → Backend API (FastAPI)
                                  ↓                        ↓
                             Azure AD (OIDC)           Worker (Celery)
                                  ↓                        ↓
                             Graph API / SP          Job Queue (Redis)
                                                       PostgreSQL
```

---
