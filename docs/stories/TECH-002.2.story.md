# Story TECH-002.2: Contracts Management Interface

## Status
Draft

## Story
**As an** Admin or PM,
**I want** to manage contracts through a comprehensive web interface with full CRUD operations,
**so that** I can create, view, edit, and track all contracts and their associated orders in one place

## Acceptance Criteria
1. List view displays all contracts with filtering, sorting, and pagination
2. Create new contract with validation and proper field constraints
3. Edit existing contracts with version tracking and audit trail
4. Delete contracts with confirmation and cascade handling for related orders
5. Contract templates available for quick creation from common patterns
6. Renewal reminders and expiration tracking with notification system
7. Bulk operations support (export to Excel/CSV, mass update status)
8. Advanced search with multiple criteria (number, name, date range, status)
9. Contract detail view shows associated orders and partner companies
10. All operations complete within 3 seconds (P95) for normal datasets

## Tasks / Subtasks

### Task 1: Create Contracts List Page (AC: 1, 8, 10)
- [ ] Create web/src/pages/Contracts.tsx as main contracts page
- [ ] Implement DataGrid component using Fluent UI DetailsList
  - [ ] Configure columns: Contract Number, Name, Status, Start/End Dates, Value, Actions
  - [ ] Add sorting capabilities on all columns
  - [ ] Implement pagination with 25/50/100 items per page options
- [ ] Add filtering panel with controls:
  - [ ] Status filter (Active, Expired, Pending, Cancelled)
  - [ ] Date range pickers for start/end dates
  - [ ] Text search for contract number and name
  - [ ] Clear all filters button
- [ ] Integrate with React Query for data fetching:
  ```typescript
  const { data, isLoading } = useQuery({
    queryKey: ['contracts', filters, page, pageSize],
    queryFn: () => contractsService.list(filters, page, pageSize),
    staleTime: 30000,
  });
  ```
- [ ] Add loading states with Fluent UI Spinner
- [ ] Implement error handling with retry logic

### Task 2: Build Contract Form Component (AC: 2, 3, 5)
- [ ] Create web/src/components/contracts/ContractForm.tsx
- [ ] Define form fields matching backend schema:
  ```typescript
  interface ContractFormData {
    contract_number: string;  // Required, unique
    name: string;            // Required, max 255 chars
    description?: string;    // Optional, multiline
    start_date: Date;        // Required
    end_date?: Date;         // Optional
    total_value?: number;    // Optional, decimal(15,2)
    status: 'draft' | 'active' | 'expired' | 'cancelled';
  }
  ```
- [ ] Implement form validation using react-hook-form:
  - [ ] Contract number format validation (alphanumeric + dash)
  - [ ] Date validation (end_date > start_date if provided)
  - [ ] Value validation (positive number, max 2 decimal places)
- [ ] Add template selection dropdown:
  - [ ] Load templates from localStorage or API
  - [ ] Pre-fill form fields from selected template
- [ ] Create save as template functionality
- [ ] Add field-level error display
- [ ] Implement form reset and cancel handlers

### Task 3: Implement Create Contract Modal (AC: 2, 5)
- [ ] Create web/src/components/contracts/CreateContractModal.tsx
- [ ] Use Fluent UI Dialog component for modal wrapper
- [ ] Embed ContractForm component
- [ ] Add submit handler with API call:
  ```typescript
  const mutation = useMutation({
    mutationFn: (data: ContractCreate) => 
      contractsService.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries(['contracts']);
      showSuccess('Contract created successfully');
      closeModal();
    },
    onError: (error) => {
      showError(`Failed to create contract: ${error.message}`);
    }
  });
  ```
- [ ] Add loading state during submission
- [ ] Handle validation errors from backend
- [ ] Implement optimistic update for better UX

### Task 4: Build Edit Contract Functionality (AC: 3)
- [ ] Create web/src/components/contracts/EditContractModal.tsx
- [ ] Load existing contract data on modal open
- [ ] Pre-populate form with current values
- [ ] Implement update API call:
  ```typescript
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: ContractUpdate }) =>
      contractsService.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['contracts']);
      queryClient.invalidateQueries(['contract', id]);
    }
  });
  ```
- [ ] Track changes for audit trail
- [ ] Add version conflict detection
- [ ] Show last modified by/date information

### Task 5: Add Delete Contract Capability (AC: 4)
- [ ] Implement delete confirmation dialog
- [ ] Check for associated orders before deletion:
  ```typescript
  const checkDependencies = async (contractId: number) => {
    const orders = await ordersService.getByContract(contractId);
    return {
      hasOrders: orders.length > 0,
      orderCount: orders.length,
      activeOrders: orders.filter(o => o.status === 'active')
    };
  };
  ```
- [ ] Display cascade warning if orders exist
- [ ] Add force delete option for admins
- [ ] Implement soft delete with status change
- [ ] Update list after successful deletion

### Task 6: Create Contract Detail View (AC: 9)
- [ ] Build web/src/pages/contracts/ContractDetail.tsx
- [ ] Display full contract information in read-only format
- [ ] Add tabs for related data:
  - [ ] Orders tab - list associated orders
  - [ ] Partners tab - show assigned partner companies
  - [ ] Documents tab - contract files/attachments
  - [ ] History tab - audit trail of changes
- [ ] Implement breadcrumb navigation
- [ ] Add action buttons (Edit, Delete, Renew, Export)
- [ ] Show contract timeline visualization

### Task 7: Implement Renewal Reminders (AC: 6)
- [ ] Create web/src/components/contracts/RenewalReminder.tsx
- [ ] Calculate days until expiration
- [ ] Display color-coded badges:
  - [ ] Red: Expired or <30 days
  - [ ] Yellow: 30-60 days
  - [ ] Green: >60 days
- [ ] Add renewal action button
- [ ] Implement renewal workflow:
  ```typescript
  const renewContract = async (contractId: number) => {
    const original = await contractsService.get(contractId);
    const renewed = {
      ...original,
      contract_number: `${original.contract_number}-R${Date.now()}`,
      start_date: original.end_date,
      end_date: addYears(original.end_date, 1),
      status: 'draft'
    };
    return contractsService.create(renewed);
  };
  ```
- [ ] Set up notification preferences
- [ ] Create renewal dashboard widget

### Task 8: Build Bulk Export Functionality (AC: 7)
- [ ] Create web/src/components/contracts/ExportDialog.tsx
- [ ] Add export format selection (CSV, XLSX)
- [ ] Implement column selection for export
- [ ] Add filters to export current view or all data
- [ ] Generate export with proper formatting:
  ```typescript
  const exportToExcel = (contracts: Contract[]) => {
    const worksheet = XLSX.utils.json_to_sheet(contracts);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Contracts');
    XLSX.writeFile(workbook, `contracts_${Date.now()}.xlsx`);
  };
  ```
- [ ] Handle large datasets with progress indicator
- [ ] Add metadata sheet with export parameters

### Task 9: Implement Advanced Search (AC: 8)
- [ ] Create web/src/components/contracts/AdvancedSearch.tsx
- [ ] Build expandable search panel with multiple criteria
- [ ] Add search fields:
  - [ ] Contract number (partial match)
  - [ ] Name/Description (full text)
  - [ ] Date ranges (created, start, end)
  - [ ] Value range (min/max)
  - [ ] Status multi-select
  - [ ] Created/Updated by user
- [ ] Implement search query builder
- [ ] Add save search functionality
- [ ] Create search history dropdown

### Task 10: Add Contract Templates Management (AC: 5)
- [ ] Create web/src/components/contracts/TemplateManager.tsx
- [ ] List saved templates with preview
- [ ] Add create template from existing contract
- [ ] Implement template editing
- [ ] Add template categorization
- [ ] Create template usage tracking
- [ ] Build template sharing for team

### Task 11: Integrate Contract API Service (AC: All)
- [ ] Create web/src/services/contracts.ts
- [ ] Implement API methods:
  ```typescript
  class ContractsService {
    async list(filters?: Filters, page?: number, pageSize?: number)
    async get(id: number): Promise<Contract>
    async create(data: ContractCreate): Promise<Contract>
    async update(id: number, data: ContractUpdate): Promise<Contract>
    async delete(id: number): Promise<void>
    async getTemplates(): Promise<ContractTemplate[]>
    async checkDependencies(id: number): Promise<Dependencies>
    async export(format: 'csv' | 'xlsx', filters?: Filters): Promise<Blob>
  }
  ```
- [ ] Add request/response interceptors
- [ ] Implement error handling and retry logic
- [ ] Add response caching where appropriate

### Task 12: Write Tests (AC: All)
- [ ] Unit tests for ContractForm validation
- [ ] Test CRUD operations with mock API
- [ ] Test filter and search functionality
- [ ] Test bulk operations
- [ ] Test template functionality
- [ ] Integration tests for full workflows
- [ ] Accessibility tests for WCAG compliance

## Dev Notes

### Previous Story Insights
From Story 5.1 (Admin Dashboard):
- **React Query Configuration** [Source: Story 5.1]:
  ```typescript
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { staleTime: 5 * 60 * 1000, refetchOnWindowFocus: false }
    }
  });
  ```
- **Fluent UI Setup** already configured in web/src/App.tsx
- **MSAL Authentication** integrated with automatic token renewal
- **Navigation Structure** already includes /contracts route

From Story 5.2 (Order Creation):
- **Form Validation Pattern** using react-hook-form with yup
- **Multi-step Wizard** implementation pattern available
- **Export Service** already created in web/src/services/export.ts

### Data Models
**Contract Model** [Source: api/models/contract.py]:
```python
class Contract(Base):
    id: Integer (primary key)
    contract_number: String(50) - unique, indexed
    name: String(255) - required
    description: Text - optional
    start_date: DateTime - required
    end_date: DateTime - optional
    status: String(50) - default "active"
    total_value: Numeric(15, 2) - optional
    created_at/updated_at: DateTime
    created_by/updated_by: String(255)
```

### API Specifications
**Contract Endpoints** [Source: api/routers/contracts.py]:
- GET /api/contracts - List with optional status filter
- POST /api/contracts - Create new contract
- GET /api/contracts/{id} - Get single contract
- PUT /api/contracts/{id} - Update contract
- DELETE /api/contracts/{id} - Delete contract

**Request/Response Schemas** [Source: api/schemas/contract.py]:
- ContractCreate: contract_number, name, description, start_date, end_date, total_value
- ContractUpdate: All fields optional except id
- Contract: Full model with timestamps and user tracking

### Component Specifications
**UI Components** [Source: architecture/5-frontend-architecture-react.md]:
- Use Fluent UI v9 components exclusively
- DetailsList for data grids
- Dialog for modals
- Form controls from @fluentui/react-components
- Follow WCAG 2.2 AA accessibility standards

### File Locations
Based on project structure [Source: architecture/3-workloads-services-monorepo.md]:
- Pages: web/src/pages/Contracts.tsx
- Components: web/src/components/contracts/
- Services: web/src/services/contracts.ts
- Tests: web/src/__tests__/contracts/
- Types: web/src/types/contract.ts

### Testing Requirements
**Testing Standards** [Source: architecture/coding-standards.md]:
- Test files in __tests__ directories
- Use Vitest for unit tests
- React Testing Library for component tests
- Coverage target ≥70% for frontend
- Mock API calls with MSW (Mock Service Worker)
- Test commands:
  ```bash
  npm run test           # Run all tests
  npm run test:coverage  # Generate coverage report
  npm run test:watch     # Watch mode for development
  ```

### Technical Constraints
**Performance Requirements** [Source: architecture/16-a11y-performance-targets-from-prd.md]:
- Page load P95 < 3 seconds
- List operations handle 1000+ records with pagination
- Virtual scrolling for lists > 100 items
- Implement request debouncing for search (300ms)

**Security Considerations** [Source: architecture/13-security-compliance.md]:
- All API calls require authentication token
- Role-based access (NEU_Admin, NEU_PM)
- Audit all CRUD operations
- No sensitive data in localStorage

**Error Handling** [Source: architecture/11-notifications.md]:
- Display correlation ID for errors
- Toast notifications for success/error
- Retry logic for network failures
- Graceful degradation for missing data

## Testing
- Test file location: web/src/__tests__/contracts/, web/src/components/contracts/__tests__/
- Framework: Vitest + React Testing Library for unit tests
- E2E: Playwright for contract workflows
- Coverage target: ≥70% line coverage
- Key test scenarios:
  - Contract CRUD operations
  - Form validation edge cases
  - Filter and search combinations
  - Bulk operations with large datasets
  - Template creation and application
  - Permission-based UI rendering

## Change Log
| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2025-01-10 | 1.0 | Initial story creation from EPIC-TECH-002 | Bob (Scrum Master) |

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
