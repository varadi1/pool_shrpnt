import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PermissionAudit } from '../PermissionAudit';
import { format } from 'date-fns';
import userEvent from '@testing-library/user-event';

const createQueryClient = () => new QueryClient({
  defaultOptions: {
    queries: { retry: false },
    mutations: { retry: false }
  }
});

const renderWithProviders = (component: React.ReactElement) => {
  const queryClient = createQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      {component}
    </QueryClientProvider>
  );
};

describe('PermissionAudit', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = createQueryClient();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders audit trail with header', () => {
    renderWithProviders(<PermissionAudit orderId="order-1" />);
    
    expect(screen.getByText('Permission Audit Trail')).toBeInTheDocument();
    expect(screen.getByText(/Showing \d+ audit entries/)).toBeInTheDocument();
  });

  it('displays audit entries in the grid', () => {
    renderWithProviders(<PermissionAudit orderId="order-1" />);
    
    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('john.doe@company.com')).toBeInTheDocument();
    expect(screen.getByText('01_SZAKERTOI/CompanyA')).toBeInTheDocument();
    expect(screen.getByText('Granted write access for document upload')).toBeInTheDocument();
  });

  it('shows timestamp with date and time', () => {
    renderWithProviders(<PermissionAudit orderId="order-1" />);
    
    const timestamp = new Date('2025-01-10T10:30:00');
    expect(screen.getByText(format(timestamp, 'yyyy-MM-dd'))).toBeInTheDocument();
    expect(screen.getByText(format(timestamp, 'HH:mm:ss'))).toBeInTheDocument();
  });

  it('displays action badges with appropriate colors', () => {
    renderWithProviders(<PermissionAudit orderId="order-1" />);
    
    const updateBadge = screen.getByText('UPDATE');
    expect(updateBadge).toBeInTheDocument();
    expect(updateBadge.closest('[class*="Badge"]')).toBeInTheDocument();
    
    const lockBadge = screen.getByText('LOCK');
    expect(lockBadge).toBeInTheDocument();
  });

  it('shows change details with before and after values', () => {
    renderWithProviders(<PermissionAudit orderId="order-1" />);
    
    expect(screen.getByText(/level:/)).toBeInTheDocument();
    expect(screen.getByText(/read → write/)).toBeInTheDocument();
    expect(screen.getByText(/source:/)).toBeInTheDocument();
    expect(screen.getByText(/inherited → explicit/)).toBeInTheDocument();
  });

  it('displays affected users and folders as badges', () => {
    renderWithProviders(<PermissionAudit orderId="order-1" />);
    
    expect(screen.getByText('user1@company.com')).toBeInTheDocument();
    expect(screen.getByText('user2@company.com')).toBeInTheDocument();
    expect(screen.getByText('01_SZAKERTOI/CompanyA/docs')).toBeInTheDocument();
  });

  it('filters by user when typing in user filter', async () => {
    renderWithProviders(<PermissionAudit orderId="order-1" />);
    
    const userFilter = screen.getByPlaceholderText('Filter by user...');
    await userEvent.type(userFilter, 'Jane');
    
    await waitFor(() => {
      expect(screen.getByText('Jane Smith')).toBeInTheDocument();
      expect(screen.queryByText('John Doe')).not.toBeInTheDocument();
    });
  });

  it('filters by action type when selecting from dropdown', async () => {
    renderWithProviders(<PermissionAudit orderId="order-1" />);
    
    const actionDropdown = screen.getByPlaceholderText('Action type');
    fireEvent.click(actionDropdown);
    
    const lockOption = await screen.findByText('Lock');
    fireEvent.click(lockOption);
    
    await waitFor(() => {
      expect(screen.getByText('LOCK')).toBeInTheDocument();
      expect(screen.queryByText('UPDATE')).not.toBeInTheDocument();
    });
  });

  it('filters by resource type when selecting from dropdown', async () => {
    renderWithProviders(<PermissionAudit orderId="order-1" />);
    
    const resourceDropdown = screen.getByPlaceholderText('Resource type');
    fireEvent.click(resourceDropdown);
    
    const groupOption = await screen.findByText('Groups');
    fireEvent.click(groupOption);
    
    await waitFor(() => {
      expect(screen.getByText('CompanyB Experts')).toBeInTheDocument();
      expect(screen.queryByText('01_SZAKERTOI/CompanyA')).not.toBeInTheDocument();
    });
  });

  it('filters by date range when selecting dates', async () => {
    renderWithProviders(<PermissionAudit orderId="order-1" />);
    
    const startDateInput = screen.getByPlaceholderText('Start date');
    const endDateInput = screen.getByPlaceholderText('End date');
    
    fireEvent.change(startDateInput, { target: { value: '2025-01-09' } });
    fireEvent.change(endDateInput, { target: { value: '2025-01-09' } });
    
    await waitFor(() => {
      expect(screen.getByText('System')).toBeInTheDocument();
      expect(screen.getByText('Admin User')).toBeInTheDocument();
      expect(screen.queryByText('John Doe')).not.toBeInTheDocument();
    });
  });

  it('shows rollback button for entries with rollback available', () => {
    renderWithProviders(<PermissionAudit orderId="order-1" />);
    
    const rollbackButtons = screen.getAllByRole('button', { name: /rollback/i });
    expect(rollbackButtons.length).toBeGreaterThan(0);
  });

  it('shows link button for entries with related lock events', () => {
    renderWithProviders(<PermissionAudit orderId="order-1" />);
    
    const linkButtons = screen.getAllByRole('button', { name: /related lock/i });
    expect(linkButtons.length).toBeGreaterThan(0);
  });

  it('opens export dialog when clicking export button', async () => {
    renderWithProviders(<PermissionAudit orderId="order-1" />);
    
    const exportButton = screen.getByRole('button', { name: /export/i });
    fireEvent.click(exportButton);
    
    await waitFor(() => {
      expect(screen.getByText('Export Audit Log')).toBeInTheDocument();
      expect(screen.getByText('Export as CSV')).toBeInTheDocument();
      expect(screen.getByText('Export as XLSX')).toBeInTheDocument();
    });
  });

  it('shows export details in export dialog', async () => {
    renderWithProviders(<PermissionAudit orderId="order-1" />);
    
    const exportButton = screen.getByRole('button', { name: /export/i });
    fireEvent.click(exportButton);
    
    await waitFor(() => {
      expect(screen.getByText(/filtered entries/)).toBeInTheDocument();
      expect(screen.getByText(/All columns and details/)).toBeInTheDocument();
      expect(screen.getByText(/Applied filters and date range/)).toBeInTheDocument();
    });
  });

  it('exports as CSV when clicking CSV export', async () => {
    const createElementSpy = vi.spyOn(document, 'createElement');
    const clickSpy = vi.fn();
    
    createElementSpy.mockImplementation((tagName) => {
      if (tagName === 'a') {
        const element = document.createElement(tagName);
        element.click = clickSpy;
        return element;
      }
      return document.createElement(tagName);
    });
    
    renderWithProviders(<PermissionAudit orderId="order-1" />);
    
    const exportButton = screen.getByRole('button', { name: /export/i });
    fireEvent.click(exportButton);
    
    const csvButton = await screen.findByRole('button', { name: /export as csv/i });
    fireEvent.click(csvButton);
    
    await waitFor(() => {
      expect(clickSpy).toHaveBeenCalled();
    });
  });

  it('opens rollback dialog when clicking rollback button', async () => {
    renderWithProviders(<PermissionAudit orderId="order-1" />);
    
    const rollbackButtons = screen.getAllByRole('button', { name: /rollback/i });
    fireEvent.click(rollbackButtons[0]);
    
    await waitFor(() => {
      expect(screen.getByText('Rollback Permission Change')).toBeInTheDocument();
      expect(screen.getByText('Are you sure you want to rollback this change?')).toBeInTheDocument();
    });
  });

  it('shows change details in rollback dialog', async () => {
    renderWithProviders(<PermissionAudit orderId="order-1" />);
    
    const rollbackButtons = screen.getAllByRole('button', { name: /rollback/i });
    fireEvent.click(rollbackButtons[0]);
    
    await waitFor(() => {
      expect(screen.getByText('Change Details:')).toBeInTheDocument();
      expect(screen.getByText('Current (After)')).toBeInTheDocument();
      expect(screen.getByText('Will Restore To (Before)')).toBeInTheDocument();
    });
  });

  it('performs rollback when confirming in dialog', async () => {
    renderWithProviders(<PermissionAudit orderId="order-1" />);
    
    const rollbackButtons = screen.getAllByRole('button', { name: /rollback/i });
    fireEvent.click(rollbackButtons[0]);
    
    const confirmButton = await screen.findByRole('button', { name: /confirm rollback/i });
    fireEvent.click(confirmButton);
    
    await waitFor(() => {
      expect(screen.queryByText('Rollback Permission Change')).not.toBeInTheDocument();
    });
  });

  it('closes export dialog when clicking cancel', async () => {
    renderWithProviders(<PermissionAudit orderId="order-1" />);
    
    const exportButton = screen.getByRole('button', { name: /export/i });
    fireEvent.click(exportButton);
    
    const cancelButton = await screen.findByRole('button', { name: /cancel/i });
    fireEvent.click(cancelButton);
    
    await waitFor(() => {
      expect(screen.queryByText('Export Audit Log')).not.toBeInTheDocument();
    });
  });

  it('closes rollback dialog when clicking cancel', async () => {
    renderWithProviders(<PermissionAudit orderId="order-1" />);
    
    const rollbackButtons = screen.getAllByRole('button', { name: /rollback/i });
    fireEvent.click(rollbackButtons[0]);
    
    const cancelButton = await screen.findByRole('button', { name: /cancel/i });
    fireEvent.click(cancelButton);
    
    await waitFor(() => {
      expect(screen.queryByText('Rollback Permission Change')).not.toBeInTheDocument();
    });
  });

  it('shows system as actor for automated actions', () => {
    renderWithProviders(<PermissionAudit orderId="order-1" />);
    
    expect(screen.getByText('System')).toBeInTheDocument();
    expect(screen.getByText('system@neu.com')).toBeInTheDocument();
  });

  it('handles entries without rollback capability', () => {
    renderWithProviders(<PermissionAudit orderId="order-1" />);
    
    const rows = screen.getAllByRole('row');
    const systemRow = rows.find(row => within(row).queryByText('System'));
    
    if (systemRow) {
      const rollbackButton = within(systemRow).queryByRole('button', { name: /rollback/i });
      expect(rollbackButton).not.toBeInTheDocument();
    }
  });

  it('combines multiple filters correctly', async () => {
    renderWithProviders(<PermissionAudit orderId="order-1" />);
    
    const userFilter = screen.getByPlaceholderText('Filter by user...');
    await userEvent.type(userFilter, 'Admin');
    
    const actionDropdown = screen.getByPlaceholderText('Action type');
    fireEvent.click(actionDropdown);
    const createOption = await screen.findByText('Create');
    fireEvent.click(createOption);
    
    await waitFor(() => {
      expect(screen.getByText('Admin User')).toBeInTheDocument();
      expect(screen.queryByText('John Doe')).not.toBeInTheDocument();
      expect(screen.queryByText('Jane Smith')).not.toBeInTheDocument();
    });
  });

  it('updates entry count when filtering', async () => {
    renderWithProviders(<PermissionAudit orderId="order-1" />);
    
    expect(screen.getByText(/Showing 5 audit entries/)).toBeInTheDocument();
    
    const userFilter = screen.getByPlaceholderText('Filter by user...');
    await userEvent.type(userFilter, 'John');
    
    await waitFor(() => {
      expect(screen.getByText(/Showing 1 audit entries/)).toBeInTheDocument();
    });
  });
});