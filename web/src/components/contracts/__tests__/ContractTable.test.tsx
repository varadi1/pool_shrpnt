import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { ContractTable } from '../ContractTable';
import { Contract } from '../../../types/contracts';

const mockContracts: Contract[] = [
  {
    id: 1,
    contractNumber: 'C001',
    name: 'Test Contract 1',
    clientName: 'Client A',
    status: 'active',
    startDate: '2025-01-01',
    endDate: '2025-12-31',
    pmName: 'John Doe',
    totalValue: 100000,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z'
  },
  {
    id: 2,
    contractNumber: 'C002',
    name: 'Test Contract 2',
    clientName: 'Client B',
    status: 'inactive',
    startDate: '2024-01-01',
    endDate: '2024-12-31',
    pmName: 'Jane Smith',
    totalValue: 150000,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z'
  },
  {
    id: 3,
    contractNumber: 'C003',
    name: 'Test Contract 3',
    clientName: 'Client C',
    status: 'expired',
    startDate: '2023-01-01',
    endDate: '2023-12-31',
    pmName: 'Bob Johnson',
    totalValue: 200000,
    createdAt: '2023-01-01T00:00:00Z',
    updatedAt: '2023-01-01T00:00:00Z'
  }
];

const mockOnView = vi.fn();
const mockOnEdit = vi.fn();
const mockOnDelete = vi.fn();
const mockOnPageChange = vi.fn();
const mockOnPageSizeChange = vi.fn();
const mockOnSort = vi.fn();

const createQueryClient = () => new QueryClient({
  defaultOptions: {
    queries: { retry: false },
    mutations: { retry: false }
  }
});

const renderContractTable = (props = {}) => {
  const queryClient = createQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <FluentProvider theme={webLightTheme}>
        <ContractTable
          contracts={mockContracts}
          totalCount={mockContracts.length}
          currentPage={1}
          pageSize={10}
          onView={mockOnView}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          onPageChange={mockOnPageChange}
          onPageSizeChange={mockOnPageSizeChange}
          onSort={mockOnSort}
          canEdit={true}
          canDelete={true}
          loading={false}
          {...props}
        />
      </FluentProvider>
    </QueryClientProvider>
  );
};

describe.skip('ContractTable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render contracts with correct columns', () => {
    renderContractTable();
    
    // Check headers
    expect(screen.getByText('Contract Number')).toBeInTheDocument();
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Client')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Start Date')).toBeInTheDocument();
    expect(screen.getByText('End Date')).toBeInTheDocument();
    expect(screen.getByText('PM')).toBeInTheDocument();
    expect(screen.getByText('Actions')).toBeInTheDocument();

    // Check contract data
    expect(screen.getByText('C001')).toBeInTheDocument();
    expect(screen.getByText('Test Contract 1')).toBeInTheDocument();
    expect(screen.getByText('Client A')).toBeInTheDocument();
    expect(screen.getByText('John Doe')).toBeInTheDocument();
  });

  it('should handle sorting on all columns', async () => {
    renderContractTable();
    
    const sortableHeaders = [
      'Contract Number',
      'Name',
      'Client',
      'Status',
      'Start Date',
      'End Date',
      'PM'
    ];

    for (const header of sortableHeaders) {
      const headerElement = screen.getByText(header);
      await userEvent.click(headerElement);
      
      expect(mockOnSort).toHaveBeenCalledWith(
        expect.objectContaining({
          column: expect.any(String),
          direction: expect.stringMatching(/^(asc|desc)$/)
        })
      );
    }
  });

  it('should display status badges with correct colors', () => {
    renderContractTable();
    
    // Check active status (green)
    const activeRow = screen.getByText('C001').closest('tr');
    const activeBadge = within(activeRow!).getByText('active');
    expect(activeBadge).toHaveClass('fui-Badge__icon');
    
    // Check inactive status (gray/neutral)
    const inactiveRow = screen.getByText('C002').closest('tr');
    const inactiveBadge = within(inactiveRow!).getByText('inactive');
    expect(inactiveBadge).toHaveClass('fui-Badge__icon');
    
    // Check expired status (blue/brand)
    const expiredRow = screen.getByText('C003').closest('tr');
    const expiredBadge = within(expiredRow!).getByText('expired');
    expect(expiredBadge).toHaveClass('fui-Badge__icon');
  });

  it('should navigate to detail view on row click', async () => {
    renderContractTable();
    
    const row = screen.getByText('C001').closest('tr');
    await userEvent.click(row!);
    
    expect(mockOnView).toHaveBeenCalledWith(mockContracts[0]);
  });

  it('should handle pagination controls', async () => {
    renderContractTable({ totalCount: 100, currentPage: 2, pageSize: 25 });
    
    // Check pagination info
    expect(screen.getByText(/26-50 of 100/)).toBeInTheDocument();
    
    // Click next page
    const nextButton = screen.getByRole('button', { name: /next/i });
    await userEvent.click(nextButton);
    expect(mockOnPageChange).toHaveBeenCalledWith(3);
    
    // Click previous page
    const prevButton = screen.getByRole('button', { name: /previous/i });
    await userEvent.click(prevButton);
    expect(mockOnPageChange).toHaveBeenCalledWith(1);
  });

  it('should display empty state when no contracts', () => {
    renderContractTable({ contracts: [], totalCount: 0 });
    
    expect(screen.getByText('No contracts found')).toBeInTheDocument();
    expect(screen.getByText(/Try adjusting your filters or search criteria/)).toBeInTheDocument();
  });

  it('should show loading skeleton when loading', () => {
    renderContractTable({ loading: true });
    
    // Check for skeleton elements
    const skeletonRows = screen.getAllByTestId('skeleton-row');
    expect(skeletonRows).toHaveLength(5); // Default skeleton row count
  });

  it('should handle page size changes', async () => {
    renderContractTable();
    
    const pageSizeSelector = screen.getByRole('combobox', { name: /items per page/i });
    await userEvent.selectOptions(pageSizeSelector, '25');
    
    expect(mockOnPageSizeChange).toHaveBeenCalledWith(25);
  });

  it('should display action buttons based on permissions', () => {
    // Test with edit/delete permissions
    const { rerender } = renderContractTable({ canEdit: true, canDelete: true });
    
    const viewButtons = screen.getAllByRole('button', { name: /view/i });
    const editButtons = screen.getAllByRole('button', { name: /edit/i });
    const deleteButtons = screen.getAllByRole('button', { name: /delete/i });
    
    expect(viewButtons).toHaveLength(mockContracts.length);
    expect(editButtons).toHaveLength(mockContracts.length);
    expect(deleteButtons).toHaveLength(mockContracts.length);
    
    // Test without permissions
    rerender(
      <QueryClientProvider client={createQueryClient()}>
        <FluentProvider theme={webLightTheme}>
          <ContractTable
            contracts={mockContracts}
            totalCount={mockContracts.length}
            currentPage={1}
            pageSize={10}
            onView={mockOnView}
            onEdit={mockOnEdit}
            onDelete={mockOnDelete}
            onPageChange={mockOnPageChange}
            onPageSizeChange={mockOnPageSizeChange}
            onSort={mockOnSort}
            canEdit={false}
            canDelete={false}
            loading={false}
          />
        </FluentProvider>
      </QueryClientProvider>
    );
    
    expect(screen.getAllByRole('button', { name: /view/i })).toHaveLength(mockContracts.length);
    expect(screen.queryByRole('button', { name: /edit/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();
  });

  it('should call action handlers correctly', async () => {
    renderContractTable();
    
    const firstContract = mockContracts[0];
    const row = screen.getByText('C001').closest('tr');
    
    // Test view action
    const viewButton = within(row!).getByRole('button', { name: /view/i });
    await userEvent.click(viewButton);
    expect(mockOnView).toHaveBeenCalledWith(firstContract);
    
    // Test edit action
    const editButton = within(row!).getByRole('button', { name: /edit/i });
    await userEvent.click(editButton);
    expect(mockOnEdit).toHaveBeenCalledWith(firstContract);
    
    // Test delete action
    const deleteButton = within(row!).getByRole('button', { name: /delete/i });
    await userEvent.click(deleteButton);
    expect(mockOnDelete).toHaveBeenCalledWith(firstContract);
  });

  it('should format dates correctly', () => {
    renderContractTable();
    
    // Check date formatting (should be localized)
    expect(screen.getByText('01/01/2025')).toBeInTheDocument();
    expect(screen.getByText('12/31/2025')).toBeInTheDocument();
  });

  it('should format currency values correctly', () => {
    renderContractTable();
    
    // Currency should be formatted with thousands separator
    const firstRow = screen.getByText('C001').closest('tr');
    expect(within(firstRow!).getByText('$100,000.00')).toBeInTheDocument();
  });
});