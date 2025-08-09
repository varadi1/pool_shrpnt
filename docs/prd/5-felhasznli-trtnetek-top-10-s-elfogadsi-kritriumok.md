# 5) Felhasználói történetek (top 10) és elfogadási kritériumok

## US-01 — Adminként új **megrendeléshez** (EM) teljes mappastruktúrát hozok létre

**AC:**

- Sikeres létrehozás **< 10 perc** alatt;
- Rész (A/B/C), partner(ek), határidők, naming-konvenció paraméterezhető;
- Létrehozott mappák és engedélyek megjelennek a **Teams** csatornán belül;
- Audit napló: ki, mikor, mit hozott létre.

## US-02 — Adminként **sablonokat** tudok szerkeszteni és verziózni

**AC:**

- Új sablon publikálása nem érinti visszamenőleg a már létrejött EM-eket;
- Sablon diff megtekinthető;
- Rollback gomb;
- Kötelező mezők validálása.

## US-03 — PM-ként tudok új megrendeléshez sablon alapján mappákat létrehozni, partner céget társítani

**AC:**

- Hozzáférek a poolDRV webes felületéhez is;
- Szerződésekhez, amikhez van jogom tudok új megrendelést bejegyezni;
- A megrendelésekhez rendelt sablonokból tudok mappákat létrehozni;
- Ki tudom választani a szerződéshez hozzárendelt partner cégek közül, hogy melyik láthatja az EM-et;
- Manuálisan tudok zárolni mappákat, hogy a partner cégeknek csak olvasási joga legyen.

## US-04 — Partner Adminként a **saját cég mappáit** teljes joggal érem el

**AC:**

- Nem férek hozzá a poolDRV webes felületéhez, csak a teams csoportot látom, ahova hozzáadtak;
- Csak a saját cég „CEG\_XX” szekciója látszik és csak azok a szerződések és megrendelések, amelyhez hozzá vagyok adva;
- Hiába vagyok hozzáadva egy szerződéshez, ha nem vagyok még a megrendeléshez is hozzáadva, akkor nem látok mást, csak azokat a megrendeléseket, amikhez én is hozzá lettem adva;
- A megrendeléssel kapcsolatban minden partneri mappát látok;
- EM mappák automatikusan megjelennek;
- Jogosultságok öröklődnek/öröklés megtörhető az érzékeny almappáknál.

## US-05 — Szakértőként **feltöltök** dokumentumot a határidőig

**AC:**

- Nem férek hozzá a poolDRV webes felületéhez, csak a teams csoportot látom, ahova hozzáadtak;
- „Aktív\_Verzio” mappába írás a határidőig;
- Nem látok minden partneri mappát, csak a megrendelés szakmai részeivel kapcsolatosakat;
- Verziónapló automatikus;
- Határidőkor zárolás (csak olvasás), hibaüzenet és értesítés.

## US-06 — Pénzügyesként láthatom a megrendelés pénzügyi részeit is

**AC:**

- TIG, szerződések érzékenyebb részeihez is hozzáférek;
- A szakmai mappákhoz csak olvasási jogom van;
- Nem férek hozzá a poolDRV webes felületéhez, csak a teams csoportot látom.

## US-07 — Adminként **vendég felhasználókat** kezelek

**AC:**

- Azure AD B2B guest lifecycle: meghívás, csoportba sorolás, visszavonás;
- Audit trail minden változásról;
- Hibakezelés Graph-rate limit esetén retry-val.

## US-08 — Adminként **időalapú zárolás** szabályait konfigurálom

**AC:**

- T+0..T+n ablakok paraméterezhetőek, konkrét dátum / óra is beállítható;
- Kivétel (CR) esetén ideiglenes feloldás (48 óra) automatikus visszazárral.

## US-09 — Adminként **riportokat** generálok

**AC:**

- Elérés- és módosítási napló aggregálása;
- Tudok olyan riportot generálni, hogy melyik mappához pontosan ki fér hozzá, milyen jogosultsággal;
- Tudok olyan riportot generálni, hogy melyik személy, vagy csoport milyen mappákhoz fér hozzá;
- Zárolási események;
- Szakértői feltöltési készültség;
- CSV/XLSX export.

## US-10 — Adminként **archiválom** a lezárt szerződéseket, azok összes EM-jével

**AC:**

- 90 nap/1 év/7 év szabály szerinti mozgatás;
- Max 5 verzió tárolás, régebbiek zip archívba;
- Visszaállítás / export kérése ticket alapján.

---
