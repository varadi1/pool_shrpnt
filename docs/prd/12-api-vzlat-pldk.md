# 12) API vázlat (példák)

- `POST /api/orders` — új EM létrehozás (param: rész, partner, határidők, sablonVerzió).
- `POST /api/orders/{id}/provision` — mappák, csoportok, engedélyek létrehozása (async job).
- `POST /api/templates` — sablon CRUD.
- `POST /api/locks/apply` — időalapú zárolás futtatása.
- `GET /api/reports/access` — hozzáférési riport.
- `POST /api/users/invite` — guest meghívás+csoporthozzárendelés.

**Hibamodel:** 4xx validáció; 429 retry-after; 5xx fallback és riasztás.

---
