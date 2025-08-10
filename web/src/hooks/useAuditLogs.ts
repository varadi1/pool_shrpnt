import { useQuery, useMutation, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useState, useCallback, useMemo } from 'react';
import { auditService, VIRTUAL_SCROLL_THRESHOLD } from '../services/audit';
import type { AuditFilter, AuditEntry, ExportJob } from '../types/audit';

export const useAuditLogs = (filter?: AuditFilter, pageSize: number = 50) => {
  const queryClient = useQueryClient();

  const {
    data,
    error,
    fetchNextPage,
    hasNextPage,
    isFetching,
    isFetchingNextPage,
    status,
    refetch
  } = useInfiniteQuery({
    queryKey: ['audit', 'logs', filter],
    queryFn: ({ pageParam = undefined }) =>
      auditService.getAuditLogs({ cursor: pageParam, limit: pageSize, filter }),
    getNextPageParam: (lastPage) =>
      lastPage.pagination.hasMore ? lastPage.pagination.cursor : undefined,
    staleTime: 30000, // 30 seconds
    cacheTime: 5 * 60 * 1000, // 5 minutes
  });

  const entries = useMemo(() =>
    data?.pages.flatMap(page => page.entries) ?? [],
    [data]
  );

  const totalCount = data?.pages[0]?.pagination.totalCount ?? 0;

  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const refresh = useCallback(() => {
    queryClient.invalidateQueries(['audit', 'logs', filter]);
    refetch();
  }, [queryClient, filter, refetch]);

  return {
    entries,
    totalCount,
    isLoading: status === 'loading',
    isError: status === 'error',
    error,
    isFetching,
    isFetchingNextPage,
    hasNextPage,
    loadMore,
    refresh,
    shouldVirtualize: entries.length > VIRTUAL_SCROLL_THRESHOLD
  };
};

export const useAuditEntry = (id: string | null) => {
  return useQuery({
    queryKey: ['audit', 'entry', id],
    queryFn: () => id ? auditService.getEntry(id) : null,
    enabled: !!id,
    staleTime: 60000, // 1 minute
  });
};

export const useCorrelatedEvents = (correlationId: string | null) => {
  return useQuery({
    queryKey: ['audit', 'correlation', correlationId],
    queryFn: () => correlationId ? auditService.getCorrelatedEvents(correlationId) : null,
    enabled: !!correlationId,
    staleTime: 60000, // 1 minute
  });
};

export const useAuditStats = (filter?: AuditFilter) => {
  return useQuery({
    queryKey: ['audit', 'stats', filter],
    queryFn: () => auditService.getStats(filter),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};

export const useAuditExport = () => {
  const [exportJobs, setExportJobs] = useState<Map<string, ExportJob>>(new Map());
  const queryClient = useQueryClient();

  const exportMutation = useMutation({
    mutationFn: ({ format, filter, columns }: {
      format: 'csv' | 'xlsx';
      filter?: AuditFilter;
      columns?: string[];
    }) => auditService.queueExport(format, filter, columns),
    onSuccess: (job) => {
      setExportJobs(prev => new Map(prev).set(job.id, job));
      // Start polling for job status
      pollExportStatus(job.id);
    },
  });

  const pollExportStatus = useCallback(async (jobId: string) => {
    const intervalId = setInterval(async () => {
      try {
        const job = await auditService.getExportStatus(jobId);
        setExportJobs(prev => new Map(prev).set(jobId, job));

        if (job.status === 'completed' || job.status === 'failed') {
          clearInterval(intervalId);
          
          if (job.status === 'completed' && job.downloadUrl) {
            // Trigger download
            const blob = await auditService.downloadExport(jobId);
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `audit-export-${jobId}.${job.format}`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
          }
        }
      } catch (error) {
        console.error(`Failed to poll export status for ${jobId}:`, error);
        clearInterval(intervalId);
      }
    }, 2000); // Poll every 2 seconds

    // Cleanup after 10 minutes
    setTimeout(() => clearInterval(intervalId), 10 * 60 * 1000);
  }, []);

  const cancelExport = useCallback((jobId: string) => {
    setExportJobs(prev => {
      const next = new Map(prev);
      next.delete(jobId);
      return next;
    });
  }, []);

  return {
    exportAudit: exportMutation.mutate,
    isExporting: exportMutation.isLoading,
    exportError: exportMutation.error,
    exportJobs: Array.from(exportJobs.values()),
    cancelExport
  };
};

export const useAuditSearch = (delay: number = 500) => {
  const [searchText, setSearchText] = useState('');
  const [debouncedSearchText, setDebouncedSearchText] = useState('');
  const queryClient = useQueryClient();

  // Create debounced search function
  const debouncedSearch = useMemo(
    () => auditService.createDebouncedSearch(delay),
    [delay]
  );

  // Update debounced text after delay
  const handleSearch = useCallback((text: string) => {
    setSearchText(text);
    
    const timeoutId = setTimeout(() => {
      setDebouncedSearchText(text);
    }, delay);

    return () => clearTimeout(timeoutId);
  }, [delay]);

  // Use the debounced text for the query
  const filter: AuditFilter | undefined = debouncedSearchText 
    ? { searchText: debouncedSearchText }
    : undefined;

  const query = useAuditLogs(filter);

  return {
    searchText,
    setSearchText: handleSearch,
    ...query
  };
};

export const usePrefetchAuditEntry = () => {
  const queryClient = useQueryClient();

  return useCallback(async (entry: AuditEntry) => {
    // Prefetch related data
    await auditService.prefetchRelated(entry);

    // Update cache
    queryClient.setQueryData(['audit', 'entry', entry.id], entry);

    if (entry.metadata.correlationId) {
      queryClient.prefetchQuery({
        queryKey: ['audit', 'correlation', entry.metadata.correlationId],
        queryFn: () => auditService.getCorrelatedEvents(entry.metadata.correlationId),
        staleTime: 60000,
      });
    }
  }, [queryClient]);
};

export const useAuditFilters = (initialFilter?: AuditFilter) => {
  const [filter, setFilter] = useState<AuditFilter>(initialFilter || {});
  const queryClient = useQueryClient();

  const updateFilter = useCallback((updates: Partial<AuditFilter>) => {
    setFilter(prev => ({ ...prev, ...updates }));
  }, []);

  const clearFilter = useCallback(() => {
    setFilter({});
    auditService.clearFilterCache();
    queryClient.invalidateQueries(['audit']);
  }, [queryClient]);

  const applyFilter = useCallback((newFilter: AuditFilter) => {
    setFilter(newFilter);
    auditService.clearFilterCache(newFilter);
    queryClient.invalidateQueries(['audit', 'logs', newFilter]);
  }, [queryClient]);

  return {
    filter,
    updateFilter,
    clearFilter,
    applyFilter
  };
};