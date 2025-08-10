import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { BrowserRouter } from 'react-router-dom';
import '../../components/contracts/__tests__/setup.tsx'; // Import DataGrid mocks
import { Contracts } from '../Contracts';

// Mock ResizeObserver
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock matchMedia
global.matchMedia = vi.fn().mockImplementation(query => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: vi.fn(),
  removeListener: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn(),
}));
import { contractsApi } from '../../services/api/contracts';
import { useAuth } from '../../hooks/useAuth';
import { Contract } from '../../types/contracts';

// Mock modules
vi.mock('../../services/api/contracts', () => ({
  contractsApi: {
    getAll: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    getUserContracts: vi.fn(),
    getByPmId: vi.fn(),
    getActive: vi.fn(),
    exportToCsv: vi.fn()
  }
}));
vi.mock('../../hooks/useAuth');
vi.mock('../../components/common/ToastProvider', () => ({
  useToast: () => ({
    showToast: vi.fn(),
    showSuccess: vi.fn(),
    showWarning: vi.fn(),
    showInfo: vi.fn(),
    showError: vi.fn()
  })
}));
vi.mock('../../hooks/useContractStatusMonitor', () => ({
  useContractStatusMonitor: vi.fn()
}));

// Mock contract data
const mockContracts: Contract[] = [
  {
    id: 1,
    contractNumber: 'C001',
    name: 'Test Contract 1',
    description: 'Description for contract 1',
    clientName: 'Client Alpha',
    status: 'active',
    startDate: '2025-01-01',
    endDate: '2025-12-31',
    pmName: 'John Doe',
    pmId: 'pm-001',
    totalValue: 100000,
    createdAt: '2025-01-01T10:00:00Z',
    updatedAt: '2025-01-15T14:00:00Z',
    createdBy: 'admin@example.com',
    updatedBy: 'admin@example.com'
  },
  {
    id: 2,
    contractNumber: 'C002',
    name: 'Test Contract 2',
    description: 'Description for contract 2',
    clientName: 'Client Beta',
    status: 'inactive',
    startDate: '2024-01-01',
    endDate: '2024-12-31',
    pmName: 'Jane Smith',
    pmId: 'pm-002',
    totalValue: 150000,
    createdAt: '2024-01-01T10:00:00Z',
    updatedAt: '2024-06-15T14:00:00Z',
    createdBy: 'admin@example.com',
    updatedBy: 'manager@example.com'
  }
];

const createQueryClient = () => new QueryClient({
  defaultOptions: {
    queries: { retry: false },
    mutations: { retry: false }
  }
});

const renderContractsPage = () => {
  const queryClient = createQueryClient();
  return render(
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <FluentProvider theme={webLightTheme}>
          <Contracts />
        </FluentProvider>
      </QueryClientProvider>
    </BrowserRouter>
  );
};

describe('Contracts Page - Integration Tests', () => {
  // Increase timeout for integration tests
  vi.setConfig({ testTimeout: 10000 });
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    
    // Mock authenticated admin user by default
    vi.mocked(useAuth).mockReturnValue({
      user: {
        id: 'admin-001',
        email: 'admin@example.com',
        name: 'Admin User',
        roles: ['NEU_Admin']
      },
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      getAccessToken: vi.fn(),
      userRoles: ['NEU_Admin'],
      hasRole: vi.fn((role) => role === 'NEU_Admin'),
      hasAnyRole: vi.fn((roles) => roles.includes('NEU_Admin')),
      isAdmin: vi.fn(() => true),
      isPM: vi.fn(() => false)
    });

    // Default mock responses
    vi.mocked(contractsApi.getAll).mockResolvedValue({
      items: mockContracts,
      total: mockContracts.length,
      page: 1,
      pageSize: 10,
      totalPages: 1
    });
    
    // Mock exportToCsv to avoid DOM manipulation in tests
    vi.mocked(contractsApi.exportToCsv).mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Complete User Workflow', () => {
    it('should handle complete CRUD workflow', async () => {
      const user = userEvent.setup({ delay: null });
      renderContractsPage();

      // 1. View initial contracts
      await waitFor(() => {
        expect(screen.getByText('C001')).toBeInTheDocument();
        expect(screen.getByText('C002')).toBeInTheDocument();
      });

      // 2. Filter contracts
      const searchInput = screen.getByPlaceholderText(/search contracts/i);
      await user.type(searchInput, 'Alpha');
      
      vi.advanceTimersByTime(300); // Debounce

      // Mock filtered response
      vi.mocked(contractsApi.getAll).mockResolvedValue({
        items: [mockContracts[0]],
        total: 1,
        page: 1,
        pageSize: 10,
        totalPages: 1
      });

      await waitFor(() => {
        expect(screen.getByText('C001')).toBeInTheDocument();
        expect(screen.queryByText('C002')).not.toBeInTheDocument();
      });

      // 3. View contract details
      vi.mocked(contractsApi.getById).mockResolvedValue(mockContracts[0]);
      
      const viewButton = screen.getByRole('button', { name: /view/i });
      await user.click(viewButton);

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(screen.getByText('Description for contract 1')).toBeInTheDocument();
      });

      // Close detail view
      const closeButton = screen.getByRole('button', { name: /close/i });
      await user.click(closeButton);

      // 4. Create new contract
      const newContract: Contract = {
        id: 3,
        contractNumber: 'C003',
        name: 'New Contract',
        clientName: 'New Client',
        status: 'active',
        startDate: '2025-02-01',
        endDate: '2025-12-31',
        totalValue: 200000,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      vi.mocked(contractsApi.create).mockResolvedValue(newContract);

      const newButton = screen.getByRole('button', { name: /new contract/i });
      await user.click(newButton);

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      // Fill the form
      const numberInput = screen.getByLabelText(/contract number/i);
      const nameInput = screen.getByLabelText(/contract name/i);
      const clientInput = screen.getByLabelText(/client name/i);
      const startDateInput = screen.getByLabelText(/start date/i);
      
      await user.type(numberInput, 'C003');
      await user.type(nameInput, 'New Contract');
      await user.type(clientInput, 'New Client');
      await user.type(startDateInput, '2025-02-01');

      const saveButton = screen.getByRole('button', { name: /save/i });
      await user.click(saveButton);

      // Mock updated list with new contract
      vi.mocked(contractsApi.getAll).mockResolvedValue({
        items: [...mockContracts, newContract],
        total: 3,
        page: 1,
        pageSize: 10,
        totalPages: 1
      });

      await waitFor(() => {
        expect(screen.getByText('C003')).toBeInTheDocument();
      });

      // 5. Edit contract
      const updatedContract = { ...mockContracts[0], name: 'Updated Contract' };
      vi.mocked(contractsApi.update).mockResolvedValue(updatedContract);

      const firstRow = screen.getByText('C001').closest('tr');
      const editButton = within(firstRow!).getByRole('button', { name: /edit/i });
      await user.click(editButton);

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      const editNameInput = screen.getByLabelText(/contract name/i);
      await user.clear(editNameInput);
      await user.type(editNameInput, 'Updated Contract');

      const updateButton = screen.getByRole('button', { name: /save/i });
      await user.click(updateButton);

      // Mock updated response
      vi.mocked(contractsApi.getAll).mockResolvedValue({
        items: [updatedContract, mockContracts[1], newContract],
        total: 3,
        page: 1,
        pageSize: 10,
        totalPages: 1
      });

      await waitFor(() => {
        expect(screen.getByText('Updated Contract')).toBeInTheDocument();
      });

      // 6. Delete contract
      vi.mocked(contractsApi.delete).mockResolvedValue(undefined);

      const deleteRow = screen.getByText('C002').closest('tr');
      const deleteButton = within(deleteRow!).getByRole('button', { name: /delete/i });
      await user.click(deleteButton);

      // Confirm deletion
      await waitFor(() => {
        expect(screen.getByText(/are you sure/i)).toBeInTheDocument();
      });

      const confirmButton = screen.getByRole('button', { name: /confirm/i });
      await user.click(confirmButton);

      // Mock response without deleted contract
      vi.mocked(contractsApi.getAll).mockResolvedValue({
        items: [updatedContract, newContract],
        total: 2,
        page: 1,
        pageSize: 10,
        totalPages: 1
      });

      await waitFor(() => {
        expect(screen.queryByText('C002')).not.toBeInTheDocument();
      });
    });
  });

  describe('Pagination Integration', () => {
    it('should handle pagination with filtering', async () => {
      const user = userEvent.setup();
      
      // Create many contracts for pagination
      const manyContracts = Array.from({ length: 35 }, (_, i) => ({
        id: i + 1,
        contractNumber: `C${String(i + 1).padStart(3, '0')}`,
        name: `Contract ${i + 1}`,
        clientName: i % 2 === 0 ? 'Client Alpha' : 'Client Beta',
        status: 'active' as const,
        startDate: '2025-01-01',
        endDate: '2025-12-31',
        pmName: 'John Doe',
        totalValue: 100000 + i * 1000,
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z'
      }));

      // Mock first page
      vi.mocked(contractsApi.getAll).mockResolvedValue({
        items: manyContracts.slice(0, 10),
        total: manyContracts.length,
        page: 1,
        pageSize: 10,
        totalPages: 4
      });

      renderContractsPage();

      await waitFor(() => {
        expect(screen.getByText('C001')).toBeInTheDocument();
        expect(screen.getByText('1-10 of 35')).toBeInTheDocument();
      });

      // Navigate to page 2
      vi.mocked(contractsApi.getAll).mockResolvedValue({
        items: manyContracts.slice(10, 20),
        total: manyContracts.length,
        page: 2,
        pageSize: 10,
        totalPages: 4
      });

      const nextButton = screen.getByRole('button', { name: /next/i });
      await user.click(nextButton);

      await waitFor(() => {
        expect(screen.getByText('C011')).toBeInTheDocument();
        expect(screen.getByText('11-20 of 35')).toBeInTheDocument();
      });

      // Apply filter
      const clientFilter = screen.getByPlaceholderText(/filter by client/i);
      await user.type(clientFilter, 'Alpha');

      vi.advanceTimersByTime(300); // Debounce

      const alphaContracts = manyContracts.filter(c => c.clientName.includes('Alpha'));
      vi.mocked(contractsApi.getAll).mockResolvedValue({
        items: alphaContracts.slice(0, 10),
        total: alphaContracts.length,
        page: 1,
        pageSize: 10,
        totalPages: Math.ceil(alphaContracts.length / 10)
      });

      await waitFor(() => {
        expect(screen.getByText('1-10 of 18')).toBeInTheDocument();
      });

      // Change page size
      const pageSizeSelector = screen.getByRole('combobox', { name: /items per page/i });
      await user.selectOptions(pageSizeSelector, '25');

      vi.mocked(contractsApi.getAll).mockResolvedValue({
        items: alphaContracts.slice(0, 18),
        total: alphaContracts.length,
        page: 1,
        pageSize: 25,
        totalPages: 1
      });

      await waitFor(() => {
        expect(screen.getByText('1-18 of 18')).toBeInTheDocument();
      });
    });
  });

  describe('Real-time Updates', () => {
    it('should detect and notify status changes', async () => {
      renderContractsPage();

      await waitFor(() => {
        expect(screen.getByText('C001')).toBeInTheDocument();
      });

      // Simulate status change after polling interval
      vi.advanceTimersByTime(5 * 60 * 1000); // 5 minutes

      const updatedContracts = [
        { ...mockContracts[0], status: 'expired' as const }, // Changed status
        mockContracts[1]
      ];

      vi.mocked(contractsApi.getAll).mockResolvedValue({
        items: updatedContracts,
        total: updatedContracts.length,
        page: 1,
        pageSize: 10,
        totalPages: 1
      });

      // Wait for polling to occur
      await waitFor(() => {
        // Should show notification about status change
        expect(screen.getByText(/contract c001 status changed/i)).toBeInTheDocument();
      });

      // Contract should show new status
      const contractRow = screen.getByText('C001').closest('tr');
      expect(within(contractRow!).getByText('expired')).toBeInTheDocument();
    });

    it('should handle automatic expiry detection', async () => {
      // Set system time to before contract end date
      const currentDate = new Date('2025-12-30');
      vi.setSystemTime(currentDate);

      renderContractsPage();

      await waitFor(() => {
        expect(screen.getByText('C001')).toBeInTheDocument();
      });

      // Move time forward past contract end date
      const futureDate = new Date('2026-01-02');
      vi.setSystemTime(futureDate);
      vi.advanceTimersByTime(5 * 60 * 1000); // Trigger polling

      const expiredContracts = [
        { ...mockContracts[0], status: 'expired' as const },
        mockContracts[1]
      ];

      vi.mocked(contractsApi.getAll).mockResolvedValue({
        items: expiredContracts,
        total: expiredContracts.length,
        page: 1,
        pageSize: 10,
        totalPages: 1
      });

      await waitFor(() => {
        expect(screen.getByText(/contract c001 has expired/i)).toBeInTheDocument();
      });
    });
  });

  describe('Complex Filtering Scenarios', () => {
    it('should handle multiple filters simultaneously', async () => {
      const user = userEvent.setup({ delay: null });
      
      // Create diverse contracts
      const diverseContracts: Contract[] = [
        {
          ...mockContracts[0],
          status: 'active',
          clientName: 'Alpha Corp',
          startDate: '2025-01-01',
          endDate: '2025-06-30'
        },
        {
          ...mockContracts[1],
          id: 2,
          contractNumber: 'C002',
          status: 'active',
          clientName: 'Beta Inc',
          startDate: '2025-02-01',
          endDate: '2025-12-31'
        },
        {
          id: 3,
          contractNumber: 'C003',
          name: 'Special Contract',
          status: 'inactive',
          clientName: 'Alpha Corp',
          startDate: '2024-01-01',
          endDate: '2024-12-31',
          pmName: 'John Doe',
          totalValue: 75000,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z'
        }
      ];

      vi.mocked(contractsApi.getAll).mockResolvedValue({
        items: diverseContracts,
        total: diverseContracts.length,
        page: 1,
        pageSize: 10,
        totalPages: 1
      });

      renderContractsPage();

      await waitFor(() => {
        expect(screen.getByText('C001')).toBeInTheDocument();
        expect(screen.getByText('C002')).toBeInTheDocument();
        expect(screen.getByText('C003')).toBeInTheDocument();
      });

      // Apply multiple filters
      // 1. Status filter
      const statusDropdown = screen.getByRole('combobox', { name: /status/i });
      await user.selectOptions(statusDropdown, 'active');

      // 2. Client filter
      const clientInput = screen.getByPlaceholderText(/filter by client/i);
      await user.type(clientInput, 'Alpha');

      // 3. Date range filter
      const startDateInput = screen.getByLabelText(/start date/i);
      await user.type(startDateInput, '2025-01-01');

      vi.advanceTimersByTime(300); // Debounce

      // Mock filtered response
      vi.mocked(contractsApi.getAll).mockResolvedValue({
        items: [diverseContracts[0]], // Only C001 matches all filters
        total: 1,
        page: 1,
        pageSize: 10,
        totalPages: 1
      });

      await waitFor(() => {
        expect(screen.getByText('C001')).toBeInTheDocument();
        expect(screen.queryByText('C002')).not.toBeInTheDocument();
        expect(screen.queryByText('C003')).not.toBeInTheDocument();
      });

      // Clear filters
      const clearButton = screen.getByRole('button', { name: /clear.*filters/i });
      await user.click(clearButton);

      // Mock unfiltered response
      vi.mocked(contractsApi.getAll).mockResolvedValue({
        items: diverseContracts,
        total: diverseContracts.length,
        page: 1,
        pageSize: 10,
        totalPages: 1
      });

      await waitFor(() => {
        expect(screen.getByText('C001')).toBeInTheDocument();
        expect(screen.getByText('C002')).toBeInTheDocument();
        expect(screen.getByText('C003')).toBeInTheDocument();
      });
    });
  });

  describe('Performance and Loading States', () => {
    it('should show appropriate loading states during operations', async () => {
      const user = userEvent.setup();
      
      // Delay initial load
      vi.mocked(contractsApi.getAll).mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve({
          items: mockContracts,
          total: mockContracts.length,
          page: 1,
          pageSize: 10,
          totalPages: 1
        }), 100))
      );

      renderContractsPage();

      // Should show loading skeleton
      expect(screen.getAllByTestId('skeleton-row')).toHaveLength(5);

      // Wait for data
      await waitFor(() => {
        expect(screen.getByText('C001')).toBeInTheDocument();
      });

      // Trigger refresh with loading state
      const refreshButton = screen.getByRole('button', { name: /refresh/i });
      
      // Mock slow refresh
      vi.mocked(contractsApi.getAll).mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve({
          items: mockContracts,
          total: mockContracts.length,
          page: 1,
          pageSize: 10,
          totalPages: 1
        }), 500))
      );

      await user.click(refreshButton);

      // Button should show loading state
      expect(refreshButton).toHaveAttribute('aria-busy', 'true');

      // Data should remain visible during refresh
      expect(screen.getByText('C001')).toBeInTheDocument();

      // Wait for refresh to complete
      await waitFor(() => {
        expect(refreshButton).not.toHaveAttribute('aria-busy', 'true');
      });
    });
  });

  describe('Export with Filters', () => {
    it('should export filtered data correctly', async () => {
      const user = userEvent.setup({ delay: null });
      
      // Mock download elements
      const mockClick = vi.fn();
      const mockRemove = vi.fn();
      global.document.createElement = vi.fn((tagName) => {
        if (tagName === 'a') {
          return {
            href: '',
            download: '',
            click: mockClick,
            remove: mockRemove,
            style: {}
          } as any;
        }
        return document.createElement(tagName);
      });
      global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
      global.URL.revokeObjectURL = vi.fn();

      renderContractsPage();

      await waitFor(() => {
        expect(screen.getByText('C001')).toBeInTheDocument();
      });

      // Apply filter
      const statusDropdown = screen.getByRole('combobox', { name: /status/i });
      await user.selectOptions(statusDropdown, 'active');

      const activeContracts = mockContracts.filter(c => c.status === 'active');
      vi.mocked(contractsApi.getAll).mockResolvedValue({
        items: activeContracts,
        total: activeContracts.length,
        page: 1,
        pageSize: 10,
        totalPages: 1
      });

      await waitFor(() => {
        expect(screen.queryByText('C002')).not.toBeInTheDocument();
      });

      // Export filtered data
      const exportButton = screen.getByRole('button', { name: /export/i });
      await user.click(exportButton);

      // Verify export was triggered
      expect(mockClick).toHaveBeenCalled();

      // Check CSV content
      const createObjectURLCall = vi.mocked(URL.createObjectURL).mock.calls[0];
      const blob = createObjectURLCall[0] as Blob;
      const csvContent = await blob.text();

      // Should only contain active contract
      expect(csvContent).toContain('C001');
      expect(csvContent).not.toContain('C002');
    });
  });
});