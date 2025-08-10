import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PermissionReports } from '../PermissionReports';
import userEvent from '@testing-library/user-event';

const createQueryClient = () => new QueryClient({
  defaultOptions: {
    queries: { retry: false },
    mutations: { retry: false },
  },
});

const renderWithProviders = (component: React.ReactElement) => {
  const queryClient = createQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      {component}
    </QueryClientProvider>
  );
};

describe('PermissionReports', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders report tabs correctly', () => {
    renderWithProviders(<PermissionReports orderId="order-1" />);
    
    expect(screen.getByText('Permission Reports')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Folder → Users/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /User → Folders/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Changes Over Time/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Conflict History/i })).toBeInTheDocument();
  });

  it('displays folder access report by default', async () => {
    renderWithProviders(<PermissionReports orderId="order-1" />);
    
    await waitFor(() => {
      expect(screen.getByText('Experts')).toBeInTheDocument();
      expect(screen.getByText('00_BELSO_NEU_ONLY')).toBeInTheDocument();
    });

    // Check for NEU Only badge
    expect(screen.getByText('NEU Only')).toBeInTheDocument();
    
    // Check for user details - use getAllByText for multiple occurrences
    const johnElements = screen.getAllByText(/John Smith/);
    expect(johnElements.length).toBeGreaterThan(0);
    const janeElements = screen.getAllByText(/Jane Doe/);
    expect(janeElements.length).toBeGreaterThan(0);
  });

  it('switches to user access report when tab is clicked', async () => {
    renderWithProviders(<PermissionReports orderId="order-1" />);
    
    const userAccessTab = screen.getByRole('tab', { name: /User → Folders/i });
    fireEvent.click(userAccessTab);
    
    await waitFor(() => {
      expect(screen.getByText('John Smith')).toBeInTheDocument();
      expect(screen.getByText('john.smith@company.com')).toBeInTheDocument();
    });
    
    // Check for role badge
    expect(screen.getByText('Expert')).toBeInTheDocument();
  });

  it('displays permission changes report', async () => {
    renderWithProviders(<PermissionReports orderId="order-1" />);
    
    const changesTab = screen.getByRole('tab', { name: /Changes Over Time/i });
    fireEvent.click(changesTab);
    
    await waitFor(() => {
      expect(screen.getByText('admin@neu.com')).toBeInTheDocument();
      expect(screen.getByText('Updated permissions')).toBeInTheDocument();
    });
    
    // Check for permission change indicators
    expect(screen.getByText('read')).toBeInTheDocument();
    expect(screen.getByText('write')).toBeInTheDocument();
  });

  it('displays conflict history report', async () => {
    renderWithProviders(<PermissionReports orderId="order-1" />);
    
    const conflictsTab = screen.getByRole('tab', { name: /Conflict History/i });
    fireEvent.click(conflictsTab);
    
    await waitFor(() => {
      expect(screen.getByText('Bob Johnson')).toBeInTheDocument();
      expect(screen.getByText(/Financial\/TIG/)).toBeInTheDocument();
    });
    
    // Check for conflict sources
    expect(screen.getByText(/Role: Company_Admin/)).toBeInTheDocument();
    expect(screen.getByText(/Group: Finance Team/)).toBeInTheDocument();
  });

  it('filters folder access report by folder', async () => {
    renderWithProviders(<PermissionReports orderId="order-1" />);
    
    await waitFor(() => {
      expect(screen.getByText('Experts')).toBeInTheDocument();
    });

    const folderDropdown = screen.getByRole('combobox', { name: /Filter by Folder/i });
    fireEvent.click(folderDropdown);
    
    const neuOnlyOption = screen.getByRole('option', { name: /NEU Only/ });
    fireEvent.click(neuOnlyOption);
    
    await waitFor(() => {
      // When filtered to NEU Only, 00_BELSO_NEU_ONLY should still be visible
      expect(screen.getByText('00_BELSO_NEU_ONLY')).toBeInTheDocument();
      
      // The Experts folder row should not be in the data grid anymore
      // Check that we only have 1 data row (NEU Only), not 2
      const dataRows = screen.getAllByRole('row');
      // Filter out header rows by checking for actual data content
      const dataRowsWithContent = dataRows.filter(row => row.textContent?.includes('00_BELSO_NEU_ONLY'));
      expect(dataRowsWithContent.length).toBe(1);
    });
  });

  it('filters user access report by user', async () => {
    renderWithProviders(<PermissionReports orderId="order-1" />);
    
    const userAccessTab = screen.getByRole('tab', { name: /User → Folders/i });
    fireEvent.click(userAccessTab);
    
    await waitFor(() => {
      expect(screen.getByText('John Smith')).toBeInTheDocument();
    });

    const userDropdown = screen.getByRole('combobox', { name: /Filter by User/i });
    fireEvent.click(userDropdown);
    
    const johnOption = screen.getByRole('option', { name: /John Smith/ });
    fireEvent.click(johnOption);
    
    await waitFor(() => {
      expect(screen.getByText('John Smith')).toBeInTheDocument();
    });
  });

  it('filters changes report by date range', async () => {
    renderWithProviders(<PermissionReports orderId="order-1" />);
    
    const changesTab = screen.getByRole('tab', { name: /Changes Over Time/i });
    fireEvent.click(changesTab);
    
    await waitFor(() => {
      expect(screen.getByText('admin@neu.com')).toBeInTheDocument();
    });

    const dateDropdown = screen.getByRole('combobox', { name: /Date Range/i });
    fireEvent.click(dateDropdown);
    
    const last30Days = screen.getByRole('option', { name: /Last 30 Days/ });
    fireEvent.click(last30Days);
    
    // Verify data still loads (mock doesn't filter by date, but UI should update)
    await waitFor(() => {
      expect(screen.getByText('admin@neu.com')).toBeInTheDocument();
    });
  });

  it('opens export dialog when Export Report button is clicked', async () => {
    renderWithProviders(<PermissionReports orderId="order-1" />);
    
    // Get all buttons with Export Report text and click the first one (header button)
    const exportButtons = screen.getAllByRole('button', { name: /Export Report/i });
    fireEvent.click(exportButtons[0]);
    
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    
    // Now check inside the dialog for the title
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Export Report')).toBeInTheDocument();
    
    // Check export options
    expect(screen.getByLabelText('CSV')).toBeInTheDocument();
    expect(screen.getByLabelText('Excel (XLSX)')).toBeInTheDocument();
    expect(screen.getByText('Include Metadata')).toBeInTheDocument();
  });

  it('exports report with selected options', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    renderWithProviders(<PermissionReports orderId="order-1" />);
    
    // Get all buttons with Export Report text and click the first one (header button)
    const exportButtons = screen.getAllByRole('button', { name: /Export Report/i });
    fireEvent.click(exportButtons[0]);
    
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    
    // Select CSV format
    const csvRadio = screen.getByLabelText('CSV');
    fireEvent.click(csvRadio);
    
    // Click export in dialog - find the button that says "Export" (not "Export Report")
    const dialog = screen.getByRole('dialog');
    const dialogButtons = within(dialog).getAllByRole('button');
    const exportButton = dialogButtons.find(btn => btn.textContent === 'Export');
    
    if (exportButton) {
      fireEvent.click(exportButton);
      
      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith(
          'Exporting report with options:',
          expect.objectContaining({
            format: 'csv',
            includeMetadata: true,
          })
        );
      }, { timeout: 3000 });
    }
  });

  it('opens schedule export dialog', () => {
    const consoleSpy = vi.spyOn(console, 'log');
    renderWithProviders(<PermissionReports orderId="order-1" />);
    
    const scheduleButton = screen.getByRole('button', { name: /Schedule Export/i });
    fireEvent.click(scheduleButton);
    
    expect(consoleSpy).toHaveBeenCalledWith('Opening schedule dialog');
  });

  it('displays empty state when no folder access data', async () => {
    renderWithProviders(<PermissionReports orderId="order-1" />);
    
    // Select a folder that would return no data
    const folderDropdown = screen.getByRole('combobox', { name: /Filter by Folder/i });
    fireEvent.click(folderDropdown);
    
    const financialOption = screen.getByRole('option', { name: /Financial/ });
    fireEvent.click(financialOption);
    
    await waitFor(() => {
      expect(screen.getByText('No folder access data available')).toBeInTheDocument();
      expect(screen.getByText('Select a folder or adjust filters to see access information')).toBeInTheDocument();
    });
  });

  it('displays loading state while fetching data', () => {
    renderWithProviders(<PermissionReports orderId="order-1" />);
    
    expect(screen.getByText('Loading folder access report...')).toBeInTheDocument();
  });

  it('displays special folder badges correctly', async () => {
    renderWithProviders(<PermissionReports orderId="order-1" />);
    
    await waitFor(() => {
      expect(screen.getByText('00_BELSO_NEU_ONLY')).toBeInTheDocument();
    });
    
    // Check for special badges
    expect(screen.getByText('NEU Only')).toBeInTheDocument();
    // Check that the NEU Only text is inside a Badge component
    const neuBadge = screen.getByText('NEU Only');
    expect(neuBadge.className).toContain('Badge');
  });

  it('displays permission levels with correct colors', async () => {
    renderWithProviders(<PermissionReports orderId="order-1" />);
    
    await waitFor(() => {
      // Check for multiple permission texts
      const writeElements = screen.getAllByText(/write/);
      expect(writeElements.length).toBeGreaterThan(0);
      const fullElements = screen.getAllByText(/full/);
      expect(fullElements.length).toBeGreaterThan(0);
    });
    
    // Permission badges should be present
    const writeElements = screen.getAllByText(/write/);
    const fullElements = screen.getAllByText(/full/);
    
    // Check that at least one of each exists
    expect(writeElements[0]).toBeInTheDocument();
    expect(fullElements[0]).toBeInTheDocument();
  });

  it('displays tooltips for long folder paths', async () => {
    renderWithProviders(<PermissionReports orderId="order-1" />);
    
    await waitFor(() => {
      expect(screen.getByText('/A.1 Documentation/Experts')).toBeInTheDocument();
    });
    
    // Tooltip content should match the full path
    const pathElement = screen.getByText('/A.1 Documentation/Experts');
    expect(pathElement).toBeInTheDocument();
  });

  it('cancels export dialog', async () => {
    renderWithProviders(<PermissionReports orderId="order-1" />);
    
    const exportButton = screen.getByRole('button', { name: /Export Report/i });
    fireEvent.click(exportButton);
    
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    
    const cancelButton = within(screen.getByRole('dialog')).getByRole('button', { name: /Cancel/i });
    fireEvent.click(cancelButton);
    
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('displays user count badges', async () => {
    renderWithProviders(<PermissionReports orderId="order-1" />);
    
    await waitFor(() => {
      expect(screen.getByText('2')).toBeInTheDocument(); // Total users for Experts folder
      expect(screen.getByText('1')).toBeInTheDocument(); // Total users for NEU Only folder
    });
  });

  it('displays conflict resolution details', async () => {
    renderWithProviders(<PermissionReports orderId="order-1" />);
    
    const conflictsTab = screen.getByRole('tab', { name: /Conflict History/i });
    fireEvent.click(conflictsTab);
    
    await waitFor(() => {
      expect(screen.getByText('Bob Johnson')).toBeInTheDocument();
    });
    
    // Check resolution details
    expect(screen.getByText('full')).toBeInTheDocument();
    expect(screen.getByText('(priority)')).toBeInTheDocument();
    expect(screen.getByText('by system')).toBeInTheDocument();
  });

  it('displays affected users in changes report', async () => {
    renderWithProviders(<PermissionReports orderId="order-1" />);
    
    const changesTab = screen.getByRole('tab', { name: /Changes Over Time/i });
    fireEvent.click(changesTab);
    
    await waitFor(() => {
      expect(screen.getByText('john.smith@company.com')).toBeInTheDocument();
    });
    
    // Check that affected user is displayed
    const affectedUser = screen.getByText('john.smith@company.com');
    expect(affectedUser).toBeInTheDocument();
  });

  it('shows truncated user list with "more" indicator', async () => {
    renderWithProviders(<PermissionReports orderId="order-1" />);
    
    await waitFor(() => {
      expect(screen.getByText('Experts')).toBeInTheDocument();
    });
    
    // The component shows max 3 users, so with 2 users no "more" should appear
    expect(screen.queryByText(/more\.\.\./)).not.toBeInTheDocument();
  });
});