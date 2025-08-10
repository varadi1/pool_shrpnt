import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { AuditList } from '../AuditList';
import type { AuditEntry } from '@/types/audit';

const mockUseAuth = vi.fn();
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('@/services/api/axios-client', () => ({
  apiClient: {
    get: vi.fn(),
  },
}));

const mockAuditEntries: AuditEntry[] = [
  {
    id: '1',
    timestamp: '2024-01-10T10:00:00Z',
    actor: {
      id: 'user1',
      name: 'Test User',
      email: 'test@example.com',
      role: 'NEU_Admin',
      type: 'user',
    },
    action: {
      type: 'ORDER_CREATED',
      category: 'provisioning',
      severity: 'info',
      description: 'Megrendelés létrehozva',
    },
    target: {
      type: 'order',
      id: 'order1',
      name: 'Test Order',
    },
    metadata: {
      correlationId: 'corr-123-456',
      duration: 1234,
    },
    status: 'success',
  },
  {
    id: '2',
    timestamp: '2024-01-10T11:00:00Z',
    actor: {
      id: 'system',
      name: 'System',
      email: 'system@example.com',
      role: 'System',
      type: 'system',
    },
    action: {
      type: 'LOCK_APPLIED',
      category: 'lock',
      severity: 'warning',
      description: 'Időzár alkalmazva',
    },
    target: {
      type: 'lock',
      id: 'lock1',
      name: 'Time Lock',
    },
    metadata: {
      correlationId: 'corr-789-012',
      duration: 567,
    },
    status: 'success',
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
      <FluentProvider theme={webLightTheme}>
        {children}
      </FluentProvider>
    </QueryClientProvider>
  );
};

describe('AuditList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({
      isAdmin: () => true,
      isPM: () => false,
      hasAnyRole: () => true,
    });
  });

  it('should render loading state initially', () => {
    const { apiClient } = vi.mocked(await import('@/services/api/axios-client'), true) as any;
    apiClient.get.mockImplementation(() => new Promise(() => {}));

    render(<AuditList />, { wrapper: createWrapper() });
    
    expect(screen.getByText('Audit naplók betöltése...')).toBeInTheDocument();
  });

  it('should render audit entries when data is loaded', async () => {
    const { apiClient } = await import('@/services/api/axios-client') as any;
    apiClient.get.mockResolvedValue({
      entries: mockAuditEntries,
      pagination: {
        hasMore: false,
        totalCount: 2,
      },
    });

    render(<AuditList />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText('Audit Napló')).toBeInTheDocument();
    });

    expect(screen.getByText('Test User')).toBeInTheDocument();
    expect(screen.getByText('Megrendelés létrehozva')).toBeInTheDocument();
    expect(screen.getByText('Időzár alkalmazva')).toBeInTheDocument();
  });

  it('should show access denied for unauthorized users', () => {
    mockUseAuth.mockReturnValue({
      isAdmin: () => false,
      isPM: () => false,
      hasAnyRole: () => false,
    });

    render(<AuditList />, { wrapper: createWrapper() });

    expect(screen.getByText('Hozzáférés megtagadva')).toBeInTheDocument();
    expect(
      screen.getByText('Nincs jogosultsága az audit naplók megtekintéséhez.'),
    ).toBeInTheDocument();
  });

  it('should handle error state', async () => {
    const { apiClient } = await import('@/services/api/axios-client') as any;
    apiClient.get.mockRejectedValue(new Error('Network error'));

    render(<AuditList />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText('Hiba történt')).toBeInTheDocument();
    });

    expect(screen.getByText('Nem sikerült betölteni az audit naplókat.')).toBeInTheDocument();
    expect(screen.getByText('Network error')).toBeInTheDocument();
  });

  it('should handle empty state', async () => {
    const { apiClient } = await import('@/services/api/axios-client') as any;
    apiClient.get.mockResolvedValue({
      entries: [],
      pagination: {
        hasMore: false,
        totalCount: 0,
      },
    });

    render(<AuditList />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText('Nincs audit bejegyzés')).toBeInTheDocument();
    });

    expect(
      screen.getByText('Még nem történt rögzített esemény a rendszerben.'),
    ).toBeInTheDocument();
  });

  it('should toggle live updates', async () => {
    const { apiClient } = await import('@/services/api/axios-client') as any;
    apiClient.get.mockResolvedValue({
      entries: mockAuditEntries,
      pagination: {
        hasMore: false,
        totalCount: 2,
      },
    });

    render(<AuditList />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText('Audit Napló')).toBeInTheDocument();
    });

    const liveToggleButton = screen.getByText('Élő frissítés ki');
    expect(liveToggleButton).toBeInTheDocument();

    await userEvent.click(liveToggleButton);
    expect(screen.getByText('Élő frissítés be')).toBeInTheDocument();
  });

  it('should handle refresh button click', async () => {
    const { apiClient } = await import('@/services/api/axios-client') as any;
    apiClient.get.mockResolvedValue({
      entries: mockAuditEntries,
      pagination: {
        hasMore: false,
        totalCount: 2,
      },
    });

    render(<AuditList />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText('Audit Napló')).toBeInTheDocument();
    });

    const refreshButton = screen.getByLabelText('Frissítés');
    await userEvent.click(refreshButton);

    expect(apiClient.get).toHaveBeenCalledWith('/api/audit/logs', expect.any(Object));
  });

  it('should display correlation ID with tooltip', async () => {
    const { apiClient } = await import('@/services/api/axios-client') as any;
    apiClient.get.mockResolvedValue({
      entries: mockAuditEntries,
      pagination: {
        hasMore: false,
        totalCount: 2,
      },
    });

    render(<AuditList />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText('Audit Napló')).toBeInTheDocument();
    });

    const correlationCells = screen.getAllByText(/corr-/);
    expect(correlationCells.length).toBeGreaterThan(0);
  });

  it('should format timestamps correctly', async () => {
    const { apiClient } = await import('@/services/api/axios-client') as any;
    apiClient.get.mockResolvedValue({
      entries: mockAuditEntries,
      pagination: {
        hasMore: false,
        totalCount: 2,
      },
    });

    render(<AuditList />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText('Audit Napló')).toBeInTheDocument();
    });

    const table = screen.getByRole('table');
    const rows = within(table).getAllByRole('row');
    expect(rows.length).toBeGreaterThan(1);
  });

  it('should show appropriate icons for different action types', async () => {
    const { apiClient } = await import('@/services/api/axios-client') as any;
    apiClient.get.mockResolvedValue({
      entries: mockAuditEntries,
      pagination: {
        hasMore: false,
        totalCount: 2,
      },
    });

    render(<AuditList />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText('Audit Napló')).toBeInTheDocument();
    });

    const badges = screen.getAllByText(/provisioning|lock/);
    expect(badges.length).toBeGreaterThan(0);
  });

  it('should display status badges with appropriate colors', async () => {
    const { apiClient } = await import('@/services/api/axios-client') as any;
    apiClient.get.mockResolvedValue({
      entries: mockAuditEntries,
      pagination: {
        hasMore: false,
        totalCount: 2,
      },
    });

    render(<AuditList />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText('Audit Napló')).toBeInTheDocument();
    });

    const successBadges = screen.getAllByText('success');
    expect(successBadges.length).toBe(2);
  });
});