import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { templateService } from '../services/templates';
import type {
  Template,
  TemplateFilters,
  TemplateSortOptions,
  TemplateVersion,
  VersionTag,
  AnalyticsExportRequest,
} from '../types/templates';

/**
 * React Query hooks for template operations with optimistic updates
 */

// Query keys
export const templateKeys = {
  all: ['templates'] as const,
  lists: () => [...templateKeys.all, 'list'] as const,
  list: (filters?: TemplateFilters, sort?: TemplateSortOptions, page?: number) =>
    [...templateKeys.lists(), { filters, sort, page }] as const,
  details: () => [...templateKeys.all, 'detail'] as const,
  detail: (id: string) => [...templateKeys.details(), id] as const,
  versions: (id: string) => [...templateKeys.detail(id), 'versions'] as const,
  version: (id: string, version: string) => [...templateKeys.versions(id), version] as const,
  versionUsage: (id: string, version: string) => [...templateKeys.version(id, version), 'usage'] as const,
};

/**
 * Hook to fetch templates list with pagination
 */
export function useTemplatesList(
  page: number = 1,
  pageSize: number = 20,
  filters?: TemplateFilters,
  sort?: TemplateSortOptions
) {
  return useQuery({
    queryKey: templateKeys.list(filters, sort, page),
    queryFn: () => templateService.getTemplates(page, pageSize, filters, sort),
    staleTime: 30000, // Consider data stale after 30 seconds
  });
}

/**
 * Hook to fetch a single template
 */
export function useTemplate(id: string) {
  return useQuery({
    queryKey: templateKeys.detail(id),
    queryFn: () => templateService.getTemplate(id),
    enabled: !!id,
  });
}

/**
 * Hook to fetch template versions
 */
export function useTemplateVersions(templateId: string) {
  return useQuery({
    queryKey: templateKeys.versions(templateId),
    queryFn: () => templateService.getVersions(templateId),
    enabled: !!templateId,
  });
}

/**
 * Hook to fetch a specific template version
 */
export function useTemplateVersion(templateId: string, version: string) {
  return useQuery({
    queryKey: templateKeys.version(templateId, version),
    queryFn: () => templateService.getTemplateVersion(templateId, version),
    enabled: !!templateId && !!version,
  });
}

/**
 * Hook to fetch version usage information
 */
export function useVersionUsage(templateId: string, versionId: string) {
  return useQuery({
    queryKey: templateKeys.versionUsage(templateId, versionId),
    queryFn: () => templateService.getVersionUsage(templateId, versionId),
    enabled: !!templateId && !!versionId,
  });
}

/**
 * Hook to create a new template with optimistic update
 */
export function useCreateTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (template: Partial<Template>) => templateService.createTemplate(template),
    onMutate: async (newTemplate) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: templateKeys.lists() });

      // Snapshot the previous value
      const previousTemplates = queryClient.getQueryData(templateKeys.lists());

      // Optimistically update to the new value
      queryClient.setQueriesData(
        { queryKey: templateKeys.lists() },
        (old: any) => {
          if (!old) return old;
          
          const optimisticTemplate: Template = {
            id: `temp-${Date.now()}`,
            name: newTemplate.name || 'New Template',
            description: newTemplate.description || '',
            status: newTemplate.status || 'draft',
            currentVersion: '1.0.0',
            createdBy: 'Current User',
            createdAt: new Date(),
            updatedAt: new Date(),
            usageCount: 0,
            tags: newTemplate.tags || [],
          };

          return {
            ...old,
            templates: [optimisticTemplate, ...old.templates],
            total: old.total + 1,
          };
        }
      );

      // Return a context with the previous and new template
      return { previousTemplates };
    },
    onError: (err, newTemplate, context) => {
      // If the mutation fails, use the context to roll back
      if (context?.previousTemplates) {
        queryClient.setQueryData(templateKeys.lists(), context.previousTemplates);
      }
    },
    onSettled: () => {
      // Always refetch after error or success
      queryClient.invalidateQueries({ queryKey: templateKeys.lists() });
    },
  });
}

/**
 * Hook to update a template with optimistic update
 */
export function useUpdateTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<Template> }) =>
      templateService.updateTemplate(id, updates),
    onMutate: async ({ id, updates }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: templateKeys.detail(id) });

      // Snapshot the previous value
      const previousTemplate = queryClient.getQueryData(templateKeys.detail(id));

      // Optimistically update to the new value
      queryClient.setQueryData(templateKeys.detail(id), (old: Template | undefined) => {
        if (!old) return old;
        return {
          ...old,
          ...updates,
          updatedAt: new Date(),
        };
      });

      // Also update in the list
      queryClient.setQueriesData(
        { queryKey: templateKeys.lists() },
        (old: any) => {
          if (!old) return old;
          return {
            ...old,
            templates: old.templates.map((t: Template) =>
              t.id === id ? { ...t, ...updates, updatedAt: new Date() } : t
            ),
          };
        }
      );

      return { previousTemplate, id };
    },
    onError: (err, { id }, context) => {
      // If the mutation fails, use the context to roll back
      if (context?.previousTemplate) {
        queryClient.setQueryData(templateKeys.detail(id), context.previousTemplate);
      }
      // Also invalidate the lists to ensure consistency
      queryClient.invalidateQueries({ queryKey: templateKeys.lists() });
    },
    onSettled: (data, error, { id }) => {
      // Always refetch after error or success
      queryClient.invalidateQueries({ queryKey: templateKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: templateKeys.lists() });
    },
  });
}

/**
 * Hook to delete a template with optimistic update
 */
export function useDeleteTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => templateService.deleteTemplate(id),
    onMutate: async (id) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: templateKeys.lists() });

      // Snapshot the previous value
      const previousTemplates = queryClient.getQueryData(templateKeys.lists());

      // Optimistically update to the new value
      queryClient.setQueriesData(
        { queryKey: templateKeys.lists() },
        (old: any) => {
          if (!old) return old;
          return {
            ...old,
            templates: old.templates.filter((t: Template) => t.id !== id),
            total: old.total - 1,
          };
        }
      );

      return { previousTemplates };
    },
    onError: (err, id, context) => {
      // If the mutation fails, use the context to roll back
      if (context?.previousTemplates) {
        queryClient.setQueryData(templateKeys.lists(), context.previousTemplates);
      }
    },
    onSettled: () => {
      // Always refetch after error or success
      queryClient.invalidateQueries({ queryKey: templateKeys.lists() });
    },
  });
}

/**
 * Hook to rollback a template
 */
export function useRollbackTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      templateId,
      targetVersion,
      reason,
    }: {
      templateId: string;
      targetVersion: string;
      reason: string;
    }) => templateService.performRollback(templateId, targetVersion, reason),
    onSuccess: (data, { templateId }) => {
      // Invalidate template detail and versions
      queryClient.invalidateQueries({ queryKey: templateKeys.detail(templateId) });
      queryClient.invalidateQueries({ queryKey: templateKeys.versions(templateId) });
      queryClient.invalidateQueries({ queryKey: templateKeys.lists() });
    },
  });
}

/**
 * Hook to validate a template
 */
export function useValidateTemplate() {
  return useMutation({
    mutationFn: (template: Partial<Template>) => templateService.validateTemplate(template),
  });
}

/**
 * Hook to update version tags
 */
export function useUpdateVersionTags() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      templateId,
      versionId,
      tags,
    }: {
      templateId: string;
      versionId: string;
      tags: VersionTag[];
    }) => templateService.updateVersionTags(templateId, versionId, tags),
    onMutate: async ({ templateId, versionId, tags }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: templateKeys.version(templateId, versionId) });

      // Snapshot the previous value
      const previousVersion = queryClient.getQueryData(templateKeys.version(templateId, versionId));

      // Optimistically update to the new value
      queryClient.setQueryData(
        templateKeys.version(templateId, versionId),
        (old: TemplateVersion | undefined) => {
          if (!old) return old;
          return {
            ...old,
            tags,
          };
        }
      );

      return { previousVersion, templateId, versionId };
    },
    onError: (err, { templateId, versionId }, context) => {
      // If the mutation fails, use the context to roll back
      if (context?.previousVersion) {
        queryClient.setQueryData(
          templateKeys.version(templateId, versionId),
          context.previousVersion
        );
      }
    },
    onSettled: (data, error, { templateId, versionId }) => {
      // Always refetch after error or success
      queryClient.invalidateQueries({ queryKey: templateKeys.version(templateId, versionId) });
      queryClient.invalidateQueries({ queryKey: templateKeys.versions(templateId) });
    },
  });
}

/**
 * Hook to update version notes
 */
export function useUpdateVersionNotes() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      templateId,
      versionId,
      notes,
    }: {
      templateId: string;
      versionId: string;
      notes: string;
    }) => templateService.updateVersionNotes(templateId, versionId, notes),
    onMutate: async ({ templateId, versionId, notes }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: templateKeys.version(templateId, versionId) });

      // Snapshot the previous value
      const previousVersion = queryClient.getQueryData(templateKeys.version(templateId, versionId));

      // Optimistically update to the new value
      queryClient.setQueryData(
        templateKeys.version(templateId, versionId),
        (old: TemplateVersion | undefined) => {
          if (!old) return old;
          return {
            ...old,
            changelog: notes,
          };
        }
      );

      return { previousVersion, templateId, versionId };
    },
    onError: (err, { templateId, versionId }, context) => {
      // If the mutation fails, use the context to roll back
      if (context?.previousVersion) {
        queryClient.setQueryData(
          templateKeys.version(templateId, versionId),
          context.previousVersion
        );
      }
    },
    onSettled: (data, error, { templateId, versionId }) => {
      // Always refetch after error or success
      queryClient.invalidateQueries({ queryKey: templateKeys.version(templateId, versionId) });
      queryClient.invalidateQueries({ queryKey: templateKeys.versions(templateId) });
    },
  });
}

/**
 * Hook to prefetch template data
 */
export function usePrefetchTemplate() {
  const queryClient = useQueryClient();

  return (id: string) => {
    queryClient.prefetchQuery({
      queryKey: templateKeys.detail(id),
      queryFn: () => templateService.getTemplate(id),
      staleTime: 10000,
    });
  };
}

/**
 * Hook to invalidate template queries
 */
export function useInvalidateTemplates() {
  const queryClient = useQueryClient();

  return {
    invalidateAll: () => queryClient.invalidateQueries({ queryKey: templateKeys.all }),
    invalidateLists: () => queryClient.invalidateQueries({ queryKey: templateKeys.lists() }),
    invalidateDetail: (id: string) =>
      queryClient.invalidateQueries({ queryKey: templateKeys.detail(id) }),
    invalidateVersions: (id: string) =>
      queryClient.invalidateQueries({ queryKey: templateKeys.versions(id) }),
  };
}

/**
 * Hook to fetch template analytics
 */
export function useTemplateAnalytics(templateId: string, timeRange?: string) {
  return useQuery({
    queryKey: ['templates', 'analytics', templateId, timeRange],
    queryFn: () => templateService.getAnalytics(templateId, timeRange),
    staleTime: 60000, // 1 minute
  });
}

/**
 * Hook to export analytics
 */
export function useExportAnalytics() {
  return useMutation({
    mutationFn: async (request: AnalyticsExportRequest) => {
      const blob = await templateService.exportAnalytics(request);
      
      // Create download link
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      
      const timestamp = new Date().toISOString().split('T')[0];
      const extension = request.format === 'pdf' ? 'pdf' : request.format === 'json' ? 'json' : 'csv';
      link.download = `template-analytics-${request.templateId}-${timestamp}.${extension}`;
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      window.URL.revokeObjectURL(url);
    },
  });
}

/**
 * Hook to fetch usage statistics
 */
export function useUsageStatistics(templateId: string) {
  return useQuery({
    queryKey: ['templates', 'usage-statistics', templateId],
    queryFn: () => templateService.getUsageStatistics(templateId),
    staleTime: 60000, // 1 minute
  });
}

/**
 * Hook to fetch adoption trends
 */
export function useAdoptionTrends(templateId: string, period: '7d' | '30d' | '90d' | '1y') {
  return useQuery({
    queryKey: ['templates', 'adoption-trends', templateId, period],
    queryFn: () => templateService.getAdoptionTrends(templateId, period),
    staleTime: 60000, // 1 minute
  });
}

/**
 * Hook to fetch performance metrics
 */
export function usePerformanceMetrics(templateId: string) {
  return useQuery({
    queryKey: ['templates', 'performance-metrics', templateId],
    queryFn: () => templateService.getPerformanceMetrics(templateId),
    staleTime: 60000, // 1 minute
  });
}

/**
 * Hook to fetch usage heat map
 */
export function useUsageHeatMap(templateId: string, granularity: 'daily' | 'weekly' | 'monthly') {
  return useQuery({
    queryKey: ['templates', 'usage-heatmap', templateId, granularity],
    queryFn: () => templateService.getUsageHeatMap(templateId, granularity),
    staleTime: 60000, // 1 minute
  });
}

/**
 * Combined hook for all template operations including analytics
 */
export function useTemplates() {
  const queryClient = useQueryClient();
  
  return {
    // Query hooks
    templates: useTemplatesList(),
    template: useTemplate,
    versions: useTemplateVersions,
    versionUsage: useVersionUsage,
    analytics: {
      data: queryClient.getQueryData(['templates', 'analytics']),
      useAnalytics: useTemplateAnalytics,
      useStatistics: useUsageStatistics,
      useTrends: useAdoptionTrends,
      useMetrics: usePerformanceMetrics,
      useHeatMap: useUsageHeatMap,
    },
    
    // Mutation hooks
    createTemplate: useCreateTemplate(),
    updateTemplate: useUpdateTemplate(),
    deleteTemplate: useDeleteTemplate(),
    rollbackTemplate: useRollbackTemplate(),
    validateTemplate: useValidateTemplate(),
    updateVersionChangelog: useUpdateVersionChangelog(),
    updateVersionTags: useUpdateVersionTags(),
    exportAnalytics: useExportAnalytics(),
    
    // Utility hooks
    prefetch: usePrefetchTemplate(),
    invalidate: useInvalidateTemplates(),
    
    // Loading states
    isLoadingAnalytics: false, // Will be set by actual query
    analyticsError: null as Error | null, // Will be set by actual query
  };
}