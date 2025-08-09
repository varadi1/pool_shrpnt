# Azure AD Beállítási Ellenőrzőlista

## Jelenlegi információk:
- **Tenant ID**: `c9d647f7-888c-4f81-a048-a59e45303236`
- **Meglévő App ID**: `0953a920-27b5-40ea-baa4-c728f4392120`

## Ellenőrizd az Azure Portalon:

### 1. Meglévő alkalmazás (`0953a920-27b5-40ea-baa4-c728f4392120`)
- [ ] Mi a neve?
- [ ] Milyen típusú? (API vagy Daemon)
- [ ] Van-e API scope beállítva?
- [ ] Milyen Graph engedélyei vannak?

### 2. poolDRV API alkalmazás (Frontend számára)
- [ ] Létezik? 
  - Ha igen, App ID: ___________
  - Ha nem, létre kell hozni
- [ ] API hatókör (`access`) beállítva?
- [ ] Átirányítási URI-k:
  - [ ] `http://localhost:5173/auth/callback` (SPA)
  - [ ] `http://localhost:8000/api/auth/callback` (Web)
- [ ] Implicit flow engedélyezve?

### 3. poolDRV Daemon alkalmazás (Backend/Graph API)
- [ ] Létezik?
  - Ha igen, App ID: ___________
  - Ha nem, létre kell hozni
- [ ] Graph API engedélyek:
  - [ ] Group.ReadWrite.All
  - [ ] Directory.Read.All
  - [ ] Sites.ReadWrite.All
  - [ ] Files.ReadWrite.All
  - [ ] User.Read.All
  - [ ] Team.ReadBasic.All
  - [ ] Mail.Send
  - [ ] ChannelMessage.Send
  - [ ] Chat.ReadWrite (opcionális)
- [ ] Admin consent megadva?
- [ ] Van érvényes client secret?

## Válaszolj ezekre a kérdésekre:

1. **A meglévő alkalmazás (`0953a920-27b5-40ea-baa4-c728f4392120`) neve**: ___________

2. **Milyen Graph API engedélyei vannak?** (listázd)
   - ___________
   - ___________
   - ___________

3. **Van-e API scope beállítva?** (igen/nem)
   - Ha igen, mi a neve: ___________

4. **Kell-e új alkalmazást létrehozni?** (igen/nem)
   - Ha igen, melyiket: [ ] API / [ ] Daemon

5. **Van-e admin jogosultságod?** (igen/nem)

## Következő lépések:

Ha nincs admin jogod:
1. Kérd meg az IT admint a hiányzó alkalmazás létrehozására
2. Vagy kérj Application Administrator szerepkört

Ha van admin jogod:
1. Hozd létre a hiányzó alkalmazást
2. Állítsd be a megfelelő engedélyeket
3. Adj admin consent-et a Graph API engedélyekhez