# poolDRV Docker Services Status

## ✅ Minden szolgáltatás fut!

### Szolgáltatások állapota:

| Szolgáltatás | Állapot | Port | Leírás |
|--------------|---------|------|--------|
| **PostgreSQL** | ✅ Fut (healthy) | 5432 | Adatbázis |
| **Redis** | ✅ Fut (healthy) | 6379 | Cache és message broker |
| **API** | ✅ Fut | 8000 | Backend API |
| **Worker** | ✅ Fut | - | Háttérfeladatok (Celery) |

### Elérhetőségek:

- **API Dokumentáció**: http://localhost:8000/docs
- **API Root**: http://localhost:8000/
- **PostgreSQL**: `postgresql://pooldrv:pooldrv@localhost:5432/pooldrv`
- **Redis**: `redis://localhost:6379`

### Worker képességek:

A worker a következő feladatokat tudja kezelni:
- **Provisioning** - Rendelések létrehozása/törlése
- **Locks** - Zárolások kezelése
- **Notifications** - Értesítések küldése
- **Reports** - Jelentések generálása
- **Scheduled Tasks** - Időzített feladatok (15 percenként lock evaluáció)

### Docker parancsok:

```bash
# Szolgáltatások állapota
docker ps

# Logok megtekintése
docker logs pool_shrpnt-api-1 --tail 50
docker logs pool_shrpnt-worker-1 --tail 50

# Szolgáltatások újraindítása
docker-compose restart

# Szolgáltatások leállítása
docker-compose down

# Szolgáltatások indítása
docker-compose up -d

# Adatbázis elérése
docker exec -it pool_shrpnt-postgres-1 psql -U pooldrv

# Redis CLI
docker exec -it pool_shrpnt-redis-1 redis-cli
```

### API tesztelése:

```bash
# Health check
curl http://localhost:8000/

# API docs
open http://localhost:8000/docs
```

## 🎉 A rendszer készen áll a használatra!