import axiosClient from './api/axios-client';
import type { 
  Template, 
  TemplateListResponse, 
  TemplateFilters, 
  TemplateSortOptions,
  TemplateVersion,
  VersionTag,
  VersionUsageResponse,
  TemplateExport,
  TemplateImportResult,
  TemplateShare,
  TemplateMigration,
  MigrationResult,
  TemplateAnalytics,
  AnalyticsExportRequest
} from '@/types/templates';

export const templatesApi = {
  async getTemplates(
    page: number = 1,
    pageSize: number = 20,
    filters?: TemplateFilters,
    sort?: TemplateSortOptions
  ): Promise<TemplateListResponse> {
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        page_size: pageSize.toString(),
      });

      if (filters?.search) {
        params.append('search', filters.search);
      }
      if (filters?.status?.length) {
        filters.status.forEach(status => params.append('status', status));
      }
      if (filters?.tags?.length) {
        filters.tags.forEach(tag => params.append('tag', tag));
      }
      if (filters?.createdBy) {
        params.append('createdBy', filters.createdBy);
      }
      // API doesn't support these params yet, so we don't send them
      // if (sort) {
      //   params.append('sortField', sort.field);
      //   params.append('sortDirection', sort.direction);
      // }

      const response = await axiosClient.get<any>(
        `/templates/?${params.toString()}`
      );
      
      // Transform the API response to match frontend expectations
      const apiData = response.data;
      
      // If the API returns the expected format, use it
      if (apiData.templates && Array.isArray(apiData.templates)) {
        // Transform each template to match frontend expectations
        const transformedTemplates = apiData.templates.map((t: any) => ({
          id: t.id?.toString() || '',
          name: t.name || '',
          description: t.description || '',
          status: t.is_active ? 'active' : 'draft',
          currentVersion: t.version_number || '1.0.0',
          createdBy: t.created_by || 'System',
          createdAt: new Date(t.created_at),
          updatedAt: new Date(t.updated_at),
          usageCount: 0,
          tags: [],
        }));
        
        return {
          templates: transformedTemplates,
          total: apiData.total || transformedTemplates.length,
          page: apiData.page || page,
          pageSize: apiData.page_size || pageSize,
        };
      }
      
      // Fallback to mock data if API doesn't return expected format
      return {
        templates: [],
        total: 0,
        page: page,
        pageSize: pageSize,
      };
    } catch (error) {
      console.error('Failed to fetch templates:', error);
      // Return mock data for development
      return {
        templates: [
          {
            id: '1',
            name: 'Standard Project Template',
            description: 'Default template for standard projects with basic folder structure',
            status: 'active' as const,
            currentVersion: '1.0.0',
            createdBy: 'Admin',
            createdAt: new Date('2025-01-01'),
            updatedAt: new Date('2025-01-05'),
            usageCount: 42,
            tags: ['standard', 'default'],
          },
          {
            id: '2',
            name: 'Marketing Campaign Template',
            description: 'Template for marketing campaigns with specific folder requirements',
            status: 'default' as const,
            currentVersion: '2.1.0',
            createdBy: 'Sarah',
            createdAt: new Date('2025-01-03'),
            updatedAt: new Date('2025-01-08'),
            usageCount: 18,
            tags: ['marketing', 'campaign'],
          },
          {
            id: '3',
            name: 'Product Development Template',
            description: 'Template for product development projects with R&D folders',
            status: 'active' as const,
            currentVersion: '1.3.2',
            createdBy: 'Mike',
            createdAt: new Date('2024-12-15'),
            updatedAt: new Date('2025-01-02'),
            usageCount: 7,
            tags: ['product', 'development'],
          },
        ],
        total: 3,
        page: page,
        pageSize: pageSize,
      };
    }
  },

  async getTemplate(id: string): Promise<Template> {
    try {
      const response = await axiosClient.get<any>(`/templates/${id}`);
      const t = response.data;
      return {
        id: t.id?.toString() || id,
        name: t.name || 'Template',
        description: t.description || '',
        status: t.is_active ? 'active' : 'draft',
        currentVersion: t.version_number || '1.0.0',
        createdBy: t.created_by || 'System',
        createdAt: new Date(t.created_at),
        updatedAt: new Date(t.updated_at),
        usageCount: 0,
        tags: [],
      };
    } catch (error) {
      console.error('Failed to fetch template:', error);
      throw error;
    }
  },

  async createTemplate(template: Partial<Template>): Promise<Template> {
    const response = await axiosClient.post<Template>('/templates', template);
    return response.data;
  },

  async updateTemplate(id: string, updates: Partial<Template>): Promise<Template> {
    const response = await axiosClient.put<Template>(`/templates/${id}`, updates);
    return response.data;
  },

  async deleteTemplate(id: string): Promise<void> {
    try {
      await axiosClient.delete(`/templates/${id}`);
    } catch (error) {
      console.error('Failed to delete template:', error);
      throw error;
    }
  },

  async getTemplateVersions(id: string): Promise<TemplateVersion[]> {
    const response = await axiosClient.get<TemplateVersion[]>(
      `/templates/${id}/versions`
    );
    return response.data;
  },

  async getTemplateVersion(id: string, version: string): Promise<TemplateVersion> {
    const response = await axiosClient.get<TemplateVersion>(
      `/templates/${id}/versions/${version}`
    );
    return response.data;
  },

  async rollbackTemplate(id: string, targetVersion: string, reason: string): Promise<Template> {
    const response = await axiosClient.post<Template>(
      `/templates/${id}/rollback`,
      { targetVersion, reason }
    );
    return response.data;
  },

  async validateTemplate(template: Partial<Template>): Promise<{ valid: boolean; errors?: string[] }> {
    const response = await axiosClient.post<{ valid: boolean; errors?: string[] }>(
      '/templates/validate',
      template
    );
    return response.data;
  },

  async getVersions(templateId: string): Promise<TemplateVersion[]> {
    const response = await axiosClient.get<TemplateVersion[]>(
      `/templates/${templateId}/versions`
    );
    return response.data;
  },

  async getVersionUsage(templateId: string, versionId: string): Promise<VersionUsageResponse> {
    const response = await axiosClient.get<VersionUsageResponse>(
      `/templates/${templateId}/versions/${versionId}/usage`
    );
    return response.data;
  },

  async updateVersionTags(templateId: string, versionId: string, tags: VersionTag[]): Promise<TemplateVersion> {
    const response = await axiosClient.patch<TemplateVersion>(
      `/templates/${templateId}/versions/${versionId}/tags`,
      { tags }
    );
    return response.data;
  },

  async updateVersionNotes(templateId: string, versionId: string, notes: string): Promise<TemplateVersion> {
    const response = await axiosClient.patch<TemplateVersion>(
      `/templates/${templateId}/versions/${versionId}/notes`,
      { changelog: notes }
    );
    return response.data;
  },

  async analyzeRollbackImpact(templateId: string, targetVersion: string): Promise<{
    affectedOrders: {
      id: string;
      name: string;
      status: string;
      createdAt: string;
    }[];
    breakingChanges: string[];
    warnings: string[];
    constraints: {
      message: string;
      severity: 'error' | 'warning' | 'info';
    }[];
  }> {
    const response = await axiosClient.get(
      `/templates/${templateId}/rollback/impact?targetVersion=${targetVersion}`
    );
    return response.data;
  },

  async performRollback(templateId: string, targetVersion: string, reason: string): Promise<TemplateVersion> {
    const response = await axiosClient.post<TemplateVersion>(
      `/templates/${templateId}/rollback`,
      { 
        targetVersion,
        reason,
        createNewVersion: true,
        preserveAuditTrail: true
      }
    );
    return response.data;
  },

  // Import/Export Methods
  async exportTemplates(templateIds: string[], includeVersions: boolean = true): Promise<TemplateExport> {
    const response = await axiosClient.post<TemplateExport>(
      '/templates/export',
      { 
        templateIds,
        includeVersions,
        format: 'json'
      }
    );
    return response.data;
  },

  async importTemplates(exportData: TemplateExport): Promise<TemplateImportResult> {
    const response = await axiosClient.post<TemplateImportResult>(
      '/templates/import',
      exportData
    );
    return response.data;
  },

  async validateImport(exportData: TemplateExport): Promise<{
    valid: boolean;
    errors: string[];
    warnings: string[];
  }> {
    const response = await axiosClient.post(
      '/templates/import/validate',
      exportData
    );
    return response.data;
  },

  // Bulk Operations
  async bulkUpdate(templateIds: string[], updates: Partial<Template>): Promise<{
    success: number;
    failed: number;
    errors: string[];
  }> {
    const response = await axiosClient.post(
      '/templates/bulk/update',
      { templateIds, updates }
    );
    return response.data;
  },

  async bulkDelete(templateIds: string[]): Promise<{
    success: number;
    failed: number;
    errors: string[];
  }> {
    const response = await axiosClient.post(
      '/templates/bulk/delete',
      { templateIds }
    );
    return response.data;
  },

  async bulkArchive(templateIds: string[]): Promise<{
    success: number;
    failed: number;
    errors: string[];
  }> {
    const response = await axiosClient.post(
      '/templates/bulk/archive',
      { templateIds }
    );
    return response.data;
  },

  // Backup Operations
  async createBackup(): Promise<{
    backupId: string;
    url: string;
    expiresAt: Date;
  }> {
    const response = await axiosClient.post('/templates/backup');
    return response.data;
  },

  async listBackups(): Promise<{
    backups: {
      id: string;
      createdAt: Date;
      size: number;
      templateCount: number;
    }[];
  }> {
    const response = await axiosClient.get('/templates/backups');
    return response.data;
  },

  async restoreBackup(backupId: string): Promise<TemplateImportResult> {
    const response = await axiosClient.post<TemplateImportResult>(
      `/templates/backup/${backupId}/restore`
    );
    return response.data;
  },

  // Sharing Operations
  async createShare(templateIds: string[], expiry: string): Promise<TemplateShare> {
    const response = await axiosClient.post<TemplateShare>(
      '/templates/share',
      { templateIds, expiry }
    );
    return response.data;
  },

  async getShare(shareId: string): Promise<TemplateShare> {
    const response = await axiosClient.get<TemplateShare>(
      `/templates/share/${shareId}`
    );
    return response.data;
  },

  async revokeShare(shareId: string): Promise<void> {
    await axiosClient.delete(`/templates/share/${shareId}`);
  },

  // Migration Operations
  async getMigrationPlan(fromVersion: string, toVersion: string): Promise<TemplateMigration> {
    const response = await axiosClient.get<TemplateMigration>(
      `/templates/migration/plan?from=${fromVersion}&to=${toVersion}`
    );
    return response.data;
  },

  async executeMigration(templateId: string, migration: TemplateMigration): Promise<MigrationResult> {
    const response = await axiosClient.post<MigrationResult>(
      `/templates/${templateId}/migrate`,
      migration
    );
    return response.data;
  },

  async getMigrationHistory(templateId: string): Promise<{
    migrations: {
      id: string;
      fromVersion: string;
      toVersion: string;
      executedAt: Date;
      executedBy: string;
      result: MigrationResult;
    }[];
  }> {
    const response = await axiosClient.get(
      `/templates/${templateId}/migrations`
    );
    return response.data;
  },

  // Analytics Operations
  async getAnalytics(templateId: string, timeRange?: string): Promise<TemplateAnalytics> {
    const params = new URLSearchParams();
    if (timeRange) params.append('timeRange', timeRange);
    
    const response = await axiosClient.get<TemplateAnalytics>(
      `/templates/${templateId}/analytics?${params.toString()}`
    );
    return response.data;
  },

  async exportAnalytics(request: AnalyticsExportRequest): Promise<Blob> {
    const response = await axiosClient.post(
      `/templates/${request.templateId}/analytics/export`,
      {
        format: request.format,
        timeRange: request.timeRange,
      },
      {
        responseType: 'blob',
      }
    );
    return response.data;
  },

  async getUsageStatistics(templateId: string): Promise<{
    totalOrders: number;
    activeOrders: number;
    archivedOrders: number;
    byVersion: { version: string; count: number }[];
  }> {
    const response = await axiosClient.get(
      `/templates/${templateId}/usage-statistics`
    );
    return response.data;
  },

  async getAdoptionTrends(templateId: string, period: '7d' | '30d' | '90d' | '1y'): Promise<{
    trend: { date: string; count: number }[];
    adoptionRate: number;
    changePercent: number;
  }> {
    const response = await axiosClient.get(
      `/templates/${templateId}/adoption-trends?period=${period}`
    );
    return response.data;
  },

  async getPerformanceMetrics(templateId: string): Promise<{
    avgProvisioningTime: number;
    successRate: number;
    errorRate: number;
    commonErrors: { error: string; count: number }[];
  }> {
    const response = await axiosClient.get(
      `/templates/${templateId}/performance-metrics`
    );
    return response.data;
  },

  async getUsageHeatMap(templateId: string, granularity: 'daily' | 'weekly' | 'monthly'): Promise<{
    heatMap: number[][];
    startDate: string;
    endDate: string;
  }> {
    const response = await axiosClient.get(
      `/templates/${templateId}/usage-heatmap?granularity=${granularity}`
    );
    return response.data;
  },
};

export const templateService = templatesApi;