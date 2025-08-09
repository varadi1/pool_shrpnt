# 13) Adatmodell vázlat

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
