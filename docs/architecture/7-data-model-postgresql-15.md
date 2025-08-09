# 7) Data Model (PostgreSQL 15)

**Key tables** (aligned with PRD):

- `contract`, `partner_company`, `order_em` (EM), `sp_site`, `sp_drive`
- `folder_template`, `folder_instance`, `permission_assignment`
- `role`, `group`, `membership`
- `lock_rule` (per EM), `lock_state` (derived/applied)
- `audit_log` (immutable), `report_job`, `notification_job`

**Notes**

- Keep **desired state** for permissions/locks; reconcilers compare desired vs actual.
- Index heavy report queries; consider **materialized views** for access reports.

---
