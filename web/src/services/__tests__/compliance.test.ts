import { describe, it, expect, vi, beforeEach } from 'vitest';
import { complianceService, ComplianceReport, ReportGenerationRequest, ReportTemplate } from '../compliance';
import { api } from '../api';

vi.mock('../api');

describe('ComplianceService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('generateReport', () => {
    it('generates a compliance report', async () => {
      const request: ReportGenerationRequest = {
        type: 'user-access',
        name: 'User Access Report',
        filters: {},
        format: 'xlsx',
      };

      const mockResponse = {
        reportId: 'report-123',
        status: 'queued' as const,
        estimatedCompletionTime: '2024-01-01T12:00:00Z',
      };

      vi.mocked(api.post).mockResolvedValue({ data: mockResponse });

      const result = await complianceService.generateReport(request);

      expect(api.post).toHaveBeenCalledWith('/api/compliance/reports', request);
      expect(result).toEqual(mockResponse);
    });

    it('creates audit trail after generating report', async () => {
      const request: ReportGenerationRequest = {
        type: 'permission-changes',
        name: 'Permission Report',
        filters: {},
      };

      const mockResponse = {
        reportId: 'report-456',
        status: 'queued' as const,
      };

      vi.mocked(api.post).mockResolvedValue({ data: mockResponse });

      await complianceService.generateReport(request);

      expect(api.post).toHaveBeenCalledTimes(2);
      expect(api.post).toHaveBeenNthCalledWith(2, '/api/audit/log', expect.objectContaining({
        action: 'REPORT_GENERATED',
        target: {
          type: 'report',
          id: 'report-456',
          name: 'Permission Report',
        },
      }));
    });

    it('handles generation errors', async () => {
      const request: ReportGenerationRequest = {
        type: 'system-access',
        filters: {},
      };

      const error = new Error('Generation failed');
      vi.mocked(api.post).mockRejectedValue(error);

      await expect(complianceService.generateReport(request)).rejects.toThrow('Generation failed');
    });
  });

  describe('getReport', () => {
    it('retrieves a report by ID', async () => {
      const mockReport: ComplianceReport = {
        id: 'report-123',
        type: 'user-access',
        name: 'User Access Report',
        description: 'Test report',
        generatedAt: '2024-01-01T00:00:00Z',
        generatedBy: 'user1',
        filters: {},
        entries: [],
        summary: {
          totalEvents: 100,
          uniqueUsers: 10,
          dateRange: {
            from: '2024-01-01T00:00:00Z',
            to: '2024-01-31T23:59:59Z',
          },
          categories: {},
          severities: {},
          successRate: 90,
          failureRate: 10,
        },
      };

      vi.mocked(api.get).mockResolvedValue({ data: mockReport });

      const result = await complianceService.getReport('report-123');

      expect(api.get).toHaveBeenCalledWith('/api/compliance/reports/report-123');
      expect(result).toEqual(mockReport);
    });
  });

  describe('listReports', () => {
    it('lists reports without filters', async () => {
      const mockReports: ComplianceReport[] = [
        {
          id: 'report-1',
          type: 'user-access',
          name: 'Report 1',
          description: 'Test',
          generatedAt: '2024-01-01T00:00:00Z',
          generatedBy: 'user1',
          filters: {},
          entries: [],
          summary: {
            totalEvents: 50,
            uniqueUsers: 5,
            dateRange: { from: '', to: '' },
            categories: {},
            severities: {},
            successRate: 95,
            failureRate: 5,
          },
        },
      ];

      vi.mocked(api.get).mockResolvedValue({ data: mockReports });

      const result = await complianceService.listReports();

      expect(api.get).toHaveBeenCalledWith('/api/compliance/reports?');
      expect(result).toEqual(mockReports);
    });

    it('lists reports with filters', async () => {
      const filters = {
        type: 'permission-changes' as const,
        generatedBy: 'user2',
        dateRange: {
          from: new Date('2024-01-01'),
          to: new Date('2024-01-31'),
        },
      };

      vi.mocked(api.get).mockResolvedValue({ data: [] });

      await complianceService.listReports(filters);

      const expectedUrl = expect.stringContaining('type=permission-changes');
      expect(api.get).toHaveBeenCalledWith(expectedUrl);
    });
  });

  describe('exportReport', () => {
    it('exports a report in specified format', async () => {
      const blob = new Blob(['test data']);
      vi.mocked(api.get).mockResolvedValue({ data: blob });

      const result = await complianceService.exportReport('report-123', 'pdf');

      expect(api.get).toHaveBeenCalledWith(
        '/api/compliance/reports/report-123/export',
        {
          params: { format: 'pdf' },
          responseType: 'blob',
        }
      );
      expect(result).toBe(blob);
    });

    it('creates audit trail after export', async () => {
      const blob = new Blob(['test data']);
      vi.mocked(api.get).mockResolvedValue({ data: blob });
      vi.mocked(api.post).mockResolvedValue({ data: {} });

      await complianceService.exportReport('report-123', 'csv');

      expect(api.post).toHaveBeenCalledWith('/api/audit/log', expect.objectContaining({
        action: 'REPORT_EXPORTED',
        target: {
          type: 'report',
          id: 'report-123',
        },
        metadata: {
          format: 'csv',
        },
      }));
    });
  });

  describe('deleteReport', () => {
    it('deletes a report', async () => {
      vi.mocked(api.delete).mockResolvedValue({ data: {} });

      await complianceService.deleteReport('report-123');

      expect(api.delete).toHaveBeenCalledWith('/api/compliance/reports/report-123');
    });
  });

  describe('getReportStatus', () => {
    it('gets report generation status', async () => {
      const mockStatus = {
        reportId: 'report-123',
        status: 'processing' as const,
        message: 'Processing...',
      };

      vi.mocked(api.get).mockResolvedValue({ data: mockStatus });

      const result = await complianceService.getReportStatus('report-123');

      expect(api.get).toHaveBeenCalledWith('/api/compliance/reports/report-123/status');
      expect(result).toEqual(mockStatus);
    });
  });

  describe('specific report generators', () => {
    it('generates user access report', async () => {
      const mockResponse = {
        reportId: 'report-user',
        status: 'queued' as const,
      };

      vi.mocked(api.post).mockResolvedValue({ data: mockResponse });

      const result = await complianceService.generateUserAccessReport({
        dateRange: {
          from: new Date('2024-01-01'),
          to: new Date('2024-01-31'),
        },
      });

      expect(api.post).toHaveBeenCalledWith('/api/compliance/reports', expect.objectContaining({
        type: 'user-access',
        name: 'User Access Report',
        filters: expect.objectContaining({
          categories: ['user', 'security'],
        }),
      }));
      expect(result).toEqual(mockResponse);
    });

    it('generates permission changes report', async () => {
      const mockResponse = {
        reportId: 'report-perm',
        status: 'queued' as const,
      };

      vi.mocked(api.post).mockResolvedValue({ data: mockResponse });

      const result = await complianceService.generatePermissionChangesReport({});

      expect(api.post).toHaveBeenCalledWith('/api/compliance/reports', expect.objectContaining({
        type: 'permission-changes',
        filters: expect.objectContaining({
          actionTypes: ['PERMISSION_GRANTED', 'PERMISSION_REVOKED', 'PERMISSION_MODIFIED'],
        }),
      }));
      expect(result).toEqual(mockResponse);
    });

    it('generates system access report', async () => {
      const mockResponse = {
        reportId: 'report-sys',
        status: 'queued' as const,
      };

      vi.mocked(api.post).mockResolvedValue({ data: mockResponse });

      const result = await complianceService.generateSystemAccessReport({});

      expect(api.post).toHaveBeenCalledWith('/api/compliance/reports', expect.objectContaining({
        type: 'system-access',
        filters: expect.objectContaining({
          categories: ['system'],
        }),
      }));
      expect(result).toEqual(mockResponse);
    });
  });

  describe('report templates', () => {
    it('gets report templates', async () => {
      const mockTemplates: ReportTemplate[] = [
        {
          id: 'template-1',
          name: 'Weekly User Report',
          description: 'Weekly user activity',
          type: 'user-access',
          filters: {},
          createdBy: 'admin',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
      ];

      vi.mocked(api.get).mockResolvedValue({ data: mockTemplates });

      const result = await complianceService.getReportTemplates();

      expect(api.get).toHaveBeenCalledWith('/api/compliance/reports/templates');
      expect(result).toEqual(mockTemplates);
    });

    it('saves a report template', async () => {
      const template: ReportTemplate = {
        id: 'template-new',
        name: 'Custom Report',
        description: 'Custom template',
        type: 'custom',
        filters: {},
        createdBy: 'user1',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      vi.mocked(api.post).mockResolvedValue({ data: template });

      const result = await complianceService.saveReportTemplate(template);

      expect(api.post).toHaveBeenCalledWith('/api/compliance/reports/templates', template);
      expect(result).toEqual(template);
    });

    it('updates a report template', async () => {
      const updates = {
        name: 'Updated Template',
        description: 'Updated description',
      };

      const updatedTemplate: ReportTemplate = {
        id: 'template-1',
        name: 'Updated Template',
        description: 'Updated description',
        type: 'custom',
        filters: {},
        createdBy: 'user1',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-02T00:00:00Z',
      };

      vi.mocked(api.put).mockResolvedValue({ data: updatedTemplate });

      const result = await complianceService.updateReportTemplate('template-1', updates);

      expect(api.put).toHaveBeenCalledWith('/api/compliance/reports/templates/template-1', updates);
      expect(result).toEqual(updatedTemplate);
    });

    it('deletes a report template', async () => {
      vi.mocked(api.delete).mockResolvedValue({ data: {} });

      await complianceService.deleteReportTemplate('template-1');

      expect(api.delete).toHaveBeenCalledWith('/api/compliance/reports/templates/template-1');
    });

    it('generates report from template', async () => {
      const template: ReportTemplate = {
        id: 'template-1',
        name: 'Template Report',
        description: 'From template',
        type: 'custom',
        filters: { categories: ['user'] },
        defaultFormat: 'pdf',
        createdBy: 'admin',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      const mockResponse = {
        reportId: 'report-from-template',
        status: 'queued' as const,
      };

      vi.mocked(api.get).mockResolvedValue({ data: template });
      vi.mocked(api.post).mockResolvedValue({ data: mockResponse });

      const result = await complianceService.generateFromTemplate('template-1', {
        dateRange: {
          from: new Date('2024-01-01'),
          to: new Date('2024-01-31'),
        },
      });

      expect(api.get).toHaveBeenCalledWith('/api/compliance/reports/templates/template-1');
      expect(api.post).toHaveBeenCalledWith('/api/compliance/reports', expect.objectContaining({
        type: 'custom',
        name: 'Template Report',
        filters: expect.objectContaining({
          categories: ['user'],
          dateRange: expect.any(Object),
        }),
        format: 'pdf',
      }));
      expect(result).toEqual(mockResponse);
    });
  });
});