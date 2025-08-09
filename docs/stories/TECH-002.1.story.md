# Story TECH-002.1: Azure AD Role Configuration and Backend Token Validation

## Story Metadata
**Story ID:** TECH-002.1  
**Epic:** TECH-002 - UI Completion and Azure AD Role Configuration  
**Sprint:** Current  
**Priority:** P0 - Critical (Blocking all role-based functionality)  
**Story Points:** 5  
**Assignee:** TBD  
**Created:** 2025-01-03  
**Updated:** 2025-01-03  
**Status:** Ready for Development  

## User Story
**As a** system administrator  
**I want to** configure Azure AD App Roles and enable backend token validation  
**So that** users can access the system with proper role-based permissions and all API calls are secured  

## Context & Problem Statement
Azure AD authentication is currently working in the poolDRV application, but critical security configurations are missing:
1. **App Roles are not configured in Azure AD** - causing all users to have no roles
2. **Backend is not validating Azure AD tokens** - APIs are unprotected
3. **Hardcoded admin role workaround** is currently in use for development

This is blocking all role-based functionality and leaving the API endpoints unsecured.

## Current State Analysis
### What's Working ✅
- Azure AD authentication flow is functional
- MSAL.js is properly configured in frontend
- Token acquisition is successful
- User can login with Azure AD credentials

### What's NOT Working ❌
- No App Roles defined in Azure AD app registration
- Backend accepts any request without token validation
- Role claims are not present in ID tokens
- Hardcoded `NEU_Admin` role in `useAuth.ts` (line 126)
- Authorization header not being sent with API requests

## Technical Requirements

### 1. Azure Portal Configuration
Configure the following App Roles in the poolDRV app registration:

```json
{
  "appRoles": [
    {
      "allowedMemberTypes": ["User"],
      "description": "NEU Administrator with full system access",
      "displayName": "NEU Admin",
      "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "isEnabled": true,
      "origin": "Application",
      "value": "NEU_Admin"
    },
    {
      "allowedMemberTypes": ["User"],
      "description": "NEU Project Manager with project management access",
      "displayName": "NEU PM",
      "id": "b2c3d4e5-f6a7-8901-bcde-f23456789012",
      "isEnabled": true,
      "origin": "Application",
      "value": "NEU_PM"
    },
    {
      "allowedMemberTypes": ["User"],
      "description": "Partner organization user with limited access",
      "displayName": "NEU Partner",
      "id": "c3d4e5f6-a789-0123-cdef-345678901234",
      "isEnabled": true,
      "origin": "Application",
      "value": "NEU_Partner"
    },
    {
      "allowedMemberTypes": ["User"],
      "description": "Guest user with minimal read-only access",
      "displayName": "NEU Guest",
      "id": "d4e5f6a7-8901-2345-def0-456789012345",
      "isEnabled": true,
      "origin": "Application",
      "value": "NEU_Guest"
    }
  ]
}
```

### 2. Frontend Changes

#### File: `web/src/hooks/useAuth.ts`
```typescript
// REMOVE the hardcoded role workaround (around line 126)
// DELETE: return ['NEU_Admin'] as UserRole[];

// REPLACE WITH: Proper role extraction from claims
const getRoles = (): UserRole[] => {
  if (!account) return [];
  
  // Check both 'roles' claim and 'extension_roles' claim
  const roles = account.idTokenClaims?.roles || 
                 account.idTokenClaims?.extension_roles || 
                 [];
  
  // Validate and filter to known roles
  const validRoles: UserRole[] = ['NEU_Admin', 'NEU_PM', 'NEU_Partner', 'NEU_Guest'];
  return roles.filter((role: string) => validRoles.includes(role as UserRole)) as UserRole[];
};
```

#### File: `web/src/services/api/axios-client.ts`
```typescript
// RE-ENABLE token attachment in Authorization header
axiosInstance.interceptors.request.use(
  async (config) => {
    try {
      const account = msalInstance.getActiveAccount();
      if (account) {
        const tokenResponse = await msalInstance.acquireTokenSilent({
          scopes: [`api://${import.meta.env.VITE_AZURE_CLIENT_ID}/.default`],
          account: account,
        });
        
        if (tokenResponse.accessToken) {
          config.headers.Authorization = `Bearer ${tokenResponse.accessToken}`;
        }
      }
    } catch (error) {
      console.error('Failed to acquire token:', error);
      // Handle token acquisition failure
      if (error instanceof InteractionRequiredAuthError) {
        await msalInstance.acquireTokenRedirect({
          scopes: [`api://${import.meta.env.VITE_AZURE_CLIENT_ID}/.default`],
        });
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);
```

### 3. Backend Token Validation

#### File: `api/dependencies/auth.py`
```python
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
from typing import Optional, List
import httpx
from functools import lru_cache

security = HTTPBearer()

@lru_cache()
def get_signing_keys():
    """Fetch and cache Azure AD signing keys"""
    tenant_id = settings.AZURE_TENANT_ID
    keys_url = f"https://login.microsoftonline.com/{tenant_id}/discovery/v2.0/keys"
    response = httpx.get(keys_url)
    return response.json()

async def validate_token(
    credentials: HTTPAuthorizationCredentials = Depends(security)
) -> dict:
    """Validate Azure AD bearer token"""
    token = credentials.credentials
    
    try:
        # Decode without verification first to get the kid
        unverified = jwt.get_unverified_header(token)
        
        # Get the signing key
        keys = get_signing_keys()
        rsa_key = {}
        for key in keys["keys"]:
            if key["kid"] == unverified["kid"]:
                rsa_key = {
                    "kty": key["kty"],
                    "kid": key["kid"],
                    "use": key["use"],
                    "n": key["n"],
                    "e": key["e"]
                }
                break
        
        if not rsa_key:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Unable to find appropriate key"
            )
        
        # Validate the token
        payload = jwt.decode(
            token,
            rsa_key,
            algorithms=["RS256"],
            audience=f"api://{settings.AZURE_CLIENT_ID}",
            issuer=f"https://sts.windows.net/{settings.AZURE_TENANT_ID}/"
        )
        
        return payload
        
    except JWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Token validation failed: {str(e)}"
        )

def get_current_user(token_data: dict = Depends(validate_token)) -> dict:
    """Extract user information from validated token"""
    return {
        "id": token_data.get("oid"),  # Object ID
        "email": token_data.get("preferred_username"),
        "name": token_data.get("name"),
        "roles": token_data.get("roles", [])
    }

def require_role(required_roles: List[str]):
    """Dependency to require specific roles"""
    def role_checker(user: dict = Depends(get_current_user)):
        user_roles = user.get("roles", [])
        if not any(role in required_roles for role in user_roles):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions"
            )
        return user
    return role_checker

# Usage in endpoints:
# @router.get("/admin-only")
# async def admin_endpoint(user=Depends(require_role(["NEU_Admin"]))):
#     return {"message": "Admin access granted"}
```

#### File: `api/core/config.py`
```python
# Add Azure AD configuration
AZURE_TENANT_ID: str = os.getenv("AZURE_TENANT_ID", "")
AZURE_CLIENT_ID: str = os.getenv("AZURE_CLIENT_ID", "")
AZURE_CLIENT_SECRET: str = os.getenv("AZURE_CLIENT_SECRET", "")  # For daemon auth

# Token validation settings
TOKEN_VALIDATION_ENABLED: bool = os.getenv("TOKEN_VALIDATION_ENABLED", "true").lower() == "true"
```

### 4. Update All API Endpoints

Apply token validation to all routers:

```python
# Example for contracts router
from api.dependencies.auth import get_current_user, require_role

@router.get("/contracts")
async def list_contracts(
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # User is authenticated, proceed with logic
    return await get_contracts(db, user_id=user["id"])

@router.post("/contracts")
async def create_contract(
    contract: ContractCreate,
    user: dict = Depends(require_role(["NEU_Admin", "NEU_PM"])),
    db: Session = Depends(get_db)
):
    # Only NEU_Admin and NEU_PM can create contracts
    return await create_new_contract(db, contract, user_id=user["id"])
```

## Implementation Steps

### Phase 1: Azure Portal Configuration (Day 1)
1. [ ] Login to Azure Portal
2. [ ] Navigate to App registrations → poolDRV
3. [ ] Add App Roles via Manifest or UI
4. [ ] Assign NEU_Admin role to varadi@neuzrt.hu
5. [ ] Test role assignment in Enterprise Applications

### Phase 2: Frontend Updates (Day 1-2)
1. [ ] Remove hardcoded role from useAuth.ts
2. [ ] Implement proper role extraction from token claims
3. [ ] Re-enable Authorization header in axios-client.ts
4. [ ] Add token refresh logic for 401 responses
5. [ ] Test role-based UI rendering

### Phase 3: Backend Security (Day 2-3)
1. [ ] Implement token validation in dependencies/auth.py
2. [ ] Add role-based authorization decorators
3. [ ] Update all API endpoints with authentication
4. [ ] Configure CORS for authenticated requests
5. [ ] Add token validation bypass for health checks

### Phase 4: Integration Testing (Day 4)
1. [ ] Test login flow with different user roles
2. [ ] Verify token validation on all endpoints
3. [ ] Test token refresh mechanism
4. [ ] Validate role-based access control
5. [ ] Performance test with token validation

### Phase 5: Documentation & Deployment (Day 5)
1. [ ] Document role assignment process
2. [ ] Create runbook for token validation issues
3. [ ] Update API documentation with auth requirements
4. [ ] Deploy to staging environment
5. [ ] Conduct security review

## Acceptance Criteria
- [ ] App Roles are configured in Azure AD with 4 distinct roles
- [ ] varadi@neuzrt.hu is assigned NEU_Admin role
- [ ] Frontend dynamically loads roles from Azure AD token claims
- [ ] No hardcoded roles remain in the codebase
- [ ] All API endpoints validate Azure AD tokens
- [ ] Invalid/expired tokens return 401 Unauthorized
- [ ] Users without required roles receive 403 Forbidden
- [ ] Token refresh works seamlessly without user interaction
- [ ] API performance impact is <100ms per request
- [ ] All existing tests pass with authentication enabled

## Testing Requirements

### Unit Tests
```typescript
// Frontend: useAuth.test.ts
describe('useAuth', () => {
  it('should extract roles from token claims', () => {
    const mockAccount = {
      idTokenClaims: {
        roles: ['NEU_Admin', 'NEU_PM']
      }
    };
    const roles = getRoles(mockAccount);
    expect(roles).toEqual(['NEU_Admin', 'NEU_PM']);
  });
  
  it('should return empty array when no roles present', () => {
    const mockAccount = { idTokenClaims: {} };
    const roles = getRoles(mockAccount);
    expect(roles).toEqual([]);
  });
});
```

```python
# Backend: test_auth.py
async def test_token_validation():
    """Test Azure AD token validation"""
    # Mock valid token
    valid_token = create_mock_token(roles=["NEU_Admin"])
    result = await validate_token(valid_token)
    assert result["roles"] == ["NEU_Admin"]
    
async def test_role_authorization():
    """Test role-based access control"""
    # Test with admin role
    admin_user = {"roles": ["NEU_Admin"]}
    assert require_role(["NEU_Admin"])(admin_user) == admin_user
    
    # Test without required role
    guest_user = {"roles": ["NEU_Guest"]}
    with pytest.raises(HTTPException) as exc:
        require_role(["NEU_Admin"])(guest_user)
    assert exc.value.status_code == 403
```

### Integration Tests
1. Login with different test users assigned to each role
2. Verify menu items appear based on roles
3. Test API access with valid/invalid/expired tokens
4. Validate cross-origin requests with authentication
5. Test token refresh during long sessions

### Security Tests
1. Attempt API access without token (should fail)
2. Use expired token (should trigger refresh)
3. Use token from different tenant (should fail)
4. Modify token claims client-side (should fail)
5. Test rate limiting on failed auth attempts

## Dependencies
- Azure AD tenant with appropriate permissions
- Azure Portal access for app registration configuration
- Test users with different role assignments
- Updated environment variables in all environments

## Risks & Mitigations
| Risk | Impact | Mitigation |
|------|--------|------------|
| Token validation adds latency | High | Cache signing keys, optimize validation |
| Users lose access during migration | High | Implement feature flag for gradual rollout |
| Role assignment process unclear | Medium | Create detailed documentation and training |
| Token refresh fails silently | Medium | Add comprehensive error handling and logging |

## Performance Considerations
- Cache Azure AD signing keys for 24 hours
- Implement token validation result caching (5 minutes)
- Use connection pooling for key endpoint requests
- Monitor API response times during rollout

## Security Considerations
- Never log tokens or sensitive claims
- Implement rate limiting on authentication endpoints
- Use secure token storage in frontend (memory only)
- Regular rotation of client secrets
- Audit log all authorization failures

## Documentation Requirements
1. **Admin Guide**: How to assign roles in Azure Portal
2. **Developer Guide**: How to add role requirements to new endpoints
3. **Troubleshooting Guide**: Common auth issues and solutions
4. **Security Guide**: Token validation architecture and flow

## Definition of Done
- [ ] Code complete and peer reviewed
- [ ] Unit tests written and passing (>80% coverage)
- [ ] Integration tests passing in staging
- [ ] Security review completed
- [ ] Performance benchmarks met (<100ms overhead)
- [ ] Documentation updated
- [ ] Deployed to staging environment
- [ ] User acceptance testing completed
- [ ] Production deployment plan created

## Post-Implementation Tasks
1. Monitor authentication metrics for first 48 hours
2. Gather user feedback on login experience
3. Review security logs for any anomalies
4. Plan gradual rollout to all users
5. Schedule security audit after 30 days

## Notes
- This story is critical path - blocks all other role-based features
- Coordinate with Azure AD admin for role configuration
- Consider implementing feature flag for easy rollback
- Plan for user communication about new login requirements

## References
- [EPIC-TECH-002: UI Completion](../EPIC-TECH-002-ui-completion.md)
- [Azure AD App Roles Documentation](https://docs.microsoft.com/en-us/azure/active-directory/develop/howto-add-app-roles-in-azure-ad-apps)
- [MSAL.js Token Validation](https://docs.microsoft.com/en-us/azure/active-directory/develop/msal-js-initializing-client-applications)
- [FastAPI Security](https://fastapi.tiangolo.com/tutorial/security/)
- [Architecture: Identity & Access](../architecture/4-identity-access-azure-ad-msal.md)
