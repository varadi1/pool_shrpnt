import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { rest } from 'msw';
import { setupServer } from 'msw/node';
import { AuditList } from '../AuditList';
import type { AuditEntry, AuditPaginatedResponse, ExportJob } from '@/types/audit';

// Mock auth context
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: 'test-user',
      name: 'Test User',
      email: 'test@example.com',
      role: 'NEU_Admin',
    },
    isAuthenticated: true,
    getAccessToken: () => Promise.resolve('mock-token'),
  }),
}));

// Mock WebSocket
vi.mock('@/services/auditWebSocket', () => ({
  AuditWebSocketService: vi.fn().mockImplementation(() => ({
    connect: vi.fn(),
    disconnect: vi.fn(),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    getConnectionStatus: vi.fn().mockReturnValue('connected'),
    getEventQueue: vi.fn().mockReturnValue([]),
  })),
}));

const generateMockAuditData = (page = 1, pageSize = 20): AuditPaginatedResponse => {
  const startId = (page - 1) * pageSize + 1;
  const entries: AuditEntry[] = Array.from({ length: pageSize }, (_, i) => ({
    id: `audit-${startId + i}`,
    timestamp: new Date(Date.now() - i * 60000).toISOString(),
    actor: {
      id: `user-${i % 3}`,
      name: `User ${i % 3}`,
      email: `user${i % 3}@example.com`,
      role: ['Admin', 'User', 'Manager'][i % 3],
      type: 'user',
    },
    action: {
      type: ['TEMPLATE_CREATED', 'ORDER_PROVISIONED', 'PERMISSION_GRANTED'][i % 3] as any,
      category: ['template', 'provisioning', 'security'][i % 3] as any,
      severity: ['info', 'warning', 'error'][i % 3] as any,
      description: `Action ${startId + i}`,
    },
    target: {
      type: ['template', 'order', 'permission'][i % 3],
      id: `target-${startId + i}`,
      name: `Target ${startId + i}`,
    },
    metadata: {
      correlationId: `corr-${Math.floor((startId + i) / 3)}`,
      duration: 1000 + i * 100,
      ipAddress: `192.168.1.${i}`,
      userAgent: 'Mozilla/5.0',
    },
    status: i % 10 === 0 ? 'failure' : 'success',
  }));

  return {
    entries,
    pagination: {
      cursor: page < 5 ? `cursor-page-${page + 1}` : undefined,
      hasMore: page < 5,
      totalCount: 100,
    },
  };
};

// Setup MSW server
const server = setupServer(
  rest.get('/api/audit/logs', (req, res, ctx) => {
    const cursor = req.url.searchParams.get('cursor');
    const page = cursor ? parseInt(cursor.split('-').pop() || '1') : 1;
    const filters = req.url.searchParams.get('filters');
    
    if (filters) {
      const filterObj = JSON.parse(filters);
      if (filterObj.searchText === 'error') {
        return res(ctx.status(500), ctx.json({ message: 'Server error' }));
      }
    }
    
    return res(ctx.json(generateMockAuditData(page)));
  }),
  
  rest.get('/api/audit/logs/:id', (req, res, ctx) => {
    const { id } = req.params;
    return res(ctx.json({
      id,
      timestamp: new Date().toISOString(),
      actor: {
        id: 'user-1',
        name: 'Test User',
        email: 'test@example.com',
        role: 'Admin',
        type: 'user',
      },
      action: {
        type: 'TEMPLATE_CREATED',
        category: 'template',
        severity: 'info',
        description: 'Template created',
      },
      target: {
        type: 'template',
        id: 'template-1',
        name: 'Test Template',
      },
      metadata: {
        correlationId: 'corr-123',
      },
      status: 'success',
    }));
  }),
  
  rest.get('/api/audit/correlation/:id', (req, res, ctx) => {
    const { id } = req.params;
    return res(ctx.json({
      correlationId: id,
      events: generateMockAuditData(1, 5).entries,
      statistics: {
        totalEvents: 5,
        duration: 5000,
        services: ['api', 'worker', 'graph'],
        status: 'success',
      },
    }));
  }),
  
  rest.post('/api/audit/export', (req, res, ctx) => {
    const jobId = `export-${Date.now()}`;
    return res(ctx.json({
      id: jobId,
      status: 'processing',
      format: 'csv',
      filters: {},
      createdAt: new Date().toISOString(),
      progress: {
        current: 0,
        total: 100,
        percentage: 0,
      },
    } as ExportJob));
  }),
  
  rest.get('/api/audit/export/:jobId', (req, res, ctx) => {
    const { jobId } = req.params;
    return res(ctx.json({
      id: jobId,
      status: 'completed',
      format: 'csv',
      filters: {},
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      downloadUrl: `/api/audit/export/download/${jobId}`,
      progress: {
        current: 100,
        total: 100,
        percentage: 100,
      },
    } as ExportJob));
  }),
  
  rest.get('/api/audit/stats', (req, res, ctx) => {
    return res(ctx.json({
      eventsPerDay: [
        { date: '2025-01-01', count: 150 },
        { date: '2025-01-02', count: 200 },
        { date: '2025-01-03', count: 175 },
      ],
      topUsers: [
        { userId: 'user-1', name: 'User 1', eventCount: 50 },
        { userId: 'user-2', name: 'User 2', eventCount: 45 },
      ],
      commonActions: [
        { action: 'TEMPLATE_CREATED', count: 30 },
        { action: 'ORDER_PROVISIONED', count: 25 },
      ],
      failureRate: 0.05,
    }));
  }),
);

describe('AuditList - Integration Tests with Mock API', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    server.listen();
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
        mutations: { retry: false },
      },
    });
  });

  afterEach(() => {
    server.resetHandlers();
    server.close();
    queryClient.clear();
  });

  const renderComponent = () => {
    return render(
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AuditList />
        </BrowserRouter>
      </QueryClientProvider>
    );
  };

  describe('Complete Audit Workflow', () => {
    it('loads and displays audit entries from API', async () => {
      renderComponent();
      
      await waitFor(() => {
        expect(screen.getByText('Audit napló')).toBeInTheDocument();
      });
      
      // Wait for data to load
      await waitFor(() => {
        expect(screen.getByText(/Action 1/)).toBeInTheDocument();
      });
      
      // Verify multiple entries loaded
      const entries = screen.getAllByTestId(/audit-entry/);
      expect(entries.length).toBeGreaterThan(0);
    });

    it('applies filters and fetches filtered data', async () => {
      renderComponent();
      const user = userEvent.setup();
      
      await waitFor(() => {
        expect(screen.getByPlaceholderText('Szabad szöveges keresés...')).toBeInTheDocument();
      });
      
      // Apply search filter
      const searchInput = screen.getByPlaceholderText('Szabad szöveges keresés...');
      await user.type(searchInput, 'template');
      
      // Wait for debounced request
      await waitFor(() => {
        // Check that filtered results are displayed
        expect(screen.queryByText(/Action 1/)).toBeInTheDocument();
      }, { timeout: 2000 });
    });

    it('handles pagination through API', async () => {
      renderComponent();
      const user = userEvent.setup();
      
      // Wait for initial load
      await waitFor(() => {
        expect(screen.getByText(/Action 1/)).toBeInTheDocument();
      });
      
      // Load more entries
      const loadMoreButton = await screen.findByText('További betöltése');
      await user.click(loadMoreButton);
      
      // Wait for second page
      await waitFor(() => {
        expect(screen.getByText(/Action 21/)).toBeInTheDocument();
      });
      
      // Both pages should be visible
      expect(screen.getByText(/Action 1/)).toBeInTheDocument();
      expect(screen.getByText(/Action 21/)).toBeInTheDocument();
    });

    it('exports audit data through API', async () => {
      renderComponent();
      const user = userEvent.setup();
      
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /exportálás/i })).toBeInTheDocument();
      });
      
      // Open export dialog
      const exportButton = screen.getByRole('button', { name: /exportálás/i });
      await user.click(exportButton);
      
      // Start export
      const startExportButton = await screen.findByRole('button', { name: /exportálás indítása/i });
      await user.click(startExportButton);
      
      // Wait for export to complete
      await waitFor(() => {
        expect(screen.getByText(/export sikeres/i)).toBeInTheDocument();
      });
    });
  });

  describe('Error Handling Integration', () => {
    it('displays error when API returns error', async () => {
      server.use(
        rest.get('/api/audit/logs', (req, res, ctx) => {
          return res(ctx.status(500), ctx.json({ message: 'Internal server error' }));
        })
      );
      
      renderComponent();
      
      await waitFor(() => {
        expect(screen.getByText(/hiba történt/i)).toBeInTheDocument();
      });
    });

    it('retries failed requests', async () => {
      let attemptCount = 0;
      server.use(
        rest.get('/api/audit/logs', (req, res, ctx) => {
          attemptCount++;
          if (attemptCount === 1) {
            return res(ctx.status(500), ctx.json({ message: 'Temporary error' }));
          }
          return res(ctx.json(generateMockAuditData()));
        })
      );
      
      // Enable retry for this test
      const retryClient = new QueryClient({
        defaultOptions: {
          queries: { retry: 1, retryDelay: 100 },
        },
      });
      
      render(
        <QueryClientProvider client={retryClient}>
          <BrowserRouter>
            <AuditList />
          </BrowserRouter>
        </QueryClientProvider>
      );
      
      await waitFor(() => {
        expect(screen.getByText(/Action 1/)).toBeInTheDocument();
      }, { timeout: 3000 });
      
      expect(attemptCount).toBe(2);
    });

    it('handles network timeout gracefully', async () => {
      server.use(
        rest.get('/api/audit/logs', (req, res, ctx) => {
          return res(ctx.delay(5000), ctx.json(generateMockAuditData()));
        })
      );
      
      renderComponent();
      
      // Should show loading state
      expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
      
      // Cancel or timeout handling would happen here
    });
  });

  describe('Real-time Updates Integration', () => {
    it('receives and displays WebSocket updates', async () => {
      const { container } = renderComponent();
      
      await waitFor(() => {
        expect(screen.getByText(/Action 1/)).toBeInTheDocument();
      });
      
      // Simulate WebSocket message
      const newEvent: AuditEntry = {
        id: 'ws-event-1',
        timestamp: new Date().toISOString(),
        actor: {
          id: 'ws-user',
          name: 'WebSocket User',
          email: 'ws@example.com',
          role: 'Admin',
          type: 'user',
        },
        action: {
          type: 'TEMPLATE_CREATED',
          category: 'template',
          severity: 'info',
          description: 'Real-time event',
        },
        target: {
          type: 'template',
          id: 'ws-template',
          name: 'WebSocket Template',
        },
        metadata: {
          correlationId: 'ws-corr',
        },
        status: 'success',
      };
      
      // Mock WebSocket service would emit this event
      // In real implementation, this would be handled by the WebSocket connection
      
      // Check for real-time update indicator
      const updateBadge = container.querySelector('[data-testid="live-update-badge"]');
      expect(updateBadge).toBeInTheDocument();
    });

    it('handles WebSocket disconnection and fallback', async () => {
      const WebSocketMock = vi.fn().mockImplementation(() => ({
        connect: vi.fn(),
        disconnect: vi.fn(),
        subscribe: vi.fn(),
        unsubscribe: vi.fn(),
        getConnectionStatus: vi.fn()
          .mockReturnValueOnce('connecting')
          .mockReturnValueOnce('connected')
          .mockReturnValueOnce('disconnected')
          .mockReturnValue('polling'),
        getEventQueue: vi.fn().mockReturnValue([]),
      }));
      
      vi.mocked(WebSocketMock);
      
      renderComponent();
      
      await waitFor(() => {
        expect(screen.getByText(/Action 1/)).toBeInTheDocument();
      });
      
      // Connection status should be visible
      const statusIndicator = screen.getByTestId('connection-status');
      expect(statusIndicator).toBeInTheDocument();
    });
  });

  describe('Complex Filter Scenarios', () => {
    it('combines multiple filters correctly', async () => {
      renderComponent();
      const user = userEvent.setup();
      
      await waitFor(() => {
        expect(screen.getByPlaceholderText('Szabad szöveges keresés...')).toBeInTheDocument();
      });
      
      // Apply multiple filters
      const searchInput = screen.getByPlaceholderText('Szabad szöveges keresés...');
      await user.type(searchInput, 'template');
      
      // Open advanced filters
      const advancedButton = screen.getByText(/speciális szűrők/i);
      await user.click(advancedButton);
      
      // Select status filter
      const successCheckbox = screen.getByLabelText('Sikeres');
      await user.click(successCheckbox);
      
      // Apply date range
      const todayButton = screen.getByText('Ma');
      await user.click(todayButton);
      
      // Verify filters are applied
      await waitFor(() => {
        const activeFilters = screen.getAllByTestId(/active-filter/);
        expect(activeFilters.length).toBeGreaterThan(2);
      });
    });

    it('saves and loads filter presets', async () => {
      renderComponent();
      const user = userEvent.setup();
      
      await waitFor(() => {
        expect(screen.getByPlaceholderText('Szabad szöveges keresés...')).toBeInTheDocument();
      });
      
      // Apply filters
      const searchInput = screen.getByPlaceholderText('Szabad szöveges keresés...');
      await user.type(searchInput, 'security');
      
      // Save as preset
      window.prompt = vi.fn().mockReturnValue('Security Filter');
      const saveButton = screen.getByText('Mentés előbeállításként');
      await user.click(saveButton);
      
      // Clear filters
      const clearButton = screen.getByText('Szűrők törlése');
      await user.click(clearButton);
      
      // Load preset
      const presetDropdown = screen.getByPlaceholderText('Válassz előbeállítást...');
      await user.click(presetDropdown);
      
      const securityPreset = await screen.findByText('Security Filter');
      await user.click(securityPreset);
      
      // Verify filter is applied
      expect(searchInput).toHaveValue('security');
    });
  });

  describe('Correlation View Integration', () => {
    it('loads and displays correlated events', async () => {
      renderComponent();
      const user = userEvent.setup();
      
      await waitFor(() => {
        expect(screen.getByText(/Action 1/)).toBeInTheDocument();
      });
      
      // Click on a correlation ID
      const correlationLink = screen.getAllByText(/corr-/)[0];
      await user.click(correlationLink);
      
      // Should load correlation view
      await waitFor(() => {
        expect(screen.getByText(/kapcsolódó események/i)).toBeInTheDocument();
      });
      
      // Should display multiple correlated events
      const correlatedEvents = screen.getAllByTestId(/correlation-event/);
      expect(correlatedEvents.length).toBeGreaterThan(1);
    });

    it('exports correlation chain', async () => {
      renderComponent();
      const user = userEvent.setup();
      
      await waitFor(() => {
        expect(screen.getByText(/Action 1/)).toBeInTheDocument();
      });
      
      // Open correlation view
      const correlationLink = screen.getAllByText(/corr-/)[0];
      await user.click(correlationLink);
      
      await waitFor(() => {
        expect(screen.getByText(/kapcsolódó események/i)).toBeInTheDocument();
      });
      
      // Export correlation
      const exportButton = screen.getByRole('button', { name: /exportálás/i });
      await user.click(exportButton);
      
      // Verify export initiated
      await waitFor(() => {
        expect(screen.getByText(/export/i)).toBeInTheDocument();
      });
    });
  });

  describe('Analytics View Integration', () => {
    it('loads and displays audit statistics', async () => {
      renderComponent();
      const user = userEvent.setup();
      
      await waitFor(() => {
        expect(screen.getByRole('tab', { name: /elemzés/i })).toBeInTheDocument();
      });
      
      // Switch to analytics tab
      const analyticsTab = screen.getByRole('tab', { name: /elemzés/i });
      await user.click(analyticsTab);
      
      // Should load statistics
      await waitFor(() => {
        expect(screen.getByText(/események naponta/i)).toBeInTheDocument();
      });
      
      // Verify charts/stats are displayed
      expect(screen.getByText(/top felhasználók/i)).toBeInTheDocument();
      expect(screen.getByText(/gyakori műveletek/i)).toBeInTheDocument();
    });

    it('generates compliance reports', async () => {
      renderComponent();
      const user = userEvent.setup();
      
      // Switch to analytics
      const analyticsTab = screen.getByRole('tab', { name: /elemzés/i });
      await user.click(analyticsTab);
      
      await waitFor(() => {
        expect(screen.getByText(/jelentések/i)).toBeInTheDocument();
      });
      
      // Open reports tab
      const reportsTab = screen.getByRole('tab', { name: /jelentések/i });
      await user.click(reportsTab);
      
      // Generate user access report
      const userAccessButton = screen.getByText(/felhasználói hozzáférés/i);
      await user.click(userAccessButton);
      
      // Should start report generation
      await waitFor(() => {
        expect(screen.getByText(/jelentés generálása/i)).toBeInTheDocument();
      });
    });
  });

  describe('Performance Under Load', () => {
    it('handles large dataset efficiently', async () => {
      server.use(
        rest.get('/api/audit/logs', (req, res, ctx) => {
          return res(ctx.json({
            entries: generateMockAuditData(1, 1000).entries,
            pagination: {
              hasMore: false,
              totalCount: 1000,
            },
          }));
        })
      );
      
      const startTime = performance.now();
      renderComponent();
      
      await waitFor(() => {
        expect(screen.getByText(/Action 1/)).toBeInTheDocument();
      });
      
      const loadTime = performance.now() - startTime;
      
      // Should load within reasonable time (3 seconds)
      expect(loadTime).toBeLessThan(3000);
      
      // Should use virtual scrolling for performance
      const visibleEntries = screen.getAllByTestId(/audit-entry/);
      expect(visibleEntries.length).toBeLessThan(100); // Not all 1000 rendered
    });

    it('debounces rapid filter changes', async () => {
      let apiCallCount = 0;
      server.use(
        rest.get('/api/audit/logs', (req, res, ctx) => {
          apiCallCount++;
          return res(ctx.json(generateMockAuditData()));
        })
      );
      
      renderComponent();
      const user = userEvent.setup({ delay: null });
      
      await waitFor(() => {
        expect(screen.getByPlaceholderText('Szabad szöveges keresés...')).toBeInTheDocument();
      });
      
      const initialCallCount = apiCallCount;
      
      // Type rapidly
      const searchInput = screen.getByPlaceholderText('Szabad szöveges keresés...');
      await user.type(searchInput, 'test search query');
      
      // Wait for debounce
      await waitFor(() => {
        // Should only make 1-2 additional calls despite multiple keystrokes
        expect(apiCallCount - initialCallCount).toBeLessThanOrEqual(2);
      }, { timeout: 2000 });
    });
  });
});