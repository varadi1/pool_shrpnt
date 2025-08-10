import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Title1,
  makeStyles,
  tokens,
  Spinner,
  Text,
  Card,
  Badge,
  Button,
  Tooltip,
  TabList,
  Tab,
} from '@fluentui/react-components';
import {
  Table,
  TableBody,
  TableCell,
  TableCellLayout,
  TableHeader,
  TableHeaderCell,
  TableRow,
} from '@fluentui/react-components';
import { useQueryClient } from '@tanstack/react-query';
// import { useVirtualizer } from '@tanstack/react-virtual'; // TODO: Install package
import {
  Clock24Regular,
  Person24Regular,
  Target24Regular,
  CheckmarkCircle24Regular,
  ErrorCircle24Regular,
  Link24Regular,
  ArrowSync24Regular,
  DocumentTableRegular,
} from '@fluentui/react-icons';
import { useAuth } from '@/hooks/useAuth';
import { useAuditWebSocket } from '@/hooks/useAuditWebSocket';
import { useAuditLogs, useAuditExport, useAuditFilters } from '@/hooks/useAuditLogs';
import { AuditFilters } from '@/components/audit/AuditFilters';
import { AuditExport } from '@/components/audit/AuditExport';
import { LiveUpdateBadge } from '@/components/audit/LiveUpdateBadge';
import AuditAnalytics from '@/components/audit/AuditAnalytics';
import type { ReportType } from '@/components/audit/AuditAnalytics';
import type { AuditEntry, AuditFilter, ExportJob, AuditStats } from '@/types/audit';
import type { ExportOptions } from '@/components/audit/AuditExport';
import { complianceService } from '@/services/compliance';
import { api } from '@/services/api';

const useStyles = makeStyles({
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
    height: '100%',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: tokens.spacingVerticalL,
  },
  tableContainer: {
    flex: 1,
    overflowY: 'auto',
    border: `1px solid ${tokens.colorNeutralStroke1}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  virtualScrollContainer: {
    height: '600px',
    overflow: 'auto',
  },
  row: {
    display: 'contents',
  },
  timestampCell: {
    fontFamily: tokens.fontFamilyMonospace,
    fontSize: tokens.fontSizeBase200,
  },
  actorCell: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
  },
  actionCell: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
  },
  targetCell: {
    fontFamily: tokens.fontFamilyMonospace,
    fontSize: tokens.fontSizeBase200,
  },
  statusBadge: {
    textTransform: 'capitalize',
  },
  correlationId: {
    fontFamily: tokens.fontFamilyMonospace,
    fontSize: tokens.fontSizeBase100,
    color: tokens.colorNeutralForeground3,
    cursor: 'pointer',
    '&:hover': {
      textDecoration: 'underline',
    },
  },
  loadingContainer: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '200px',
  },
  errorContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: tokens.spacingVerticalM,
    padding: tokens.spacingVerticalXL,
  },
  noDataContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: tokens.spacingVerticalM,
    padding: tokens.spacingVerticalXXL,
  },
  liveIndicator: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
  },
  liveDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    backgroundColor: tokens.colorPaletteGreenBackground2,
    animation: 'pulse 2s infinite',
  },
  '@keyframes pulse': {
    '0%': {
      opacity: 1,
    },
    '50%': {
      opacity: 0.4,
    },
    '100%': {
      opacity: 1,
    },
  },
});

const formatTimestamp = (timestamp: string): string => {
  const date = new Date(timestamp);
  return date.toLocaleString('hu-HU', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short',
  });
};

const getActionIcon = (actionType: string) => {
  if (actionType.includes('CREATE')) return <CheckmarkCircle24Regular />;
  if (actionType.includes('DELETE') || actionType.includes('FAIL')) return <ErrorCircle24Regular />;
  return <Target24Regular />;
};

const getStatusColor = (status: string) => {
  return status === 'success' ? 'success' : 'danger';
};

interface AuditTableRowProps {
  entry: AuditEntry;
  onClick: (entry: AuditEntry) => void;
}

const AuditTableRow: React.FC<AuditTableRowProps> = ({ entry, onClick }) => {
  const styles = useStyles();

  return (
    <TableRow
      onClick={() => onClick(entry)}
      style={{ cursor: 'pointer' }}
      aria-label={`Audit bejegyzés ${entry.id}`}
    >
      <TableCell className={styles.timestampCell}>
        <TableCellLayout>
          {formatTimestamp(entry.timestamp)}
        </TableCellLayout>
      </TableCell>
      <TableCell>
        <TableCellLayout className={styles.actorCell}>
          <Person24Regular />
          <div>
            <Text weight="semibold">{entry.actor.name}</Text>
            <Text size={100} style={{ display: 'block' }}>
              {entry.actor.type === 'user' ? entry.actor.role : 'Rendszer'}
            </Text>
          </div>
        </TableCellLayout>
      </TableCell>
      <TableCell>
        <TableCellLayout className={styles.actionCell}>
          {getActionIcon(entry.action.type)}
          <div>
            <Text>{entry.action.description}</Text>
            <Badge
              appearance="tint"
              size="small"
              color={entry.action.severity === 'error' ? 'danger' : 'brand'}
            >
              {entry.action.category}
            </Badge>
          </div>
        </TableCellLayout>
      </TableCell>
      <TableCell className={styles.targetCell}>
        <TableCellLayout>
          <Text>{entry.target.type}</Text>
          {entry.target.name && (
            <Text size={100} style={{ display: 'block' }}>
              {entry.target.name}
            </Text>
          )}
        </TableCellLayout>
      </TableCell>
      <TableCell>
        <TableCellLayout>
          <Badge
            appearance="filled"
            color={getStatusColor(entry.status)}
            className={styles.statusBadge}
          >
            {entry.status}
          </Badge>
        </TableCellLayout>
      </TableCell>
      <TableCell>
        <TableCellLayout>
          <Tooltip content="Kattintson a kapcsolódó események megtekintéséhez" relationship="label">
            <Text className={styles.correlationId}>
              <Link24Regular fontSize={12} />
              {entry.metadata.correlationId.substring(0, 8)}...
            </Text>
          </Tooltip>
        </TableCellLayout>
      </TableCell>
    </TableRow>
  );
};


export const AuditList = () => {
  const styles = useStyles();
  const { isAdmin, isPM, hasAnyRole } = useAuth();
  const queryClient = useQueryClient();
  const [selectedEntry, setSelectedEntry] = useState<AuditEntry | null>(null);
  const [isLiveUpdatesEnabled, setIsLiveUpdatesEnabled] = useState(true);
  const [selectedTab, setSelectedTab] = useState<'logs' | 'analytics'>('logs');
  const [auditStats, setAuditStats] = useState<AuditStats | undefined>(undefined);
  const tableContainerRef = useRef<HTMLDivElement>(null);

  const canViewAudit = isAdmin() || isPM() || hasAnyRole(['NEU_Admin', 'NEU_PM']);

  // Use the new audit hooks
  const { filter, updateFilter, clearFilter, applyFilter } = useAuditFilters();
  
  const {
    entries: allEntries,
    totalCount,
    isLoading,
    isError,
    error,
    hasNextPage,
    isFetchingNextPage,
    loadMore,
    refresh,
    shouldVirtualize
  } = useAuditLogs(filter, 100);

  const {
    exportAudit,
    isExporting,
    exportError,
    exportJobs,
    cancelExport
  } = useAuditExport();

  const handleNewEvents = useCallback((events: AuditEntry[]) => {
    // Refresh the query to include new events
    refresh();
  }, [refresh]);

  const {
    status: wsStatus,
    isConnected,
    newEventCount,
    lastEventTime,
    connect,
    disconnect,
    reconnect,
    clearNewEventCount,
    toggleAutoScroll,
    autoScrollEnabled,
  } = useAuditWebSocket({
    enabled: canViewAudit && isLiveUpdatesEnabled,
    onNewEvents: handleNewEvents,
  });

  // TODO: Re-enable virtualizer when @tanstack/react-virtual is installed
  // const virtualizer = useVirtualizer({
  //   count: allEntries.length,
  //   getScrollElement: () => tableContainerRef.current,
  //   estimateSize: () => 60,
  //   overscan: 5,
  // });

  const handleEntryClick = useCallback((entry: AuditEntry) => {
    setSelectedEntry(entry);
  }, []);

  const handleLoadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      loadMore();
    }
  }, [hasNextPage, isFetchingNextPage, loadMore]);

  useEffect(() => {
    const handleScroll = () => {
      if (!tableContainerRef.current) return;
      
      const { scrollTop, scrollHeight, clientHeight } = tableContainerRef.current;
      if (scrollTop + clientHeight >= scrollHeight - 100) {
        handleLoadMore();
      }
    };

    const container = tableContainerRef.current;
    if (container) {
      container.addEventListener('scroll', handleScroll);
      return () => container.removeEventListener('scroll', handleScroll);
    }
  }, [handleLoadMore]);

  const handleRefresh = () => {
    refresh();
  };

  const handleFiltersChange = useCallback((newFilters: AuditFilter) => {
    applyFilter(newFilters);
  }, [applyFilter]);

  const handleClearFilters = useCallback(() => {
    clearFilter();
  }, [clearFilter]);

  const availableActors = useMemo(() => {
    const actors = new Map<string, { id: string; name: string; email: string }>();
    allEntries.forEach(entry => {
      if (!actors.has(entry.actor.id)) {
        actors.set(entry.actor.id, {
          id: entry.actor.id,
          name: entry.actor.name,
          email: entry.actor.email,
        });
      }
    });
    return Array.from(actors.values());
  }, [allEntries]);

  const handleExport = useCallback(async (options: ExportOptions): Promise<ExportJob> => {
    const response = await api.post('/api/audit/export', {
      ...options,
      filters: filter,
    });
    return response.data;
  }, [filter]);

  const handleDownload = useCallback((jobId: string) => {
    window.open(`/api/audit/export/${jobId}/download`, '_blank');
  }, []);

  const handleGenerateReport = useCallback(async (type: ReportType, filters: AuditFilter) => {
    try {
      let response;
      switch (type) {
        case 'user-access':
          response = await complianceService.generateUserAccessReport(filters);
          break;
        case 'permission-changes':
          response = await complianceService.generatePermissionChangesReport(filters);
          break;
        case 'system-access':
          response = await complianceService.generateSystemAccessReport(filters);
          break;
        default:
          response = await complianceService.generateReport({
            type,
            filters,
            format: 'xlsx',
            includeDetails: true,
            includeSummary: true,
          });
      }
      
      // Show success notification
      console.log('Report generation started:', response);
      
      // Poll for completion and download
      const checkStatus = async () => {
        const status = await complianceService.getReportStatus(response.reportId);
        if (status.status === 'completed' && status.downloadUrl) {
          window.open(status.downloadUrl, '_blank');
        } else if (status.status === 'processing' || status.status === 'queued') {
          setTimeout(checkStatus, 2000);
        }
      };
      
      setTimeout(checkStatus, 2000);
    } catch (error) {
      console.error('Failed to generate report:', error);
    }
  }, []);

  if (!canViewAudit) {
    return (
      <div className={styles.container}>
        <Card className={styles.errorContainer}>
          <ErrorCircle24Regular fontSize={48} color={tokens.colorPaletteDangerForeground1} />
          <Title1>Hozzáférés megtagadva</Title1>
          <Text>Nincs jogosultsága az audit naplók megtekintéséhez.</Text>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loadingContainer}>
          <Spinner size="large" label="Audit naplók betöltése..." />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className={styles.container}>
        <Card className={styles.errorContainer}>
          <ErrorCircle24Regular fontSize={48} color={tokens.colorPaletteDangerForeground1} />
          <Title1>Hiba történt</Title1>
          <Text>Nem sikerült betölteni az audit naplókat.</Text>
          <Text size={200}>{(error as Error)?.message || 'Ismeretlen hiba'}</Text>
          <Button appearance="primary" onClick={handleRefresh}>
            Újra próbálkozás
          </Button>
        </Card>
      </div>
    );
  }

  if (!allEntries || allEntries.length === 0) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <Title1>Audit Napló</Title1>
        </div>
        <Card className={styles.noDataContainer}>
          <Clock24Regular fontSize={48} />
          <Title1>Nincs audit bejegyzés</Title1>
          <Text>Még nem történt rögzített esemény a rendszerben.</Text>
        </Card>
      </div>
    );
  }

  return (
    <div className={styles.container} role="region" aria-label="Audit napló">
      <div className={styles.header}>
        <Title1>Audit Napló</Title1>
        <LiveUpdateBadge
          status={wsStatus}
          newEventCount={newEventCount}
          lastEventTime={lastEventTime}
          autoScrollEnabled={autoScrollEnabled}
          onClearNewEvents={() => {
            clearNewEventCount();
            // Scroll to top to show new events
            if (tableContainerRef.current) {
              tableContainerRef.current.scrollTop = 0;
            }
          }}
          onToggleAutoScroll={toggleAutoScroll}
          onReconnect={reconnect}
          isLiveUpdatesEnabled={isLiveUpdatesEnabled}
          onToggleLiveUpdates={() => {
            setIsLiveUpdatesEnabled(!isLiveUpdatesEnabled);
            if (!isLiveUpdatesEnabled) {
              connect();
            } else {
              disconnect();
            }
          }}
        />
      </div>

      <TabList
        selectedValue={selectedTab}
        onTabSelect={(_, data) => setSelectedTab(data.value as 'logs' | 'analytics')}
        style={{ marginBottom: tokens.spacingVerticalL }}
      >
        <Tab value="logs" icon={<DocumentTableRegular />}>
          Audit Logs
        </Tab>
        <Tab value="analytics">
          Analytics & Compliance
        </Tab>
      </TabList>

      {selectedTab === 'logs' && (
        <>
          <AuditFilters
            filters={filter}
            onFiltersChange={handleFiltersChange}
            onClearFilters={handleClearFilters}
            availableActors={availableActors}
            isLoading={isLoading}
          />

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: tokens.spacingVerticalM }}>
            <AuditExport
              filters={filter}
              totalCount={totalCount || allEntries.length}
              onExport={(options: ExportOptions) => {
                exportAudit({
                  format: options.format,
                  filter: filter,
                  columns: options.columns
                });
              }}
              onDownload={(jobId: string) => {
                // Export jobs are automatically downloaded when completed
                console.log('Download requested for job:', jobId);
              }}
            />
          </div>

          <div className={styles.virtualScrollContainer} ref={tableContainerRef}>
            <Table aria-label="Audit események táblázata">
              <TableHeader>
                <TableRow>
                  <TableHeaderCell>Időbélyeg</TableHeaderCell>
                  <TableHeaderCell>Végrehajtó</TableHeaderCell>
                  <TableHeaderCell>Művelet</TableHeaderCell>
                  <TableHeaderCell>Cél</TableHeaderCell>
                  <TableHeaderCell>Állapot</TableHeaderCell>
                  <TableHeaderCell>Korreláció</TableHeaderCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allEntries.map((entry) => (
                  <AuditTableRow key={entry.id} entry={entry} onClick={handleEntryClick} />
                ))}
              </TableBody>
            </Table>
            {isFetchingNextPage && (
              <div style={{ padding: tokens.spacingVerticalM, textAlign: 'center' }}>
                <Spinner size="small" label="További bejegyzések betöltése..." />
              </div>
            )}
          </div>
        </>
      )}

      {selectedTab === 'analytics' && (
        <AuditAnalytics
          entries={allEntries}
          filters={filter}
          loading={isLoading}
          error={error}
          onGenerateReport={handleGenerateReport}
          stats={auditStats}
        />
      )}
    </div>
  );
};