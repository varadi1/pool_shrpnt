import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { BrowserRouter } from 'react-router-dom';
import Contracts from '../Contracts';
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
    getUserContracts: vi.fn()
  }
}));
vi.mock('../../hooks/useAuth');

const mockContracts: Contract[] = [
  {
    id: 1,
    contractNumber: 'C001',
    name: 'Admin Visible Contract',
    clientName: 'Client A',
    status: 'active',
    startDate: '2025-01-01',
    endDate: '2025-12-31',
    pmName: 'John Doe',
    pmId: 'user-123',
    totalValue: 100000,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z'
  },
  {
    id: 2,
    contractNumber: 'C002',
    name: 'PM Assigned Contract',
    clientName: 'Client B',
    status: 'active',
    startDate: '2025-01-01',
    endDate: '2025-12-31',
    pmName: 'Jane PM',
    pmId: 'pm-456',
    totalValue: 150000,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z'
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

describe.skip('Contracts Page - Role-Based Access Control', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('NEU_Admin role', () => {
    beforeEach(() => {
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
        getAccessToken: vi.fn()
      });
    });

    it('should show all contracts for NEU_Admin', async () => {
      vi.mocked(contractsApi.getAll).mockResolvedValue({
        items: mockContracts,
        total: mockContracts.length,
        page: 1,
        pageSize: 10,
        totalPages: 1
      });

      renderContractsPage();

      await waitFor(() => {
        // Should see all contracts
        expect(screen.getByText('Admin Visible Contract')).toBeInTheDocument();
        expect(screen.getByText('PM Assigned Contract')).toBeInTheDocument();
      });

      // Verify API was called without PM filter
      expect(contractsApi.getAll).toHaveBeenCalledWith(
        expect.objectContaining({
          pmId: undefined // No PM filter for admin
        }), 1, 25)
      );
    });

    it('should show create/edit/delete actions for NEU_Admin', async () => {
      vi.mocked(contractsApi.getAll).mockResolvedValue({
        items: mockContracts,
        total: mockContracts.length,
        page: 1,
        pageSize: 10,
        totalPages: 1
      });

      renderContractsPage();

      await waitFor(() => {
        // Should show New Contract button
        expect(screen.getByRole('button', { name: /new contract/i })).toBeInTheDocument();
        
        // Should show edit buttons for each contract
        const editButtons = screen.getAllByRole('button', { name: /edit/i });
        expect(editButtons).toHaveLength(mockContracts.length);
        
        // Should show delete buttons for each contract  
        const deleteButtons = screen.getAllByRole('button', { name: /delete/i });
        expect(deleteButtons).toHaveLength(mockContracts.length);
      });
    });

    it('should allow NEU_Admin to create new contract', async () => {
      vi.mocked(contractsApi.getAll).mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        pageSize: 10,
        totalPages: 0
      });

      vi.mocked(contractsApi.create).mockResolvedValue({
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
      });

      renderContractsPage();

      await waitFor(() => {
        const newButton = screen.getByRole('button', { name: /new contract/i });
        expect(newButton).toBeInTheDocument();
      });

      // Click new contract button
      const newButton = screen.getByRole('button', { name: /new contract/i });
      await userEvent.click(newButton);

      // Form should open
      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(screen.getByLabelText(/contract number/i)).toBeInTheDocument();
      });
    });
  });

  describe('PM role', () => {
    const pmUserId = 'pm-456';

    beforeEach(() => {
      vi.mocked(useAuth).mockReturnValue({
        user: {
          id: pmUserId,
          email: 'pm@example.com',
          name: 'Jane PM',
          roles: ['PM']
        },
        isAuthenticated: true,
        isLoading: false,
        login: vi.fn(),
        logout: vi.fn(),
        getAccessToken: vi.fn()
      });
    });

    it('should filter contracts by PM assignment', async () => {
      // Only return contracts assigned to this PM
      const pmContracts = mockContracts.filter(c => c.pmId === pmUserId);
      
      vi.mocked(contractsApi.getAll).mockResolvedValue({
        items: pmContracts,
        total: pmContracts.length,
        page: 1,
        pageSize: 10,
        totalPages: 1
      });

      renderContractsPage();

      await waitFor(() => {
        // Should only see PM's assigned contract
        expect(screen.getByText('PM Assigned Contract')).toBeInTheDocument();
        expect(screen.queryByText('Admin Visible Contract')).not.toBeInTheDocument();
      });

      // Verify API was called with PM filter
      expect(contractsApi.getAll).toHaveBeenCalledWith(
        expect.objectContaining({
          pmId: pmUserId
        }), 1, 25)
      );
    });

    it('should hide edit/delete for non-admin users', async () => {
      const pmContracts = mockContracts.filter(c => c.pmId === pmUserId);
      
      vi.mocked(contractsApi.getAll).mockResolvedValue({
        items: pmContracts,
        total: pmContracts.length,
        page: 1,
        pageSize: 10,
        totalPages: 1
      });

      renderContractsPage();

      await waitFor(() => {
        // Should NOT show New Contract button
        expect(screen.queryByRole('button', { name: /new contract/i })).not.toBeInTheDocument();
        
        // Should still show view buttons
        const viewButtons = screen.getAllByRole('button', { name: /view/i });
        expect(viewButtons).toHaveLength(pmContracts.length);
        
        // Should NOT show edit buttons
        expect(screen.queryByRole('button', { name: /edit/i })).not.toBeInTheDocument();
        
        // Should NOT show delete buttons
        expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();
      });
    });

    it('should allow PM to view contract details', async () => {
      const pmContracts = mockContracts.filter(c => c.pmId === pmUserId);
      
      vi.mocked(contractsApi.getAll).mockResolvedValue({
        items: pmContracts,
        total: pmContracts.length,
        page: 1,
        pageSize: 10,
        totalPages: 1
      });

      vi.mocked(contractsApi.getById).mockResolvedValue(pmContracts[0]);

      renderContractsPage();

      await waitFor(() => {
        const viewButton = screen.getByRole('button', { name: /view/i });
        expect(viewButton).toBeInTheDocument();
      });

      // Click view button
      const viewButton = screen.getByRole('button', { name: /view/i });
      await userEvent.click(viewButton);

      // Should open detail view
      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(screen.getByText('C002')).toBeInTheDocument();
      });
    });
  });

  describe('Mixed roles', () => {
    it('should handle users with multiple roles correctly', async () => {
      // User with both NEU_Admin and PM roles
      vi.mocked(useAuth).mockReturnValue({
        user: {
          id: 'multi-role-user',
          email: 'multi@example.com',
          name: 'Multi Role User',
          roles: ['NEU_Admin', 'PM', 'Observer']
        },
        isAuthenticated: true,
        isLoading: false,
        login: vi.fn(),
        logout: vi.fn(),
        getAccessToken: vi.fn()
      });

      vi.mocked(contractsApi.getAll).mockResolvedValue({
        items: mockContracts,
        total: mockContracts.length,
        page: 1,
        pageSize: 10,
        totalPages: 1
      });

      renderContractsPage();

      await waitFor(() => {
        // Should have admin privileges (NEU_Admin takes precedence)
        expect(screen.getByRole('button', { name: /new contract/i })).toBeInTheDocument();
        
        // Should see all contracts (admin privilege)
        expect(screen.getByText('Admin Visible Contract')).toBeInTheDocument();
        expect(screen.getByText('PM Assigned Contract')).toBeInTheDocument();
        
        // Should have edit/delete buttons
        const editButtons = screen.getAllByRole('button', { name: /edit/i });
        expect(editButtons).toHaveLength(mockContracts.length);
      });
    });
  });

  describe('Unauthorized access', () => {
    it('should handle unauthenticated users', async () => {
      vi.mocked(useAuth).mockReturnValue({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        login: vi.fn(),
        logout: vi.fn(),
        getAccessToken: vi.fn()
      });

      renderContractsPage();

      await waitFor(() => {
        // Should show unauthorized message or redirect
        expect(screen.getByText(/unauthorized|please log in/i)).toBeInTheDocument();
      });

      // Should not call API
      expect(contractsApi.getAll).not.toHaveBeenCalled();
    });

    it('should handle users with no roles', async () => {
      vi.mocked(useAuth).mockReturnValue({
        user: {
          id: 'no-role-user',
          email: 'norole@example.com',
          name: 'No Role User',
          roles: []
        },
        isAuthenticated: true,
        isLoading: false,
        login: vi.fn(),
        logout: vi.fn(),
        getAccessToken: vi.fn()
      });

      vi.mocked(contractsApi.getAll).mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        pageSize: 10,
        totalPages: 0
      });

      renderContractsPage();

      await waitFor(() => {
        // Should show empty state
        expect(screen.getByText(/no contracts found/i)).toBeInTheDocument();
        
        // Should not show admin actions
        expect(screen.queryByRole('button', { name: /new contract/i })).not.toBeInTheDocument();
      });
    });
  });

  describe('Permission-based UI elements', () => {
    it('should show export button for all authenticated users', async () => {
      // Test with PM role
      vi.mocked(useAuth).mockReturnValue({
        user: {
          id: 'pm-user',
          email: 'pm@example.com',
          name: 'PM User',
          roles: ['PM']
        },
        isAuthenticated: true,
        isLoading: false,
        login: vi.fn(),
        logout: vi.fn(),
        getAccessToken: vi.fn()
      });

      vi.mocked(contractsApi.getAll).mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        pageSize: 10,
        totalPages: 0
      });

      renderContractsPage();

      await waitFor(() => {
        // Export should be available to all authenticated users
        expect(screen.getByRole('button', { name: /export/i })).toBeInTheDocument();
      });
    });

    it('should disable actions during loading', async () => {
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
        getAccessToken: vi.fn()
      });

      // Mock a slow API response
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

      // During loading, action buttons should be disabled
      expect(screen.getByRole('button', { name: /new contract/i })).toBeDisabled();
      expect(screen.getByRole('button', { name: /export/i })).toBeDisabled();

      await waitFor(() => {
        // After loading, buttons should be enabled
        expect(screen.getByRole('button', { name: /new contract/i })).not.toBeDisabled();
        expect(screen.getByRole('button', { name: /export/i })).not.toBeDisabled();
      });
    });
  });
});