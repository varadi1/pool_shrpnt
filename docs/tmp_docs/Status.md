---
# /qa **[1]**

[x] *review story 4.2 
[x] *review story 5.2 


---
# /dev1 **[2]**

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
[-] *develop-story 5.3 task 8
[] *develop-story 5.3 task 9
[] *develop-story 5.3 task 10
[] *develop-story 5.3 task 11
[] *develop-story 5.3 task 12

---
# /dev2 **[]**

[x] *develop-story 4.2 task 10
[x] *run-tests story 4.2


---
# /sm **[]**
[x] create story 5.2.1 to create contracts page 


---
# /po **[]**

[x] *validate-story-draft story 5.2.1
[x] kérlek végezd el a kegészítéseket, módosításokat, amik szükségesek a dokumentumban 


---
# /dev **[3]**
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
[-] *develop-story 5.2.1 task 11
[] *develop-story 5.2.1 task 12

[] *develop-story 5.4 task 1
[] *develop-story 5.4 task 2
[] fixing errors
[] *develop-story 5.4 task 3
[] *develop-story 5.4 task 4
[] *develop-story 5.4 task 5
[] *develop-story 5.4 task 6
[] *develop-story 5.4 task 7
[] *develop-story 5.4 task 8
[] *develop-story 5.4 task 9
[] *develop-story 5.4 task 10


---
---
# cursor
/dev [1]

[x] *run-tests story 5.2
[x] getting rid of sqlight
[] *run-tests story 5.2.1
[] *run-tests story 5.3

---
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