Részletes lépésről-lépésre útmutató - Azure Portal beállítások

  1. lépés: API hatókör (scope) létrehozása

  A) Nyisd meg az alkalmazást:

  1. Azure Portal → Azure Active Directory (vagy Microsoft Entra
   ID)
  2. Alkalmazásregisztrációk (App registrations)
  3. Keresd meg: NEU SharePoint Manager
  4. Kattints rá

  B) API engedélyezése:

  1. Bal oldali menüben keresd meg:
    - Magyar: "API közzététele" vagy "API engedélyezése"
    - Angol: "Expose an API"
  2. Application ID URI beállítása:
    - Ha még nincs beállítva, látsz egy "Beállítás" vagy "Set"
  gombot
    - Kattints rá
    - Elfogadhatod az alapértelmezettet:
  api://0953a920-27b5-40ea-baa4-c728f4392120
    - Vagy adhatsz egyedit: api://pooldrv.nffku.com
    - Kattints "Mentés" / "Save"
  3. Hatókör hozzáadása:
    - Kattints: "+ Hatókör hozzáadása" vagy "+ Add a scope"
    - Töltsd ki a mezőket:

  Hatókör neve (Scope name): access

  Ki járulhat hozzá (Who can consent):
  → Válaszd: "Rendszergazdák és felhasználók" / "Admins and
  users"

  Rendszergazdai jóváhagyás megjelenített neve:
  → Access poolDRV API

  Rendszergazdai jóváhagyás leírása:
  → Allows access to poolDRV backend API

  Felhasználói jóváhagyás megjelenített neve:
  → Access poolDRV API

  Felhasználói jóváhagyás leírása:
  → Allows the app to access poolDRV API on your behalf

  Állapot (State):
  → Engedélyezve / Enabled

    - Kattints "Hatókör hozzáadása" / "Add scope"

  ---
  2. lépés: Átirányítási URI-k beállítása

  A) Még mindig az alkalmazásban:

  1. Bal oldali menü: "Hitelesítés" vagy "Authentication"

  B) Platform hozzáadása a frontend-hez (SPA):

  1. Kattints: "+ Platform hozzáadása" / "+ Add a platform"
  2. Válaszd: "Egyoldalas alkalmazás" / "Single-page 
  application"
  3. Átirányítási URI:
  http://localhost:5173/auth/callback
  4. Kattints "Konfigurálás" / "Configure"

  C) Platform hozzáadása a backend-hez (Web):

  1. Kattints újra: "+ Platform hozzáadása" / "+ Add a platform"
  2. Válaszd: "Web"
  3. Átirányítási URI:
  http://localhost:8000/api/auth/callback
  4. Titkos ügyfélkulcs (Client secret): Hagyd üresen (már van)
  5. Kattints "Konfigurálás" / "Configure"

  D) Implicit flow engedélyezése:

  1. Az "Egyoldalas alkalmazás" szakaszban pipáld be:
    - ✅ Hozzáférési jogkivonatok (Access tokens)
    - ✅ Azonosító jogkivonatok (ID tokens)
  2. Görgess le és kattints "Mentés" / "Save"

  ---
  3. lépés: További Graph engedélyek (opcionális)

  A) API-engedélyek menüpont:

  1. Bal oldali menü: "API-engedélyek" / "API permissions"

  B) Teams notifikációhoz szükséges engedélyek:

  1. Kattints: "+ Engedély hozzáadása" / "+ Add a permission"
  2. Válaszd: "Microsoft Graph"
  3. Válaszd: "Alkalmazásengedélyek" / "Application permissions"
  4. Keresd meg és pipáld be:
    - ChannelMessage.Send (Teams csatorna üzenetek)
    - Chat.ReadWrite (Teams chat - opcionális)
  5. Kattints "Engedélyek hozzáadása" / "Add permissions"

  C) Admin jóváhagyás:

  1. Kattints: "Rendszergazdai jóváhagyás megadása" / "Grant 
  admin consent"
  2. Erősítsd meg: "Igen" / "Yes"

  ---
  4. lépés: Ellenőrzés

  Ellenőrizd, hogy minden beállítás sikeres volt:

  1. API közzététele menüben:
    - Van Application ID URI
    - Van access nevű hatókör
  2. Hitelesítés menüben:
    - Van SPA platform: http://localhost:5173/auth/callback
    - Van Web platform: http://localhost:8000/api/auth/callback
    - Be van pipálva az implicit flow
  3. API-engedélyek menüben:
    - Minden engedély mellett zöld pipa van
    - "Megadva" / "Granted" státusz

  ---
  5. lépés: .env fájl véglegesítése

  # 1. Másold át a végleges konfigurációt
  cp /Users/varadiimre/0SWDEV/pool_shrpnt/.env.final
  /Users/varadiimre/0SWDEV/pool_shrpnt/.env

  # 2. Generálj biztonságos kulcsot
  python3 -c "import secrets; print(secrets.token_urlsafe(32))"

  # 3. Nyisd meg a .env fájlt és cseréld ki:
  # APP_SECRET_KEY=your-super-secret-key-change-in-production
  # erre:
  # APP_SECRET_KEY=[a generált kulcs]

  ---
  Ha elakadtál:

  Képernyőképet kérhetek:

  - Az adott menüpontról ahol vagy
  - A hibaüzenetről ha van

  Tipikus problémák:

  1. "Nincs jogosultságom"
    - Application Administrator vagy Global Admin kell
    - Kérd meg az IT admint
  2. "A hatókör neve már létezik"
    - Használj más nevet: api_access vagy full_access
  3. "Invalid redirect URI"
    - Pontosan így írd be, minden karakterrel:
    - http://localhost:5173/auth/callback
    - http://localhost:8000/api/auth/callback

  
1. Indítsd el a Docker szolgáltatásokat (ha van Docker):
docker-compose up -d

2. Vagy indítsd el külön a szolgáltatásokat:
# PostgreSQL és Redis kell hogy fusson
# Majd:
cd api
python3 -m uvicorn main:app --reload

3. Frontend indítása (ha van):
cd web
npm install
npm run dev


---

Quick Steps:
1. Go to https://portal.azure.com
2. Navigate to: Azure Active Directory → App registrations → poolDRV
3. Click App roles → Create app role
4. Create 4 roles: NEU_Admin, NEU_PM, NEU_Partner, NEU_Guest
5. Go to: Enterprise applications → poolDRV → Users and groups
6. Assign yourself the NEU_Admin role
7. Clear browser cache and login again