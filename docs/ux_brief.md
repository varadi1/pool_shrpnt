# poolDRV — UX Brief + Wireframes (Admins & PMs) — v0.1

> Product: **poolDRV** (SharePoint/Teams folder structure & permissions automation)
>
> Client: **NEÜ Zrt.**\
> Platforms: **Web (desktop-first, responsive)**\
> Primary users: **Admin**, **PM**\
> Accessibility target: **WCAG 2.2 AA** (assumed; confirm)

---

## 1) Objectives & Success Criteria (MVP)

- Create and manage standardized folder structures per contract/part/company/EM.
- Enforce RBAC with inheritance & exceptions; time-based locks; CR-based temporary unlocks.
- Provide a single admin/PM UI for provisioning, templates, permissions, locks, reports, audit.
- **KPI targets** (UI contribution): EM provisioning setup < 10 min; page loads < 3s; manual lock/unlock < 1 min; report generation kickoff < 1 min.

---

## 2) Primary Flows to Nail (Admins & PMs)

1. **New Contract** — link to (or create) EM templates, create **Microsoft Team** or **Team Channel**, add partner companies, map groups, invite guests & assign users.
2. **New Order (EM) Provisioning** — create EM from template, set **Rész (A/B/C)**, partner(s), deadlines → run provisioning job → status & audit.
3. **Deadlines & Locking** — configure windows; auto‑lock at **T+8**; **CR unlock** (default 48h) with auto re‑lock; notifications.
4. **Template Management** — list, version, diff, publish/rollback (no retro‑apply to existing EMs).
5. **Users & Groups** — define/manage user groups, invite guest users, assign roles to groups and users.
6. **Access Explorer (Contracts & EMs)** — folder tree view of effective rights by role/user; compare inheritance vs exceptions.
7. **RBAC & Exceptions** — view/edit role × folder rules; break inheritance for sensitive folders; quick PM manual lock.
8. **Reports & Audit** — who‑can‑access‑what; who‑did‑what; export CSV/XLSX; lock lifecycle timeline.

---

## 3) Information Architecture

**Global nav (left sidebar):**

- Dashboard
- Contracts
- Orders (EM)
- Templates
- Users and Groups
- Permissions
- Folders
- Reports
- Audit
- Settings

**Top bar:** Tenant / Contract selector · Role badge (Admin/PM) · Search · Notifications · User menu

**Entities:** Contract ▸ Part (A/B/C) ▸ Partner Company ▸ Team ▸ Channel ▸ EM ▸ Folder Instance ▸ Role/Group ▸ User ▸ Guest ▸ Lock Rule ▸ Audit Event

---

## 4) Navigation Model & Layout

- **Desktop baseline:** 1440×900 (content max-width 1200px). Support 1280, 1024. Mobile is responsive read-only-lite (phase 2).
- **Layout pattern:** Left rail (nav, collapsible) + Top bar + Content area with 12-col grid; cards with soft elevation.
- **Component library:** **Fluent UI** controls; React 18 + TS; MSAL auth; React Router; React Query.

---

## 5) Wireframes (low‑fi)

> Note: Hungarian-facing labels shown in **bold** where applicable; English notes inline.

### 5.1 Dashboard

- KPIs: Active EMs, Provision jobs (last 24h), Upcoming deadlines (T−3/−1/T+0), Lock state changes, Throttling alerts.
- Quick actions: **Új Megrendelés** (New EM), **Sablon publikálás**, **Manuális zárolás**.

```
+────────────────────────────────────────────────────────────────────────+
| Top bar: Contract ▼ | Search | Alerts | User                         |
+───────────+───────────────────────────────────────────────────────────+
| Nav       | [Cards: Active EMs] [Deadlines] [Recent audit events]     |
| Dashboard | [Provision Queue] [Throttling status]                     |
| Orders    |                                                           |
| Templates | Table: EMs with status & next event (T−1/T+0/T+8)         |
| ...       |                                                           |
+───────────+───────────────────────────────────────────────────────────+
```

**States:** loading (skeletons), empty (helper text + CTA), error (retry, log id).\
**Interactions:** cards deep-link to filtered views.

---

### 5.2 Orders (EM) — List & Detail

**List:** searchable/filterable by Contract/Part/Partner/State/Deadline window.\
**Columns:** EM Code, Part, Partner, Deadline, Lock state (chip), Provision status, Errors (if any), Last activity.\
**Row action:** View, Manual Lock/Unlock, CR Unlock, Run Provision again (idempotent), Audit.

**Detail tabs:** Overview · **Zárolási szabályok** · Folders · Permissions · Audit

```
List view
[Filters][Search]  (Chips) [T−3][T−1][T+0][T+8]
┌─────────┬─────┬─────────┬──────────┬──────────┬─────────────┬────────┐
| EM Code | Part| Partner | Deadline | Lock     | Provision   | Errors |
├─────────┼─────┼─────────┼──────────┼──────────┼─────────────┼────────┤
| EM_...  | A   | CÉG_XX  | 2025-09-15 16:00 | ReadOnly T+8 | Done   | –      |
└─────────┴─────┴─────────┴──────────┴──────────┴─────────────┴────────┘
```

**Detail ▸ Zárolási szabályok (Lock Rules):** editable fields: `deadline_datetime`, `upload_full_window_days`, `remediation_window_days`, `readonly_from_days`, `cr_unlock_hours` with inline validation. Save → toast + Audit event.

---

### 5.3 New EM (Új Megrendelés) — Wizard

**Step 1: Basic** — Contract (year), **Rész** (A/B/C), Partner(s), EM date, Naming convention preview.\
**Step 2: Template** — choose template version; view **Diff** vs previous; required fields validation.\
**Step 3: Deadlines** — set deadline + windows; preview timeline (T+1–7 etc.).\
**Review & Create** — summary; confirm → kicks **Provision job**; modal with live status.

**Validation:** required fields; naming conflicts; permissions preview if breaking inheritance.

---

### 5.4 Templates — List / Diff / Publish / Rollback

- List: Name, Version, Last changed, In-use count, Draft/Published status.
- Row actions: **Diff**, **Publish**, **Rollback** (with confirmation & impact note).
- Diff modal: left/right tree view of folder structure; highlights added/removed/changed; notes on **no retro‑apply** to existing EMs.

---

### 5.5 Permissions (RBAC) — Matrix & Exceptions

- Role × Folder matrix with scopes: **NEÜ Admin, NEÜ PM, Partner Admin, Szakértő, NEÜ QA**.
- Toggle **Break inheritance** per sensitive folder, set explicit rights.
- Conflict detector badge; preview effective access per user/group.

---

### 5.6 Locks — Manual & CR Unlock

- **Manual Lock/Unlock** panel (scope: *Szakértők* / *Eredménytermékek*, reason required). SLA: ≤1 min to apply.
- **CR Unlock**: start (duration default 48h), countdown chip, auto re-lock, audit trail.
- Timeline: T−3/−1/T+0 reminders, T+8 auto ReadOnly, CR events.

---

### 5.7 Reports & Audit

- Reports: **Access by Folder** (who can access what) · **Access by User/Group** (what can X access) · **Lock events** · **Upload readiness**.
- Export CSV/XLSX; long-running queries show progress + email on completion.
- Audit: filter by EM/actor/action/time; export; link back to entity.

### 5.8 Contracts — List, Detail & New

- **List:** filter by year/partner/state; columns: Contract Code, Year, Template, Team/Channel, Partners, Owner, Status.
- **Detail:** overview (linked EMs, templates in use), **Team/Channel** card (open in Teams), partners & groups, pending actions.
- **New Contract wizard:**
  1. **Basics:** Year, naming preview, partner companies.
  2. **Template link:** pick EM template(s) for A/B/C; show compatibility notes.
  3. **Team/Channel:** create Team or pick existing; optional new channel name (uniqueness check).
  4. **Users & Groups:** pick groups, invite guests; role mapping preview. **Create** → background job; progress panel + audit.

### 5.9 Users & Groups — Management

- **Groups:** list + create; members count; roles mapped; bulk add/remove via panel.
- **Users:** tenant users + **Guests**; invite via email; status (pending/accepted); domain allowlist check.
- **PeoplePicker** in all relevant forms; side panel shows memberships & effective roles.

### 5.10 Folders — Tree & Effective Permissions

- **Tree view** with breadcrumbs; indicators for **Inheritance broken**; inline actions: view rights, lock, audit.
- **Right rail panel:** "Effective permissions" for selected user/group; show RBAC source & exceptions.
- **Compare** toggle: show differences between role profiles per folder.

---

## 6) Front‑End Spec (per area)

### 6.1 Routes

- `/` Dashboard
- `/contracts` List
- `/contracts/new` Wizard
- `/orders` List
- `/orders/:id` Detail (tabs: overview|locks|folders|permissions|audit)
- `/orders/new` Wizard
- `/templates` List
- `/templates/:id/diff` Modal route
- `/users-groups` Management
- `/folders` Tree & effective permissions
- `/permissions` Matrix
- `/locks` (optional consolidated view)
- `/reports` (tabs)
- `/audit`
- `/settings`

### 6.2 Components (Fluent UI)

- DataGrid (sorting, virtualized rows)
- DetailsList (grouped) / Tree view (folders)
- CommandBar (bulk actions)
- Tabs, Pivot
- Panel/Modal (Diff, CR unlock, People & Groups, Effective permissions)
- DateTime picker (deadline)
- PeoplePicker (users & guests)
- Breadcrumb (folder tree)
- Tag/Chip for states (T−3/−1/T+0/T+8, ReadOnly, CR Active)
- MessageBar (errors, 429 rate limit)
- ProgressIndicator (long‑running exports/provisioning)
- Toasts & Inline validation

### 6.3 States & Edge Cases

- Loading: skeletons for tables/cards; optimistic updates for simple toggles.
- Errors: inline field errors; global callout with correlation id; idempotent retry for provisioning/locks.
- Empty: guidance + CTA; templates area shows sample template import.
- Rate limit (429): surface non-blocking banner; queue jobs; show **Retry after** countdown.

### 6.4 Forms & Validation

- Required: Contract, Part, Partner, Deadline, Template version.
- Naming: preview of `EM_YYYY_XXX_YYYYMMDD`; collision check.
- Contract uniqueness: prevent duplicate **Contract Code + Year**.
- Team/Channel: pre‑check name availability; warn if reserved or already exists.
- Guests: validate domain against **allowlist**; show actionable error if blocked.
- Lock rules: `readonly_from_days` > (`upload_full_window_days` + `remediation_window_days`).
- Bulk operations: dry‑run preview of changes for groups/permissions before apply.

### 6.5 Accessibility

- Keyboard nav across tables, modals, wizards; visible focus; ARIA labels for diff tree.
- Toasts and banners announce via live regions; color never sole indicator (chips include icons + text).
- Minimum 44×44px targets; time‑based elements readable with textual labels (e.g., “Auto‑lock in 2 days”).

### 6.6 Telemetry (events)

- `contracts.create.clicked/succeeded/failed`
- `teams.create.started/succeeded/failed`, `channels.create.started/succeeded/failed`
- `orders.create.clicked`, `orders.provision.started/succeeded/failed`
- `templates.publish.clicked/succeeded/failed`, `templates.diff.viewed`
- `users.invited`, `guests.invite.sent/failed`, `groups.create`, `groups.members.updated`, `users.assignRole`
- `accessExplorer.node.viewed`, `accessExplorer.effectivePermissions.requested`
- `locks.manual.apply`, `locks.manual.release`, `locks.cr.open/close/expire`
- `reports.export.started/succeeded/failed`

### 6.7 API Contracts (UI → Backend)

- `POST /api/contracts` (create Contract) · `GET /api/contracts` (list)
- `POST /api/teams` (create Team) · `POST /api/teams/{id}/channels` (create Channel) · `GET /api/teams/{id}`
- `POST /api/orders` (create EM) · `POST /api/orders/{id}/provision` (async)
- `PUT /api/locks/rules/{emId}` (edit lock rules)
- `POST /api/locks/manual` `{emId, scope, action, reason}`
- `POST /api/locks/cr/open` `{emId, scope, hours}` / `POST /api/locks/cr/close`
- `GET /api/folders/tree?contractId=...` (folder tree for Contract)
- `GET /api/permissions/effective?principalId=...&path=...` (effective rights)
- `POST /api/groups` (create), `PUT /api/groups/{id}/members` (bulk update)
- `POST /api/users` (create user) · `POST /api/guests` (invite guest) · `GET /api/guests/status?id=...`
- `GET /api/reports/access?mode=folder|principal`
- `GET /api/names/check?team=...&channel=...` (availability)
- Error model: 4xx field errors; 429 retry-after; 5xx with correlation id

---

## 7) Microcopy (HU)

- **Új Szerződés** — „Válaszd ki a sablont, majd hozd létre a Teamet vagy csatornát.”
- **Csatornanév foglalt** — „A csatornanév foglalt a kiválasztott Teamben.”
- **Felhasználók és csoportok** — „Kezdj el gépelni a név vagy e‑mail alapján.”
- **Vendég domain tiltva** — „A(z) {domain} nem engedélyezett vendégdomain.”
- **Hozzáférés‑térkép** — „Válassz mappát a jogosultságok megtekintéséhez.”
- **Új Megrendelés** — „Töltsd ki az alapadatokat, majd válaszd ki a sablont.”
- **Zárolási szabályok** — „A T+8 napon a mappák automatikusan csak olvashatók.”
- **CR feloldás** — „A feloldás 48 óra múlva automatikusan lejár.”
- Provision success toast — „Mappastruktúra létrehozva, jogosultságok alkalmazva.”

---

## 8) Acceptance (UI)

- All primary flows (Contracts, Orders/EM, Templates, Users & Groups, Folders, Permissions, Locks, Reports, Audit) testable end‑to‑end with mocked Microsoft Graph responses.
- Effective permissions panel responds <2s (P95) for folder depth ≤6.
- Page performance: <3s at P95 on 100‑row tables.
- A11y: no P1 issues; keyboard‑only completion of **both** wizards (Contract & EM); PeoplePicker fully navigable by keyboard and screen readers.
- Domain allowlist enforced with clear, localized error states and recovery actions.
- Team/Channel provisioning is idempotent; retries safe after transient errors (429/5xx).
- Audit events emitted for each lock/template/provision/contract/team/user/group action.

---

## 9) Open Questions

1. Confirm **brand** (logo, colors, typography) or use clean neutral.
2. Confirm WCAG target (2.2 AA) and key accessibility personas.
3. Finalize **Templates Diff** UX depth (tree compare only vs rule compare too).
4. Decide if PM sees **Permissions** matrix read‑only or editable for scoped parts.
5. Reports: async export via email OK?

---

## 10) Next Steps

- Validate wireframes with Admin & PM users (15–30 min sessions).
- Produce mid‑fi mocks (Figma) and component tokens.
- Lock screen‑by‑screen **Front‑End Spec**; handoff to Dev.

