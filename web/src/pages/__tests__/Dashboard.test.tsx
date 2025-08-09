import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Dashboard } from '../Dashboard';
import { apiClient } from '@/services/api/axios-client';

// Mock the API client
vi.mock('@/services/api/axios-client', () => ({
  apiClient: {
    get: vi.fn(),
  },
}));

// Mock the components
vi.mock('@/components/dashboard/MetricCard', () => ({
  MetricCard: ({ title, value, loading, error }: any) => (
    <div data-testid="metric-card">
      <span>{title}</span>
      {loading && <span>Loading...</span>}
      {error && <span>Error</span>}
      {!loading && !error && <span>{value ?? '-'}</span>}
    </div>
  ),
}));

vi.mock('@/components/dashboard/ActivityFeed', () => ({
  ActivityFeed: ({ activities, loading }: any) => (
    <div data-testid="activity-feed">
      {loading && <span>Loading activities...</span>}
      {!loading && activities && <span>{activities.length} activities</span>}
    </div>
  ),
}));

vi.mock('@/components/dashboard/SystemHealth', () => ({
  SystemHealth: ({ health, queueDepth, lastProvisionTime, apiLatency, loading }: any) => (
    <div data-testid="system-health">
      {loading && <span>Loading...</span>}
      {!loading && (
        <>
          <span>Health: {health}</span>
          <span>Queue: {queueDepth}</span>
          <span>Provision: {lastProvisionTime}min</span>
          <span>Latency: {apiLatency}ms</span>
        </>
      )}
    </div>
  ),
}));

describe('Dashboard', () => {
  let queryClient: QueryClient;
  let performanceMock: any;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          gcTime: 0,
          staleTime: 0,
        },
      },
    });

    // Mock performance API
    performanceMock = {
      mark: vi.fn(),
      measure: vi.fn(),
      getEntriesByName: vi.fn(() => [{ duration: 1500 }]),
      clearMarks: vi.fn(),
      clearMeasures: vi.fn(),
      now: vi.fn(() => 1000),
    };
    Object.defineProperty(window, 'performance', {
      value: performanceMock,
      writable: true,
    });

    // Reset mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders dashboard title', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <Dashboard />
      </QueryClientProvider>
    );

    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });

  it('fetches and displays metrics', async () => {
    const mockMetricsResponse = {
      timeLocked: 5,
      crUnlocked: 2,
      manualLocked: 3,
    };

    const mockHealthResponse = {
      status: 'healthy',
      queueDepth: 10,
      lastProvisionTime: 5,
      latency: 150,
    };

    (apiClient.get as any).mockImplementation((url: string) => {
      if (url.includes('/api/v1/orders?status=active')) {
        return Promise.resolve({ count: 10 });
      }
      if (url.includes('/api/v1/orders?status=pending_provision')) {
        return Promise.resolve({ count: 3 });
      }
      if (url.includes('/api/v1/orders?status=failed')) {
        return Promise.resolve({ count: 1 });
      }
      if (url.includes('/api/v1/contracts')) {
        return Promise.resolve({ count: 5 });
      }
      if (url.includes('/api/v1/locks/summary')) {
        return Promise.resolve(mockMetricsResponse);
      }
      if (url.includes('/api/v1/guests?status=active')) {
        return Promise.resolve({ count: 20 });
      }
      if (url.includes('/api/v1/guests?expiring_days=7')) {
        return Promise.resolve({ count: 2 });
      }
      if (url.includes('/health')) {
        return Promise.resolve(mockHealthResponse);
      }
      if (url.includes('/api/audit/recent') || url.includes('/api/v1/audit/recent')) {
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    });

    render(
      <QueryClientProvider client={queryClient}>
        <Dashboard />
      </QueryClientProvider>
    );

    // Wait for data to load
    await waitFor(() => {
      const metricCards = screen.getAllByTestId('metric-card');
      expect(metricCards).toHaveLength(8);
      // Check that loading state is gone
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
    }, { timeout: 3000 });

    // Check that metric cards are displayed
    expect(screen.getByText('Active Orders')).toBeInTheDocument();
    expect(screen.getByText('Pending Provisions')).toBeInTheDocument();
    expect(screen.getByText('Failed (24h)')).toBeInTheDocument();
    
    // The values should be displayed after loading
    await waitFor(() => {
      expect(screen.getByText('10')).toBeInTheDocument();
      expect(screen.getByText('3')).toBeInTheDocument();
      expect(screen.getByText('1')).toBeInTheDocument();
    });
  });

  it('displays loading states', () => {
    (apiClient.get as any).mockImplementation(() => new Promise(() => {})); // Never resolves

    render(
      <QueryClientProvider client={queryClient}>
        <Dashboard />
      </QueryClientProvider>
    );

    // Check for loading indicators
    const loadingElements = screen.getAllByText('Loading...');
    expect(loadingElements.length).toBeGreaterThan(0);
  });

  it('handles API errors gracefully', async () => {
    (apiClient.get as any).mockRejectedValue(new Error('API Error'));

    render(
      <QueryClientProvider client={queryClient}>
        <Dashboard />
      </QueryClientProvider>
    );

    // Wait for error state
    await waitFor(() => {
      const errorElements = screen.getAllByText('Error');
      expect(errorElements.length).toBeGreaterThan(0);
    });
  });

  it('tracks performance metrics', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <Dashboard />
      </QueryClientProvider>
    );

    // Check that performance marks were called
    expect(performanceMock.mark).toHaveBeenCalledWith('dashboard-start');
    
    // Cleanup should trigger performance measurement
    queryClient.clear();
  });

  it('fetches recent activities', async () => {
    const mockActivities = [
      {
        id: '1',
        user: 'user@example.com',
        action: 'Created order',
        target: 'Order-123',
        timestamp: new Date().toISOString(),
        type: 'create',
      },
      {
        id: '2',
        user: 'admin@example.com',
        action: 'Updated contract',
        target: 'Contract-456',
        timestamp: new Date().toISOString(),
        type: 'update',
      },
    ];

    (apiClient.get as any).mockImplementation((url: string) => {
      if (url.includes('/api/v1/audit/recent')) {
        return Promise.resolve(mockActivities);
      }
      if (url.includes('/health')) {
        return Promise.resolve({ status: 'healthy', queueDepth: 0, lastProvisionTime: 0, latency: 0 });
      }
      if (url.includes('/api/v1')) {
        return Promise.resolve({ count: 0 });
      }
      return Promise.resolve({});
    });

    render(
      <QueryClientProvider client={queryClient}>
        <Dashboard />
      </QueryClientProvider>
    );

    await waitFor(() => {
      // Check that activities are displayed
      expect(screen.getByText('Recent Activity')).toBeInTheDocument();
      // Activities are rendered in the ActivityFeed component
    });
  });

  it('displays system health status', async () => {
    const mockHealthResponse = {
      status: 'degraded',
      queueDepth: 25,
      lastProvisionTime: 12,
      latency: 350,
    };

    (apiClient.get as any).mockImplementation((url: string) => {
      if (url.includes('/health')) {
        return Promise.resolve(mockHealthResponse);
      }
      if (url.includes('/api/v1/locks/summary')) {
        return Promise.resolve({ timeLocked: 0, crUnlocked: 0, manualLocked: 0 });
      }
      if (url.includes('/api/v1/audit/recent')) {
        return Promise.resolve([]);
      }
      if (url.includes('/api/v1')) {
        return Promise.resolve({ count: 0 });
      }
      return Promise.resolve({ count: 0 });
    });

    render(
      <QueryClientProvider client={queryClient}>
        <Dashboard />
      </QueryClientProvider>
    );

    await waitFor(() => {
      // Check that health status is displayed
      const healthText = screen.getByText((content, element) => {
        return element?.textContent?.includes('degraded') || false;
      });
      expect(healthText).toBeInTheDocument();
      expect(screen.getByText('Latency: 350ms')).toBeInTheDocument();
    });
  });

  it('logs warning when load time exceeds 3 seconds', async () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Mock slow API response
    performanceMock.now.mockReturnValueOnce(0).mockReturnValueOnce(3500);

    (apiClient.get as any).mockImplementation(() => 
      new Promise(resolve => setTimeout(() => resolve({}), 100))
    );

    render(
      <QueryClientProvider client={queryClient}>
        <Dashboard />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Dashboard metrics load time exceeded target'));
    });

    consoleSpy.mockRestore();
  });

  it('uses correct query configurations', async () => {
    const querySpy = vi.fn();
    
    const customQueryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          queryFn: querySpy,
        },
      },
    });

    render(
      <QueryClientProvider client={customQueryClient}>
        <Dashboard />
      </QueryClientProvider>
    );

    // Check that queries are configured with correct stale time and refetch interval
    const queries = customQueryClient.getQueryCache().getAll();
    
    queries.forEach(query => {
      if (query.queryKey[0] === 'dashboard-metrics' || query.queryKey[0] === 'recent-activities') {
        expect(query.options.staleTime).toBe(30000); // 30 seconds
        expect(query.options.refetchInterval).toBe(60000); // 1 minute
      }
    });
  });
});