# Projekt Tanulmány: NEÜ Zrt SharePoint Mappastruktúra Kezelő Eszköz (poolDRV)

> **Projekt:** NEÜ Zrt SharePoint Mappastruktúra Kezelő Eszköz  
> **Létrehozás dátuma:** 2025. augusztus 8.  
> **Verzió:** 1.1  
> **Állapot:** Tervezés

---

## Vezetői Összefoglaló

A NEÜ Zrt SharePoint Mappastruktúra Kezelő Eszköze, a poolDRV egy automatizált dokumentumkezelő rendszer, amely a keretszerződések alapján történő beszerzési folyamatok hatékony lebonyolítását támogatja. A rendszer a Microsoft SharePoint Online és Teams integrációjával biztosítja a külső partnerek számára a kontrollált hozzáférést a projekt dokumentumokhoz.

**Elsődleges probléma:** A jelenlegi manuális mappastruktúra kezelés időigényes és hibalehetőségeket rejt magában, miközben havonta 5-10 új megrendelés kezelése történik három különböző részben (keretszerződés), mindegyikben három-három különböző vállalkozóval. A megrendelések jelentős mennyiségű szakértő bevonását követelik meg, amelynek az adminisztrációs terhe nagy. 

**Célcsoport:** NEÜ Zrt belső adminisztrátorai, belső szakmai felelősei, belső pénzügyi munkatársai és 9 keretszerződéses partner cégek adminisztrátorai és külső szakértői.

**Kulcs értékajánlat:** Automatizált mappastruktúra létrehozás, Teams integráció és központosított jogosultságkezelés egy hibrid megoldásban.

### MVP fókusz:

  - Szerződésenként standardizált Teams csoport + SharePoint tár automatikus létrehozása előre definiált mappasablonnal.
  
  - RBAC szerepek és engedélyek alkalmazása (öröklődés + kivételek a szenzitív almappákra).
  
  - Admin UI a létrehozási/lezárási folyamatokhoz, sablon-karbantartáshoz, audit-naplók megtekintéséhez.
  
  - „Nincs alkalmazásszintű tartalom-cache” az MVP-ben; Redis csak session/broker célra (ha szükséges a Celery-hez).
  
  - Eredmény: Átlátható, visszakövethető, biztonságos mappakezelés, rövidebb átfutási idők és kevesebb hibás jogosultság.

---

## Probléma Megfogalmazás

### Jelenlegi Helyzet és Fájdalompontok

A NEÜ Zrt jelenleg manuális folyamatokkal kezeli a mappastruktúrákat a keretszerződéses projektek során, nem a SharePoint platformon. Ez a következő problémákat okozza:

1. **Időigényes manuális munka**: Minden új megrendeléshez külön kell létrehozni a mappastruktúrát
2. **Hibalehetőségek**: Manuális létrehozás során előfordulhatnak elnevezési hibák vagy hiányos mappák
3. **Jogosultságkezelési komplexitás**: 9 különböző partner cég és projektenkénti 10-20-100 szakértő jogosultságainak kezelése
4. **Nyomon követési nehézségek**: Nincs átlátható rendszer az eléréssel és használattal kapcsolatos jelentésekhez

### A Probléma Hatása

- **Időigény**: Adminisztrátorok hetente 4-6 órát töltenek mappastruktúra kezeléssel
- **Hibák**: Havonta 2-3 alkalommal fordulnak elő hozzáférési problémák
- **Késések**: A manuális folyamatok miatt a projektek indítása késik
- **Auditálási kihívások**: Nehéz nyomon követni a dokumentum hozzáféréseket

### Miért Nem Megfelelőek a Meglévő Megoldások

1. **Jelenleg használt funkcionalitás**: Nem támogatja a tömeges műveletek automatizálását
2. **Külső SharePoint / TEAMS alkalmazások**: Nem illeszkednek a specifikus keretszerződéses workflow-hoz
3. **Power Automate alap flow-k**: Nem kezelik a komplex jogosultságkezelési igényeket

### Sürgősség és Fontosság

A megoldás azonnali implementálása szükséges, mivel:
- A projekt volumen növekedése várható (jelenleg 5-10/hó, tervezett 15-20/hó)
- M365 E3 licenc kihasználtságának növelése prioritás
- Audit követelmények szigorodnak a dokumentum kezeléssel kapcsolatban

---

## Javasolt Megoldás

### Alapvető Koncepció és Megközelítés

A poolDRV egy **hibrid megoldás**, amely ötvözi az adminisztrátori webes felületet a Teams integrációval. A rendszer a következő főbb komponenseket tartalmazza:

1. **Adminisztrációs Webes Eszköz**: Központosított admin felület a keretszerződések keretében kiadható eseti megrendelések és mappastruktúrák, powershell scriptek, külső felhasználók és jogosultsági csoportok beállításának kezeléséhez.
2. **Teams Integráció**: Valódi munkaterület a külső partnerek számára
3. **Automatizált Jogosultságkezelés**: A poolDRV lehetőséget biztosít, hogy a Teams csoportokhoz, illetve a SharePoint mappákhoz automatikusan lehessen beállítani, törölni, változtatni a felhasználói és csoport szintű hozzáférési jogokat.
4. **Jelentési Modul**: Átfogó riportok a használatról és hozzáférésekről

### Kulcs Differenciátorok

- **Keretszerződés-specifikus workflow**: A poolDRV rendszer a NEÜ specifikus megrendelési folyamatához és a 3 keretszerződés × 3-5 partner modellhez igazodik
- **Preset mappastruktúrák**: Szerződésenként előre definiált mappa és csoport jogosultsági sablonok a megrendelések gyors indításához
- **Tömeges műveletek**: Batch operációk a mappalétrehozáshoz és jogosultságkezeléshez
- **Hibrid Teams integráció**: Admin felület + valós munkaterület egy rendszerben
- **jogosultságkezelés**: A NEÜ saját és Vendég felhasználók hozzáadása, törlése, jogosultsági csoportokhoz történő hozzárendelése, az egyes mappák jogosultsági csoportok alapján történő beállítása
- **NEÜ és szerződés / megrendelés specifikus jogosultságok**: Az egyes szerződések és megrendelők különböző NEÜ belső csoportokhoz tartoznak, különböző partnerekkel köttetnek, emiatt fontos, hogy csak az a partner és csak az a belső NEÜ csoport lássa/férjen hozzá a megrendelés mappájához, akihez tartozik, a többiek ne. Az egyes megrendelésekhez tartozó mappákon belül lehetnek érzékenyebb adatokat tartalmazó almappák, ezek jogosultsága külön legyen kezelhető.   
- **Mappa szintű hozzáférés-kezelés**: A jogosultsági csoportok az egyes mappákat csak engedély alapján láthatják, olvashatják, szerkeszthetik, hozhatják létre, törölhetik, menthetnek bele dokumentumokat.

### Miért Lesz Sikeres Ez a Megoldás

1. **Testreszabott workflow**: Pontosan a NEÜ folyamataihoz igazított
2. **Meglévő infrastruktúra felhasználása**: SharePoint Online és M365 E3 licencre épül
3. **Felhasználóbarát**: Teams integráció miatt természetes a használat

### Hosszú Távú Vízió

A rendszer alapját képezheti egy átfogó NEÜ dokumentumkezelési, folyamatkezelési platformnak, amely kiterjeszthető további üzleti folyamatokra és automatizálhatja a teljes szervezet bizonyos területeinek működését.

---

## Célfelhasználók

### Elsődleges Felhasználói Szegmens: NEÜ Belső Adminisztrátorok

**Demográfiai/Vállalati Profil:**
- 3 fő IT/adminisztrátori szerepkörben
- Teams /M365 alapismeretekkel rendelkezők
- Napi 8 órában irodai munkavégzés

**Jelenlegi Viselkedés és Workflow:**
- Manuálisan hoznak létre mappákat új megrendelésekkor
- Excel táblázatokban vezetik a projekt státuszokat
- Email-ben koordinálják a külső partnerekkel a hozzáféréseket

**Specifikus Igények és Fájdalompontok:**
- Gyors mappastruktúra létrehozási lehetőség
- Átlátható jogosultságkezelési felület
- Automatizált reporting funkciók
- Hibák minimalizálása

**Célok:**
- Adminisztratív terhek csökkentése
- Folyamatok automatizálása
- Audit trail biztosítása

### Másodlagos Felhasználói Szegmens: Külső Partner Szakértők

**Demográfiai/Vállalati Profil:**
- 10 keretszerződéses partner cég munkatársai
- Projektenkénti 10-20-100 fő bevonás
- Változó IT-készségek

**Jelenlegi Viselkedés és Workflow:**
- Teams-en keresztül kommunikálnak
- Teamsen mappákat használnak dokumentum megosztásra, de nem szabványosított, automatizált módon
- Deadline-okhoz igazítják a dokumentum bekérést / feltöltést

**Specifikus Igények és Fájdalompontok:**
- Egyszerű, intuitív hozzáférés a projekt mappákhoz
- Tiszta felület a dokumentum feltöltéshez
- Teams integrációs lehetőség
- Jogosultság átláthatóság

**Célok:**
- Hatékony projektmunka végzés
- Zökkenőmentes dokumentum kezelés
- Kommunikáció egyszerűsítése

---

## Célok és Siker Mutatók

### Üzleti Célkitűzések

- **Adminisztratív időigény csökkentése 70%-kal**: Heti 4-6 óráról 1-2 órára
- **Hibaarány csökkentése 90%-kal**: Havi 2-3 hibaesemény 0-1-re csökkentése
- **Projekt indítási idő csökkentése**: Mappastruktúra létrehozás 2 napról 2 órára
- **M365 licenc kihasználtság növelése**: Teams és SharePoint advanced funkciók használata

### Felhasználói Siker Mutatók

- **Admin elégedettség**: 90%+ pozitív visszajelzés az új rendszerrel kapcsolatban
- **Külső partner onboarding idő**: 1 napról 1 órára csökkentése
- **Dokumentum feltöltési arány**: 95%+ deadline betartás
- **Support ticket csökkentése**: 80%-os csökkentés a hozzáférési problémák terén

### Kulcs Teljesítmény Mutatók (KPI-k)

- **Mappastruktúra létrehozási idő**: < 10 perc per projekt
- **Felhasználói hiba események**: < 1 per hó
- **System uptime**: 99.5%
- **Jogosultság módosítási idő**: < 15 perc per változtatás
- **Riport generálási idő**: < 15 perc per riport

---

## MVP Terjedelem

### Alapvető Funkciók (Kötelező)

- **Preset Mappastruktúra Sablonok**: Szerződésekhez előre definiált mappasablonok automatikus létrehozása
  *Indoklás: Ez a legkritikusabb automatizálási szükséglet*

- **Tömeges Mappalétrehozás**: Egy megrendeléshez kapcsolódóan sablon alapján az összes szükséges mappa létrehozása
  *Indoklás: Időmegtakarítás és hibák elkerülése*

- **Alapvető Jogosultságkezelés**: Partner cég adminok és szakértők, illetve belső admin, szakmai és pénzügyi csoportok létrehozása, vendégek, belső felhasználók csoportokhoz rendelése és csoport szintű jogosultságok automatikus beállítása
  Szerepek meghatározása: (Admin, Belső felelős, Pénzügy, Partner admin, Partner szakértő), engedélyek táblázata és öröklődés / mappa-szintű kivételek.
  *Indoklás: Biztonsági és compliance követelmények*

- **RBAC-mátrix és jogosultsági blueprint**: Táblázatot: Szerep × Mappa szint (gyökér / almappa) × Művelet (olvas, ír, létrehoz, töröl, megoszt), plusz öröklődés szabály. Ide kerüljenek a „kivételes” érzékeny almappák is.

- **Teams Integráció**: Szerződésenként új Teams Csoport létrehozása (névkonvenció, életciklus, archíválás, vendég-hozzáférés szabályait meg kell határozni) és a létrehozott mappák automatikus elérhetővé tétele ezekben. 
  *Indoklás: Felhasználói élmény javítása*

- **Dokumentum Feltöltés Időkorlát**: Manuális, vagy automatikus mappazárolás deadline lejártakor
  *Indoklás: Workflow integritás biztosítása*

- **Alapvető Admin Dashboard**: Aktuális megrendelések, mappahozzáférések, felhasználói csoportok és státuszok áttekintése
  *Indoklás: Központi kontroll és átláthatóság*


### MVP Siker Kritériumok

Az MVP sikeres, ha:
- Szerződés / szerződött több partner modell (minimum 3 keretszerződéses, 10 vállalkozó) mappa sablonjai implementálva vannak
- Külső és belső jogosultsági csoportok létrejönnek és az egyes mappákhoz rendelhetőek
- Jogosultsági csoportokba tartozó külső és belső felhasználók kezelhetők, létrehozhatók, törölhetők.
- 1 teljes megrendelési ciklus automatikusan lebonyolódik
- Külső partnerek tudják használni a Teams integrációt
- Admin felhasználók 50%-kal kevesebb időt töltenek mappakezeléssel
- Nulla kritikus biztonsági incidens történik a pilot során

---

## Post-MVP Vízió

### Hosszú Távú Vízió (1-2 év)

A rendszer egy átfogó NEÜ Zrt Folyamatkezelési és Projekt Menedzsment Platformmá válhat, amely:
- Menedzseli a szervezet belső folyamatait
- Integrálja a teljes projekt lifecycle-t
- Automatizálja a szerződéses folyamatokat
- Multi-tenant architektúrával más szervezetek számára is kínálható

### Bővítési Lehetőségek

- **Külső API integráció**: Dynamics/ERP/Outlook rendszerekkel való összekötés
- **Mobil alkalmazás**: Távolról dolgozó szakértők számára
- **Machine Learning**: Automatikus kategorización és workflow optimalizálás
- **Blockchain alapú audit trail**: Változhatatlan dokumentum nyomon követés

---

## Technikai Megfontolások

### Platform Követelmények

- **Cél Platformok**: SharePoint Online, Microsoft Teams, Azure AD
- **Browser/OS Támogatás**: Modern böngészők (Safari, Edge, Chrome, Firefox), Windows 10/11
- **Teljesítmény Követelmények**: 
  - < 3 sec oldal betöltési idő
  - < 10 sec mappastruktúra létrehozás
  - 15+ egyidejű felhasználó támogatása

### Technológiai Preferenciák

#### Frontend
- **Framework**: React 18 + TypeScript
- **UI Library**: **Fluent UI (Microsoft)** 
- Minden UI elem Fluent UI-ból jön
- Konzisztens Microsoft design language
- **State Management**: React Context API + React Query
- **Authentication**: MSAL (Microsoft Authentication Library)
- **Routing**: React Router v6
- **Build Tool**: Vite

#### Backend
- **Framework**: FastAPI (Python) 
- **Database**: PostgreSQL 15 (docker konténerben)
- **Cache**: Nincs alkalmazásszintű tartalom-cache; Redis csak session/broker
- **Task Queue**: Celery (docker konténerben)
- **Authentication**: Azure AD + JWT tokens
- **API Documentation**: OpenAPI/Swagger

#### Infrastructure
- **Cloud Provider**: Microsoft Azure
- **Container**: Docker + Docker Compose
- **Secrets**: Azure Key Vault
- **CI/CD**: GitHub Actions
- **SharePoint Integráció**: Microsoft Graph SDK for Python, SharePoint REST API

#### Architektúrális Megfontolások
- **Repository Struktúra**: Monorepo backend és frontend komponensekhez
- **Service Architektúra**: Monorepo + egy backend szolgáltatás (FastAPI)
- **Integrációs Követelmények**: 
  - Microsoft Graph API
  - SharePoint REST API
  - Teams API
  - Microsoft Graph - endpointok (Users, Groups, Sites/Drives, Teams)
- **Biztonság/Compliance**: 
  - Microsoft 365 biztonsági szabályok
  - Audit logging
- **Tesztelési stratégia**: 
  - mocking csak határozottan indokolt helyeken, külön utasításra!
  - unit/integrációs/end-to-end rétegek
  - **ELSŐDLEGESEN**: kontrakttesztek a Graph/SharePoint integrációhoz, rate limit kezelési tesztek, és sandbox tenant használata 
  - a már külön erre a célra kialakított development SharePoint site használata 
- **Authentication Flow**: 
  - Azure AD → Frontend MSAL → Backend JWT
  - Session storage a Redis-ben

### Kész infrastruktúra
- Development SharePoint site elkészült már, beállításai a mellékletben.
- Azure Applikáció előkészítve, beállításai a mellékletben. 
  
---

## Megszorítások és Feltételezések

### Megszorítások

- **Költségvetés**: M365 E3 licenc keretein belül, minimális külső költség
- **Időkeret**: 3-4 hónapos fejlesztési ciklus MVP-hez
- **Erőforrások**: 3 fejlesztő + NEÜ IT támogatás
- **Technikai**: SharePoint Online limitációk, M365 throttling szabályok

### Kulcs Feltételezések

- NEÜ IT csapat biztosítja az Azure AD admin hozzáférést
- M365 E3 licencek elegendőek a funkciók támogatásához
- Nincs szükség külső rendszerekkel való integrációra MVP szinten
- Felhasználók rendelkeznek alapvető SharePoint/Teams ismeretekkel

---

## Kockázatok és Nyitott Kérdések

### Kulcs Kockázatok

- **Microsoft API limitációk**: Throttling szabályok befolyásolhatják a tömeges műveleteket
  *Hatás: Teljesítménycsökkenés nagy projekt számok esetén*

- **Felhasználói ellenállás**: Változásmenedzselési kihívások
  *Hatás: Lassú felhasználói adoption*

- **SharePoint Online limitációk**: Lista item és fájl limitek
  *Hatás: Skálázhatósági problémák*

- **Külső partner IT polítiká**: Eltérő biztonsági követelmények
  *Hatás: Integráció késedelmek*


### További Kutatást Igénylő Területek

- SharePoint Online és Teams API rate limiting részletes szabályai
- Azure AD guest user lifecycle automatizálási lehetőségek  
- Power Automate vs Azure Functions teljesítmény összehasonlítás
- NEÜ belső IT biztonsági politikák és compliance követelmények

---

## Mellékletek

### A. Kutatási Összefoglaló

**Részletes Interjúk Eredményei:**
- 3 rész × 3-4 partner = 10 keretszerződéses vállalkozó
- Havi 5-10 új megrendelés, projektenkénti 10-20-100 szakértő
- M365 E3 licenc teljes kihasználása prioritás
- Teams integráció erősen preferált
- Admin-only jogosultságkezelés kritikus követelmény

**Technikai Felmérés:**
- SharePoint Online aktív használat (Teams)
- Azure AD integráció működik
- PowerShell szkriptelési tapasztalat nincs, de hasznosságát érzik
- Nincs külső rendszer integráció igény

### B. Érintettek Visszajelzései

**NEÜ IT Csapat:**
- Pozitív hozzáállás az automatizáláshoz
- SharePoint szakértelem biztosítható
- Azure környezet hozzáférés garantált

**Partner Cégek:**
- Teams használat természetes
- Egyszerű onboarding kritikus
- Dokumentum feltöltési határidők fontosak

