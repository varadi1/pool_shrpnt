# Azure AD App Registrations Documentation

## poolDRV API App Registration

### Basic Information
- **Application (client) ID**: 0953a920-27b5-40ea-baa4-c728f4392120
- **Directory (tenant) ID**: c9d647f7-888c-4f81-a048-a59e45303236
- **Display Name**: poolDRV API
- **Supported account types**: Single tenant

### Authentication
- **Platform**: Web
- **Redirect URIs**: 
  - http://localhost:8000/api/auth/callback (development)
  - https://api.pooldrv.neu.hu/api/auth/callback (production)

### API Permissions (Delegated)
- Microsoft Graph:
  - User.Read
  - email
  - offline_access
  - openid
  - profile

### Expose an API
- **Application ID URI**: api://pooldrv/access
- **Scopes**:
  - `api://pooldrv/access` - Access poolDRV API

---

## poolDRV Daemon App Registration

### Basic Information
- **Application (client) ID**: [Same as API app for development]
- **Directory (tenant) ID**: c9d647f7-888c-4f81-a048-a59e45303236
- **Display Name**: poolDRV Daemon
- **Supported account types**: Single tenant

### Authentication
- **Client Secret**: Stored in Azure Key Vault
- **Secret Name**: pooldrv-daemon-client-secret
- **Secret Value**: [Masked - see .env or Key Vault]

### API Permissions (Application)
- Microsoft Graph (Application permissions):
  - Group.ReadWrite.All - Create and manage groups
  - Sites.ReadWrite.All - Create and manage SharePoint sites
  - Files.ReadWrite.All - Read and write files in all site collections
  - Team.ReadBasic.All - Read Teams basic properties
  - Directory.Read.All - Read directory data

### Admin Consent
- **Status**: Granted by tenant admin
- **Granted on**: 2025-08-08
- **Granted by**: Admin@nffku.onmicrosoft.com

---

## Configuration Notes

### Environment Variables
```bash
# Azure AD Configuration
AZURE_CLIENT_ID=0953a920-27b5-40ea-baa4-c728f4392120
AZURE_CLIENT_SECRET=[Stored in Key Vault]
AZURE_TENANT_ID=c9d647f7-888c-4f81-a048-a59e45303236

# Graph API Endpoint
GRAPH_API_ENDPOINT=https://graph.microsoft.com/v1.0
GRAPH_API_BETA_ENDPOINT=https://graph.microsoft.com/beta

# SharePoint Configuration
SHAREPOINT_SITE_URL=https://nffku.sharepoint.com/sites/PoolDrive-Dev
SHAREPOINT_TENANT_NAME=nffku
```

### Key Vault Secrets
- `pooldrv-client-secret`: Client secret for daemon app
- `pooldrv-api-secret`: API app secret (if needed)

### Required Tenant Configurations
1. Teams and SharePoint must be enabled for the tenant
2. Users must have appropriate licenses (M365 E3/E5)
3. Guest access must be configured per PRD requirements

---

## Security Considerations

1. **Least Privilege**: Only requested permissions absolutely necessary
2. **Secret Rotation**: Client secrets rotated every 90 days
3. **Conditional Access**: Applied based on tenant policies
4. **Audit Logging**: All Graph API calls logged with correlation IDs

---

## References
- [Microsoft Graph permissions reference](https://docs.microsoft.com/en-us/graph/permissions-reference)
- [Authentication flows](https://docs.microsoft.com/en-us/azure/active-directory/develop/authentication-flows-app-scenarios)
- [MSAL Python documentation](https://github.com/AzureAD/microsoft-authentication-library-for-python)