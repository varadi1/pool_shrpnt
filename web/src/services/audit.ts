import axios from 'axios';
import { apiClient } from './api';
import type {
  AuditEntry,
  AuditFilter,
  AuditPaginatedResponse,
  CorrelationGroup,
  ExportJob,
  AuditStats,
  AuditActionType,
  AuditCategory
} from '../types/audit';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  key: string;
}

class AuditService {
  private readonly baseUrl = '/api/audit';
  private readonly cacheTime = 5 * 60 * 1000; // 5 minutes TTL
  private cache = new Map<string, CacheEntry<any>>();
  private activeExports = new Map<string, ExportJob>();

  private getCacheKey(endpoint: string, params?: any): string {
    return `${endpoint}:${JSON.stringify(params || {})}`;
  }

  private getCachedData<T>(key: string): T | null {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheTime) {
      return cached.data as T;
    }
    this.cache.delete(key);
    return null;
  }

  private setCachedData<T>(key: string, data: T): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      key
    });
  }

  private buildFilterParams(filter?: AuditFilter): Record<string, any> {
    if (!filter) return {};

    const params: Record<string, any> = {};

    if (filter.dateRange) {
      params.from = filter.dateRange.from.toISOString();
      params.to = filter.dateRange.to.toISOString();
    }

    if (filter.actors?.length) {
      params.actors = filter.actors.join(',');
    }

    if (filter.actionTypes?.length) {
      params.actionTypes = filter.actionTypes.join(',');
    }

    if (filter.categories?.length) {
      params.categories = filter.categories.join(',');
    }

    if (filter.targetTypes?.length) {
      params.targetTypes = filter.targetTypes.join(',');
    }

    if (filter.correlationId) {
      params.correlationId = filter.correlationId;
    }

    if (filter.status?.length) {
      params.status = filter.status.join(',');
    }

    if (filter.searchText) {
      params.search = filter.searchText;
    }

    return params;
  }

  /**
   * Fetch paginated audit logs with optional filtering
   */
  async getLogs(
    cursor?: string,
    limit: number = 50,
    filter?: AuditFilter,
    useCache: boolean = true
  ): Promise<AuditPaginatedResponse> {
    const params = {
      ...this.buildFilterParams(filter),
      cursor,
      limit
    };

    const cacheKey = this.getCacheKey(`${this.baseUrl}/logs`, params);
    
    if (useCache) {
      const cached = this.getCachedData<AuditPaginatedResponse>(cacheKey);
      if (cached) return cached;
    }

    try {
      const response = await apiClient.get<AuditPaginatedResponse>(
        `${this.baseUrl}/logs`,
        { params }
      );

      this.setCachedData(cacheKey, response.data);
      return response.data;
    } catch (error) {
      console.error('Failed to fetch audit logs:', error);
      throw error;
    }
  }

  // Compatibility wrapper used by tests
  async getAuditLogs(options?: {
    cursor?: string
    limit?: number
    filter?: AuditFilter
    filters?: AuditFilter
  }): Promise<AuditPaginatedResponse> {
    const filter = options?.filter || options?.filters
    return this.getLogs(options?.cursor, options?.limit ?? 50, filter)
  }

  /**
   * Get a single audit entry by ID
   */
  async getEntry(id: string): Promise<AuditEntry> {
    const cacheKey = this.getCacheKey(`${this.baseUrl}/logs/${id}`);
    const cached = this.getCachedData<AuditEntry>(cacheKey);
    if (cached) return cached;

    try {
      const response = await apiClient.get<AuditEntry>(
        `${this.baseUrl}/logs/${id}`
      );

      this.setCachedData(cacheKey, response.data);
      return response.data;
    } catch (error) {
      console.error(`Failed to fetch audit entry ${id}:`, error);
      throw error;
    }
  }

  /**
   * Get all events related by correlation ID
   */
  async getCorrelatedEvents(correlationId: string): Promise<CorrelationGroup> {
    const cacheKey = this.getCacheKey(`${this.baseUrl}/correlation/${correlationId}`);
    const cached = this.getCachedData<CorrelationGroup>(cacheKey);
    if (cached) return cached;

    try {
      const response = await apiClient.get<CorrelationGroup>(
        `${this.baseUrl}/correlation/${correlationId}`
      );

      this.setCachedData(cacheKey, response.data);
      return response.data;
    } catch (error) {
      console.error(`Failed to fetch correlated events for ${correlationId}:`, error);
      throw error;
    }
  }

  /**
   * Queue an export job for audit logs
   */
  async queueExport(
    format: 'csv' | 'xlsx',
    filter?: AuditFilter,
    columns?: string[]
  ): Promise<ExportJob> {
    try {
      const response = await apiClient.post<ExportJob>(
        `${this.baseUrl}/export`,
        {
          format,
          filter: filter || {},
          columns: columns || []
        }
      );

      const job = response.data;
      this.activeExports.set(job.id, job);
      return job;
    } catch (error) {
      console.error('Failed to queue export job:', error);
      throw error;
    }
  }

  // Compatibility wrapper used by tests
  async createExportJob(options: {
    format: 'csv' | 'xlsx'
    filter?: AuditFilter
    columns?: string[]
    chunkSize?: number
  }): Promise<ExportJob> {
    return this.queueExport(options.format, options.filter, options.columns)
  }

  /**
   * Get export job status
   */
  async getExportStatus(jobId: string): Promise<ExportJob> {
    // Check local cache first
    const cached = this.activeExports.get(jobId);
    if (cached && cached.status === 'completed') {
      return cached;
    }

    try {
      const response = await apiClient.get<ExportJob>(
        `${this.baseUrl}/export/${jobId}`
      );

      const job = response.data;
      this.activeExports.set(jobId, job);

      // Clear from cache if completed or failed
      if (job.status === 'completed' || job.status === 'failed') {
        setTimeout(() => this.activeExports.delete(jobId), 60000); // Clear after 1 minute
      }

      return job;
    } catch (error) {
      console.error(`Failed to get export status for ${jobId}:`, error);
      throw error;
    }
  }

  /**
   * Download export file
   */
  async downloadExport(jobId: string): Promise<Blob> {
    try {
      const job = await this.getExportStatus(jobId);
      
      if (job.status !== 'completed' || !job.downloadUrl) {
        throw new Error('Export not ready for download');
      }

      const response = await axios.get(job.downloadUrl, {
        responseType: 'blob'
      });

      return response.data;
    } catch (error) {
      console.error(`Failed to download export ${jobId}:`, error);
      throw error;
    }
  }

  /**
   * Get audit statistics
   */
  async getStats(filter?: AuditFilter): Promise<AuditStats> {
    const params = this.buildFilterParams(filter);
    const cacheKey = this.getCacheKey(`${this.baseUrl}/stats`, params);
    
    const cached = this.getCachedData<AuditStats>(cacheKey);
    if (cached) return cached;

    try {
      const response = await apiClient.get<AuditStats>(
        `${this.baseUrl}/stats`,
        { params }
      );

      this.setCachedData(cacheKey, response.data);
      return response.data;
    } catch (error) {
      console.error('Failed to fetch audit stats:', error);
      throw error;
    }
  }

  /**
   * Get latest events for real-time updates (polling fallback)
   */
  async getLatestEvents(since?: Date): Promise<AuditEntry[]> {
    const params: any = {
      limit: 50,
      sort: 'desc'
    };

    if (since) {
      params.since = since.toISOString();
    }

    try {
      const response = await apiClient.get<{ entries: AuditEntry[] }>(
        `${this.baseUrl}/logs/latest`,
        { params }
      );

      return response.data.entries;
    } catch (error) {
      console.error('Failed to fetch latest events:', error);
      return [];
    }
  }

  /**
   * Fetch chunk of audit logs for export processing
   */
  async getChunk(cursor: string, size: number): Promise<AuditPaginatedResponse> {
    return this.getLogs(cursor, size, undefined, false); // No cache for export chunks
  }

  /**
   * Clear all cached data
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Clear cache for specific filter
   */
  clearFilterCache(filter?: AuditFilter): void {
    // Clear all audit logs cache entries when filter changes
    // This is simpler and more reliable than trying to match specific filter combinations
    Array.from(this.cache.keys()).forEach(key => {
      if (key.startsWith(`${this.baseUrl}/logs:`)) {
        this.cache.delete(key);
      }
    });
  }

  /**
   * Optimize query with cursor-based pagination
   */
  async *iterateLogs(
    filter?: AuditFilter,
    chunkSize: number = 100
  ): AsyncGenerator<AuditEntry[], void, unknown> {
    let cursor: string | undefined;
    let hasMore = true;

    while (hasMore) {
      const response = await this.getLogs(cursor, chunkSize, filter, false);
      
      yield response.entries;

      cursor = response.pagination.cursor;
      hasMore = response.pagination.hasMore;
    }
  }

  /**
   * Batch fetch multiple audit entries
   */
  async getEntriesBatch(ids: string[]): Promise<Map<string, AuditEntry>> {
    const result = new Map<string, AuditEntry>();
    
    // Check cache first
    const uncachedIds: string[] = [];
    for (const id of ids) {
      const cacheKey = this.getCacheKey(`${this.baseUrl}/logs/${id}`);
      const cached = this.getCachedData<AuditEntry>(cacheKey);
      if (cached) {
        result.set(id, cached);
      } else {
        uncachedIds.push(id);
      }
    }

    // Fetch uncached entries
    if (uncachedIds.length > 0) {
      try {
        const response = await apiClient.post<{ entries: AuditEntry[] }>(
          `${this.baseUrl}/logs/batch`,
          { ids: uncachedIds }
        );

        response.data.entries.forEach(entry => {
          result.set(entry.id, entry);
          const cacheKey = this.getCacheKey(`${this.baseUrl}/logs/${entry.id}`);
          this.setCachedData(cacheKey, entry);
        });
      } catch (error) {
        console.error('Failed to batch fetch audit entries:', error);
      }
    }

    return result;
  }

  /**
   * Search audit logs with debounced input
   */
  createDebouncedSearch(delay: number = 500) {
    let timeoutId: NodeJS.Timeout | null = null;
    let lastAbortController: AbortController | null = null;

    return (
      searchText: string,
      filter?: AuditFilter
    ): Promise<AuditPaginatedResponse> => {
      return new Promise((resolve, reject) => {
        // Cancel previous request
        if (lastAbortController) {
          lastAbortController.abort();
        }

        // Clear previous timeout
        if (timeoutId) {
          clearTimeout(timeoutId);
        }

        // Set new timeout
        timeoutId = setTimeout(async () => {
          lastAbortController = new AbortController();

          try {
            const response = await this.getLogs(
              undefined,
              50,
              { ...filter, searchText },
              true
            );
            resolve(response);
          } catch (error: any) {
            if (error.name !== 'AbortError') {
              reject(error);
            }
          }
        }, delay);
      });
    };
  }

  /**
   * Prefetch related audit entries for performance
   */
  async prefetchRelated(entry: AuditEntry): Promise<void> {
    const tasks: Promise<any>[] = [];

    // Prefetch correlation group
    if (entry.metadata.correlationId) {
      tasks.push(this.getCorrelatedEvents(entry.metadata.correlationId));
    }

    // Prefetch previous/next entries
    const filter: AuditFilter = {
      dateRange: {
        from: new Date(new Date(entry.timestamp).getTime() - 60000), // 1 minute before
        to: new Date(new Date(entry.timestamp).getTime() + 60000) // 1 minute after
      }
    };
    tasks.push(this.getLogs(undefined, 10, filter));

    await Promise.all(tasks);
  }
}

// Export singleton instance
export const auditService = new AuditService();

// Function exports expected by tests
export const getAuditLogs = (options?: {
  cursor?: string
  limit?: number
  filter?: AuditFilter
  filters?: AuditFilter
}): Promise<AuditPaginatedResponse> => auditService.getAuditLogs(options)

export const createExportJob = (options: {
  format: 'csv' | 'xlsx'
  filter?: AuditFilter
  columns?: string[]
  chunkSize?: number
}): Promise<ExportJob> => auditService.createExportJob(options)

// Export helper for virtual scrolling threshold
export const VIRTUAL_SCROLL_THRESHOLD = 100;

// Export helper for export limits
export const EXPORT_LIMITS = {
  maxRowsPerExport: 50000,
  maxFileSizeMB: 100,
  chunkSize: 5000
} as const;