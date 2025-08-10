import React, { useState, useCallback } from 'react';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  DialogTrigger,
  DialogActions,
  Button,
  Checkbox,
  RadioGroup,
  Radio,
  Label,
  Spinner,
  ProgressBar,
  makeStyles,
  tokens,
  Card,
  CardHeader,
  Text,
  Badge,
  Divider,
  Field,
  Switch,
} from '@fluentui/react-components';
import {
  ArrowDownloadRegular,
  DocumentTableRegular,
  DocumentRegular,
  CheckmarkCircleRegular,
  ErrorCircleRegular,
  ClockRegular,
} from '@fluentui/react-icons';
import type { AuditFilter, ExportJob } from '../../types/audit';

const useStyles = makeStyles({
  dialog: {
    maxWidth: '600px',
  },
  section: {
    marginBottom: tokens.spacingVerticalL,
  },
  columnGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: tokens.spacingHorizontalS,
    marginTop: tokens.spacingVerticalS,
  },
  progressSection: {
    marginTop: tokens.spacingVerticalL,
    padding: tokens.spacingHorizontalL,
    backgroundColor: tokens.colorNeutralBackground2,
    borderRadius: tokens.borderRadiusMedium,
  },
  statusIcon: {
    marginRight: tokens.spacingHorizontalS,
  },
  exportInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
  },
  exportMetadata: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
  },
  limitWarning: {
    padding: tokens.spacingHorizontalM,
    backgroundColor: tokens.colorPaletteYellowBackground2,
    borderRadius: tokens.borderRadiusMedium,
    marginBottom: tokens.spacingVerticalM,
  },
});

interface AuditExportProps {
  filters: AuditFilter;
  totalCount: number;
  onExport: (options: ExportOptions) => Promise<ExportJob>;
  onDownload: (jobId: string) => void;
  maxRowsPerExport?: number;
}

export interface ExportOptions {
  format: 'csv' | 'xlsx';
  columns: string[];
  includeFilters: boolean;
  dateRangeLimit?: {
    from: Date;
    to: Date;
  };
}

const DEFAULT_COLUMNS = [
  'timestamp',
  'actor',
  'action',
  'target',
  'status',
  'correlationId',
];

const AVAILABLE_COLUMNS = [
  { id: 'timestamp', label: 'Timestamp', required: true },
  { id: 'actor', label: 'Actor', required: true },
  { id: 'action', label: 'Action', required: true },
  { id: 'target', label: 'Target', required: false },
  { id: 'status', label: 'Status', required: false },
  { id: 'correlationId', label: 'Correlation ID', required: false },
  { id: 'changes', label: 'Changes', required: false },
  { id: 'metadata', label: 'Metadata', required: false },
  { id: 'duration', label: 'Duration', required: false },
  { id: 'ipAddress', label: 'IP Address', required: false },
  { id: 'userAgent', label: 'User Agent', required: false },
  { id: 'error', label: 'Error Details', required: false },
];

export const AuditExport: React.FC<AuditExportProps> = ({
  filters,
  totalCount,
  onExport,
  onDownload,
  maxRowsPerExport = 50000,
}) => {
  const styles = useStyles();
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState<'csv' | 'xlsx'>('csv');
  const [selectedColumns, setSelectedColumns] = useState<string[]>(DEFAULT_COLUMNS);
  const [includeFilters, setIncludeFilters] = useState(true);
  const [includeMetadata, setIncludeMetadata] = useState(true);
  const [exportJob, setExportJob] = useState<ExportJob | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const exceedsLimit = totalCount > maxRowsPerExport;

  const handleColumnToggle = useCallback((columnId: string, checked: boolean) => {
    setSelectedColumns(prev => {
      if (checked) {
        return [...prev, columnId];
      }
      return prev.filter(id => id !== columnId);
    });
  }, []);

  const handleExport = useCallback(async () => {
    setIsExporting(true);
    setError(null);

    try {
      const exportOptions: ExportOptions = {
        format,
        columns: selectedColumns,
        includeFilters,
      };

      if (exceedsLimit && filters.dateRange) {
        exportOptions.dateRangeLimit = {
          from: filters.dateRange.from,
          to: filters.dateRange.to,
        };
      }

      const job = await onExport(exportOptions);
      setExportJob(job);

      if (job.status === 'completed' && job.downloadUrl) {
        onDownload(job.id);
        setOpen(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setIsExporting(false);
    }
  }, [format, selectedColumns, includeFilters, exceedsLimit, filters, onExport, onDownload]);

  const handleSelectAllColumns = useCallback(() => {
    setSelectedColumns(AVAILABLE_COLUMNS.map(col => col.id));
  }, []);

  const handleSelectRequiredOnly = useCallback(() => {
    setSelectedColumns(AVAILABLE_COLUMNS.filter(col => col.required).map(col => col.id));
  }, []);

  const getStatusIcon = () => {
    if (!exportJob) return null;

    switch (exportJob.status) {
      case 'completed':
        return <CheckmarkCircleRegular className={styles.statusIcon} primaryFill={tokens.colorPaletteGreenForeground1} />;
      case 'failed':
        return <ErrorCircleRegular className={styles.statusIcon} primaryFill={tokens.colorPaletteRedForeground1} />;
      case 'processing':
        return <Spinner size="tiny" className={styles.statusIcon} />;
      default:
        return <ClockRegular className={styles.statusIcon} />;
    }
  };

  return (
    <Dialog open={open} onOpenChange={(_, data) => setOpen(data.open)}>
      <DialogTrigger disableButtonEnhancement>
        <Button 
          appearance="primary" 
          icon={<ArrowDownloadRegular />}
          disabled={totalCount === 0}
        >
          Export
        </Button>
      </DialogTrigger>
      <DialogSurface className={styles.dialog}>
        <DialogTitle>Export Audit Logs</DialogTitle>
        <DialogContent>
          <DialogBody>
            {exceedsLimit && (
              <div className={styles.limitWarning}>
                <Text weight="semibold">⚠️ Export Limit Warning</Text>
                <Text style={{ display: 'block', marginTop: '4px' }}>
                  The current selection contains {totalCount.toLocaleString()} entries, 
                  which exceeds the export limit of {maxRowsPerExport.toLocaleString()}.
                  The export will be limited to the most recent entries within your date range.
                </Text>
              </div>
            )}

            {!exportJob ? (
              <>
                <div className={styles.section}>
                  <Label htmlFor="format-selection">Export Format</Label>
                  <RadioGroup
                    id="format-selection"
                    value={format}
                    onChange={(_, data) => setFormat(data.value as 'csv' | 'xlsx')}
                  >
                    <Radio 
                      value="csv" 
                      label={
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <DocumentTableRegular />
                          <span>CSV - Comma Separated Values</span>
                        </div>
                      }
                    />
                    <Radio 
                      value="xlsx" 
                      label={
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <DocumentRegular />
                          <span>XLSX - Excel Spreadsheet</span>
                        </div>
                      }
                    />
                  </RadioGroup>
                </div>

                <Divider />

                <div className={styles.section}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Label>Select Columns to Export</Label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <Button size="small" appearance="subtle" onClick={handleSelectAllColumns}>
                        Select All
                      </Button>
                      <Button size="small" appearance="subtle" onClick={handleSelectRequiredOnly}>
                        Required Only
                      </Button>
                    </div>
                  </div>
                  <div className={styles.columnGrid}>
                    {AVAILABLE_COLUMNS.map(column => (
                      <Checkbox
                        key={column.id}
                        label={column.label}
                        checked={selectedColumns.includes(column.id)}
                        disabled={column.required}
                        onChange={(_, data) => handleColumnToggle(column.id, data.checked as boolean)}
                      />
                    ))}
                  </div>
                </div>

                <Divider />

                <div className={styles.section}>
                  <Label>Export Options</Label>
                  <Field>
                    <Switch
                      label="Include current filters in export"
                      checked={includeFilters}
                      onChange={(_, data) => setIncludeFilters(data.checked)}
                    />
                  </Field>
                  {format === 'xlsx' && (
                    <Field>
                      <Switch
                        label="Include metadata sheet"
                        checked={includeMetadata}
                        onChange={(_, data) => setIncludeMetadata(data.checked)}
                      />
                    </Field>
                  )}
                </div>

                <Card>
                  <CardHeader
                    header={
                      <Text weight="semibold">Export Summary</Text>
                    }
                  />
                  <div className={styles.exportInfo}>
                    <Text className={styles.exportMetadata}>
                      Format: {format.toUpperCase()}
                    </Text>
                    <Text className={styles.exportMetadata}>
                      Estimated rows: {Math.min(totalCount, maxRowsPerExport).toLocaleString()}
                    </Text>
                    <Text className={styles.exportMetadata}>
                      Columns: {selectedColumns.length} of {AVAILABLE_COLUMNS.length}
                    </Text>
                    {includeFilters && (
                      <Text className={styles.exportMetadata}>
                        ✓ Filters will be applied
                      </Text>
                    )}
                    {format === 'xlsx' && includeMetadata && (
                      <Text className={styles.exportMetadata}>
                        ✓ Metadata sheet will be included
                      </Text>
                    )}
                  </div>
                </Card>
              </>
            ) : (
              <div className={styles.progressSection}>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '12px' }}>
                  {getStatusIcon()}
                  <Text weight="semibold">
                    {exportJob.status === 'completed' ? 'Export Complete' :
                     exportJob.status === 'failed' ? 'Export Failed' :
                     exportJob.status === 'processing' ? 'Processing Export...' :
                     'Export Queued'}
                  </Text>
                </div>
                
                {exportJob.progress && exportJob.status === 'processing' && (
                  <>
                    <ProgressBar
                      value={exportJob.progress.percentage / 100}
                      max={1}
                    />
                    <Text className={styles.exportMetadata} style={{ marginTop: '8px' }}>
                      {exportJob.progress.current.toLocaleString()} of {exportJob.progress.total.toLocaleString()} entries processed
                    </Text>
                  </>
                )}

                {exportJob.status === 'completed' && (
                  <Text>
                    Your export is ready for download. The file will be available for 24 hours.
                  </Text>
                )}

                {exportJob.status === 'failed' && exportJob.error && (
                  <Text style={{ color: tokens.colorPaletteRedForeground1 }}>
                    {exportJob.error}
                  </Text>
                )}
              </div>
            )}

            {error && (
              <div style={{ marginTop: '12px' }}>
                <Badge appearance="filled" color="danger">
                  {error}
                </Badge>
              </div>
            )}
          </DialogBody>
        </DialogContent>
        <DialogActions>
          <DialogTrigger disableButtonEnhancement>
            <Button appearance="secondary">Cancel</Button>
          </DialogTrigger>
          {!exportJob && (
            <Button
              appearance="primary"
              icon={<ArrowDownloadRegular />}
              onClick={handleExport}
              disabled={isExporting || selectedColumns.length === 0}
            >
              {isExporting ? 'Exporting...' : 'Start Export'}
            </Button>
          )}
          {exportJob?.status === 'completed' && exportJob.downloadUrl && (
            <Button
              appearance="primary"
              icon={<ArrowDownloadRegular />}
              onClick={() => {
                onDownload(exportJob.id);
                setOpen(false);
              }}
            >
              Download
            </Button>
          )}
        </DialogActions>
      </DialogSurface>
    </Dialog>
  );
};