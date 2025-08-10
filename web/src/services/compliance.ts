import { api } from './api';
import type { AuditFilter, AuditEntry } from '../types/audit';

export interface ComplianceReport {
  id: string;
  type: 'user-access' | 'permission-changes' | 'system-access' | 'custom';
  name: string;
  description: string;
  generatedAt: string;
  generatedBy: string;
  filters: AuditFilter;
  entries: AuditEntry[];
  summary: {
    totalEvents: number;
    uniqueUsers: number;
    dateRange: {
      from: string;
      to: string;
    };
    categories: Record<string, number>;
    severities: Record<string, number>;
    successRate: number;
    failureRate: number;
  };
  format?: 'pdf' | 'csv' | 'xlsx';
  downloadUrl?: string;
}

export interface ReportGenerationRequest {
  type: ComplianceReport['type'];
  name?: string;
  description?: string;
  filters: AuditFilter;
  format?: 'pdf' | 'csv' | 'xlsx';
  includeDetails?: boolean;
  includeSummary?: boolean;
}

export interface ReportGenerationResponse {
  reportId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  message?: string;
  downloadUrl?: string;
  estimatedCompletionTime?: string;
}

class ComplianceService {
  private baseUrl = '/api/compliance/reports';

  async generateReport(request: ReportGenerationRequest): Promise<ReportGenerationResponse> {
    try {
      const response = await api.post<ReportGenerationResponse>(this.baseUrl, request);
      
      // Create audit trail for report generation
      await this.createAuditTrail({
        action: 'REPORT_GENERATED',
        target: {
          type: 'report',
          id: response.data.reportId,
          name: request.name || `${request.type} report`,
        },
        metadata: {
          reportType: request.type,
          format: request.format,
          filters: request.filters,
        },
      });
      
      return response.data;
    } catch (error) {
      console.error('Failed to generate report:', error);
      throw error;
    }
  }

  async getReport(reportId: string): Promise<ComplianceReport> {
    try {
      const response = await api.get<ComplianceReport>(`${this.baseUrl}/${reportId}`);
      return response.data;
    } catch (error) {
      console.error('Failed to get report:', error);
      throw error;
    }
  }

  async listReports(filters?: {
    type?: ComplianceReport['type'];
    generatedBy?: string;
    dateRange?: { from: Date; to: Date };
  }): Promise<ComplianceReport[]> {
    try {
      const params = new URLSearchParams();
      if (filters?.type) params.append('type', filters.type);
      if (filters?.generatedBy) params.append('generatedBy', filters.generatedBy);
      if (filters?.dateRange) {
        params.append('from', filters.dateRange.from.toISOString());
        params.append('to', filters.dateRange.to.toISOString());
      }
      
      const response = await api.get<ComplianceReport[]>(`${this.baseUrl}?${params}`);
      return response.data;
    } catch (error) {
      console.error('Failed to list reports:', error);
      throw error;
    }
  }

  async exportReport(reportId: string, format: 'pdf' | 'csv' | 'xlsx'): Promise<Blob> {
    try {
      const response = await api.get(`${this.baseUrl}/${reportId}/export`, {
        params: { format },
        responseType: 'blob',
      });
      
      // Create audit trail for report export
      await this.createAuditTrail({
        action: 'REPORT_EXPORTED',
        target: {
          type: 'report',
          id: reportId,
        },
        metadata: {
          format,
        },
      });
      
      return response.data;
    } catch (error) {
      console.error('Failed to export report:', error);
      throw error;
    }
  }

  async deleteReport(reportId: string): Promise<void> {
    try {
      await api.delete(`${this.baseUrl}/${reportId}`);
    } catch (error) {
      console.error('Failed to delete report:', error);
      throw error;
    }
  }

  async getReportStatus(reportId: string): Promise<ReportGenerationResponse> {
    try {
      const response = await api.get<ReportGenerationResponse>(`${this.baseUrl}/${reportId}/status`);
      return response.data;
    } catch (error) {
      console.error('Failed to get report status:', error);
      throw error;
    }
  }

  async generateUserAccessReport(filters: AuditFilter): Promise<ReportGenerationResponse> {
    return this.generateReport({
      type: 'user-access',
      name: 'User Access Report',
      description: 'Comprehensive report of user access activities',
      filters: {
        ...filters,
        categories: ['user', 'security'],
      },
      format: 'xlsx',
      includeDetails: true,
      includeSummary: true,
    });
  }

  async generatePermissionChangesReport(filters: AuditFilter): Promise<ReportGenerationResponse> {
    return this.generateReport({
      type: 'permission-changes',
      name: 'Permission Changes Report',
      description: 'Report of all permission grants, revocations, and modifications',
      filters: {
        ...filters,
        actionTypes: ['PERMISSION_GRANTED', 'PERMISSION_REVOKED', 'PERMISSION_MODIFIED'],
      },
      format: 'xlsx',
      includeDetails: true,
      includeSummary: true,
    });
  }

  async generateSystemAccessReport(filters: AuditFilter): Promise<ReportGenerationResponse> {
    return this.generateReport({
      type: 'system-access',
      name: 'System Access Report',
      description: 'Report of system-level access and administrative actions',
      filters: {
        ...filters,
        categories: ['system'],
      },
      format: 'xlsx',
      includeDetails: true,
      includeSummary: true,
    });
  }

  private async createAuditTrail(data: {
    action: string;
    target: {
      type: string;
      id: string;
      name?: string;
    };
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    try {
      await api.post('/api/audit/log', {
        action: data.action,
        target: data.target,
        metadata: data.metadata,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Failed to create audit trail:', error);
      // Don't throw - audit trail creation failure shouldn't stop the main operation
    }
  }

  // Report template management
  async getReportTemplates(): Promise<ReportTemplate[]> {
    try {
      const response = await api.get<ReportTemplate[]>(`${this.baseUrl}/templates`);
      return response.data;
    } catch (error) {
      console.error('Failed to get report templates:', error);
      throw error;
    }
  }

  async saveReportTemplate(template: ReportTemplate): Promise<ReportTemplate> {
    try {
      const response = await api.post<ReportTemplate>(`${this.baseUrl}/templates`, template);
      return response.data;
    } catch (error) {
      console.error('Failed to save report template:', error);
      throw error;
    }
  }

  async updateReportTemplate(templateId: string, template: Partial<ReportTemplate>): Promise<ReportTemplate> {
    try {
      const response = await api.put<ReportTemplate>(`${this.baseUrl}/templates/${templateId}`, template);
      return response.data;
    } catch (error) {
      console.error('Failed to update report template:', error);
      throw error;
    }
  }

  async deleteReportTemplate(templateId: string): Promise<void> {
    try {
      await api.delete(`${this.baseUrl}/templates/${templateId}`);
    } catch (error) {
      console.error('Failed to delete report template:', error);
      throw error;
    }
  }

  async generateFromTemplate(templateId: string, overrides?: Partial<AuditFilter>): Promise<ReportGenerationResponse> {
    try {
      const template = await this.getReportTemplate(templateId);
      return this.generateReport({
        type: 'custom',
        name: template.name,
        description: template.description,
        filters: {
          ...template.filters,
          ...overrides,
        },
        format: template.defaultFormat || 'xlsx',
        includeDetails: true,
        includeSummary: true,
      });
    } catch (error) {
      console.error('Failed to generate report from template:', error);
      throw error;
    }
  }

  private async getReportTemplate(templateId: string): Promise<ReportTemplate> {
    try {
      const response = await api.get<ReportTemplate>(`${this.baseUrl}/templates/${templateId}`);
      return response.data;
    } catch (error) {
      console.error('Failed to get report template:', error);
      throw error;
    }
  }
}

export interface ReportTemplate {
  id: string;
  name: string;
  description: string;
  type: ComplianceReport['type'];
  filters: AuditFilter;
  defaultFormat?: 'pdf' | 'csv' | 'xlsx';
  columns?: string[];
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  isPublic?: boolean;
  tags?: string[];
}

export const complianceService = new ComplianceService();