# Story TECH-002.3: Guest User Management Portal

## Status
Draft

## Story
**As an** Admin or PM,
**I want** to invite, list, manage, and offboard B2B guest users through Azure AD,
**so that** partner users can securely access resources with controlled lifecycle and auditability.

## Acceptance Criteria
1. Invite new guests with email validation
2. List all guests with status indicators
3. Manage guest group assignments
4. Set and monitor access expiration
5. Resend invitations for pending guests
6. Bulk invite from CSV/Excel
7. Guest access audit trail
8. Email notification templates

## Tasks / Subtasks

### Frontend (web/)
- [ ] Wire Guests list to real API (AC: 2)
  - [ ] Update `web/src/components/guests/GuestList.tsx` to consume backend response shape `GuestListResponse` (`guests`, `total`, `page`, `page_size`) instead of `items`
  - [ ] Implement pagination controls and pass `page` and `page_size` query params
  - [ ] Map backend `GuestStatus` values (lowercase enum) to UI badges consistently
  - [ ] Handle loading, error, and empty states per a11y guidance

- [ ] Implement Invite flow (AC: 1, 8)
  - [ ] Use `web/src/components/guests/GuestInviteForm.tsx` to call `POST /api/guests` with schema `{ email, partner_company_id, display_name, role, send_notification }`
  - [ ] Validate email (client-side) and display inline field errors
  - [ ] On success, show toast and refresh list; on failure, show correlation-aware error

- [ ] Resend invitation (AC: 5)
  - [ ] Add action to Guests list to call `POST /api/guests/{id}/resend-invitation` (align FE to BE path)
  - [ ] Confirm success path and refresh list

- [ ] Manage group assignments (AC: 3)
  - [ ] Use `web/src/components/guests/GuestGroupAssignment.tsx` to fetch available groups (`GET /api/groups`) and update via `PATCH /api/guests/{id}/groups`
  - [ ] Show categorized list (partner/project/system) and maintain selection state with optimistic update + rollback on failure

- [ ] Extensions and expiry (AC: 4)
  - [ ] Implement `GuestExtensionForm` (existing import used in `GuestList`) to call `POST /api/guests/{id}/extend` with `{ justification, extension_days? }`
  - [ ] Show days-to-expiry badge and status chip per guest; refresh on success

- [ ] Revocation (single and bulk)
  - [ ] Ensure `web/src/components/guests/GuestRevocationModal.tsx` calls `DELETE /api/guests/{id}` (single) and `POST /api/guests/bulk-revoke` (bulk)
  - [ ] Validate reason length <= 500 and show result summary

- [ ] Bulk invite (AC: 6)
  - [ ] Create `web/src/components/guests/BulkInviteDialog.tsx` to upload CSV/Excel (columns: email, display_name, partner_company_id, role)
  - [ ] Call `POST /api/guests/bulk` and show per-row result with correlation id
  - [ ] Add download of CSV template

- [ ] Notifications UX (AC: 8)
  - [ ] Show success toasts with correlation id; error bar for rate-limits with retry-after
  - [ ] Provide link to invitation email preview (if available)

### Backend (api/)
- [ ] Guests router real data (AC: 2, 7)
  - [ ] Implement `GET /api/guests` in `api/routers/guests.py` to return paginated results from DB (remove mock response)
  - [ ] Support filters: `email`, `partner_company_id`, `status`, `include_expired`, `page`, `page_size`
  - [ ] Keep response model `GuestListResponse` with `guests`, `total`, `page`, `page_size`

- [ ] Invitation flows (AC: 1, 5, 8)
  - [ ] Ensure `POST /api/guests` uses `GuestService.invite_guest` with email validation and audit + notification
  - [ ] Align FE path for resend: keep `POST /api/guests/{guest_id}/resend-invitation` and document; FE to adopt same path

- [ ] Group assignments (AC: 3)
  - [ ] Confirm presence of `GET /api/groups` (RBAC groups). If missing, add endpoint to list groups with `{ id, name, description }`
  - [ ] Ensure `PATCH /api/guests/{guest_id}/groups` persists adds/removes and audits changes

- [ ] Extensions and expiry (AC: 4)
  - [ ] Ensure `POST /api/guests/{guest_id}/extend` uses `GuestLifecycleService.extend_guest_access` with policy validation and audit
  - [ ] Implement `GET /api/guests/expiring` to list guests nearing expiry (already present): wire through lifecycle service; confirm pagination and shape

- [ ] Bulk invite (AC: 6)
  - [ ] Add `POST /api/guests/bulk` endpoint that validates rows, invites via `GuestService.invite_guest`, batches notifications, returns per-row result
  - [ ] Enforce idempotency by email within request; return correlation id

- [ ] Audit trail (AC: 7)
  - [ ] Ensure all actions (invite, resend, extend, revoke, group changes, bulk ops) log immutable audit entries via `AuditService`

- [ ] Security & observability
  - [ ] All endpoints require `Depends(get_current_user)` from `api/dependencies/auth.py`
  - [ ] Propagate and log `X-Correlation-ID`; never log tokens or PII beyond minimal identifiers

## Dev Notes

### Architecture references
- Identity & Access — SPA uses MSAL; backend validates JWT; RBAC via roles; token refresh and caching. [Source: docs/architecture/4-identity-access-azure-ad-msal.md]
- Frontend Architecture — React Router, React Query, Fluent UI; MSAL role claims → UI guards; no Graph calls from FE. [Source: docs/architecture/5-frontend-architecture-react.md]
- Microsoft 365 Integrations — Invitations and ACLs managed via app-only Graph; backoff, rate limits. [Source: docs/architecture/10-microsoft-365-integrations-graph-sharepoint.md]
- Observability & Audit — JSON logs, correlation id, immutable audit events for guests. [Source: docs/architecture/12-observability-audit.md]
- Coding Standards — Auth: RS256 JWT, aud/iss check; FE stores roles in session only as backup; no token logging; test/coverage targets. [Source: docs/architecture/coding-standards.md#7-biztonsag-es-megfeleloseg]

### Relevant source tree (current implementation)
- Backend router: `api/routers/guests.py` — endpoints exist for invite, list (mocked), detail, status, groups update, resend-invitation, revoke, bulk-revoke, expiring, extend, extensions history. Needs pagination + real list implementation.
- Services: `api/services/guests/guest_service.py`, `api/services/guests/lifecycle_service.py` — implement Graph invitation, group assign, revoke, extend, expiry, notifications, audit.
- Models/Schemas: `api/models/guest.py`, `api/schemas/guest.py` — enums, request/response models (note: `GuestStatus` lowercase).
- Frontend components exist: `web/src/components/guests/GuestInviteForm.tsx`, `GuestList.tsx`, `GuestRevocationModal.tsx`, `GuestGroupAssignment.tsx`, `GuestExtensionForm.tsx` (already referenced).
- FE API client attaches `Authorization: Bearer <token>` and correlation id; handles 401/429. See `web/src/services/api/axios-client.ts`.

### Gaps and alignment tasks
- FE vs BE path mismatch: FE uses `/api/guests/{id}/resend`; BE exposes `/resend-invitation`. Align FE to BE path.
- FE expects `response.data.items`; BE returns `guests`. Update FE to use `response.data.guests` and `total`.
- Status casing mismatch: FE uses uppercase strings; BE returns enum values (lowercase). Normalize in FE.
- Bulk invite endpoint not present: add `POST /api/guests/bulk` on BE and wire FE dialog.

### File locations
- Pages/Components: `web/src/components/guests/*`
- Services: `web/src/services/api.ts` and `web/src/services/api/axios-client.ts`
- Backend router: `api/routers/guests.py`
- Backend services: `api/services/guests/*`

## Testing

### Frontend
- Unit: update/extend existing tests in `web/src/components/guests/__tests__/`
  - Invite form validates email and posts correct payload
  - Guests list paginates, filters, and maps statuses correctly
  - Group assignment toggles and saves selection
  - Revocation modal validates reason and calls correct endpoints (single/bulk)
- Integration (Vitest + MSW): mock BE responses for list/invite/extend/revoke/expiring
- E2E (Playwright): happy paths for invite → list → extend → revoke

### Backend
- Unit: services for invite (Graph mocked), resend, groups update, extend, revoke, bulk revoke, expiring queries
- API: router tests for pagination and filters on list, extend, bulk invite/revoke, resend-invitation
- Performance: list endpoint P95 < 300ms for 1k guests with pagination

## Change Log
| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2025-08-09 | 1.0 | Initial story draft from EPIC TECH-002 | Bob (Scrum Master) |

## Dev Agent Record

### Agent Model Used
[To be filled by Dev Agent]

### Debug Log References
[To be filled by Dev Agent]

### Completion Notes List
[To be filled by Dev Agent]

### File List
[To be filled by Dev Agent]

## QA Results
[To be filled by QA Agent]


