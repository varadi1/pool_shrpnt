import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuditExport, type ExportOptions } from '../AuditExport';
import type { AuditFilter, ExportJob } from '@/types/audit';

describe('AuditExport - Comprehensive Export Tests', () => {
  const mockOnExport = vi.fn();
  const mockOnDownload = vi.fn();
  
  const defaultProps = {
    filters: {} as AuditFilter,
    totalCount: 100,
    onExport: mockOnExport,
    onDownload: mockOnDownload,
    maxRowsPerExport: 50000,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const renderComponent = (props = {}) => {
    return render(<AuditExport {...defaultProps} {...props} />);
  };

  describe('Export Dialog Functionality', () => {
    it('opens export dialog when trigger button is clicked', async () => {
      renderComponent();
      
      const exportButton = screen.getByRole('button', { name: /exportálás/i });
      fireEvent.click(exportButton);
      
      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(screen.getByText('Audit bejegyzések exportálása')).toBeInTheDocument();
      });
    });

    it('displays format selection options', async () => {
      renderComponent();
      
      const exportButton = screen.getByRole('button', { name: /exportálás/i });
      fireEvent.click(exportButton);
      
      await waitFor(() => {
        expect(screen.getByLabelText('CSV')).toBeInTheDocument();
        expect(screen.getByLabelText('Excel (XLSX)')).toBeInTheDocument();
      });
    });

    it('shows column selection with all options', async () => {
      renderComponent();
      
      const exportButton = screen.getByRole('button', { name: /exportálás/i });
      fireEvent.click(exportButton);
      
      await waitFor(() => {
        const expectedColumns = [
          'Időbélyeg',
          'Aktor',
          'Művelet',
          'Cél entitás',
          'Státusz',
          'Korrelációs ID',
          'Változások',
          'Metaadatok'
        ];
        
        expectedColumns.forEach(column => {
          expect(screen.getByLabelText(column)).toBeInTheDocument();
        });
      });
    });

    it('handles format selection changes', async () => {
      renderComponent();
      const user = userEvent.setup();
      
      const exportButton = screen.getByRole('button', { name: /exportálás/i });
      await user.click(exportButton);
      
      const xlsxRadio = screen.getByLabelText('Excel (XLSX)');
      await user.click(xlsxRadio);
      
      expect(xlsxRadio).toBeChecked();
      expect(screen.getByLabelText('CSV')).not.toBeChecked();
    });

    it('closes dialog on cancel', async () => {
      renderComponent();
      
      const exportButton = screen.getByRole('button', { name: /exportálás/i });
      fireEvent.click(exportButton);
      
      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });
      
      const cancelButton = screen.getByRole('button', { name: /mégse/i });
      fireEvent.click(cancelButton);
      
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
    });
  });

  describe('Column Selection', () => {
    it('selects all columns when "Összes kiválasztása" is clicked', async () => {
      renderComponent();
      const user = userEvent.setup();
      
      const exportButton = screen.getByRole('button', { name: /exportálás/i });
      await user.click(exportButton);
      
      const selectAllButton = screen.getByRole('button', { name: /összes kiválasztása/i });
      await user.click(selectAllButton);
      
      const checkboxes = screen.getAllByRole('checkbox');
      checkboxes.forEach(checkbox => {
        if (checkbox.getAttribute('aria-label') !== 'Szűrők hozzáadása') {
          expect(checkbox).toBeChecked();
        }
      });
    });

    it('selects only required columns when "Csak kötelező" is clicked', async () => {
      renderComponent();
      const user = userEvent.setup();
      
      const exportButton = screen.getByRole('button', { name: /exportálás/i });
      await user.click(exportButton);
      
      const requiredOnlyButton = screen.getByRole('button', { name: /csak kötelező/i });
      await user.click(requiredOnlyButton);
      
      const requiredColumns = ['Időbélyeg', 'Aktor', 'Művelet', 'Státusz'];
      const optionalColumns = ['Változások', 'Metaadatok'];
      
      requiredColumns.forEach(column => {
        const checkbox = screen.getByLabelText(column);
        expect(checkbox).toBeChecked();
      });
      
      optionalColumns.forEach(column => {
        const checkbox = screen.getByLabelText(column);
        expect(checkbox).not.toBeChecked();
      });
    });

    it('handles individual column selection', async () => {
      renderComponent();
      const user = userEvent.setup();
      
      const exportButton = screen.getByRole('button', { name: /exportálás/i });
      await user.click(exportButton);
      
      const changesCheckbox = screen.getByLabelText('Változások');
      await user.click(changesCheckbox);
      
      expect(changesCheckbox).toBeChecked();
      
      await user.click(changesCheckbox);
      expect(changesCheckbox).not.toBeChecked();
    });

    it('prevents export when no columns selected', async () => {
      renderComponent();
      const user = userEvent.setup();
      
      const exportButton = screen.getByRole('button', { name: /exportálás/i });
      await user.click(exportButton);
      
      // Uncheck all columns
      const checkboxes = screen.getAllByRole('checkbox');
      for (const checkbox of checkboxes) {
        if (checkbox.getAttribute('checked') !== null) {
          await user.click(checkbox);
        }
      }
      
      const startExportButton = screen.getByRole('button', { name: /exportálás indítása/i });
      expect(startExportButton).toBeDisabled();
    });
  });

  describe('Export Size Limits', () => {
    it('shows warning when export exceeds row limit', async () => {
      renderComponent({ totalCount: 60000, maxRowsPerExport: 50000 });
      
      const exportButton = screen.getByRole('button', { name: /exportálás/i });
      fireEvent.click(exportButton);
      
      await waitFor(() => {
        expect(screen.getByText(/figyelmeztetés: az export mérete meghaladja/i)).toBeInTheDocument();
        expect(screen.getByText(/50000/)).toBeInTheDocument();
      });
    });

    it('does not show warning when within limits', async () => {
      renderComponent({ totalCount: 1000, maxRowsPerExport: 50000 });
      
      const exportButton = screen.getByRole('button', { name: /exportálás/i });
      fireEvent.click(exportButton);
      
      await waitFor(() => {
        expect(screen.queryByText(/figyelmeztetés: az export mérete/i)).not.toBeInTheDocument();
      });
    });

    it('handles date range limitation for large exports', async () => {
      renderComponent({ totalCount: 100000 });
      const user = userEvent.setup();
      
      const exportButton = screen.getByRole('button', { name: /exportálás/i });
      await user.click(exportButton);
      
      // Should suggest date range limitation
      expect(screen.getByText(/nagy adatmennyiség esetén/i)).toBeInTheDocument();
    });
  });

  describe('Export Job Processing', () => {
    it('initiates export with correct options', async () => {
      const mockJob: ExportJob = {
        id: 'job-123',
        status: 'processing',
        format: 'csv',
        filters: {},
        createdAt: new Date(),
        progress: { current: 0, total: 100, percentage: 0 },
      };
      
      mockOnExport.mockResolvedValue(mockJob);
      
      renderComponent();
      const user = userEvent.setup();
      
      const exportButton = screen.getByRole('button', { name: /exportálás/i });
      await user.click(exportButton);
      
      const startExportButton = screen.getByRole('button', { name: /exportálás indítása/i });
      await user.click(startExportButton);
      
      await waitFor(() => {
        expect(mockOnExport).toHaveBeenCalledWith(
          expect.objectContaining({
            format: 'csv',
            columns: expect.arrayContaining(['timestamp', 'actor', 'action']),
            includeFilters: false,
          })
        );
      });
    });

    it('shows progress bar during export', async () => {
      const mockJob: ExportJob = {
        id: 'job-123',
        status: 'processing',
        format: 'csv',
        filters: {},
        createdAt: new Date(),
        progress: { current: 50, total: 100, percentage: 50 },
      };
      
      mockOnExport.mockResolvedValue(mockJob);
      
      renderComponent();
      const user = userEvent.setup();
      
      const exportButton = screen.getByRole('button', { name: /exportálás/i });
      await user.click(exportButton);
      
      const startExportButton = screen.getByRole('button', { name: /exportálás indítása/i });
      await user.click(startExportButton);
      
      await waitFor(() => {
        expect(screen.getByRole('progressbar')).toBeInTheDocument();
        expect(screen.getByText('50%')).toBeInTheDocument();
      });
    });

    it('handles successful export completion', async () => {
      const mockJob: ExportJob = {
        id: 'job-123',
        status: 'completed',
        format: 'csv',
        filters: {},
        createdAt: new Date(),
        completedAt: new Date(),
        downloadUrl: '/api/audit/export/download/job-123',
        progress: { current: 100, total: 100, percentage: 100 },
      };
      
      mockOnExport.mockResolvedValue(mockJob);
      
      renderComponent();
      const user = userEvent.setup();
      
      const exportButton = screen.getByRole('button', { name: /exportálás/i });
      await user.click(exportButton);
      
      const startExportButton = screen.getByRole('button', { name: /exportálás indítása/i });
      await user.click(startExportButton);
      
      await waitFor(() => {
        expect(screen.getByText(/export sikeres/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /letöltés/i })).toBeInTheDocument();
      });
    });

    it('handles export failure gracefully', async () => {
      const mockJob: ExportJob = {
        id: 'job-123',
        status: 'failed',
        format: 'csv',
        filters: {},
        createdAt: new Date(),
        error: 'Export failed due to server error',
      };
      
      mockOnExport.mockResolvedValue(mockJob);
      
      renderComponent();
      const user = userEvent.setup();
      
      const exportButton = screen.getByRole('button', { name: /exportálás/i });
      await user.click(exportButton);
      
      const startExportButton = screen.getByRole('button', { name: /exportálás indítása/i });
      await user.click(startExportButton);
      
      await waitFor(() => {
        expect(screen.getByText(/export sikertelen/i)).toBeInTheDocument();
        expect(screen.getByText(/Export failed due to server error/)).toBeInTheDocument();
      });
    });

    it('triggers download when download button clicked', async () => {
      const mockJob: ExportJob = {
        id: 'job-123',
        status: 'completed',
        format: 'csv',
        filters: {},
        createdAt: new Date(),
        completedAt: new Date(),
        downloadUrl: '/api/audit/export/download/job-123',
      };
      
      mockOnExport.mockResolvedValue(mockJob);
      
      renderComponent();
      const user = userEvent.setup();
      
      const exportButton = screen.getByRole('button', { name: /exportálás/i });
      await user.click(exportButton);
      
      const startExportButton = screen.getByRole('button', { name: /exportálás indítása/i });
      await user.click(startExportButton);
      
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /letöltés/i })).toBeInTheDocument();
      });
      
      const downloadButton = screen.getByRole('button', { name: /letöltés/i });
      await user.click(downloadButton);
      
      expect(mockOnDownload).toHaveBeenCalledWith('job-123');
    });
  });

  describe('Export Format Specifics', () => {
    it('includes metadata sheet for XLSX format', async () => {
      mockOnExport.mockResolvedValue({
        id: 'job-123',
        status: 'processing',
        format: 'xlsx',
        filters: {},
        createdAt: new Date(),
      });
      
      renderComponent();
      const user = userEvent.setup();
      
      const exportButton = screen.getByRole('button', { name: /exportálás/i });
      await user.click(exportButton);
      
      const xlsxRadio = screen.getByLabelText('Excel (XLSX)');
      await user.click(xlsxRadio);
      
      const startExportButton = screen.getByRole('button', { name: /exportálás indítása/i });
      await user.click(startExportButton);
      
      expect(mockOnExport).toHaveBeenCalledWith(
        expect.objectContaining({
          format: 'xlsx',
        })
      );
    });

    it('handles CSV delimiter options', async () => {
      renderComponent();
      const user = userEvent.setup();
      
      const exportButton = screen.getByRole('button', { name: /exportálás/i });
      await user.click(exportButton);
      
      const csvRadio = screen.getByLabelText('CSV');
      await user.click(csvRadio);
      
      // CSV format should be selected by default
      expect(csvRadio).toBeChecked();
    });
  });

  describe('Filter Inclusion', () => {
    it('includes current filters when option is selected', async () => {
      const filters: AuditFilter = {
        searchText: 'test',
        categories: ['template'],
        status: ['success'],
      };
      
      mockOnExport.mockResolvedValue({
        id: 'job-123',
        status: 'processing',
        format: 'csv',
        filters,
        createdAt: new Date(),
      });
      
      renderComponent({ filters });
      const user = userEvent.setup();
      
      const exportButton = screen.getByRole('button', { name: /exportálás/i });
      await user.click(exportButton);
      
      const includeFiltersSwitch = screen.getByLabelText('Szűrők hozzáadása');
      await user.click(includeFiltersSwitch);
      
      const startExportButton = screen.getByRole('button', { name: /exportálás indítása/i });
      await user.click(startExportButton);
      
      expect(mockOnExport).toHaveBeenCalledWith(
        expect.objectContaining({
          includeFilters: true,
        })
      );
    });

    it('displays active filters in export dialog', async () => {
      const filters: AuditFilter = {
        searchText: 'security',
        categories: ['security'],
        dateRange: {
          from: new Date('2025-01-01'),
          to: new Date('2025-01-31'),
        },
      };
      
      renderComponent({ filters });
      
      const exportButton = screen.getByRole('button', { name: /exportálás/i });
      fireEvent.click(exportButton);
      
      await waitFor(() => {
        expect(screen.getByText(/aktív szűrők/i)).toBeInTheDocument();
      });
    });
  });

  describe('Export Queue Management', () => {
    it('handles multiple export jobs', async () => {
      const job1: ExportJob = {
        id: 'job-1',
        status: 'processing',
        format: 'csv',
        filters: {},
        createdAt: new Date(),
      };
      
      const job2: ExportJob = {
        id: 'job-2',
        status: 'queued',
        format: 'xlsx',
        filters: {},
        createdAt: new Date(),
      };
      
      mockOnExport
        .mockResolvedValueOnce(job1)
        .mockResolvedValueOnce(job2);
      
      renderComponent();
      const user = userEvent.setup();
      
      // Start first export
      const exportButton = screen.getByRole('button', { name: /exportálás/i });
      await user.click(exportButton);
      
      const startExportButton = screen.getByRole('button', { name: /exportálás indítása/i });
      await user.click(startExportButton);
      
      await waitFor(() => {
        expect(screen.getByText(/feldolgozás alatt/i)).toBeInTheDocument();
      });
    });

    it('shows queue position for waiting exports', async () => {
      const queuedJob: ExportJob = {
        id: 'job-123',
        status: 'queued',
        format: 'csv',
        filters: {},
        createdAt: new Date(),
        progress: { current: 0, total: 100, percentage: 0 },
      };
      
      mockOnExport.mockResolvedValue(queuedJob);
      
      renderComponent();
      const user = userEvent.setup();
      
      const exportButton = screen.getByRole('button', { name: /exportálás/i });
      await user.click(exportButton);
      
      const startExportButton = screen.getByRole('button', { name: /exportálás indítása/i });
      await user.click(startExportButton);
      
      await waitFor(() => {
        expect(screen.getByText(/várakozás/i)).toBeInTheDocument();
      });
    });
  });

  describe('Error Scenarios', () => {
    it('handles network errors during export initiation', async () => {
      mockOnExport.mockRejectedValue(new Error('Network error'));
      
      renderComponent();
      const user = userEvent.setup();
      
      const exportButton = screen.getByRole('button', { name: /exportálás/i });
      await user.click(exportButton);
      
      const startExportButton = screen.getByRole('button', { name: /exportálás indítása/i });
      await user.click(startExportButton);
      
      await waitFor(() => {
        expect(screen.getByText(/hiba történt/i)).toBeInTheDocument();
      });
    });

    it('handles timeout errors for large exports', async () => {
      const timeoutJob: ExportJob = {
        id: 'job-123',
        status: 'failed',
        format: 'csv',
        filters: {},
        createdAt: new Date(),
        error: 'Export timeout: Processing took too long',
      };
      
      mockOnExport.mockResolvedValue(timeoutJob);
      
      renderComponent({ totalCount: 100000 });
      const user = userEvent.setup();
      
      const exportButton = screen.getByRole('button', { name: /exportálás/i });
      await user.click(exportButton);
      
      const startExportButton = screen.getByRole('button', { name: /exportálás indítása/i });
      await user.click(startExportButton);
      
      await waitFor(() => {
        expect(screen.getByText(/timeout/i)).toBeInTheDocument();
      });
    });

    it('provides retry option after failure', async () => {
      mockOnExport
        .mockRejectedValueOnce(new Error('First attempt failed'))
        .mockResolvedValueOnce({
          id: 'job-124',
          status: 'completed',
          format: 'csv',
          filters: {},
          createdAt: new Date(),
          completedAt: new Date(),
          downloadUrl: '/download/job-124',
        });
      
      renderComponent();
      const user = userEvent.setup();
      
      const exportButton = screen.getByRole('button', { name: /exportálás/i });
      await user.click(exportButton);
      
      const startExportButton = screen.getByRole('button', { name: /exportálás indítása/i });
      await user.click(startExportButton);
      
      await waitFor(() => {
        expect(screen.getByText(/hiba történt/i)).toBeInTheDocument();
      });
      
      const retryButton = screen.getByRole('button', { name: /újrapróbálkozás/i });
      await user.click(retryButton);
      
      await waitFor(() => {
        expect(screen.getByText(/export sikeres/i)).toBeInTheDocument();
      });
    });
  });
});