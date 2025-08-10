import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuditExport, type ExportOptions } from '../AuditExport';
import type { AuditFilter, ExportJob } from '../../../types/audit';

describe('AuditExport', () => {
  const mockFilters: AuditFilter = {
    dateRange: {
      from: new Date('2025-01-01'),
      to: new Date('2025-01-31'),
    },
    actors: ['user1@example.com'],
    status: ['success'],
  };

  const mockOnExport = vi.fn();
  const mockOnDownload = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render export button', () => {
      render(
        <AuditExport
          filters={mockFilters}
          totalCount={100}
          onExport={mockOnExport}
          onDownload={mockOnDownload}
        />
      );

      expect(screen.getByRole('button', { name: /export/i })).toBeInTheDocument();
    });

    it('should disable export button when totalCount is 0', () => {
      render(
        <AuditExport
          filters={mockFilters}
          totalCount={0}
          onExport={mockOnExport}
          onDownload={mockOnDownload}
        />
      );

      expect(screen.getByRole('button', { name: /export/i })).toBeDisabled();
    });

    it('should open dialog when export button is clicked', async () => {
      render(
        <AuditExport
          filters={mockFilters}
          totalCount={100}
          onExport={mockOnExport}
          onDownload={mockOnDownload}
        />
      );

      const exportButton = screen.getByRole('button', { name: /export/i });
      await userEvent.click(exportButton);

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('Export Audit Logs')).toBeInTheDocument();
    });
  });

  describe('Export Format Selection', () => {
    it('should default to CSV format', async () => {
      render(
        <AuditExport
          filters={mockFilters}
          totalCount={100}
          onExport={mockOnExport}
          onDownload={mockOnDownload}
        />
      );

      await userEvent.click(screen.getByRole('button', { name: /export/i }));

      const csvRadio = screen.getByRole('radio', { name: /csv/i });
      expect(csvRadio).toBeChecked();
    });

    it('should allow switching to XLSX format', async () => {
      render(
        <AuditExport
          filters={mockFilters}
          totalCount={100}
          onExport={mockOnExport}
          onDownload={mockOnDownload}
        />
      );

      await userEvent.click(screen.getByRole('button', { name: /export/i }));

      const xlsxRadio = screen.getByRole('radio', { name: /xlsx/i });
      await userEvent.click(xlsxRadio);

      expect(xlsxRadio).toBeChecked();
    });

    it('should show metadata option for XLSX format', async () => {
      render(
        <AuditExport
          filters={mockFilters}
          totalCount={100}
          onExport={mockOnExport}
          onDownload={mockOnDownload}
        />
      );

      await userEvent.click(screen.getByRole('button', { name: /export/i }));

      const xlsxRadio = screen.getByRole('radio', { name: /xlsx/i });
      await userEvent.click(xlsxRadio);

      expect(screen.getByText('Include metadata sheet')).toBeInTheDocument();
    });
  });

  describe('Column Selection', () => {
    it('should display all available columns', async () => {
      render(
        <AuditExport
          filters={mockFilters}
          totalCount={100}
          onExport={mockOnExport}
          onDownload={mockOnDownload}
        />
      );

      await userEvent.click(screen.getByRole('button', { name: /export/i }));

      expect(screen.getByLabelText('Timestamp')).toBeInTheDocument();
      expect(screen.getByLabelText('Actor')).toBeInTheDocument();
      expect(screen.getByLabelText('Action')).toBeInTheDocument();
      expect(screen.getByLabelText('Target')).toBeInTheDocument();
      expect(screen.getByLabelText('Status')).toBeInTheDocument();
      expect(screen.getByLabelText('Correlation ID')).toBeInTheDocument();
      expect(screen.getByLabelText('Changes')).toBeInTheDocument();
      expect(screen.getByLabelText('Metadata')).toBeInTheDocument();
    });

    it('should have default columns selected', async () => {
      render(
        <AuditExport
          filters={mockFilters}
          totalCount={100}
          onExport={mockOnExport}
          onDownload={mockOnDownload}
        />
      );

      await userEvent.click(screen.getByRole('button', { name: /export/i }));

      expect(screen.getByLabelText('Timestamp')).toBeChecked();
      expect(screen.getByLabelText('Actor')).toBeChecked();
      expect(screen.getByLabelText('Action')).toBeChecked();
      expect(screen.getByLabelText('Target')).toBeChecked();
      expect(screen.getByLabelText('Status')).toBeChecked();
      expect(screen.getByLabelText('Correlation ID')).toBeChecked();
    });

    it('should disable required columns', async () => {
      render(
        <AuditExport
          filters={mockFilters}
          totalCount={100}
          onExport={mockOnExport}
          onDownload={mockOnDownload}
        />
      );

      await userEvent.click(screen.getByRole('button', { name: /export/i }));

      expect(screen.getByLabelText('Timestamp')).toBeDisabled();
      expect(screen.getByLabelText('Actor')).toBeDisabled();
      expect(screen.getByLabelText('Action')).toBeDisabled();
    });

    it('should select all columns when Select All is clicked', async () => {
      render(
        <AuditExport
          filters={mockFilters}
          totalCount={100}
          onExport={mockOnExport}
          onDownload={mockOnDownload}
        />
      );

      await userEvent.click(screen.getByRole('button', { name: /export/i }));
      await userEvent.click(screen.getByRole('button', { name: /select all/i }));

      const checkboxes = screen.getAllByRole('checkbox');
      checkboxes.forEach(checkbox => {
        if (!checkbox.getAttribute('disabled')) {
          expect(checkbox).toBeChecked();
        }
      });
    });

    it('should select only required columns when Required Only is clicked', async () => {
      render(
        <AuditExport
          filters={mockFilters}
          totalCount={100}
          onExport={mockOnExport}
          onDownload={mockOnDownload}
        />
      );

      await userEvent.click(screen.getByRole('button', { name: /export/i }));
      await userEvent.click(screen.getByRole('button', { name: /required only/i }));

      expect(screen.getByLabelText('Timestamp')).toBeChecked();
      expect(screen.getByLabelText('Actor')).toBeChecked();
      expect(screen.getByLabelText('Action')).toBeChecked();
      expect(screen.getByLabelText('Changes')).not.toBeChecked();
    });
  });

  describe('Export Limit Warning', () => {
    it('should show warning when totalCount exceeds limit', async () => {
      render(
        <AuditExport
          filters={mockFilters}
          totalCount={60000}
          onExport={mockOnExport}
          onDownload={mockOnDownload}
          maxRowsPerExport={50000}
        />
      );

      await userEvent.click(screen.getByRole('button', { name: /export/i }));

      expect(screen.getByText(/exceeds the export limit/i)).toBeInTheDocument();
      expect(screen.getByText((content, element) => {
        return element?.textContent?.includes('50,000') && element?.textContent?.includes('export limit') || false;
      })).toBeInTheDocument();
    });

    it('should not show warning when totalCount is within limit', async () => {
      render(
        <AuditExport
          filters={mockFilters}
          totalCount={40000}
          onExport={mockOnExport}
          onDownload={mockOnDownload}
          maxRowsPerExport={50000}
        />
      );

      await userEvent.click(screen.getByRole('button', { name: /export/i }));

      expect(screen.queryByText(/exceeds the export limit/i)).not.toBeInTheDocument();
    });
  });

  describe('Export Options', () => {
    it('should have include filters option checked by default', async () => {
      render(
        <AuditExport
          filters={mockFilters}
          totalCount={100}
          onExport={mockOnExport}
          onDownload={mockOnDownload}
        />
      );

      await userEvent.click(screen.getByRole('button', { name: /export/i }));

      const includeFiltersSwitch = screen.getByRole('switch', { name: /include current filters/i });
      expect(includeFiltersSwitch).toBeChecked();
    });

    it('should toggle include filters option', async () => {
      render(
        <AuditExport
          filters={mockFilters}
          totalCount={100}
          onExport={mockOnExport}
          onDownload={mockOnDownload}
        />
      );

      await userEvent.click(screen.getByRole('button', { name: /export/i }));

      const includeFiltersSwitch = screen.getByRole('switch', { name: /include current filters/i });
      await userEvent.click(includeFiltersSwitch);

      expect(includeFiltersSwitch).not.toBeChecked();
    });
  });

  describe('Export Summary', () => {
    it('should display export summary', async () => {
      render(
        <AuditExport
          filters={mockFilters}
          totalCount={1500}
          onExport={mockOnExport}
          onDownload={mockOnDownload}
        />
      );

      await userEvent.click(screen.getByRole('button', { name: /export/i }));

      expect(screen.getByText('Export Summary')).toBeInTheDocument();
      expect(screen.getByText(/Format: CSV/i)).toBeInTheDocument();
      expect(screen.getByText(/Estimated rows: 1,500/i)).toBeInTheDocument();
      expect(screen.getByText(/Columns: 6 of 12/i)).toBeInTheDocument();
      expect(screen.getByText(/✓ Filters will be applied/i)).toBeInTheDocument();
    });

    it('should update summary when format changes', async () => {
      render(
        <AuditExport
          filters={mockFilters}
          totalCount={100}
          onExport={mockOnExport}
          onDownload={mockOnDownload}
        />
      );

      await userEvent.click(screen.getByRole('button', { name: /export/i }));

      const xlsxRadio = screen.getByRole('radio', { name: /xlsx/i });
      await userEvent.click(xlsxRadio);

      expect(screen.getByText(/Format: XLSX/i)).toBeInTheDocument();
    });
  });

  describe('Export Process', () => {
    it('should call onExport with correct options', async () => {
      mockOnExport.mockResolvedValue({
        id: 'export-1',
        status: 'completed',
        format: 'csv',
        filters: mockFilters,
        createdAt: new Date(),
        completedAt: new Date(),
        downloadUrl: '/download/export-1',
      } as ExportJob);

      render(
        <AuditExport
          filters={mockFilters}
          totalCount={100}
          onExport={mockOnExport}
          onDownload={mockOnDownload}
        />
      );

      await userEvent.click(screen.getByRole('button', { name: /export/i }));
      await userEvent.click(screen.getByRole('button', { name: /start export/i }));

      await waitFor(() => {
        expect(mockOnExport).toHaveBeenCalledWith({
          format: 'csv',
          columns: ['timestamp', 'actor', 'action', 'target', 'status', 'correlationId'],
          includeFilters: true,
        });
      });
    });

    it('should show progress when export is processing', async () => {
      mockOnExport.mockResolvedValue({
        id: 'export-1',
        status: 'processing',
        format: 'csv',
        filters: mockFilters,
        createdAt: new Date(),
        progress: {
          current: 500,
          total: 1000,
          percentage: 50,
        },
      } as ExportJob);

      render(
        <AuditExport
          filters={mockFilters}
          totalCount={1000}
          onExport={mockOnExport}
          onDownload={mockOnDownload}
        />
      );

      await userEvent.click(screen.getByRole('button', { name: /export/i }));
      await userEvent.click(screen.getByRole('button', { name: /start export/i }));

      await waitFor(() => {
        expect(screen.getByText('Processing Export...')).toBeInTheDocument();
        expect(screen.getByText(/500 of 1,000 entries processed/i)).toBeInTheDocument();
      });
    });

    it('should show error when export fails', async () => {
      mockOnExport.mockRejectedValue(new Error('Export failed due to server error'));

      render(
        <AuditExport
          filters={mockFilters}
          totalCount={100}
          onExport={mockOnExport}
          onDownload={mockOnDownload}
        />
      );

      await userEvent.click(screen.getByRole('button', { name: /export/i }));
      await userEvent.click(screen.getByRole('button', { name: /start export/i }));

      await waitFor(() => {
        expect(screen.getByText('Export failed due to server error')).toBeInTheDocument();
      });
    });

    it('should show download button when export is completed', async () => {
      mockOnExport.mockResolvedValue({
        id: 'export-1',
        status: 'completed',
        format: 'csv',
        filters: mockFilters,
        createdAt: new Date(),
        completedAt: new Date(),
        downloadUrl: '/download/export-1',
      } as ExportJob);

      render(
        <AuditExport
          filters={mockFilters}
          totalCount={100}
          onExport={mockOnExport}
          onDownload={mockOnDownload}
        />
      );

      await userEvent.click(screen.getByRole('button', { name: /export/i }));
      await userEvent.click(screen.getByRole('button', { name: /start export/i }));

      await waitFor(() => {
        expect(screen.getByText('Export Complete')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /download/i })).toBeInTheDocument();
      }, { timeout: 3000 });
    });

    it('should call onDownload when download button is clicked', async () => {
      mockOnExport.mockResolvedValue({
        id: 'export-1',
        status: 'completed',
        format: 'csv',
        filters: mockFilters,
        createdAt: new Date(),
        completedAt: new Date(),
        downloadUrl: '/download/export-1',
      } as ExportJob);

      render(
        <AuditExport
          filters={mockFilters}
          totalCount={100}
          onExport={mockOnExport}
          onDownload={mockOnDownload}
        />
      );

      await userEvent.click(screen.getByRole('button', { name: /export/i }));
      await userEvent.click(screen.getByRole('button', { name: /start export/i }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /download/i })).toBeInTheDocument();
      }, { timeout: 3000 });

      await userEvent.click(screen.getByRole('button', { name: /download/i }));

      expect(mockOnDownload).toHaveBeenCalledWith('export-1');
    });
  });

  describe('Dialog Control', () => {
    it('should close dialog when cancel is clicked', async () => {
      render(
        <AuditExport
          filters={mockFilters}
          totalCount={100}
          onExport={mockOnExport}
          onDownload={mockOnDownload}
        />
      );

      await userEvent.click(screen.getByRole('button', { name: /export/i }));
      expect(screen.getByRole('dialog')).toBeInTheDocument();

      await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
      
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
    });

    it('should not disable start export when only required columns are selected', async () => {
      render(
        <AuditExport
          filters={mockFilters}
          totalCount={100}
          onExport={mockOnExport}
          onDownload={mockOnDownload}
        />
      );

      await userEvent.click(screen.getByRole('button', { name: /export/i }));

      // Try to uncheck optional columns (required columns are disabled and can't be unchecked)
      const targetCheckbox = screen.getByLabelText('Target');
      const statusCheckbox = screen.getByLabelText('Status');
      const correlationCheckbox = screen.getByLabelText('Correlation ID');

      await userEvent.click(targetCheckbox);
      await userEvent.click(statusCheckbox);
      await userEvent.click(correlationCheckbox);

      // Start export should still be enabled because required columns remain selected
      const startExportButton = screen.getByRole('button', { name: /start export/i });
      expect(startExportButton).not.toBeDisabled();
    });
  });
});