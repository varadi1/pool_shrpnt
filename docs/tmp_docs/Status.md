---
# /qa **[]**

[x] *review story 4.2 
[x] *review story 5.2 
[] user testing


---
# /dev1 **[1]**

[x] *develop-story 5.2 task 1
[x] *develop-story 5.2 task 2
[x] *develop-story 5.2 task 3
[x] *develop-story 5.2 task 4
[x] *develop-story 5.2 task 5
[x] *develop-story 5.2 task 6
[x] *develop-story 5.2 task 7
[x] *develop-story 5.2 task 8
[x] *develop-story 5.2 task 9
[x] *develop-story 5.2 task 10
[x] fixing frontend

[x] *develop-story 5.3 task 1
[x] *develop-story 5.3 task 2
[x] fixing errors
[x] *develop-story 5.3 task 3
[x] *develop-story 5.3 task 4
[x] *develop-story 5.3 task 5
[x] *develop-story 5.3 task 6
[x] *develop-story 5.3 task 7
[x] *develop-story 5.3 task 8
[x] *develop-story 5.3 task 9
[x] *develop-story 5.3 task 10

[x] *develop-story 5.5 task 1
[x] *develop-story 5.5 task 2 véletlen a [3] csinálja nem a [2]
[x] *develop-story 5.5 task 3
[x] *develop-story 5.5 task 4
[x] *develop-story 5.5 task 5
[x] *develop-story 5.5 task 6
[x] fixing errors
[x] *develop-story 5.5 task 7
[x] *develop-story 5.5 task 8
[x] *develop-story 5.5 task 9 - waiting to start after limit liftet
[x] *develop-story 5.5 task 10

---
# /dev2 **[]**

[x] *develop-story 4.2 task 10
[x] *run-tests story 4.2


---
# /sm **[]**
[x] create story 5.2.1 to create contracts page 
[] draft

---
# /po **[]**

[x] *validate-story-draft story 5.2.1
[x] kérlek végezd el a kegészítéseket, módosításokat, amik szükségesek a dokumentumban 


---
# /dev **[2]**
[x] *develop-story 5.2.1 task 1
[x] *develop-story 5.2.1 task 2
[x] *develop-story 5.2.1 task 3
[x] *develop-story 5.2.1 task 4
[x] *develop-story 5.2.1 task 5
[x] *develop-story 5.2.1 task 6
[x] *develop-story 5.2.1 task 7
[x] *develop-story 5.2.1 task 8
[x] *develop-story 5.2.1 task 9
[x] *develop-story 5.2.1 task 10
[x] fixing language and errors
[x] *develop-story 5.2.1 task 11
[x] *develop-story 5.2.1 task 12
[x] fixing Fluent UI DataGrid compatibility issues 

[x] *develop-story 5.4 task 1
[x] *develop-story 5.4 task 2
[] fixing errors
[x] *develop-story 5.4 task 3
[x] *develop-story 5.4 task 4
[x] *develop-story 5.4 task 5
[x] *develop-story 5.4 task 6
[x] *develop-story 5.4 task 7
[x] *develop-story 5.4 task 8
[x] *develop-story 5.4 task 9 we have to restart this after limits are lifted
[x] *develop-story 5.4 task 10


---
/bmad-master **[1]**

[-] fixing contract page issues

---
---
# cursor
/dev [1]

[x] *run-tests story 5.2 please make sure internal or local services, apis and functions are not mocked, but tested and corrected properly.
[x] getting rid of sqlight
[x] *run-tests story 5.2.1 please make sure internal or local services, apis and functions are not mocked, but tested and corrected properly. 
[] *run-tests story 5.4 please make sure internal or local services, apis and functions are not mocked, but tested and corrected properly. Please also make sure there is no sqligth ever! we use postgresql, it is in the docker and we use only that for implementation and tests. 

visszatérve a szerződések oldal szűrőire, a szabadszavas szűrő továbbra is gyorsan elveszti a fókuszt és akkor nem lehet tovább gépelni. A Lejárat dátuma-ig, a Lejárat dátumáig magyarul továbbra sem működik. Ez valami furát kereshet, mert csak olyan eredmény jön, ahol nincs érték megadva. 

---
---
# DOCKER

How to run (stop your local Vite on 3000 first):
docker compose up -d postgres redis api worker scheduler
docker compose up -d frontend
Visit http://localhost:3000 and test API via fetch('/api/health')
Prod override (static build):
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d frontend
All YAML validated with docker compose config. No lints introduced.
Extended docker-compose.yml with frontend and scheduler, and API healthcheck.
Created docker-compose.prod.yml.

**indítás/stop**
Start all: ./scripts/start.sh
Stop all: ./scripts/stop.sh





---
1. Backend szerver indítása

# Navigálj a projekt gyökérkönyvtárába
cd /Users/varadiimre/0SWDEV/pool_shrpnt

# Docker-rel (legegyszerűbb):
docker-compose up -d postgres redis
docker-compose up api worker

# VAGY közvetlenül Python-nal:
python3 -m uvicorn api.main:app --host 0.0.0.0 --port 8000 --reload

Backend elérése: http://localhost:8000
API dokumentáció: http://localhost:8000/docs

2. Frontend szerver indítása

# Navigálj a web könyvtárba
cd /Users/varadiimre/0SWDEV/pool_shrpnt/web

# Függőségek telepítése (ha még nem tetted meg)
npm install

# Fejlesztői szerver indítása
npm run dev

Frontend elérése: http://localhost:3000

3. Tesztelhető funkciók

Backend API-n keresztül (http://localhost:8000/docs)

- ✅ Lock Management - Teljes manuális lock/unlock rendszer
- ✅ Contracts - CRUD műveletek
- ✅ Orders - Megrendelés kezelés
- ✅ Templates - Mappa sablon kezelés verziókezeléssel
- ✅ Health Check - /health endpoint

Frontend felületen (http://localhost:3000)

- ✅ Manual Lock Panel - A legfejlettebb funkció:
- EM kiválasztás legördülő menüből
- Mappa scope választó (Experts/Deliverables)
- Lock/Unlock műveletek
- Kötelező indoklás (min. 10 karakter)
- Valós idejű státusz megjelenítés
- Műveleti előzmények
- ✅ Navigation - Működő navigáció az oldalak között
- ✅ Dashboard, Contracts, Orders, Templates, Settings oldalak

4. Azure AD nélküli tesztelés

Ha nincs beállítva Azure AD, ezeket tudod tesztelni:
- Backend API dokumentáció böngészése
- Frontend UI komponensek megtekintése
- Mock adatok a Lock Management felületen (EM 2025/A/001, stb.)

5. Gyors teszt parancsok

# Backend health check
curl http://localhost:8000/health

# Frontend build teszt
cd web && npm run build

# Tesztek futtatása
cd web && npm test

---

⚠️ Még be kell állítani az Azure Portalon:

1. [ ] API hatókör (scope) létrehozása
- Menü: "API engedélyezése" / "Expose an API"
- Hatókör neve: access
2. [ ] Átirányítási URI-k
- SPA: http://localhost:5173/auth/callback
- Web: http://localhost:8000/api/auth/callback
3. [ ] Implicit flow engedélyezése (Hitelesítés menüben):
- ✅ Access tokens
- ✅ ID tokens
4. [ ] Opcionális Graph engedélyek (ha Teams notifikációt
akarsz):
- ChannelMessage.Send
- Chat.ReadWrite

📝 Miután kész vagy:

1. Másold át a .env.final fájlt .env néven:
cp .env.final .env

2. Generálj egy biztonságos APP_SECRET_KEY-t:
python3 -c "import secrets; print(secrets.token_urlsafe(32))"

3. Cseréld ki az APP_SECRET_KEY értékét a generált kulcsra

