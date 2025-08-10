import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

describe.skip('Contracts Export Functionality', () => {
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
      getAccessToken: vi.fn()
    });

    // Mock successful API response
    vi.mocked(contractsApi.getAll).mockResolvedValue({
      items: mockContracts,
      total: mockContracts.length,
      page: 1,
      pageSize: 10,
      totalPages: 1
    });

    // Mock document.createElement for download link
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

    // Check that download was triggered
    expect(mockClick).toHaveBeenCalled();

    // Verify CSV headers were created
    const createObjectURLCall = vi.mocked(URL.createObjectURL).mock.calls[0];
    const blob = createObjectURLCall[0] as Blob;
    const csvContent = await blob.text();

    // Check headers
    expect(csvContent).toContain('Contract Number,Name,Client,Status,Start Date,End Date,PM,Total Value');
  });

  it('should include only visible contracts in export', async () => {
    // Apply a filter first
    renderContractsPage();

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/search contracts/i)).toBeInTheDocument();
    });

    // Filter to only active contracts
    const statusDropdown = screen.getByRole('combobox', { name: /status/i });
    await userEvent.selectOptions(statusDropdown, 'active');

    // Mock filtered response
    const activeContracts = mockContracts.filter(c => c.status === 'active');
    vi.mocked(contractsApi.getAll).mockResolvedValue({
      items: activeContracts,
      total: activeContracts.length,
      page: 1,
      pageSize: 10,
      totalPages: 1
    });

    // Wait for filtered data
    await waitFor(() => {
      expect(screen.queryByText('C002')).not.toBeInTheDocument();
      expect(screen.queryByText('C003')).not.toBeInTheDocument();
    });

    // Export filtered data
    const exportButton = screen.getByRole('button', { name: /export/i });
    await userEvent.click(exportButton);

    // Verify only filtered contracts are in CSV
    const createObjectURLCall = vi.mocked(URL.createObjectURL).mock.calls[0];
    const blob = createObjectURLCall[0] as Blob;
    const csvContent = await blob.text();

    expect(csvContent).toContain('C001');
    expect(csvContent).not.toContain('C002');
    expect(csvContent).not.toContain('C003');
  });

  it('should trigger download on export click', async () => {
    renderContractsPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /export/i })).toBeInTheDocument();
    });

    const exportButton = screen.getByRole('button', { name: /export/i });
    await userEvent.click(exportButton);

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

    const createObjectURLCall = vi.mocked(URL.createObjectURL).mock.calls[0];
    const blob = createObjectURLCall[0] as Blob;
    const csvContent = await blob.text();

    // Check that null/undefined values are handled (should be empty strings)
    const lines = csvContent.split('\n');
    const contractC003Line = lines.find(line => line.includes('C003'));
    
    expect(contractC003Line).toBeDefined();
    // PM name should be empty (not "undefined")
    expect(contractC003Line).not.toContain('undefined');
    // Should have proper empty fields
    expect(contractC003Line).toMatch(/C003.*,,$/); // Ends with empty fields for PM and value
  });

  it('should escape special characters in CSV', async () => {
    renderContractsPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /export/i })).toBeInTheDocument();
    });

    const exportButton = screen.getByRole('button', { name: /export/i });
    await userEvent.click(exportButton);

    const createObjectURLCall = vi.mocked(URL.createObjectURL).mock.calls[0];
    const blob = createObjectURLCall[0] as Blob;
    const csvContent = await blob.text();

    // Check that special characters are properly quoted
    expect(csvContent).toContain('"Contract, with ""special"" chars"'); // Name with comma and quotes
    expect(csvContent).toContain('"Client ""C"""'); // Client name with quotes
  });

  it('should format dates correctly in CSV', async () => {
    renderContractsPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /export/i })).toBeInTheDocument();
    });

    const exportButton = screen.getByRole('button', { name: /export/i });
    await userEvent.click(exportButton);

    const createObjectURLCall = vi.mocked(URL.createObjectURL).mock.calls[0];
    const blob = createObjectURLCall[0] as Blob;
    const csvContent = await blob.text();

    // Dates should be formatted as MM/DD/YYYY
    expect(csvContent).toContain('01/01/2025');
    expect(csvContent).toContain('12/31/2025');
  });

  it('should format currency values correctly in CSV', async () => {
    renderContractsPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /export/i })).toBeInTheDocument();
    });

    const exportButton = screen.getByRole('button', { name: /export/i });
    await userEvent.click(exportButton);

    const createObjectURLCall = vi.mocked(URL.createObjectURL).mock.calls[0];
    const blob = createObjectURLCall[0] as Blob;
    const csvContent = await blob.text();

    // Currency should be formatted without $ symbol but with decimals
    expect(csvContent).toContain('100000.00');
    expect(csvContent).toContain('150000.50');
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

    // Check the download attribute was set with date
    const anchorElement = (document.createElement as any).mock.results[0].value;
    expect(anchorElement.download).toBe('contracts-2025-08-10.csv');

    vi.useRealTimers();
  });

  it('should show loading state during export', async () => {
    renderContractsPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /export/i })).toBeInTheDocument();
    });

    const exportButton = screen.getByRole('button', { name: /export/i });
    
    // Before clicking, button should not show loading
    expect(exportButton).not.toHaveAttribute('aria-busy', 'true');

    await userEvent.click(exportButton);

    // Should briefly show loading state
    await waitFor(() => {
      expect(exportButton).toHaveAttribute('aria-busy', 'true');
    }, { timeout: 100 });

    // Should return to normal state
    await waitFor(() => {
      expect(exportButton).not.toHaveAttribute('aria-busy', 'true');
    });
  });

  it('should handle export errors gracefully', async () => {
    // Mock an error in creating blob
    const originalCreateObjectURL = URL.createObjectURL;
    URL.createObjectURL = vi.fn(() => {
      throw new Error('Failed to create blob');
    });

    renderContractsPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /export/i })).toBeInTheDocument();
    });

    const exportButton = screen.getByRole('button', { name: /export/i });
    await userEvent.click(exportButton);

    // Should show error message
    await waitFor(() => {
      expect(screen.getByText(/failed to export/i)).toBeInTheDocument();
    });

    // Restore mock
    URL.createObjectURL = originalCreateObjectURL;
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

    // Return first page initially
    vi.mocked(contractsApi.getAll).mockResolvedValue({
      items: manyContracts.slice(0, 50),
      total: manyContracts.length,
      page: 1,
      pageSize: 50,
      totalPages: 3
    });

    renderContractsPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /export/i })).toBeInTheDocument();
    });

    // Mock fetching all pages for export
    vi.mocked(contractsApi.getAll).mockImplementation(async (params) => {
      const page = params?.page || 1;
      const pageSize = params?.pageSize || 50;
      const start = (page - 1) * pageSize;
      const end = start + pageSize;
      
      return {
        items: manyContracts.slice(start, end),
        total: manyContracts.length,
        page,
        pageSize,
        totalPages: Math.ceil(manyContracts.length / pageSize)
      };
    });

    const exportButton = screen.getByRole('button', { name: /export/i });
    await userEvent.click(exportButton);

    // Should fetch all pages
    await waitFor(() => {
      expect(contractsApi.getAll).toHaveBeenCalledWith(1, 1000, expect.any(Object));
    });

    const createObjectURLCall = vi.mocked(URL.createObjectURL).mock.calls[0];
    const blob = createObjectURLCall[0] as Blob;
    const csvContent = await blob.text();

    // Should contain contracts from all pages
    const lines = csvContent.split('\n').filter(line => line.trim());
    expect(lines.length).toBeGreaterThan(51); // Header + 50+ contracts
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
      const exportButton = screen.getByRole('button', { name: /export/i });
      expect(exportButton).toBeDisabled();
    });
  });
});