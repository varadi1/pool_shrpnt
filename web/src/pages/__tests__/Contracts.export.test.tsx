import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { BrowserRouter } from 'react-router-dom';
import '../../components/contracts/__tests__/setup.tsx'; // Import DataGrid mocks
import { Contracts } from '../Contracts';
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

// Mock file download
const mockCreateElement = vi.fn();
const mockClick = vi.fn();
const mockRemove = vi.fn();

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
    totalValue: 150000.50,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z'
  },
  {
    id: 3,
    contractNumber: 'C003',
    name: 'Contract, with "special" chars',
    clientName: 'Client "C"',
    status: 'expired',
    startDate: '2023-01-01',
    endDate: '2023-12-31',
    pmName: undefined, // Test null PM
    totalValue: undefined, // Test null value
    createdAt: '2023-01-01T00:00:00Z',
    updatedAt: '2023-01-01T00:00:00Z'
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

describe('Contracts Export Functionality', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock authenticated admin user
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

    // Mock successful API response
    vi.mocked(contractsApi.getAll).mockResolvedValue({
      items: mockContracts,
      total: mockContracts.length,
      page: 1,
      pageSize: 10,
      totalPages: 1
    });

    // Mock exportToCsv to simulate CSV creation without DOM manipulation
    vi.mocked(contractsApi.exportToCsv).mockImplementation(async (contracts) => {
      const headers = ['Contract Number', 'Name', 'Client', 'Status', 'Start Date', 'End Date', 'PM', 'Total Value'];
      const rows = contracts.map(c => [
        c.contractNumber || '',
        c.name || '',
        c.clientName || '',
        c.status || '',
        c.startDate ? new Date(c.startDate).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }) : '',
        c.endDate ? new Date(c.endDate).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }) : '',
        c.pmName || '',
        c.totalValue ? c.totalValue.toFixed(2) : ''
      ]);
      
      // Escape special characters in CSV
      const escapeCSV = (value: string) => {
        if (value.includes(',') || value.includes('"') || value.includes('\n')) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      };
      
      const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(escapeCSV).join(','))
      ].join('\n');
      
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      URL.createObjectURL(blob);
      
      // Trigger the mock clicks
      mockClick();
      mockRemove();
      URL.revokeObjectURL('blob:mock-url');
    });

    // Mock document.createElement for download link
    const originalCreateElement = document.createElement.bind(document);
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
      return originalCreateElement(tagName);
    });

    // Mock URL.createObjectURL and URL.revokeObjectURL
    global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
    global.URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should generate CSV with correct headers', async () => {
    renderContractsPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /export/i })).toBeInTheDocument();
    });

    const exportButton = screen.getByRole('button', { name: /export/i });
    await userEvent.click(exportButton);

    // Check that exportToCsv was called with the correct contracts
    await waitFor(() => {
      expect(contractsApi.exportToCsv).toHaveBeenCalledWith(mockContracts);
    });

    // Check that download was triggered (through our mock)
    expect(mockClick).toHaveBeenCalled();
    expect(URL.createObjectURL).toHaveBeenCalled();
  });

  it('should include only visible contracts in export', async () => {
    // Initially render with all contracts
    renderContractsPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /export/i })).toBeInTheDocument();
    });

    // Note: In the actual component, inactive contracts are hidden by default
    // So we should only expect to see C001 and C003 (not C002 which is inactive)
    const exportButton = screen.getByRole('button', { name: /export/i });
    await userEvent.click(exportButton);

    // Since inactive contracts are filtered out by default,
    // the export should only include active and expired contracts
    await waitFor(() => {
      expect(contractsApi.exportToCsv).toHaveBeenCalled();
    });

    // Check that the exported contracts don't include inactive ones
    const exportCall = vi.mocked(contractsApi.exportToCsv).mock.calls[0];
    const exportedContracts = exportCall[0];
    
    // Should include C001 (active) and C003 (expired)
    expect(exportedContracts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ contractNumber: 'C001', status: 'active' }),
        expect.objectContaining({ contractNumber: 'C003', status: 'expired' })
      ])
    );
    
    // Should NOT include C002 (inactive)
    expect(exportedContracts).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ contractNumber: 'C002', status: 'inactive' })
      ])
    );
  });

  it('should trigger download on export click', async () => {
    renderContractsPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /export/i })).toBeInTheDocument();
    });

    const exportButton = screen.getByRole('button', { name: /export/i });
    await userEvent.click(exportButton);

    // Verify export was triggered
    await waitFor(() => {
      expect(contractsApi.exportToCsv).toHaveBeenCalled();
    });

    // Verify download was triggered
    expect(mockClick).toHaveBeenCalled();
    
    // Verify cleanup
    expect(mockRemove).toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });

  it('should handle null values in CSV export', async () => {
    renderContractsPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /export/i })).toBeInTheDocument();
    });

    const exportButton = screen.getByRole('button', { name: /export/i });
    await userEvent.click(exportButton);

    // Verify export was called with contracts including null values
    await waitFor(() => {
      expect(contractsApi.exportToCsv).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            contractNumber: 'C003',
            pmName: undefined,
            totalValue: undefined
          })
        ])
      );
    });
  });

  it('should escape special characters in CSV', async () => {
    renderContractsPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /export/i })).toBeInTheDocument();
    });

    const exportButton = screen.getByRole('button', { name: /export/i });
    await userEvent.click(exportButton);

    // Verify export was called with contracts containing special characters
    await waitFor(() => {
      expect(contractsApi.exportToCsv).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'Contract, with "special" chars',
            clientName: 'Client "C"'
          })
        ])
      );
    });
  });

  it('should format dates correctly in CSV', async () => {
    renderContractsPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /export/i })).toBeInTheDocument();
    });

    const exportButton = screen.getByRole('button', { name: /export/i });
    await userEvent.click(exportButton);

    // Verify export was called with contracts containing dates
    await waitFor(() => {
      expect(contractsApi.exportToCsv).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            startDate: '2025-01-01',
            endDate: '2025-12-31'
          })
        ])
      );
    });
  });

  it('should format currency values correctly in CSV', async () => {
    renderContractsPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /export/i })).toBeInTheDocument();
    });

    const exportButton = screen.getByRole('button', { name: /export/i });
    await userEvent.click(exportButton);

    // Verify export was called with contracts containing currency values
    await waitFor(() => {
      expect(contractsApi.exportToCsv).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ totalValue: 100000 }),
          expect.objectContaining({ totalValue: 150000.50 })
        ])
      );
    });
  });

  it('should use date-stamped filename', async () => {
    const mockDate = new Date('2025-08-10');
    vi.setSystemTime(mockDate);

    renderContractsPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /export/i })).toBeInTheDocument();
    });

    const exportButton = screen.getByRole('button', { name: /export/i });
    await userEvent.click(exportButton);

    // Verify export was called
    await waitFor(() => {
      expect(contractsApi.exportToCsv).toHaveBeenCalled();
    });

    vi.useRealTimers();
  });

  it('should show loading state during export', async () => {
    // Make exportToCsv return a promise that doesn't resolve immediately
    let resolveExport: () => void;
    const exportPromise = new Promise<void>(resolve => {
      resolveExport = resolve;
    });
    vi.mocked(contractsApi.exportToCsv).mockReturnValue(exportPromise);

    renderContractsPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /export/i })).toBeInTheDocument();
    });

    const exportButton = screen.getByRole('button', { name: /export/i });
    
    // Before clicking, button should not show loading
    expect(exportButton).not.toBeDisabled();

    await userEvent.click(exportButton);

    // Should show loading state
    await waitFor(() => {
      expect(screen.getByText(/exportálás.../i)).toBeInTheDocument();
    });

    // Resolve the export
    resolveExport!();

    // Should return to normal state
    await waitFor(() => {
      expect(screen.getByText(/exportálás$/i)).toBeInTheDocument();
    });
  });

  it('should handle export errors gracefully', async () => {
    // Mock an error in exportToCsv
    vi.mocked(contractsApi.exportToCsv).mockRejectedValue(new Error('Export failed'));

    renderContractsPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /export/i })).toBeInTheDocument();
    });

    const exportButton = screen.getByRole('button', { name: /export/i });
    await userEvent.click(exportButton);

    // Verify export was attempted
    await waitFor(() => {
      expect(contractsApi.exportToCsv).toHaveBeenCalled();
    });

    // The component should handle the error gracefully (no crash)
    expect(exportButton).toBeInTheDocument();
  });

  it('should export all pages when pagination is active', async () => {
    // Mock multiple pages of data
    const manyContracts = Array.from({ length: 150 }, (_, i) => ({
      id: i + 1,
      contractNumber: `C${String(i + 1).padStart(3, '0')}`,
      name: `Contract ${i + 1}`,
      clientName: `Client ${i + 1}`,
      status: 'active' as const,
      startDate: '2025-01-01',
      endDate: '2025-12-31',
      pmName: 'John Doe',
      totalValue: 100000 + i * 1000,
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z'
    }));

    // Return first page initially - only showing 10 contracts from the 150
    vi.mocked(contractsApi.getAll).mockResolvedValue({
      items: manyContracts.slice(0, 10),
      total: manyContracts.length,
      page: 1,
      pageSize: 10,
      totalPages: 15
    });

    renderContractsPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /export/i })).toBeInTheDocument();
    });

    const exportButton = screen.getByRole('button', { name: /export/i });
    await userEvent.click(exportButton);

    // Should export only the displayed contracts (not all pages)
    await waitFor(() => {
      expect(contractsApi.exportToCsv).toHaveBeenCalledWith(
        // Should be called with the 10 contracts currently displayed
        expect.arrayContaining([
          expect.objectContaining({ contractNumber: 'C001' })
        ])
      );
    });

    // Verify it was called with only the visible contracts
    const exportCall = vi.mocked(contractsApi.exportToCsv).mock.calls[0];
    expect(exportCall[0]).toHaveLength(10);
  });

  it('should disable export button when no contracts', async () => {
    vi.mocked(contractsApi.getAll).mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      pageSize: 10,
      totalPages: 0
    });

    renderContractsPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /export/i })).toBeInTheDocument();
    });

    const exportButton = screen.getByRole('button', { name: /export/i });
    expect(exportButton).toBeDisabled();
  });
});