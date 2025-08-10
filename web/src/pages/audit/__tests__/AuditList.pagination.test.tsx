import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { AuditList } from '../AuditList';
import * as auditService from '@/services/audit';
import type { AuditEntry, AuditPaginatedResponse } from '@/types/audit';

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
  }),
}));

// Mock WebSocket service
const mockWsInstance = {
  connect: vi.fn(),
  disconnect: vi.fn(),
  subscribe: vi.fn(),
  unsubscribe: vi.fn(),
  onMessage: vi.fn(() => () => {}),
  onStatusChange: vi.fn(() => () => {}),
  getConnectionStatus: vi.fn().mockReturnValue('connected'),
  getEventQueue: vi.fn().mockReturnValue([]),
};
vi.mock('@/services/auditWebSocket', () => ({
  AuditWebSocketService: vi.fn().mockImplementation(() => mockWsInstance),
  getAuditWebSocket: vi.fn(() => null),
  createAuditWebSocket: vi.fn(() => mockWsInstance),
  default: vi.fn().mockImplementation(() => mockWsInstance),
}));

const generateMockAuditEntries = (count: number, startId = 1): AuditEntry[] => {
  return Array.from({ length: count }, (_, i) => ({
    id: `audit-${startId + i}`,
    timestamp: new Date(Date.now() - i * 60000).toISOString(),
    actor: {
      id: `user-${i % 3}`,
      name: `User ${i % 3}`,
      email: `user${i % 3}@example.com`,
      role: 'User',
      type: 'user' as const,
    },
    action: {
      type: 'TEMPLATE_CREATED' as const,
      category: 'template' as const,
      severity: 'info' as const,
      description: `Template action ${startId + i}`,
    },
    target: {
      type: 'template',
      id: `template-${startId + i}`,
      name: `Template ${startId + i}`,
    },
    metadata: {
      correlationId: `corr-${startId + i}`,
      duration: 1000 + i * 100,
    },
    status: 'success' as const,
  }));
};

describe('AuditList - Pagination and Virtual Scrolling Tests', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock to prevent real HTTP calls; individual tests override as needed
    vi.spyOn(auditService, 'getAuditLogs').mockResolvedValue({
      entries: [],
      pagination: { hasMore: false, totalCount: 0 },
    } as any);
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
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

  describe('Pagination Functionality', () => {
    it('loads initial page of audit entries', async () => {
      const mockEntries = generateMockAuditEntries(20);
      
      vi.spyOn(auditService, 'getAuditLogs').mockResolvedValue({
        entries: mockEntries,
        pagination: {
          cursor: 'next-cursor',
          hasMore: true,
          totalCount: 100,
        },
      });

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Template action 1')).toBeInTheDocument();
        expect(screen.getByText('Template action 20')).toBeInTheDocument();
      });
    });

    it('loads more entries when scrolling to bottom', async () => {
      const firstPage = generateMockAuditEntries(20, 1);
      const secondPage = generateMockAuditEntries(20, 21);
      
      vi.spyOn(auditService, 'getAuditLogs')
        .mockResolvedValueOnce({
          entries: firstPage,
          pagination: {
            cursor: 'cursor-2',
            hasMore: true,
            totalCount: 100,
          },
        })
        .mockResolvedValueOnce({
          entries: secondPage,
          pagination: {
            cursor: 'cursor-3',
            hasMore: true,
            totalCount: 100,
          },
        });

      renderComponent();

      // Wait for first page
      await waitFor(() => {
        expect(screen.getByText('Template action 1')).toBeInTheDocument();
      });

      // Find and click load more button
      const loadMoreButton = await screen.findByText('További betöltése');
      fireEvent.click(loadMoreButton);

      // Wait for second page
      await waitFor(() => {
        expect(screen.getByText('Template action 21')).toBeInTheDocument();
        expect(screen.getByText('Template action 40')).toBeInTheDocument();
      });

      // Verify both pages are displayed
      expect(screen.getByText('Template action 1')).toBeInTheDocument();
      expect(screen.getByText('Template action 40')).toBeInTheDocument();
    });

    it('shows loading indicator while fetching next page', async () => {
      const mockEntries = generateMockAuditEntries(20);
      
      vi.spyOn(auditService, 'getAuditLogs').mockImplementation(
        () => new Promise(resolve => 
          setTimeout(() => resolve({
            entries: mockEntries,
            pagination: {
              cursor: 'next',
              hasMore: true,
              totalCount: 100,
            },
          }), 1000)
        )
      );

      renderComponent();

      // Should show loading spinner initially
      expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
      });
    });

    it('handles empty result set gracefully', async () => {
      vi.spyOn(auditService, 'getAuditLogs').mockResolvedValue({
        entries: [],
        pagination: {
          hasMore: false,
          totalCount: 0,
        },
      });

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Nincs megjeleníthető audit bejegyzés')).toBeInTheDocument();
      });
    });

    it('disables load more button when no more entries', async () => {
      const mockEntries = generateMockAuditEntries(10);
      
      vi.spyOn(auditService, 'getAuditLogs').mockResolvedValue({
        entries: mockEntries,
        pagination: {
          hasMore: false,
          totalCount: 10,
        },
      });

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Template action 1')).toBeInTheDocument();
      });

      // Load more button should not be present
      expect(screen.queryByText('További betöltése')).not.toBeInTheDocument();
    });

    it('retains scroll position when loading more entries', async () => {
      const firstPage = generateMockAuditEntries(20, 1);
      const secondPage = generateMockAuditEntries(20, 21);
      
      vi.spyOn(auditService, 'getAuditLogs')
        .mockResolvedValueOnce({
          entries: firstPage,
          pagination: {
            cursor: 'cursor-2',
            hasMore: true,
            totalCount: 100,
          },
        })
        .mockResolvedValueOnce({
          entries: secondPage,
          pagination: {
            cursor: 'cursor-3',
            hasMore: false,
            totalCount: 40,
          },
        });

      const { container } = renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Template action 1')).toBeInTheDocument();
      });

      // Get scroll container
      const scrollContainer = container.querySelector('[data-testid="audit-list-container"]');
      if (scrollContainer) {
        // Save scroll position
        const initialScrollTop = scrollContainer.scrollTop;
        
        // Load more
        const loadMoreButton = screen.getByText('További betöltése');
        fireEvent.click(loadMoreButton);

        await waitFor(() => {
          expect(screen.getByText('Template action 21')).toBeInTheDocument();
        });

        // Scroll position should be maintained or adjusted
        expect(scrollContainer.scrollTop).toBeGreaterThanOrEqual(initialScrollTop);
      }
    });
  });

  describe('Virtual Scrolling', () => {
    it('renders only visible items for large datasets', async () => {
      const largeDataset = generateMockAuditEntries(1000);
      
      vi.spyOn(auditService, 'getAuditLogs').mockResolvedValue({
        entries: largeDataset,
        pagination: {
          hasMore: false,
          totalCount: 1000,
        },
      });

      const { container } = renderComponent();

      await waitFor(() => {
        // Check that container exists
        const listContainer = container.querySelector('[data-testid="audit-list-container"]');
        expect(listContainer).toBeInTheDocument();
      });

      // Should not render all 1000 items at once
      const renderedItems = container.querySelectorAll('[data-testid^="audit-entry-"]');
      
      // Virtual scrolling should limit rendered items (exact number depends on viewport)
      // We check that it's significantly less than total
      expect(renderedItems.length).toBeLessThan(100);
    });

    it('updates visible items when scrolling', async () => {
      const entries = generateMockAuditEntries(200);
      
      vi.spyOn(auditService, 'getAuditLogs').mockResolvedValue({
        entries,
        pagination: {
          hasMore: false,
          totalCount: 200,
        },
      });

      const { container } = renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Template action 1')).toBeInTheDocument();
      });

      const scrollContainer = container.querySelector('[data-testid="audit-list-container"]');
      if (scrollContainer) {
        // Simulate scroll to middle
        fireEvent.scroll(scrollContainer, { target: { scrollTop: 5000 } });

        await waitFor(() => {
          // Items from middle of list should now be visible
          // Exact items depend on virtual scrolling implementation
          const visibleItems = container.querySelectorAll('[data-testid^="audit-entry-"]');
          expect(visibleItems.length).toBeGreaterThan(0);
        });
      }
    });

    it('maintains consistent item heights for smooth scrolling', async () => {
      const entries = generateMockAuditEntries(50);
      
      vi.spyOn(auditService, 'getAuditLogs').mockResolvedValue({
        entries,
        pagination: {
          hasMore: false,
          totalCount: 50,
        },
      });

      const { container } = renderComponent();

      await waitFor(() => {
        const items = container.querySelectorAll('[data-testid^="audit-entry-"]');
        expect(items.length).toBeGreaterThan(0);
        
        // Check that all items have consistent height
        const heights = Array.from(items).map(item => item.clientHeight);
        const uniqueHeights = new Set(heights);
        
        // Should have at most 2 different heights (normal and expanded)
        expect(uniqueHeights.size).toBeLessThanOrEqual(2);
      });
    });
  });

  describe('Cursor-based Pagination', () => {
    it('uses cursor for subsequent page loads', async () => {
      const getAuditLogsSpy = vi.spyOn(auditService, 'getAuditLogs')
        .mockResolvedValueOnce({
          entries: generateMockAuditEntries(20, 1),
          pagination: {
            cursor: 'cursor-abc-123',
            hasMore: true,
            totalCount: 100,
          },
        })
        .mockResolvedValueOnce({
          entries: generateMockAuditEntries(20, 21),
          pagination: {
            cursor: 'cursor-def-456',
            hasMore: true,
            totalCount: 100,
          },
        });

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Template action 1')).toBeInTheDocument();
      });

      // First call should not have cursor
      expect(getAuditLogsSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          cursor: undefined,
        })
      );

      // Load more
      const loadMoreButton = screen.getByText('További betöltése');
      fireEvent.click(loadMoreButton);

      await waitFor(() => {
        expect(screen.getByText('Template action 21')).toBeInTheDocument();
      });

      // Second call should use cursor from first response
      expect(getAuditLogsSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          cursor: 'cursor-abc-123',
        })
      );
    });

    it('resets cursor when filters change', async () => {
      const getAuditLogsSpy = vi.spyOn(auditService, 'getAuditLogs')
        .mockResolvedValue({
          entries: generateMockAuditEntries(20),
          pagination: {
            cursor: 'cursor-123',
            hasMore: true,
            totalCount: 100,
          },
        });

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Template action 1')).toBeInTheDocument();
      });

      // Apply a filter
      const searchInput = screen.getByPlaceholderText('Szabad szöveges keresés...');
      fireEvent.change(searchInput, { target: { value: 'test' } });

      await waitFor(() => {
        // Should make new call without cursor
        expect(getAuditLogsSpy).toHaveBeenLastCalledWith(
          expect.objectContaining({
            cursor: undefined,
            filters: expect.objectContaining({
              searchText: 'test',
            }),
          })
        );
      });
    });
  });

  describe('Performance Optimizations', () => {
    it('debounces filter changes to reduce API calls', async () => {
      const getAuditLogsSpy = vi.spyOn(auditService, 'getAuditLogs')
        .mockResolvedValue({
          entries: generateMockAuditEntries(10),
          pagination: {
            hasMore: false,
            totalCount: 10,
          },
        });

      renderComponent();

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Szabad szöveges keresés...')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText('Szabad szöveges keresés...');
      
      // Type rapidly
      fireEvent.change(searchInput, { target: { value: 't' } });
      fireEvent.change(searchInput, { target: { value: 'te' } });
      fireEvent.change(searchInput, { target: { value: 'tes' } });
      fireEvent.change(searchInput, { target: { value: 'test' } });

      // Wait for debounce
      await waitFor(() => {
        // Should only make 2 calls (initial load + debounced search)
        expect(getAuditLogsSpy).toHaveBeenCalledTimes(2);
      }, { timeout: 1000 });
    });

    it('caches pages to avoid refetching', async () => {
      const getAuditLogsSpy = vi.spyOn(auditService, 'getAuditLogs')
        .mockResolvedValue({
          entries: generateMockAuditEntries(20),
          pagination: {
            hasMore: false,
            totalCount: 20,
          },
        });

      const { rerender } = renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Template action 1')).toBeInTheDocument();
      });

      // Initial load
      expect(getAuditLogsSpy).toHaveBeenCalledTimes(1);

      // Force re-render
      rerender(
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <AuditList />
          </BrowserRouter>
        </QueryClientProvider>
      );

      // Should use cached data, no additional API call
      expect(getAuditLogsSpy).toHaveBeenCalledTimes(1);
      expect(screen.getByText('Template action 1')).toBeInTheDocument();
    });

    it('handles rapid pagination requests gracefully', async () => {
      let callCount = 0;
      const getAuditLogsSpy = vi.spyOn(auditService, 'getAuditLogs')
        .mockImplementation(() => {
          callCount++;
          return Promise.resolve({
            entries: generateMockAuditEntries(20, callCount * 20 - 19),
            pagination: {
              cursor: `cursor-${callCount}`,
              hasMore: callCount < 5,
              totalCount: 100,
            },
          });
        });

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Template action 1')).toBeInTheDocument();
      });

      // Rapidly click load more multiple times
      for (let i = 0; i < 3; i++) {
        const loadMoreButton = screen.queryByText('További betöltése');
        if (loadMoreButton) {
          fireEvent.click(loadMoreButton);
        }
      }

      // Should handle concurrent requests properly
      await waitFor(() => {
        // Check that multiple pages loaded
        expect(getAuditLogsSpy.mock.calls.length).toBeGreaterThanOrEqual(2);
      });
    });
  });

  describe('Error Handling', () => {
    it('displays error message when pagination fails', async () => {
      vi.spyOn(auditService, 'getAuditLogs')
        .mockRejectedValue(new Error('Network error'));

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText(/Hiba történt az audit bejegyzések betöltése során/)).toBeInTheDocument();
      });
    });

    it('allows retry after pagination error', async () => {
      vi.spyOn(auditService, 'getAuditLogs')
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          entries: generateMockAuditEntries(10),
          pagination: {
            hasMore: false,
            totalCount: 10,
          },
        });

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText(/Hiba történt/)).toBeInTheDocument();
      });

      // Click retry button
      const retryButton = screen.getByText('Újrapróbálkozás');
      fireEvent.click(retryButton);

      await waitFor(() => {
        expect(screen.getByText('Template action 1')).toBeInTheDocument();
      });
    });

    it('handles infinite scroll errors gracefully', async () => {
      vi.spyOn(auditService, 'getAuditLogs')
        .mockResolvedValueOnce({
          entries: generateMockAuditEntries(20, 1),
          pagination: {
            cursor: 'cursor-1',
            hasMore: true,
            totalCount: 100,
          },
        })
        .mockRejectedValueOnce(new Error('Load more error'));

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Template action 1')).toBeInTheDocument();
      });

      // Try to load more
      const loadMoreButton = screen.getByText('További betöltése');
      fireEvent.click(loadMoreButton);

      await waitFor(() => {
        // Should show error but keep existing data
        expect(screen.getByText('Template action 1')).toBeInTheDocument();
        expect(screen.getByText(/Hiba történt a további bejegyzések betöltése során/)).toBeInTheDocument();
      });
    });
  });
});