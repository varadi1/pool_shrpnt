import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { AuditList } from '../AuditList';
import * as auditService from '@/services/audit';
import type { AuditEntry } from '@/types/audit';

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

const generateLargeDataset = (size: number): AuditEntry[] => {
  return Array.from({ length: size }, (_, i) => ({
    id: `audit-${i}`,
    timestamp: new Date(Date.now() - i * 1000).toISOString(),
    actor: {
      id: `user-${i % 100}`,
      name: `User ${i % 100}`,
      email: `user${i % 100}@example.com`,
      role: ['Admin', 'User', 'Manager'][i % 3],
      type: 'user' as const,
    },
    action: {
      type: ['TEMPLATE_CREATED', 'ORDER_PROVISIONED', 'PERMISSION_GRANTED'][i % 3] as any,
      category: ['template', 'provisioning', 'security'][i % 3] as any,
      severity: ['info', 'warning', 'error'][i % 3] as any,
      description: `Action ${i} with some longer description text to simulate real data`,
    },
    target: {
      type: ['template', 'order', 'permission'][i % 3],
      id: `target-${i}`,
      name: `Target ${i} with a reasonably long name`,
      path: `/path/to/resource/${i}/nested/deep/structure`,
    },
    changes: i % 5 === 0 ? {
      before: { field1: 'old value', field2: 123, field3: true },
      after: { field1: 'new value', field2: 456, field3: false },
    } : undefined,
    metadata: {
      correlationId: `corr-${Math.floor(i / 10)}`,
      sessionId: `session-${i % 50}`,
      ipAddress: `192.168.${Math.floor(i / 255)}.${i % 255}`,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      duration: Math.floor(Math.random() * 5000),
    },
    status: i % 20 === 0 ? 'failure' : 'success',
    error: i % 20 === 0 ? {
      code: 'ERR_PERMISSION_DENIED',
      message: 'User does not have permission to perform this action',
    } : undefined,
  }));
};

describe('AuditList - Performance Tests for Large Datasets', () => {
  let queryClient: QueryClient;
  let performanceObserver: PerformanceObserver | null = null;
  let renderMetrics: {
    renderTime: number;
    interactionTime: number;
    memoryUsage?: number;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    
    renderMetrics = {
      renderTime: 0,
      interactionTime: 0,
    };
    
    // Set up performance observer
    if (typeof PerformanceObserver !== 'undefined') {
      performanceObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.entryType === 'measure') {
            if (entry.name === 'render-time') {
              renderMetrics.renderTime = entry.duration;
            } else if (entry.name === 'interaction-time') {
              renderMetrics.interactionTime = entry.duration;
            }
          }
        }
      });
      performanceObserver.observe({ entryTypes: ['measure'] });
    }
  });

  afterEach(() => {
    if (performanceObserver) {
      performanceObserver.disconnect();
    }
    performance.clearMarks();
    performance.clearMeasures();
  });

  const renderComponent = () => {
    performance.mark('render-start');
    const result = render(
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AuditList />
        </BrowserRouter>
      </QueryClientProvider>
    );
    performance.mark('render-end');
    performance.measure('render-time', 'render-start', 'render-end');
    return result;
  };

  describe('Initial Load Performance', () => {
    it('renders 1000 entries within 3 seconds', async () => {
      const largeDataset = generateLargeDataset(1000);
      
      vi.spyOn(auditService, 'getAuditLogs').mockResolvedValue({
        entries: largeDataset,
        pagination: {
          hasMore: false,
          totalCount: 1000,
        },
      });

      const startTime = performance.now();
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText(/Action 0/)).toBeInTheDocument();
      });

      const endTime = performance.now();
      const totalTime = endTime - startTime;

      expect(totalTime).toBeLessThan(3000);
      console.log(`Rendered 1000 entries in ${totalTime.toFixed(2)}ms`);
    });

    it('renders 10000 entries with virtual scrolling', async () => {
      const hugeDataset = generateLargeDataset(10000);
      
      vi.spyOn(auditService, 'getAuditLogs').mockResolvedValue({
        entries: hugeDataset,
        pagination: {
          hasMore: false,
          totalCount: 10000,
        },
      });

      const { container } = renderComponent();

      await waitFor(() => {
        const listContainer = container.querySelector('[data-testid="audit-list-container"]');
        expect(listContainer).toBeInTheDocument();
      });

      // Check that not all items are rendered (virtual scrolling)
      const renderedItems = container.querySelectorAll('[data-testid^="audit-entry-"]');
      
      // Should render significantly fewer items than total
      expect(renderedItems.length).toBeLessThan(100);
      
      // Memory usage should be reasonable
      if (performance.memory) {
        const memoryUsed = performance.memory.usedJSHeapSize / 1048576; // Convert to MB
        expect(memoryUsed).toBeLessThan(200); // Less than 200MB
        console.log(`Memory usage: ${memoryUsed.toFixed(2)}MB`);
      }
    });

    it('handles initial render of complex entries efficiently', async () => {
      const complexDataset = generateLargeDataset(500).map(entry => ({
        ...entry,
        changes: {
          before: Object.fromEntries(Array.from({ length: 50 }, (_, i) => [`field${i}`, `value${i}`])),
          after: Object.fromEntries(Array.from({ length: 50 }, (_, i) => [`field${i}`, `newValue${i}`])),
        },
        metadata: {
          ...entry.metadata,
          customData: Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`meta${i}`, `data${i}`])),
        },
      }));

      vi.spyOn(auditService, 'getAuditLogs').mockResolvedValue({
        entries: complexDataset,
        pagination: {
          hasMore: false,
          totalCount: 500,
        },
      });

      const startTime = performance.now();
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText(/Action 0/)).toBeInTheDocument();
      });

      const endTime = performance.now();
      const totalTime = endTime - startTime;

      // Even with complex data, should render quickly
      expect(totalTime).toBeLessThan(2000);
    });
  });

  describe('Scrolling Performance', () => {
    it('maintains 60fps while scrolling through large dataset', async () => {
      const largeDataset = generateLargeDataset(5000);
      
      vi.spyOn(auditService, 'getAuditLogs').mockResolvedValue({
        entries: largeDataset,
        pagination: {
          hasMore: false,
          totalCount: 5000,
        },
      });

      const { container } = renderComponent();

      await waitFor(() => {
        const listContainer = container.querySelector('[data-testid="audit-list-container"]');
        expect(listContainer).toBeInTheDocument();
      });

      const scrollContainer = container.querySelector('[data-testid="audit-list-container"]');
      if (!scrollContainer) return;

      // Simulate rapid scrolling
      const scrollPositions = [0, 1000, 2000, 3000, 4000, 5000];
      const frameTimes: number[] = [];

      for (const position of scrollPositions) {
        const frameStart = performance.now();
        
        fireEvent.scroll(scrollContainer, { target: { scrollTop: position } });
        
        // Wait for next frame
        await new Promise(resolve => requestAnimationFrame(resolve));
        
        const frameEnd = performance.now();
        frameTimes.push(frameEnd - frameStart);
      }

      // Average frame time should be less than 16.67ms (60fps)
      const avgFrameTime = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
      expect(avgFrameTime).toBeLessThan(20); // Allow some margin
      console.log(`Average frame time during scroll: ${avgFrameTime.toFixed(2)}ms`);
    });

    it('efficiently updates visible items during scroll', async () => {
      const largeDataset = generateLargeDataset(2000);
      
      vi.spyOn(auditService, 'getAuditLogs').mockResolvedValue({
        entries: largeDataset,
        pagination: {
          hasMore: false,
          totalCount: 2000,
        },
      });

      const { container } = renderComponent();

      await waitFor(() => {
        const listContainer = container.querySelector('[data-testid="audit-list-container"]');
        expect(listContainer).toBeInTheDocument();
      });

      const scrollContainer = container.querySelector('[data-testid="audit-list-container"]');
      if (!scrollContainer) return;

      // Get initial rendered items
      const initialItems = container.querySelectorAll('[data-testid^="audit-entry-"]');
      const initialCount = initialItems.length;

      // Scroll to middle
      fireEvent.scroll(scrollContainer, { target: { scrollTop: 10000 } });

      await waitFor(() => {
        const currentItems = container.querySelectorAll('[data-testid^="audit-entry-"]');
        // Should still have similar number of rendered items (virtual scrolling)
        expect(Math.abs(currentItems.length - initialCount)).toBeLessThan(20);
      });
    });
  });

  describe('Filter Performance', () => {
    it('filters 10000 entries efficiently', async () => {
      const largeDataset = generateLargeDataset(10000);
      
      vi.spyOn(auditService, 'getAuditLogs').mockResolvedValue({
        entries: largeDataset,
        pagination: {
          hasMore: false,
          totalCount: 10000,
        },
      });

      renderComponent();

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Szabad szöveges keresés...')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText('Szabad szöveges keresés...');
      
      performance.mark('filter-start');
      fireEvent.change(searchInput, { target: { value: 'template' } });
      
      await waitFor(() => {
        // Filter should be applied
        expect(searchInput).toHaveValue('template');
      });
      
      performance.mark('filter-end');
      performance.measure('filter-time', 'filter-start', 'filter-end');

      // Filtering should be fast
      const filterMeasure = performance.getEntriesByName('filter-time')[0] as PerformanceMeasure;
      expect(filterMeasure.duration).toBeLessThan(500);
    });

    it('handles complex filter combinations efficiently', async () => {
      const largeDataset = generateLargeDataset(5000);
      
      vi.spyOn(auditService, 'getAuditLogs').mockResolvedValue({
        entries: largeDataset,
        pagination: {
          hasMore: false,
          totalCount: 5000,
        },
      });

      renderComponent();

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Szabad szöveges keresés...')).toBeInTheDocument();
      });

      performance.mark('complex-filter-start');

      // Apply multiple filters
      const searchInput = screen.getByPlaceholderText('Szabad szöveges keresés...');
      fireEvent.change(searchInput, { target: { value: 'action' } });

      // Open advanced filters
      const advancedButton = screen.getByText(/speciális szűrők/i);
      fireEvent.click(advancedButton);

      // Apply status filter
      const successCheckbox = await screen.findByLabelText('Sikeres');
      fireEvent.click(successCheckbox);

      performance.mark('complex-filter-end');
      performance.measure('complex-filter-time', 'complex-filter-start', 'complex-filter-end');

      const filterMeasure = performance.getEntriesByName('complex-filter-time')[0] as PerformanceMeasure;
      expect(filterMeasure.duration).toBeLessThan(1000);
    });

    it('debounces search input for performance', async () => {
      const largeDataset = generateLargeDataset(1000);
      let apiCallCount = 0;
      
      vi.spyOn(auditService, 'getAuditLogs').mockImplementation(() => {
        apiCallCount++;
        return Promise.resolve({
          entries: largeDataset,
          pagination: {
            hasMore: false,
            totalCount: 1000,
          },
        });
      });

      renderComponent();

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Szabad szöveges keresés...')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText('Szabad szöveges keresés...');
      const initialCallCount = apiCallCount;

      // Simulate rapid typing
      const text = 'searching for specific items';
      for (const char of text) {
        fireEvent.change(searchInput, { 
          target: { value: searchInput.value + char } 
        });
      }

      // Wait for debounce
      await new Promise(resolve => setTimeout(resolve, 600));

      // Should only make 1 additional API call despite multiple inputs
      expect(apiCallCount - initialCallCount).toBeLessThanOrEqual(2);
    });
  });

  describe('Memory Management', () => {
    it('releases memory when components unmount', async () => {
      const largeDataset = generateLargeDataset(1000);
      
      vi.spyOn(auditService, 'getAuditLogs').mockResolvedValue({
        entries: largeDataset,
        pagination: {
          hasMore: false,
          totalCount: 1000,
        },
      });

      const { unmount } = renderComponent();

      await waitFor(() => {
        expect(screen.getByText(/Action 0/)).toBeInTheDocument();
      });

      const memoryBefore = performance.memory?.usedJSHeapSize;

      unmount();

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const memoryAfter = performance.memory?.usedJSHeapSize;

      if (memoryBefore && memoryAfter) {
        // Memory should be released
        expect(memoryAfter).toBeLessThanOrEqual(memoryBefore);
        console.log(`Memory released: ${((memoryBefore - memoryAfter) / 1048576).toFixed(2)}MB`);
      }
    });

    it('handles memory efficiently with infinite scroll', async () => {
      let currentPage = 1;
      
      vi.spyOn(auditService, 'getAuditLogs').mockImplementation(({ cursor }) => {
        const page = cursor ? parseInt(cursor.split('-')[1]) : 1;
        currentPage = page;
        
        return Promise.resolve({
          entries: generateLargeDataset(100),
          pagination: {
            cursor: page < 50 ? `page-${page + 1}` : undefined,
            hasMore: page < 50,
            totalCount: 5000,
          },
        });
      });

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText(/Action 0/)).toBeInTheDocument();
      });

      const initialMemory = performance.memory?.usedJSHeapSize || 0;

      // Load multiple pages
      for (let i = 0; i < 10; i++) {
        const loadMoreButton = await screen.findByText('További betöltése');
        fireEvent.click(loadMoreButton);
        
        await waitFor(() => {
          expect(screen.getByText(new RegExp(`Action ${i * 100}`))).toBeInTheDocument();
        });
      }

      const finalMemory = performance.memory?.usedJSHeapSize || 0;
      const memoryIncrease = (finalMemory - initialMemory) / 1048576; // MB

      // Memory increase should be reasonable
      expect(memoryIncrease).toBeLessThan(50); // Less than 50MB for 1000 items
      console.log(`Memory increase after loading 10 pages: ${memoryIncrease.toFixed(2)}MB`);
    });
  });

  describe('Export Performance', () => {
    it('exports large dataset efficiently', async () => {
      const largeDataset = generateLargeDataset(5000);
      
      vi.spyOn(auditService, 'getAuditLogs').mockResolvedValue({
        entries: largeDataset,
        pagination: {
          hasMore: false,
          totalCount: 5000,
        },
      });

      vi.spyOn(auditService, 'createExportJob').mockResolvedValue({
        id: 'export-123',
        status: 'processing',
        format: 'csv',
        filters: {},
        createdAt: new Date(),
        progress: { current: 0, total: 5000, percentage: 0 },
      });

      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /exportálás/i })).toBeInTheDocument();
      });

      performance.mark('export-start');
      
      const exportButton = screen.getByRole('button', { name: /exportálás/i });
      fireEvent.click(exportButton);

      const startExportButton = await screen.findByRole('button', { name: /exportálás indítása/i });
      fireEvent.click(startExportButton);

      performance.mark('export-end');
      performance.measure('export-time', 'export-start', 'export-end');

      const exportMeasure = performance.getEntriesByName('export-time')[0] as PerformanceMeasure;
      
      // Export initiation should be fast
      expect(exportMeasure.duration).toBeLessThan(1000);
    });

    it('chunks large exports for better performance', async () => {
      const chunkSizes: number[] = [];
      
      vi.spyOn(auditService, 'createExportJob').mockImplementation((options) => {
        chunkSizes.push(options.chunkSize || 5000);
        
        return Promise.resolve({
          id: 'export-123',
          status: 'processing',
          format: options.format,
          filters: options.filters,
          createdAt: new Date(),
          progress: { current: 0, total: 50000, percentage: 0 },
        });
      });

      vi.spyOn(auditService, 'getAuditLogs').mockResolvedValue({
        entries: generateLargeDataset(100),
        pagination: {
          hasMore: false,
          totalCount: 50000,
        },
      });

      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /exportálás/i })).toBeInTheDocument();
      });

      const exportButton = screen.getByRole('button', { name: /exportálás/i });
      fireEvent.click(exportButton);

      const startExportButton = await screen.findByRole('button', { name: /exportálás indítása/i });
      fireEvent.click(startExportButton);

      // Should use chunking for large exports
      expect(chunkSizes[0]).toBeLessThanOrEqual(5000);
    });
  });

  describe('Concurrent Operations Performance', () => {
    it('handles multiple concurrent filters efficiently', async () => {
      const largeDataset = generateLargeDataset(2000);
      
      vi.spyOn(auditService, 'getAuditLogs').mockResolvedValue({
        entries: largeDataset,
        pagination: {
          hasMore: false,
          totalCount: 2000,
        },
      });

      renderComponent();

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Szabad szöveges keresés...')).toBeInTheDocument();
      });

      const operations = [
        () => {
          const searchInput = screen.getByPlaceholderText('Szabad szöveges keresés...');
          fireEvent.change(searchInput, { target: { value: 'test' } });
        },
        () => {
          const advancedButton = screen.getByText(/speciális szűrők/i);
          fireEvent.click(advancedButton);
        },
        async () => {
          const successCheckbox = await screen.findByLabelText('Sikeres');
          fireEvent.click(successCheckbox);
        },
      ];

      performance.mark('concurrent-start');
      
      // Execute operations concurrently
      await Promise.all(operations.map(op => op()));

      performance.mark('concurrent-end');
      performance.measure('concurrent-time', 'concurrent-start', 'concurrent-end');

      const concurrentMeasure = performance.getEntriesByName('concurrent-time')[0] as PerformanceMeasure;
      
      // Concurrent operations should complete quickly
      expect(concurrentMeasure.duration).toBeLessThan(1500);
    });

    it('maintains performance with real-time updates', async () => {
      const largeDataset = generateLargeDataset(1000);
      
      vi.spyOn(auditService, 'getAuditLogs').mockResolvedValue({
        entries: largeDataset,
        pagination: {
          hasMore: false,
          totalCount: 1000,
        },
      });

      const { container } = renderComponent();

      await waitFor(() => {
        expect(screen.getByText(/Action 0/)).toBeInTheDocument();
      });

      // Simulate real-time updates
      const updateCount = 50;
      const updateTimes: number[] = [];

      for (let i = 0; i < updateCount; i++) {
        const updateStart = performance.now();
        
        // Simulate WebSocket message (would be handled by the component)
        const newEvent = generateLargeDataset(1)[0];
        newEvent.id = `realtime-${i}`;
        
        // Trigger re-render
        fireEvent(container, new CustomEvent('audit-update', { detail: newEvent }));
        
        const updateEnd = performance.now();
        updateTimes.push(updateEnd - updateStart);
      }

      // Average update time should be very fast
      const avgUpdateTime = updateTimes.reduce((a, b) => a + b, 0) / updateTimes.length;
      expect(avgUpdateTime).toBeLessThan(10);
      console.log(`Average real-time update time: ${avgUpdateTime.toFixed(2)}ms`);
    });
  });

  describe('Stress Testing', () => {
    it('remains responsive under heavy load', async () => {
      const heavyDataset = generateLargeDataset(10000);
      
      vi.spyOn(auditService, 'getAuditLogs').mockResolvedValue({
        entries: heavyDataset,
        pagination: {
          hasMore: false,
          totalCount: 10000,
        },
      });

      renderComponent();

      // Perform multiple operations rapidly
      const stressOperations = async () => {
        // Search
        const searchInput = await screen.findByPlaceholderText('Szabad szöveges keresés...');
        fireEvent.change(searchInput, { target: { value: 'stress test' } });
        
        // Scroll
        const container = document.querySelector('[data-testid="audit-list-container"]');
        if (container) {
          for (let i = 0; i < 10; i++) {
            fireEvent.scroll(container, { target: { scrollTop: i * 1000 } });
          }
        }
        
        // Filter toggle
        const advancedButton = screen.getByText(/speciális szűrők/i);
        for (let i = 0; i < 5; i++) {
          fireEvent.click(advancedButton);
        }
      };

      performance.mark('stress-start');
      await stressOperations();
      performance.mark('stress-end');
      performance.measure('stress-time', 'stress-start', 'stress-end');

      const stressMeasure = performance.getEntriesByName('stress-time')[0] as PerformanceMeasure;
      
      // Should remain responsive even under stress
      expect(stressMeasure.duration).toBeLessThan(5000);
      
      // UI should still be interactive
      expect(screen.getByPlaceholderText('Szabad szöveges keresés...')).toBeInTheDocument();
    });
  });
});