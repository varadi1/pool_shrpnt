# 8) API Surface (examples)

- `POST /api/contracts` · `GET /api/contracts`
- `POST /api/orders` · `POST /api/orders/{id}/provision`
- `PUT /api/locks/rules/{emId}` · `POST /api/locks/manual`
- `POST /api/locks/cr/open` · `POST /api/locks/cr/close`
- `GET /api/folders/tree` · `GET /api/permissions/effective`
- `POST /api/groups` · `PUT /api/groups/{id}/members`
- `POST /api/guests` · `GET /api/guests/status`
- `GET /api/reports/access` (mode: folder|principal) · `GET /api/reports/locks`

**Errors**: 4xx field errors; 429 retry‑after; 5xx with correlation id. All mutating endpoints emit **audit events**.

---
