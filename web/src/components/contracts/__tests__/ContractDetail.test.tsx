import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { ContractDetail } from '../ContractDetail';
import { Contract } from '../../../types/contracts';
import { contractsApi } from '../../../services/api/contracts';

// Mock the contracts API
vi.mock('../../../services/api/contracts', () => ({
  contractsApi: {
    getAll: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    getUserContracts: vi.fn()
  }
}));

const mockContract: Contract = {
  id: 1,
  contractNumber: 'C001',
  name: 'Test Contract',
  description: 'This is a test contract description',
  clientName: 'Test Client',
  status: 'active',
  startDate: '2025-01-01',
  endDate: '2025-12-31',
  pmName: 'John Doe',
  totalValue: 150000,
  createdAt: '2025-01-01T10:00:00Z',
  updatedAt: '2025-01-15T14:30:00Z',
  createdBy: 'admin@example.com',
  updatedBy: 'manager@example.com'
};

const mockOnClose = vi.fn();
const mockOnEdit = vi.fn();
const mockOnDelete = vi.fn();

const createQueryClient = () => new QueryClient({
  defaultOptions: {
    queries: { retry: false },
    mutations: { retry: false }
  }
});

const renderContractDetail = (props = {}) => {
  const queryClient = createQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <FluentProvider theme={webLightTheme}>
        <ContractDetail
          contractId={mockContract.id}
          onClose={mockOnClose}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          canEdit={true}
          canDelete={true}
          {...props}
        />
      </FluentProvider>
    </QueryClientProvider>
  );
};

describe('ContractDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(contractsApi.getById).mockResolvedValue(mockContract);
  });

  it('should display all contract fields', async () => {
    renderContractDetail();
    
    await waitFor(() => {
      // Basic fields
      expect(screen.getByText('C001')).toBeInTheDocument();
      expect(screen.getByText('Test Contract')).toBeInTheDocument();
      expect(screen.getByText('This is a test contract description')).toBeInTheDocument();
      expect(screen.getByText('Test Client')).toBeInTheDocument();
      expect(screen.getByText('John Doe')).toBeInTheDocument();
      
      // Status badge
      expect(screen.getByText('active')).toBeInTheDocument();
      
      // Formatted dates
      expect(screen.getByText('01/01/2025')).toBeInTheDocument();
      expect(screen.getByText('12/31/2025')).toBeInTheDocument();
      
      // Formatted currency
      expect(screen.getByText('$150,000.00')).toBeInTheDocument();
    });
  });

  it('should show loading state while fetching', () => {
    // Mock a delayed response
    vi.mocked(contractsApi.getById).mockImplementation(
      () => new Promise(resolve => setTimeout(() => resolve(mockContract), 100))
    );
    
    renderContractDetail();
    
    // Should show loading spinner
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    expect(screen.getByText(/loading contract details/i)).toBeInTheDocument();
  });

  it('should handle API errors gracefully', async () => {
    const error = new Error('Failed to fetch contract');
    vi.mocked(contractsApi.getById).mockRejectedValue(error);
    
    renderContractDetail();
    
    await waitFor(() => {
      expect(screen.getByText(/error loading contract/i)).toBeInTheDocument();
      expect(screen.getByText(/failed to fetch contract/i)).toBeInTheDocument();
    });
    
    // Should show retry button
    const retryButton = screen.getByRole('button', { name: /retry/i });
    expect(retryButton).toBeInTheDocument();
    
    // Test retry
    vi.mocked(contractsApi.getById).mockResolvedValue(mockContract);
    await userEvent.click(retryButton);
    
    await waitFor(() => {
      expect(screen.getByText('C001')).toBeInTheDocument();
    });
  });

  it('should show audit information', async () => {
    renderContractDetail();
    
    await waitFor(() => {
      // Check audit section exists
      expect(screen.getByText(/audit information/i)).toBeInTheDocument();
      
      // Created info
      expect(screen.getByText(/created:/i)).toBeInTheDocument();
      expect(screen.getByText('admin@example.com')).toBeInTheDocument();
      expect(screen.getByText(/01\/01\/2025.*10:00 AM/i)).toBeInTheDocument();
      
      // Updated info
      expect(screen.getByText(/updated:/i)).toBeInTheDocument();
      expect(screen.getByText('manager@example.com')).toBeInTheDocument();
      expect(screen.getByText(/01\/15\/2025.*2:30 PM/i)).toBeInTheDocument();
    });
  });

  it('should handle close/back navigation', async () => {
    renderContractDetail();
    
    await waitFor(() => {
      const closeButton = screen.getByRole('button', { name: /close/i });
      expect(closeButton).toBeInTheDocument();
    });
    
    const closeButton = screen.getByRole('button', { name: /close/i });
    await userEvent.click(closeButton);
    
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('should show edit button when user has permission', async () => {
    renderContractDetail({ canEdit: true });
    
    await waitFor(() => {
      const editButton = screen.getByRole('button', { name: /edit/i });
      expect(editButton).toBeInTheDocument();
    });
    
    const editButton = screen.getByRole('button', { name: /edit/i });
    await userEvent.click(editButton);
    
    expect(mockOnEdit).toHaveBeenCalledWith(mockContract);
  });

  it('should hide edit button when user lacks permission', async () => {
    renderContractDetail({ canEdit: false });
    
    await waitFor(() => {
      expect(screen.getByText('C001')).toBeInTheDocument();
    });
    
    const editButton = screen.queryByRole('button', { name: /edit/i });
    expect(editButton).not.toBeInTheDocument();
  });

  it('should show delete button when user has permission', async () => {
    renderContractDetail({ canDelete: true });
    
    await waitFor(() => {
      const deleteButton = screen.getByRole('button', { name: /delete/i });
      expect(deleteButton).toBeInTheDocument();
    });
    
    const deleteButton = screen.getByRole('button', { name: /delete/i });
    await userEvent.click(deleteButton);
    
    expect(mockOnDelete).toHaveBeenCalledWith(mockContract);
  });

  it('should hide delete button when user lacks permission', async () => {
    renderContractDetail({ canDelete: false });
    
    await waitFor(() => {
      expect(screen.getByText('C001')).toBeInTheDocument();
    });
    
    const deleteButton = screen.queryByRole('button', { name: /delete/i });
    expect(deleteButton).not.toBeInTheDocument();
  });

  it('should handle missing optional fields gracefully', async () => {
    const contractWithoutOptionalFields: Contract = {
      ...mockContract,
      description: undefined,
      endDate: undefined,
      pmName: undefined,
      totalValue: undefined,
      createdBy: undefined,
      updatedBy: undefined
    };
    
    vi.mocked(contractsApi.getById).mockResolvedValue(contractWithoutOptionalFields);
    
    renderContractDetail();
    
    await waitFor(() => {
      expect(screen.getByText('C001')).toBeInTheDocument();
      
      // Should show placeholders for missing fields
      expect(screen.getByText(/no description provided/i)).toBeInTheDocument();
      expect(screen.getByText(/no end date/i)).toBeInTheDocument();
      expect(screen.getByText(/no pm assigned/i)).toBeInTheDocument();
      expect(screen.getByText(/not specified/i)).toBeInTheDocument(); // for value
    });
  });

  it('should display different status colors correctly', async () => {
    // Test inactive status
    const inactiveContract = { ...mockContract, status: 'inactive' as const };
    vi.mocked(contractsApi.getById).mockResolvedValue(inactiveContract);
    
    const { rerender } = renderContractDetail();
    
    await waitFor(() => {
      const badge = screen.getByText('inactive');
      expect(badge).toHaveClass('fui-Badge__icon');
    });
    
    // Test expired status
    const expiredContract = { ...mockContract, status: 'expired' as const };
    vi.mocked(contractsApi.getById).mockResolvedValue(expiredContract);
    
    rerender(
      <QueryClientProvider client={createQueryClient()}>
        <FluentProvider theme={webLightTheme}>
          <ContractDetail
            contractId={mockContract.id}
            onClose={mockOnClose}
            onEdit={mockOnEdit}
            onDelete={mockOnDelete}
            canEdit={true}
            canDelete={true}
          />
        </FluentProvider>
      </QueryClientProvider>
    );
    
    await waitFor(() => {
      const badge = screen.getByText('expired');
      expect(badge).toHaveClass('fui-Badge__icon');
    });
  });

  it('should show related orders count when available', async () => {
    const contractWithOrders = {
      ...mockContract,
      relatedOrdersCount: 5
    };
    
    vi.mocked(contractsApi.getById).mockResolvedValue(contractWithOrders);
    
    renderContractDetail();
    
    await waitFor(() => {
      expect(screen.getByText(/related orders:/i)).toBeInTheDocument();
      expect(screen.getByText('5')).toBeInTheDocument();
    });
  });

  it('should format large currency values correctly', async () => {
    const contractWithLargeValue = {
      ...mockContract,
      totalValue: 1250000.50
    };
    
    vi.mocked(contractsApi.getById).mockResolvedValue(contractWithLargeValue);
    
    renderContractDetail();
    
    await waitFor(() => {
      expect(screen.getByText('$1,250,000.50')).toBeInTheDocument();
    });
  });
});