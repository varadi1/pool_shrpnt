import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { auditService, VIRTUAL_SCROLL_THRESHOLD, EXPORT_LIMITS } from '../audit';
import { apiClient } from '../api';
import type { AuditEntry, AuditFilter, AuditPaginatedResponse, ExportJob } from '../../types/audit';

vi.mock('../api', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn()
  }
}));

describe('AuditService', () => {
  const mockAuditEntry: AuditEntry = {
    id: '1',
    timestamp: '2025-01-01T12:00:00Z',
    actor: {
      id: 'user1',
      name: 'Test User',
      email: 'test@example.com',
      role: 'Admin',
      type: 'user'
    },
    action: {
      type: 'TEMPLATE_CREATED',
      category: 'template',
      severity: 'info',
      description: 'Created template'
    },
    target: {
      type: 'template',
      id: 'template1',
      name: 'Test Template'
    },
    metadata: {
      correlationId: 'corr-123',
      sessionId: 'session-456',
      ipAddress: '192.168.1.1',
      userAgent: 'Mozilla/5.0',
      duration: 150
    },
    status: 'success'
  };

  const mockPaginatedResponse: AuditPaginatedResponse = {
    entries: [mockAuditEntry],
    pagination: {
      cursor: 'next-cursor',
      hasMore: true,
      totalCount: 100
    }
  };

  beforeEach(() => {
    vi.clearAllMocks();
    auditService.clearCache();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getLogs', () => {
    it('should fetch paginated audit logs', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({ data: mockPaginatedResponse });

      const result = await auditService.getLogs('cursor', 50);

      expect(apiClient.get).toHaveBeenCalledWith('/api/audit/logs', {
        params: { cursor: 'cursor', limit: 50 }
      });
      expect(result).toEqual(mockPaginatedResponse);
    });

    it('should apply filters to the request', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({ data: mockPaginatedResponse });

      const filter: AuditFilter = {
        dateRange: {
          from: new Date('2025-01-01'),
          to: new Date('2025-01-31')
        },
        actors: ['user1', 'user2'],
        actionTypes: ['TEMPLATE_CREATED', 'TEMPLATE_UPDATED'],
        categories: ['template'],
        correlationId: 'corr-123',
        status: ['success'],
        searchText: 'test'
      };

      await auditService.getLogs(undefined, 50, filter);

      expect(apiClient.get).toHaveBeenCalledWith('/api/audit/logs', {
        params: expect.objectContaining({
          from: '2025-01-01T00:00:00.000Z',
          to: '2025-01-31T00:00:00.000Z',
          actors: 'user1,user2',
          actionTypes: 'TEMPLATE_CREATED,TEMPLATE_UPDATED',
          categories: 'template',
          correlationId: 'corr-123',
          status: 'success',
          search: 'test',
          limit: 50
        })
      });
    });

    it('should use cached data when available', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({ data: mockPaginatedResponse });

      // First call - should hit API
      await auditService.getLogs('cursor', 50);
      expect(apiClient.get).toHaveBeenCalledTimes(1);

      // Second call - should use cache
      await auditService.getLogs('cursor', 50);
      expect(apiClient.get).toHaveBeenCalledTimes(1);
    });

    it('should skip cache when useCache is false', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({ data: mockPaginatedResponse });

      await auditService.getLogs('cursor', 50, undefined, false);
      await auditService.getLogs('cursor', 50, undefined, false);

      expect(apiClient.get).toHaveBeenCalledTimes(2);
    });
  });

  describe('getEntry', () => {
    it('should fetch a single audit entry', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({ data: mockAuditEntry });

      const result = await auditService.getEntry('1');

      expect(apiClient.get).toHaveBeenCalledWith('/api/audit/logs/1');
      expect(result).toEqual(mockAuditEntry);
    });

    it('should cache individual entries', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({ data: mockAuditEntry });

      await auditService.getEntry('1');
      await auditService.getEntry('1');

      expect(apiClient.get).toHaveBeenCalledTimes(1);
    });
  });

  describe('getCorrelatedEvents', () => {
    it('should fetch correlated events', async () => {
      const correlationGroup = {
        correlationId: 'corr-123',
        events: [mockAuditEntry],
        startTime: '2025-01-01T12:00:00Z',
        endTime: '2025-01-01T12:01:00Z',
        duration: 60000,
        services: ['api', 'worker'],
        status: 'success' as const,
        criticalPath: ['1']
      };

      vi.mocked(apiClient.get).mockResolvedValue({ data: correlationGroup });

      const result = await auditService.getCorrelatedEvents('corr-123');

      expect(apiClient.get).toHaveBeenCalledWith('/api/audit/correlation/corr-123');
      expect(result).toEqual(correlationGroup);
    });
  });

  describe('queueExport', () => {
    it('should queue an export job', async () => {
      const mockJob: ExportJob = {
        id: 'job-1',
        status: 'queued',
        format: 'csv',
        filters: {},
        createdAt: new Date('2025-01-01T12:00:00Z')
      };

      vi.mocked(apiClient.post).mockResolvedValue({ data: mockJob });

      const result = await auditService.queueExport('csv', {}, ['id', 'timestamp']);

      expect(apiClient.post).toHaveBeenCalledWith('/api/audit/export', {
        format: 'csv',
        filter: {},
        columns: ['id', 'timestamp']
      });
      expect(result).toEqual(mockJob);
    });
  });

  describe('getExportStatus', () => {
    it('should fetch export job status', async () => {
      const mockJob: ExportJob = {
        id: 'job-1',
        status: 'completed',
        format: 'csv',
        filters: {},
        createdAt: new Date('2025-01-01T12:00:00Z'),
        completedAt: new Date('2025-01-01T12:01:00Z'),
        downloadUrl: '/downloads/export.csv'
      };

      vi.mocked(apiClient.get).mockResolvedValue({ data: mockJob });

      const result = await auditService.getExportStatus('job-1');

      expect(apiClient.get).toHaveBeenCalledWith('/api/audit/export/job-1');
      expect(result).toEqual(mockJob);
    });
  });

  describe('getStats', () => {
    it('should fetch audit statistics', async () => {
      const mockStats = {
        totalEvents: 1000,
        eventsPerDay: [{ date: '2025-01-01', count: 100 }],
        topActors: [{ actor: 'user1', count: 50 }],
        actionBreakdown: [{ action: 'TEMPLATE_CREATED' as const, count: 30 }],
        categoryBreakdown: [{ category: 'template' as const, count: 40 }],
        failureRate: 0.05,
        averageResponseTime: 150
      };

      vi.mocked(apiClient.get).mockResolvedValue({ data: mockStats });

      const result = await auditService.getStats();

      expect(apiClient.get).toHaveBeenCalledWith('/api/audit/stats', { params: {} });
      expect(result).toEqual(mockStats);
    });
  });

  describe('getLatestEvents', () => {
    it('should fetch latest events for polling', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({ data: { entries: [mockAuditEntry] } });

      const since = new Date('2025-01-01T12:00:00Z');
      const result = await auditService.getLatestEvents(since);

      expect(apiClient.get).toHaveBeenCalledWith('/api/audit/logs/latest', {
        params: {
          limit: 50,
          sort: 'desc',
          since: since.toISOString()
        }
      });
      expect(result).toEqual([mockAuditEntry]);
    });

    it('should return empty array on error', async () => {
      vi.mocked(apiClient.get).mockRejectedValue(new Error('Network error'));

      const result = await auditService.getLatestEvents();

      expect(result).toEqual([]);
    });
  });

  describe('iterateLogs', () => {
    it('should iterate through paginated logs', async () => {
      const page1: AuditPaginatedResponse = {
        entries: [mockAuditEntry],
        pagination: { cursor: 'cursor2', hasMore: true, totalCount: 2 }
      };

      const page2: AuditPaginatedResponse = {
        entries: [{ ...mockAuditEntry, id: '2' }],
        pagination: { cursor: undefined, hasMore: false, totalCount: 2 }
      };

      vi.mocked(apiClient.get)
        .mockResolvedValueOnce({ data: page1 })
        .mockResolvedValueOnce({ data: page2 });

      const results: AuditEntry[] = [];
      for await (const entries of auditService.iterateLogs(undefined, 1)) {
        results.push(...entries);
      }

      expect(results).toHaveLength(2);
      expect(apiClient.get).toHaveBeenCalledTimes(2);
    });
  });

  describe('getEntriesBatch', () => {
    it('should batch fetch multiple entries', async () => {
      const entries = [
        mockAuditEntry,
        { ...mockAuditEntry, id: '2' }
      ];

      vi.mocked(apiClient.post).mockResolvedValue({ data: { entries } });

      const result = await auditService.getEntriesBatch(['1', '2']);

      expect(apiClient.post).toHaveBeenCalledWith('/api/audit/logs/batch', {
        ids: ['1', '2']
      });
      expect(result.size).toBe(2);
      expect(result.get('1')).toEqual(mockAuditEntry);
    });

    it('should use cached entries when available', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({ data: mockAuditEntry });
      vi.mocked(apiClient.post).mockResolvedValue({ 
        data: { 
          entries: [{ ...mockAuditEntry, id: '2' }] 
        } 
      });

      // Cache entry 1
      await auditService.getEntry('1');

      // Batch fetch should only request entry 2
      const result = await auditService.getEntriesBatch(['1', '2']);

      expect(apiClient.post).toHaveBeenCalledWith('/api/audit/logs/batch', {
        ids: ['2']
      });
      expect(result.size).toBe(2);
    });
  });

  describe('createDebouncedSearch', () => {
    it('should debounce search requests', async () => {
      vi.useFakeTimers();
      vi.mocked(apiClient.get).mockResolvedValue({ data: mockPaginatedResponse });

      const debouncedSearch = auditService.createDebouncedSearch(500);

      // Make multiple rapid calls
      const promise1 = debouncedSearch('test1');
      const promise2 = debouncedSearch('test2');
      const promise3 = debouncedSearch('test3');

      // Advance time
      vi.advanceTimersByTime(500);

      // Only the last call should go through
      await promise3;

      expect(apiClient.get).toHaveBeenCalledTimes(1);
      expect(apiClient.get).toHaveBeenCalledWith('/api/audit/logs', {
        params: expect.objectContaining({
          search: 'test3'
        })
      });

      vi.useRealTimers();
    });
  });

  describe('prefetchRelated', () => {
    it('should prefetch related audit entries', async () => {
      const correlationGroup = {
        correlationId: 'corr-123',
        events: [mockAuditEntry],
        startTime: '2025-01-01T12:00:00Z',
        endTime: '2025-01-01T12:01:00Z',
        duration: 60000,
        services: ['api'],
        status: 'success' as const,
        criticalPath: ['1']
      };

      vi.mocked(apiClient.get)
        .mockResolvedValueOnce({ data: correlationGroup })
        .mockResolvedValueOnce({ data: mockPaginatedResponse });

      await auditService.prefetchRelated(mockAuditEntry);

      expect(apiClient.get).toHaveBeenCalledWith('/api/audit/correlation/corr-123');
      expect(apiClient.get).toHaveBeenCalledWith('/api/audit/logs', {
        params: expect.objectContaining({
          limit: 10
        })
      });
    });
  });

  describe('clearCache', () => {
    it('should clear all cached data', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({ data: mockAuditEntry });

      // Cache some data
      await auditService.getEntry('1');
      
      // Clear cache
      auditService.clearCache();

      // Should hit API again
      await auditService.getEntry('1');

      expect(apiClient.get).toHaveBeenCalledTimes(2);
    });
  });

  describe('clearFilterCache', () => {
    it('should clear cache for specific filter', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({ data: mockPaginatedResponse });

      const filter: AuditFilter = { searchText: 'test' };

      // Cache with filter
      await auditService.getLogs(undefined, 50, filter);
      expect(apiClient.get).toHaveBeenCalledTimes(1);

      // Verify it uses cache
      await auditService.getLogs(undefined, 50, filter);
      expect(apiClient.get).toHaveBeenCalledTimes(1); // Still 1 because cached

      // Clear filter cache
      auditService.clearFilterCache(filter);

      // Should hit API again
      await auditService.getLogs(undefined, 50, filter);

      expect(apiClient.get).toHaveBeenCalledTimes(2);
    });
  });

  describe('constants', () => {
    it('should export correct constants', () => {
      expect(VIRTUAL_SCROLL_THRESHOLD).toBe(100);
      expect(EXPORT_LIMITS).toEqual({
        maxRowsPerExport: 50000,
        maxFileSizeMB: 100,
        chunkSize: 5000
      });
    });
  });
});