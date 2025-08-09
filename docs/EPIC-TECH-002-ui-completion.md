# EPIC TECH-002: UI Completion and Azure AD Role Configuration

## Epic Overview
**Epic ID:** TECH-002  
**Epic Name:** Complete UI Implementation and Azure AD Role Configuration  
**Priority:** High  
**Target Release:** MVP Phase 2  
**Created:** 2025-08-09  
**Updated:** 2025-08-09 - Clarified Azure AD is working, roles need configuration  
**Status:** Draft  

## Executive Summary
This epic encompasses the remaining work needed to transform the poolDRV frontend from a development prototype to a production-ready application. **Azure AD authentication is already working**, but App Roles need to be configured in Azure AD. The epic also includes implementation of all placeholder pages and connection of mock endpoints to real backend services.

## ⚠️ IMPORTANT: Current Authentication Status
**Azure AD authentication IS WORKING!** The issues are:
1. **App Roles not configured in Azure AD** - This is why you don't see menu items
2. **Backend not validating tokens** - API endpoints need to validate Azure AD tokens
3. **Mock data in use** - Real backend endpoints need implementation

## 🔧 Immediate Fix: Configure Azure AD App Roles

### Why You're Not NEU_Admin:
Azure AD is not sending role claims because App Roles haven't been configured in your app registration.

### How to Configure App Roles in Azure Portal:

1. **Navigate to Azure Portal**
   - Go to https://portal.azure.com
   - Navigate to: Azure Active Directory → App registrations → poolDRV (your app)

2. **Add App Roles**
   - Click on "App roles" in the left menu
   - Click "Create app role" for each role:
   
   **NEU_Admin Role:**
   ```json
   {
     "allowedMemberTypes": ["User"],
     "description": "NEU Administrator with full access",
     "displayName": "NEU Admin",
     "id": "[generate-new-guid]",
     "isEnabled": true,
     "value": "NEU_Admin"
   }
   ```
   
   **NEU_PM Role:**
   ```json
   {
     "allowedMemberTypes": ["User"],
     "description": "NEU Project Manager",
     "displayName": "NEU PM",
     "id": "[generate-new-guid]",
     "isEnabled": true,
     "value": "NEU_PM"
   }
   ```
   
   **NEU_Partner Role:**
   ```json
   {
     "allowedMemberTypes": ["User"],
     "description": "Partner organization user",
     "displayName": "NEU Partner",
     "id": "[generate-new-guid]",
     "isEnabled": true,
     "value": "NEU_Partner"
   }
   ```
   
   **NEU_Guest Role:**
   ```json
   {
     "allowedMemberTypes": ["User"],
     "description": "Guest user with limited access",
     "displayName": "NEU Guest",
     "id": "[generate-new-guid]",
     "isEnabled": true,
     "value": "NEU_Guest"
   }
   ```

3. **Assign Roles to Users**
   - Go to: Enterprise applications → poolDRV → Users and groups
   - Click "Add user/group"
   - Select your user (varadi@neuzrt.hu)
   - Select role: "NEU Admin"
   - Click "Assign"

4. **Update App Manifest (Alternative Method)**
   - Go to: App registrations → poolDRV → Manifest
   - Find the `"appRoles"` section and add:
   ```json
   "appRoles": [
     {
       "allowedMemberTypes": ["User"],
       "description": "NEU Administrator",
       "displayName": "NEU Admin",
       "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
       "isEnabled": true,
       "origin": "Application",
       "value": "NEU_Admin"
     },
     {
       "allowedMemberTypes": ["User"],
       "description": "NEU Project Manager",
       "displayName": "NEU PM",
       "id": "b2c3d4e5-f6a7-8901-bcde-f23456789012",
       "isEnabled": true,
       "origin": "Application",
       "value": "NEU_PM"
     }
   ]
   ```

5. **Test the Configuration**
   - Clear browser cache/storage
   - Login again to poolDRV
   - Check browser console for token claims
   - The roles should now appear in the ID token

### Temporary Workaround (Currently Active):
```typescript
// In useAuth.ts - REMOVE after Azure AD configuration
return ['NEU_Admin'] as UserRole[]; // Hardcoded for development
```

## Business Value
- **Security:** Proper authentication ensures only authorized users access the system
- **Functionality:** Complete UI implementation enables all planned business processes
- **User Experience:** Functional pages replace placeholders, providing full system capabilities
- **Compliance:** Proper RBAC and audit trails meet regulatory requirements

## Dependencies
- **Prerequisites:**
  - Story 5.1 (Admin Dashboard) - ✅ COMPLETE
  - Backend APIs (Stories 1.1-1.4, 2.1-2.2, 3.1-3.5) - ✅ COMPLETE
  - Azure AD App Registration - ✅ CONFIGURED
  
- **Blocks:**
  - Story 5.2 (Order Creation Form)
  - Story 5.3 (Template Manager)
  - Story 5.4 (Permissions Manager)
  - Story 5.5 (Audit View)

## Technical Scope

### Authentication & Security
- Remove all development workarounds (hardcoded roles, disabled auth)
- Implement production Azure AD B2C/B2B authentication
- Configure proper token refresh and session management
- Implement role-based access control with actual AD claims

### UI Pages Implementation
- Complete all placeholder pages with full functionality
- Connect all pages to real backend APIs
- Implement proper error handling and loading states
- Ensure consistent UI/UX across all modules

### Backend Integration
- Replace all mock API responses with real database queries
- Implement proper data validation and error handling
- Ensure all CRUD operations work end-to-end
- Add proper pagination and filtering

## Stories

### Story TECH-002.1: Azure AD Role Configuration and Backend Token Validation
**Priority:** P0 - Critical  
**Estimated Effort:** 2 days  
**Assignee:** TBD  

**Description:**  
Configure App Roles in Azure AD and enable backend token validation. Authentication is already working, but roles aren't configured and backend isn't validating tokens.

**Current Status:**
- ✅ Azure AD authentication working
- ✅ MSAL configured correctly
- ✅ Token acquisition working
- ❌ App Roles not configured in Azure AD
- ❌ Backend not validating tokens
- ❌ Hardcoded admin role in use

**Acceptance Criteria:**
1. App Roles configured in Azure AD (NEU_Admin, NEU_PM, NEU_Partner, NEU_Guest)
2. User roles dynamically loaded from AD claims (remove hardcoded roles)
3. Backend validates Azure AD tokens on all API calls
4. Token passed in Authorization header for all API requests
5. 401 responses handled with token refresh
6. Role assignments work correctly for all users

**Technical Tasks:**
- [ ] Configure App Roles in Azure Portal (see instructions above)
- [ ] Assign NEU_Admin role to varadi@neuzrt.hu
- [ ] Remove hardcoded role from useAuth.ts
- [ ] Re-enable token attachment in axios-client.ts
- [ ] Configure backend to validate Azure AD tokens
- [ ] Test role-based access with multiple users
- [ ] Document role assignment process

---

### Story TECH-002.2: Contracts Management Interface
**Priority:** P1 - High  
**Estimated Effort:** 8 days  
**Assignee:** TBD  

**Description:**  
Build the complete Contracts management interface to replace the placeholder page, enabling full CRUD operations for contracts.

**Acceptance Criteria:**
1. List view displays all contracts with filtering and sorting
2. Create new contract with validation and partner selection
3. Edit existing contracts with version tracking
4. Delete contracts with confirmation and cascade handling
5. Contract templates for quick creation
6. Renewal reminders and expiration tracking
7. Bulk operations (export, mass update)
8. Advanced search with multiple criteria

**Technical Tasks:**
- [ ] Create ContractList component with DataGrid
- [ ] Build ContractForm with Fluent UI form controls
- [ ] Implement contract template selector
- [ ] Add file attachment support for contract documents
- [ ] Create contract timeline/history view
- [ ] Build renewal notification system
- [ ] Add export to Excel/PDF functionality
- [ ] Implement contract approval workflow UI
- [ ] Add contract metrics dashboard

**API Endpoints:**
- GET /api/v1/contracts (list with pagination)
- POST /api/v1/contracts (create)
- GET /api/v1/contracts/{id} (detail)
- PUT /api/v1/contracts/{id} (update)
- DELETE /api/v1/contracts/{id} (delete)
- GET /api/v1/contracts/templates (templates)
- POST /api/v1/contracts/{id}/renew (renewal)

---

### Story TECH-002.3: Guest User Management Portal
**Priority:** P1 - High  
**Estimated Effort:** 6 days  
**Assignee:** TBD  

**Description:**  
Implement the complete Guest Management UI for inviting and managing B2B guest users through Azure AD.

**Acceptance Criteria:**
1. Invite new guests with email validation
2. List all guests with status indicators
3. Manage guest group assignments
4. Set and monitor access expiration
5. Resend invitations for pending guests
6. Bulk invite from CSV/Excel
7. Guest access audit trail
8. Email notification templates

**Technical Tasks:**
- [ ] Create GuestInviteForm with email validation
- [ ] Build GuestList with status badges
- [ ] Implement group assignment interface
- [ ] Add expiration date picker and alerts
- [ ] Create bulk import with progress tracking
- [ ] Build invitation template editor
- [ ] Add guest activity monitoring dashboard
- [ ] Implement guest offboarding workflow

**API Endpoints:**
- GET /api/v1/guests (list)
- POST /api/v1/guests (invite)
- GET /api/v1/guests/{id} (detail)
- PATCH /api/v1/guests/{id}/groups (update groups)
- POST /api/v1/guests/{id}/resend (resend invitation)
- POST /api/v1/guests/bulk (bulk invite)
- DELETE /api/v1/guests/{id} (remove guest)

---

### Story TECH-002.4: Lock Management Dashboard
**Priority:** P2 - Medium  
**Estimated Effort:** 10 days  
**Assignee:** TBD  

**Description:**  
Complete the Lock Management interface with full functionality for time-based locks, change requests, and manual lock operations.

**Acceptance Criteria:**
1. Visual timeline showing lock windows (T-3, T-1, T+0, etc.)
2. Configure time-based lock rules per EM
3. Open/close Change Requests (CR) with 48-hour window
4. Manual lock/unlock with reason and audit
5. Lock status dashboard with current state
6. Conflict detection and resolution
7. Lock schedule calendar view
8. Email notifications for lock changes

**Technical Tasks:**
- [ ] Create LockTimeline component with D3.js
- [ ] Build LockRuleEditor with validation
- [ ] Implement CR management interface
- [ ] Add manual lock panel with reason field
- [ ] Create lock conflict resolver
- [ ] Build lock calendar view
- [ ] Add lock notification preferences
- [ ] Implement lock override workflow
- [ ] Create lock status monitor dashboard

**API Endpoints:**
- GET /api/v1/locks/rules/{em_id} (get rules)
- PUT /api/v1/locks/rules/{em_id} (configure rules)
- GET /api/v1/locks/state/{em_id} (current state)
- POST /api/v1/locks/manual (manual lock/unlock)
- POST /api/v1/locks/cr/open (open CR)
- POST /api/v1/locks/cr/close (close CR)
- GET /api/v1/locks/schedule/{em_id} (schedule)

---

### Story TECH-002.5: Users & Groups Administration
**Priority:** P2 - Medium  
**Estimated Effort:** 7 days  
**Assignee:** TBD  

**Description:**  
Build the Users & Groups management interface for administering system users and security groups.

**Acceptance Criteria:**
1. List all users with role badges and status
2. Create/edit/delete users (sync with AD)
3. Manage security groups and membership
4. Bulk user operations (import/export)
5. User activity dashboard
6. Password reset and account unlock
7. Role assignment interface
8. Group hierarchy visualization

**Technical Tasks:**
- [ ] Create UserList with advanced filtering
- [ ] Build UserForm with AD integration
- [ ] Implement group management tree view
- [ ] Add bulk import from AD/CSV
- [ ] Create user activity timeline
- [ ] Build role assignment matrix
- [ ] Add group membership editor
- [ ] Implement user provisioning workflow
- [ ] Create user access review dashboard

**API Endpoints:**
- GET /api/v1/users (list)
- POST /api/v1/users (create)
- GET /api/v1/users/{id} (detail)
- PUT /api/v1/users/{id} (update)
- DELETE /api/v1/users/{id} (delete)
- GET /api/v1/groups (list groups)
- POST /api/v1/groups/{id}/members (manage members)

---

### Story TECH-002.6: Application Settings Interface
**Priority:** P3 - Low  
**Estimated Effort:** 4 days  
**Assignee:** TBD  

**Description:**  
Implement the Settings page for system configuration and user preferences.

**Acceptance Criteria:**
1. System-wide settings (admin only)
2. User preferences (theme, notifications)
3. Email template configuration
4. Integration settings (SharePoint, Teams)
5. Backup and restore configuration
6. Feature flags management
7. API rate limit configuration
8. Maintenance mode toggle

**Technical Tasks:**
- [ ] Create SettingsTabs component
- [ ] Build SystemSettings form (admin)
- [ ] Implement UserPreferences form
- [ ] Add email template editor
- [ ] Create integration test panel
- [ ] Build configuration backup/restore
- [ ] Add feature flags interface
- [ ] Implement maintenance mode controls

**API Endpoints:**
- GET /api/v1/settings (get all)
- PUT /api/v1/settings (update)
- GET /api/v1/settings/user (user prefs)
- PUT /api/v1/settings/user (update prefs)
- POST /api/v1/settings/backup (backup)
- POST /api/v1/settings/restore (restore)

---

### Story TECH-002.7: Backend API Integration
**Priority:** P0 - Critical  
**Estimated Effort:** 5 days  
**Assignee:** TBD  

**Description:**  
Connect all frontend pages to real backend APIs, replacing mock data with actual database queries.

**Acceptance Criteria:**
1. Dashboard metrics load from real data
2. All CRUD operations persist to database
3. Proper error handling for API failures
4. Loading states during data fetching
5. Optimistic updates where appropriate
6. Cache invalidation on mutations
7. Proper pagination for large datasets
8. Real-time updates via WebSocket (stretch)

**Technical Tasks:**
- [ ] Update Dashboard to fetch real metrics
- [ ] Connect Orders page to orders API
- [ ] Connect Contracts to contracts API
- [ ] Connect Templates to templates API
- [ ] Connect Locks to locks API
- [ ] Connect Guests to guests API
- [ ] Implement proper error boundaries
- [ ] Add request retry logic
- [ ] Setup WebSocket for real-time updates

---

### Story TECH-002.8: Orders Page Implementation
**Priority:** P1 - High  
**Estimated Effort:** 3 days  
**Assignee:** TBD  

**Description:**  
Complete the Orders page to show existing orders (complementing Story 5.2 which handles creation).

**Acceptance Criteria:**
1. List all orders with status indicators
2. Search and filter by multiple criteria
3. View order details and history
4. Edit order information
5. Cancel/archive orders
6. Export order list
7. Order timeline visualization

**Technical Tasks:**
- [ ] Create OrderList component
- [ ] Build OrderDetail view
- [ ] Implement order filters
- [ ] Add order status workflow
- [ ] Create order history timeline
- [ ] Build export functionality
- [ ] Add order metrics widgets

**API Endpoints:**
- GET /api/v1/orders (list)
- GET /api/v1/orders/{id} (detail)
- PUT /api/v1/orders/{id} (update)
- POST /api/v1/orders/{id}/cancel (cancel)
- GET /api/v1/orders/{id}/history (history)

---

### Story TECH-002.9: Reports Page Basic Implementation
**Priority:** P3 - Low  
**Estimated Effort:** 3 days  
**Assignee:** TBD  

**Description:**  
Create basic Reports page structure (detailed reports in Story 6.1).

**Acceptance Criteria:**
1. Report category navigation
2. Report list with descriptions
3. Basic report parameter forms
4. Report generation status
5. Download generated reports
6. Schedule report generation
7. Report history

**Technical Tasks:**
- [ ] Create ReportCatalog component
- [ ] Build ReportParameters form
- [ ] Implement report queue status
- [ ] Add report download manager
- [ ] Create report scheduler
- [ ] Build report history list

## Success Metrics
- **Authentication:** 100% of users can login with Azure AD credentials
- **Page Completion:** All menu items lead to functional pages (0 placeholders)
- **API Integration:** 100% of data comes from real backend (0 mock responses)
- **Performance:** All pages load in <3 seconds (P95)
- **Error Rate:** <1% of API calls result in unhandled errors
- **Test Coverage:** >80% code coverage for new components

## Risk Mitigation

### Risks
1. **Azure AD Configuration Issues**
   - Mitigation: Early testing with actual AD tenant
   - Fallback: Temporary local auth for development

2. **API Performance Issues**
   - Mitigation: Implement aggressive caching
   - Fallback: Pagination and lazy loading

3. **Scope Creep**
   - Mitigation: Strict adherence to acceptance criteria
   - Fallback: Phase 2 for nice-to-have features

4. **Browser Compatibility**
   - Mitigation: Test on all target browsers early
   - Fallback: Polyfills for unsupported features

## Timeline
- **Week 1-2:** Authentication integration (TECH-002.1, TECH-002.7)
- **Week 3-4:** High-priority pages (TECH-002.2, TECH-002.3, TECH-002.8)
- **Week 5-6:** Medium-priority pages (TECH-002.4, TECH-002.5)
- **Week 7:** Low-priority pages and polish (TECH-002.6, TECH-002.9)
- **Week 8:** Testing, bug fixes, and deployment preparation

## Definition of Done
- [ ] All stories completed and tested
- [ ] No placeholder pages remain
- [ ] Authentication working with real Azure AD
- [ ] All APIs connected to real backend
- [ ] Test coverage >80% for new code
- [ ] Performance metrics met (<3s load time)
- [ ] Security review completed
- [ ] Documentation updated
- [ ] Code reviewed and approved
- [ ] Deployed to staging environment

## Notes
- This epic should be completed before moving to production
- Stories can be worked on in parallel by multiple developers
- Regular integration testing needed due to interdependencies
- Consider feature flags for gradual rollout

## Change Log
| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2025-08-09 | 1.0 | Initial epic creation with 9 stories | Quinn (QA Architect) |
| 2025-08-09 | 1.1 | Clarified Azure AD is working, added role configuration instructions | Quinn (QA Architect) |

## References
- [Story 5.1: Admin Dashboard](./stories/5.1.story.md) - Foundation
- [Story 5.2: Order Creation](./stories/5.2.story.md) - Related
- [Story 5.3: Template Manager](./stories/5.3.story.md) - Related
- [Story 5.4: Permissions Manager](./stories/5.4.story.md) - Related
- [Story 5.5: Audit View](./stories/5.5.story.md) - Related
- [Azure AD Documentation](https://docs.microsoft.com/en-us/azure/active-directory/)
- [Fluent UI Components](https://react.fluentui.dev/)