import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PermissionsList } from '../PermissionsList';
import { ordersApi } from '@/services/api/orders';

vi.mock('@/services/api/orders', () => ({
  ordersApi: {
    getAll: vi.fn(),
  },
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom') as any;
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const mockOrders = [
  {
    id: '1',
    code: 'EM-2025-NEU001-001',
    name: 'Test Order 1',
    status: 'active',
    createdAt: '2025-01-01T10:00:00Z',
    updatedAt: '2025-01-05T15:00:00Z',
  },
  {
    id: '2',
    code: 'EM-2025-NEU002-001',
    name: 'Test Order 2',
    status: 'provisioning',
    createdAt: '2025-01-02T10:00:00Z',
    updatedAt: '2025-01-06T15:00:00Z',
  },
];

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        {children}
      </BrowserRouter>
    </QueryClientProvider>
  );
};

describe('PermissionsList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state initially', () => {
    vi.mocked(ordersApi.getAll).mockImplementation(() => new Promise(() => {}));
    
    render(<PermissionsList />, { wrapper: createWrapper() });
    
    expect(screen.getByText(/Jogosultságok betöltése/i)).toBeInTheDocument();
  });

  it('renders orders list after loading', async () => {
    vi.mocked(ordersApi.getAll).mockResolvedValue(mockOrders);
    
    render(<PermissionsList />, { wrapper: createWrapper() });
    
    await waitFor(() => {
      expect(screen.getByText('EM-2025-NEU001-001')).toBeInTheDocument();
      expect(screen.getByText('Test Order 1')).toBeInTheDocument();
      expect(screen.getByText('EM-2025-NEU002-001')).toBeInTheDocument();
      expect(screen.getByText('Test Order 2')).toBeInTheDocument();
    });
  });

  it('filters orders by search query', async () => {
    vi.mocked(ordersApi.getAll).mockResolvedValue(mockOrders);
    
    render(<PermissionsList />, { wrapper: createWrapper() });
    
    await waitFor(() => {
      expect(screen.getByText('EM-2025-NEU001-001')).toBeInTheDocument();
    });
    
    const searchBox = screen.getByPlaceholderText(/Keresés megrendelés kód/i);
    fireEvent.change(searchBox, { target: { value: 'NEU001' } });
    
    expect(screen.getByText('EM-2025-NEU001-001')).toBeInTheDocument();
    expect(screen.queryByText('EM-2025-NEU002-001')).not.toBeInTheDocument();
  });

  it('filters orders by status', async () => {
    vi.mocked(ordersApi.getAll).mockResolvedValue(mockOrders);
    
    render(<PermissionsList />, { wrapper: createWrapper() });
    
    await waitFor(() => {
      expect(screen.getByText('EM-2025-NEU001-001')).toBeInTheDocument();
    });
    
    const statusDropdown = screen.getByText('Minden státusz');
    fireEvent.click(statusDropdown);
    
    const activeOption = screen.getByRole('option', { name: 'Aktív' });
    fireEvent.click(activeOption);
    
    await waitFor(() => {
      expect(screen.getByText('EM-2025-NEU001-001')).toBeInTheDocument();
      expect(screen.queryByText('EM-2025-NEU002-001')).not.toBeInTheDocument();
    });
  });

  it('displays correct status badges', async () => {
    vi.mocked(ordersApi.getAll).mockResolvedValue(mockOrders);
    
    render(<PermissionsList />, { wrapper: createWrapper() });
    
    await waitFor(() => {
      expect(screen.getByText('Aktív')).toBeInTheDocument();
      expect(screen.getByText('Létrehozás alatt')).toBeInTheDocument();
    });
  });

  it('displays summary statistics', async () => {
    vi.mocked(ordersApi.getAll).mockResolvedValue(mockOrders);
    
    render(<PermissionsList />, { wrapper: createWrapper() });
    
    await waitFor(() => {
      expect(screen.getByText('2')).toBeInTheDocument();
      expect(screen.getByText('Megrendelés')).toBeInTheDocument();
      expect(screen.getByText('Felhasználó')).toBeInTheDocument();
      expect(screen.getByText('Csoport')).toBeInTheDocument();
    });
  });

  it('handles error state gracefully', async () => {
    vi.mocked(ordersApi.getAll).mockRejectedValue(new Error('API Error'));
    
    render(<PermissionsList />, { wrapper: createWrapper() });
    
    await waitFor(() => {
      expect(screen.getByText(/Hiba történt a jogosultságok betöltése során/i)).toBeInTheDocument();
      expect(screen.getByText('Újratöltés')).toBeInTheDocument();
    });
  });

  it('handles refresh button click', async () => {
    vi.mocked(ordersApi.getAll).mockResolvedValue(mockOrders);
    
    render(<PermissionsList />, { wrapper: createWrapper() });
    
    await waitFor(() => {
      expect(screen.getByText('EM-2025-NEU001-001')).toBeInTheDocument();
    });
    
    const refreshButton = screen.getByText('Frissítés');
    fireEvent.click(refreshButton);
    
    expect(ordersApi.getAll).toHaveBeenCalledTimes(2);
  });

  it('displays lock status indicators', async () => {
    vi.mocked(ordersApi.getAll).mockResolvedValue(mockOrders);
    
    render(<PermissionsList />, { wrapper: createWrapper() });
    
    await waitFor(() => {
      expect(screen.getAllByText(/Nincs zárolás/i).length).toBeGreaterThan(0);
    });
  });

  it('handles navigation to matrix view', async () => {
    vi.mocked(ordersApi.getAll).mockResolvedValue(mockOrders);
    
    render(<PermissionsList />, { wrapper: createWrapper() });
    
    await waitFor(() => {
      expect(screen.getByText('EM-2025-NEU001-001')).toBeInTheDocument();
    });
    
    const matrixButtons = screen.getAllByText('Mátrix');
    fireEvent.click(matrixButtons[0]);
    
    expect(mockNavigate).toHaveBeenCalledWith('/permissions/matrix/1');
  });
});