# NEÜ Keretmegállapodás - Teljes Mappastruktúra

## Főstruktúra Áttekintés

```
📁 NEU_Keretmegallapodas_2025
│
├── 📁 00_BELSO_NEU_ONLY (csak NEÜ hozzáférés)
├── 📁 RESZ_A_Szoftverfejlesztes
├── 📁 RESZ_B_Infrastruktura
└── 📁 RESZ_C_Tamogatas
```

## Részletes Mappastruktúra

### 1. NEÜ Belső Mappák

```
📁 00_BELSO_NEU_ONLY (csak NEÜ hozzáférés)
│
├── 📁 01_Kimutatasok
│   ├── 📁 Heti_Jelentesek
│   │   ├── 2025_W01_Heti_Jelentes.xlsx
│   │   ├── 2025_W02_Heti_Jelentes.xlsx
│   │   └── ...
│   │
│   ├── 📁 Cegenkenti_Kimutatasok
│   │   ├── ACME_Corp_2025Q1_Kimutatas.xlsx
│   │   ├── TechGlobal_2025Q1_Kimutatas.xlsx
│   │   └── Innovation_Systems_2025Q1_Kimutatas.xlsx
│   │
│   └── 📁 Reszenkenti_Kimutatasok
│       ├── ReszA_2025Q1_Osszesito.xlsx
│       ├── ReszB_2025Q1_Osszesito.xlsx
│       └── ReszC_2025Q1_Osszesito.xlsx
│
└── 📁 02_Sablonok
    ├── S01_Feladat_Megkezdes_Engedelyezes.docx
    ├── S02_Eseti_Megrendelo.docx
    ├── S03_TIG_Teljesitesigazolas.docx
    ├── S04_Osszeférhetetlensegi_Nyilatkozat_Vallalkozo.docx
    ├── S05_Titoktartasi_Nyilatkozat_Szakerto.docx
    ├── S06_Szakerto_Engedelyezes_Tajekoztato.docx
    ├── S07_Szakerto_Csere_Kerelem.docx
    ├── S08_Kotber_Ertesito.docx
    └── S09_Szakerto_Kivonas_Bevonas.docx
```

### 2. Rész Mappák (Példa: RESZ_A)

```
📁 RESZ_A_Szoftverfejlesztes
│
├── 📁 00_KOZOS_SABLONOK (minden cég látja)
│   ├── Szakertok_Elerhetosege_SABLON.xlsx
│   ├── Ajanlattevo_Nyilatkozat_Oktatas_SABLON.docx
│   ├── Eseti_Megrendeles_Visszaigazolas_SABLON.docx
│   └── Szakerto_Csere_Kezdemenyezes_SABLON.docx
│
├── 📁 CEG_01_ACME_Corp (csak ACME + NEÜ látja)
│   ├── 📁 EM_2025_001_20250115
│   ├── 📁 EM_2025_002_20250220
│   └── 📁 EM_2025_003_20250301
│
├── 📁 CEG_02_TechGlobal_Ltd
│   └── 📁 EM_2025_004_20250115
│
└── 📁 CEG_03_Innovation_Systems
    └── 📁 EM_2025_005_20250115
```

### 3. Eseti Megrendelő Mappa Struktúra

```
📁 EM_2025_001_20250115
│
├── 📁 01_Szakertok
│   ├── 📁 Aktiv_Szakertok
│   │   ├── 📁 CV_Oneletrajzok
│   │   │   ├── Kovacs_Janos_CV_20250101.pdf
│   │   │   ├── Nagy_Maria_CV_20250101.pdf
│   │   │   └── Szabo_Peter_CV_20250101.pdf
│   │   │
│   │   ├── 📁 Nyilatkozatok
│   │   │   ├── Kovacs_J_Titoktartas_20250115.pdf
│   │   │   ├── Kovacs_J_Osszeférh_20250115.pdf
│   │   │   ├── Nagy_M_Titoktartas_20250115.pdf
│   │   │   ├── Nagy_M_Osszeférh_20250115.pdf
│   │   │   ├── Szabo_P_Titoktartas_20250115.pdf
│   │   │   └── Szabo_P_Osszeférh_20250115.pdf
│   │   │
│   │   └── Szakertok_Elerhetosege_EM001.xlsx
│   │
│   ├── 📁 Kivont_Szakertok
│   │   └── 📁 Kiss_Peter_20250201
│   │       ├── Kivonasi_Indoklas.docx
│   │       ├── Kiss_P_CV.pdf
│   │       └── Archiv_Dokumentumok.zip
│   │
│   └── 📁 Uj_Bevont_Szakertok
│       └── 📁 Toth_Eva_20250205
│           ├── Toth_Eva_CV_20250205.pdf
│           ├── Toth_E_Titoktartas_20250205.pdf
│           └── Toth_E_Osszeférh_20250205.pdf
│
├── 📁 02_Megrendeles_Dokumentumok
│   ├── EM_2025_001_Teljes.pdf (csak NEÜ töltheti fel)
│   ├── EM_2025_001_Visszaigazolas.pdf
│   ├── Ajanlattevo_Megfelelosegi_Nyilatkozat.pdf
│   └── Szakertok_Bevonasi_Nyilatkozat.pdf
│
├── 📁 03_Utmutatok_Anyagok (NEÜ tölti, szakértők is látják)
│   ├── Feladatleiras_EM001.pdf
│   ├── GYIK_v2.0.pdf
│   ├── Munkaterv_EM001.xlsx
│   │
│   ├── 📁 Oktatasi_Videok
│   │   ├── 01_Bevezeto_Video.mp4
│   │   ├── 02_Rendszer_Hasznalat.mp4
│   │   └── 03_Eredmenytermek_Feltoltes.mp4
│   │
│   └── 📁 Segedanyagok
│       ├── Utmutato_Szakertoknek.pdf
│       ├── Sablon_Tanulmany.docx
│       └── Mintadokumentumok.zip
│
├── 📁 04_EREDMENYTERMEKEK
│   ├── 📁 Aktiv_Verzio (teljesítési határidőig írható)
│   │   ├── ET_001_Tanulmany_v2.3_20250215.docx
│   │   ├── ET_002_Elemzes_v1.5_20250215.xlsx
│   │   ├── ET_003_Prezentacio_v1.0_20250215.pptx
│   │   └── _VERZIO_NAPLO.xlsx
│   │
│   ├── 📁 Korabbi_Verziok (automatikus archiválás)
│   │   ├── 📁 ET_001_Tanulmany
│   │   │   ├── ET_001_Tanulmany_v2.2_20250214.docx
│   │   │   ├── ET_001_Tanulmany_v2.1_20250213.docx
│   │   │   ├── ET_001_Tanulmany_v2.0_20250212.docx
│   │   │   └── ET_001_Tanulmany_v1.0_20250210.docx
│   │   │
│   │   └── 📁 ET_002_Elemzes
│   │       ├── ET_002_Elemzes_v1.4_20250214.xlsx
│   │       └── ET_002_Elemzes_v1.0_20250210.xlsx
│   │
│   ├── 📁 NEU_Ellenorzes (NEÜ feltölti)
│   │   ├── QA_Checklist_EM001.xlsx
│   │   ├── Hibajelentes_001_20250216.pdf
│   │   ├── Javitasi_Igenyek.docx
│   │   └── Minosegellenorzesi_Jegyzokonyv.pdf
│   │
│   ├── 📁 Vegleges_Elfogadott (zárolva)
│   │   ├── ✅ ET_001_Tanulmany_FINAL_20250220.pdf
│   │   ├── ✅ ET_002_Elemzes_FINAL_20250220.pdf
│   │   ├── ✅ ET_003_Prezentacio_FINAL_20250220.pdf
│   │   └── ELFOGADASI_JEGYZOKONYV_20250220.pdf
│   │
│   └── 📁 Javitasok (CR alapján)
│       ├── 📁 CR_2025_001_Javitas
│       │   ├── ET_001_Tanulmany_JAVITOTT_v1_20250225.docx
│       │   ├── Javitasi_Indoklas.pdf
│       │   └── CR_2025_001_Jovahagyas.pdf
│       │
│       └── 📁 CR_2025_002_Potlas
│           ├── ET_002_Elemzes_POTOLT_20250228.xlsx
│           └── Hianypotlasi_Jegyzokonyv.pdf
│
└── 📁 05_Teljesites_Igazolas
    ├── 📁 Kotber_Kimutatasok
    │   ├── Hibak_Osszesito_EM001.xlsx
    │   ├── Kotber_Szamitas_EM001.xlsx
    │   └── Kotber_Jegyzokonyv_EM001.pdf
    │
    ├── TIG_EM_2025_001.pdf
    │
    └── 📁 Reszteljesitesek
        ├── Resztelj_001_20250201.pdf
        ├── Resztelj_002_20250215.pdf
        └── Vegteljesites_20250220.pdf
```

## Jogosultsági Mátrix

### Mappa Szintű Jogosultságok

| Mappa | NEÜ Admin | NEÜ PM | Cég Admin | Szakértő | NEÜ QA |
|-------|-----------|--------|-----------|----------|--------|
| 00_BELSO_NEU_ONLY | Teljes | Olvasás | - | - | - |
| KOZOS_SABLONOK | Teljes | Teljes | Olvasás | - | Olvasás |
| CEG_XX mappa | Teljes | Olvasás | Teljes* | - | Olvasás |
| 01_Szakertok | Teljes | Olvasás | Teljes** | Olvasás | - |
| 02_Megrendeles | Teljes | Olvasás | Olvasás | - | - |
| 03_Utmutatok | Írás | Írás | Olvasás | Olvasás | - |
| 04_EREDMENYTERMEKEK | Teljes | Olvasás | Teljes*** | - | Írás |
| 05_Teljesites | Teljes | Teljes | Olvasás | - | Olvasás |

*Csak saját cég mappájában
**T+8 nap után csak olvasás
***Teljesítési határidőig

### Időalapú Jogosultság Változások

```
T+0: Eseti megrendelő kiadása
├── T+1-5 nap: Szakértők feltöltése (TELJES hozzáférés)
├── T+6-7 nap: Hiánypótlás (KORLÁTOZOTT módosítás)
├── T+8 nap: Automatikus ZÁROLÁS (csak OLVASÁS)
│
├── T+9 - Teljesítési határidő-1: Eredménytermék feltöltés
├── Teljesítési határidő: Eredménytermék ZÁROLÁS
│
└── T+Határidő után: Csak CR-rel módosítható
```

## Fájlnév Konvenciók

### Szakértői Dokumentumok
```
[Vezeteknev]_[Keresztnev]_[Tipus]_[YYYYMMDD].pdf

Példák:
Kovacs_Janos_CV_20250101.pdf
Kovacs_J_Titoktartas_20250115.pdf
```

### Eredménytermékek
```
ET_[XXX]_[Megnevezes]_v[X.X]_[YYYYMMDD].[ext]

Példák:
ET_001_Tanulmany_v2.3_20250215.docx
ET_002_Elemzes_v1.5_20250215.xlsx
```

### Jelentések és Kimutatások
```
[Tipus]_[Azonosito]_[Idoszak].xlsx

Példák:
Heti_Jelentes_2025_W01.xlsx
ACME_Corp_2025Q1_Kimutatas.xlsx
```

### Change Request Dokumentumok
```
CR_[YYYY]_[XXX]_[Tipus].[ext]

Példák:
CR_2025_001_Kerelem.pdf
CR_2025_001_Jovahagyas.pdf
```

## Automatizálási Szabályok

### Verziókezelés
- Minden mentés → új verzió
- Max 10 verzió tárolása
- Régebbiek → archív zip

### Mappazárolás
- T+8 munkanap: Szakértői mappa zárolás
- Teljesítési határidő: Eredménytermék zárolás
- CR jóváhagyás: 48 órás ideiglenes feloldás

### Értesítések
- T-7 nap: Határidő közeledik
- T-3 nap: Sürgős figyelmeztetés
- T-1 nap: Kritikus értesítés
- T+0: Zárolási értesítés

## Archiválási Szabályok

### Rövid távú (90 nap)
- Aktív munkamappák
- Folyamatban lévő EM-ek
- Függő CR-ek

### Középtávú (1 év)
- Lezárt EM-ek
- Teljesített projektek
- QA dokumentáció

### Hosszú távú (7 év)
- TIG dokumentumok
- Szerződéses dokumentumok
- Audit log
- Kötbér dokumentáció