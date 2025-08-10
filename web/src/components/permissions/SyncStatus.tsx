import React, { useState, useEffect, useCallback } from 'react';
import {
  Card,
  CardHeader,
  makeStyles,
  Title3,
  Body1,
  Body2,
  Button,
  Badge,
  ProgressBar,
  tokens,
  Tooltip,
  Dialog,
  DialogTrigger,
  DialogSurface,
  DialogTitle,
  DialogBody,
  DialogActions,
  DialogContent,
  DataGrid,
  DataGridBody,
  DataGridCell,
  DataGridHeader,
  DataGridHeaderCell,
  DataGridRow,
  createTableColumn,
  TableCellLayout,
  Spinner,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
} from '@fluentui/react-components';
import {
  CheckmarkCircleRegular,
  ErrorCircleRegular,
  ClockRegular,
  WarningRegular,
  ArrowSync20Regular,
  PlayRegular,
  PauseRegular,
  ArrowRepeatAllRegular,
  InfoRegular,
} from '@fluentui/react-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusSection: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalL,
    padding: tokens.spacingVerticalM,
    backgroundColor: tokens.colorNeutralBackground2,
    borderRadius: tokens.borderRadiusMedium,
  },
  statusIcon: {
    fontSize: '24px',
  },
  statusInfo: {
    flex: 1,
  },
  statusActions: {
    display: 'flex',
    gap: tokens.spacingHorizontalS,
  },
  progressSection: {
    marginTop: tokens.spacingVerticalM,
  },
  progressHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: tokens.spacingVerticalS,
  },
  queueSection: {
    marginTop: tokens.spacingVerticalL,
  },
  queueHeader: {
    marginBottom: tokens.spacingVerticalM,
  },
  failedSection: {
    marginTop: tokens.spacingVerticalL,
  },
  detailsSection: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
    gap: tokens.spacingHorizontalL,
    marginTop: tokens.spacingVerticalL,
  },
  detailCard: {
    padding: tokens.spacingVerticalM,
    backgroundColor: tokens.colorNeutralBackground2,
    borderRadius: tokens.borderRadiusMedium,
  },
  detailLabel: {
    color: tokens.colorNeutralForeground3,
    marginBottom: tokens.spacingVerticalXS,
  },
  detailValue: {
    fontWeight: tokens.fontWeightSemibold,
  },
  emptyState: {
    padding: tokens.spacingVerticalXXL,
    textAlign: 'center',
    color: tokens.colorNeutralForeground3,
  },
  errorMessage: {
    marginTop: tokens.spacingVerticalM,
  },
});

type SyncStatusType = 'idle' | 'syncing' | 'error' | 'pending' | 'paused';

interface SyncStatusData {
  status: SyncStatusType;
  lastSync?: string;
  pendingChanges: number;
  currentOperation?: string;
  error?: string;
  progress?: {
    current: number;
    total: number;
    percentage: number;
  };
  queue: QueueItem[];
  failedItems: FailedItem[];
  stats: {
    totalSynced: number;
    avgSyncTime: number;
    successRate: number;
    lastError?: string;
  };
}

interface QueueItem {
  id: string;
  type: 'permission' | 'group' | 'user' | 'folder';
  operation: 'create' | 'update' | 'delete';
  resource: string;
  position: number;
  estimatedTime?: number;
  retryCount?: number;
}

interface FailedItem {
  id: string;
  type: string;
  operation: string;
  resource: string;
  error: string;
  failedAt: string;
  retryCount: number;
  maxRetries: number;
}

interface SyncStatusProps {
  orderId: string;
}

const mockSyncData: SyncStatusData = {
  status: 'syncing',
  lastSync: '2025-01-15T10:30:00Z',
  pendingChanges: 12,
  currentOperation: 'Updating permissions for /A.1 Documentation/Experts',
  progress: {
    current: 3,
    total: 12,
    percentage: 25,
  },
  queue: [
    {
      id: 'queue-1',
      type: 'permission',
      operation: 'update',
      resource: '/A.2 Results',
      position: 1,
      estimatedTime: 15,
    },
    {
      id: 'queue-2',
      type: 'group',
      operation: 'create',
      resource: 'Finance Team',
      position: 2,
      estimatedTime: 10,
    },
    {
      id: 'queue-3',
      type: 'user',
      operation: 'update',
      resource: 'john.smith@company.com',
      position: 3,
      estimatedTime: 5,
    },
  ],
  failedItems: [
    {
      id: 'failed-1',
      type: 'permission',
      operation: 'update',
      resource: '/Financial/TIG',
      error: 'Graph API throttling (429)',
      failedAt: '2025-01-15T09:45:00Z',
      retryCount: 2,
      maxRetries: 3,
    },
  ],
  stats: {
    totalSynced: 145,
    avgSyncTime: 12.5,
    successRate: 96.5,
    lastError: 'Graph API throttling',
  },
};

export const SyncStatus: React.FC<SyncStatusProps> = ({ orderId }) => {
  const styles = useStyles();
  const queryClient = useQueryClient();
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [retryDialogOpen, setRetryDialogOpen] = useState(false);
  const [selectedFailedItem, setSelectedFailedItem] = useState<FailedItem | null>(null);

  const { data: syncStatus, isLoading, refetch } = useQuery({
    queryKey: ['sync-status', orderId],
    queryFn: async () => {
      await new Promise(resolve => setTimeout(resolve, 500));
      return mockSyncData;
    },
    refetchInterval: 5000, // Poll every 5 seconds when syncing
    refetchIntervalInBackground: false,
  });

  const syncMutation = useMutation({
    mutationFn: async (action: 'start' | 'pause' | 'resume' | 'retry') => {
      await new Promise(resolve => setTimeout(resolve, 1000));
      console.log(`Sync action: ${action}`);
      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sync-status', orderId] });
    },
  });

  const retryMutation = useMutation({
    mutationFn: async (itemId: string) => {
      await new Promise(resolve => setTimeout(resolve, 1000));
      console.log(`Retrying failed item: ${itemId}`);
      return { success: true };
    },
    onSuccess: () => {
      setRetryDialogOpen(false);
      setSelectedFailedItem(null);
      queryClient.invalidateQueries({ queryKey: ['sync-status', orderId] });
    },
  });

  const queueColumns = [
    createTableColumn<QueueItem>({
      columnId: 'position',
      renderHeaderCell: () => '#',
      renderCell: (item) => item.position.toString(),
    }),
    createTableColumn<QueueItem>({
      columnId: 'type',
      renderHeaderCell: () => 'Type',
      renderCell: (item) => (
        <Badge appearance="tint" size="small">
          {item.type}
        </Badge>
      ),
    }),
    createTableColumn<QueueItem>({
      columnId: 'operation',
      renderHeaderCell: () => 'Operation',
      renderCell: (item) => (
        <Badge
          appearance="tint"
          color={item.operation === 'delete' ? 'danger' : item.operation === 'create' ? 'success' : 'warning'}
          size="small"
        >
          {item.operation}
        </Badge>
      ),
    }),
    createTableColumn<QueueItem>({
      columnId: 'resource',
      renderHeaderCell: () => 'Resource',
      renderCell: (item) => (
        <Tooltip content={item.resource} relationship="label">
          <span>{item.resource}</span>
        </Tooltip>
      ),
    }),
    createTableColumn<QueueItem>({
      columnId: 'time',
      renderHeaderCell: () => 'Est. Time',
      renderCell: (item) => item.estimatedTime ? `${item.estimatedTime}s` : '-',
    }),
  ];

  const failedColumns = [
    createTableColumn<FailedItem>({
      columnId: 'type',
      renderHeaderCell: () => 'Type',
      renderCell: (item) => (
        <Badge appearance="tint" size="small">
          {item.type}
        </Badge>
      ),
    }),
    createTableColumn<FailedItem>({
      columnId: 'resource',
      renderHeaderCell: () => 'Resource',
      renderCell: (item) => (
        <Tooltip content={item.resource} relationship="label">
          <span>{item.resource}</span>
        </Tooltip>
      ),
    }),
    createTableColumn<FailedItem>({
      columnId: 'error',
      renderHeaderCell: () => 'Error',
      renderCell: (item) => (
        <Tooltip content={item.error} relationship="label">
          <Body2>{item.error}</Body2>
        </Tooltip>
      ),
    }),
    createTableColumn<FailedItem>({
      columnId: 'retries',
      renderHeaderCell: () => 'Retries',
      renderCell: (item) => (
        <Badge
          appearance="filled"
          color={item.retryCount >= item.maxRetries ? 'danger' : 'warning'}
          size="small"
        >
          {item.retryCount}/{item.maxRetries}
        </Badge>
      ),
    }),
    createTableColumn<FailedItem>({
      columnId: 'actions',
      renderHeaderCell: () => 'Actions',
      renderCell: (item) => (
        <Button
          appearance="subtle"
          icon={<ArrowRepeatAllRegular />}
          size="small"
          onClick={() => {
            setSelectedFailedItem(item);
            setRetryDialogOpen(true);
          }}
          disabled={item.retryCount >= item.maxRetries}
        >
          Retry
        </Button>
      ),
    }),
  ];

  const getStatusIcon = (status?: SyncStatusType) => {
    switch (status) {
      case 'syncing':
        return <ArrowSync20Regular className={styles.statusIcon} />;
      case 'idle':
        return <CheckmarkCircleRegular className={styles.statusIcon} />;
      case 'error':
        return <ErrorCircleRegular className={styles.statusIcon} />;
      case 'paused':
        return <PauseRegular className={styles.statusIcon} />;
      case 'pending':
        return <ClockRegular className={styles.statusIcon} />;
      default:
        return <InfoRegular className={styles.statusIcon} />;
    }
  };

  const getStatusMessage = (status?: SyncStatusType) => {
    switch (status) {
      case 'syncing':
        return 'Synchronizing with SharePoint...';
      case 'idle':
        return 'All changes synchronized';
      case 'error':
        return 'Synchronization failed';
      case 'paused':
        return 'Synchronization paused';
      case 'pending':
        return 'Synchronization pending';
      default:
        return 'Unknown status';
    }
  };

  const getStatusColor = (status?: SyncStatusType) => {
    switch (status) {
      case 'syncing':
        return 'informative';
      case 'idle':
        return 'success';
      case 'error':
        return 'danger';
      case 'paused':
        return 'warning';
      case 'pending':
        return 'subtle';
      default:
        return 'subtle';
    }
  };

  const calculateEstimatedTime = () => {
    if (!syncStatus?.queue) return 0;
    return syncStatus.queue.reduce((total, item) => total + (item.estimatedTime || 0), 0);
  };

  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  if (isLoading) {
    return (
      <Card>
        <div className={styles.emptyState}>
          <Spinner label="Loading sync status..." />
        </div>
      </Card>
    );
  }

  return (
    <Card className={styles.root}>
      <CardHeader
        header={
          <div className={styles.header}>
            <Title3>SharePoint Sync Status</Title3>
            <Button
              appearance="subtle"
              icon={<ArrowSync20Regular />}
              onClick={() => refetch()}
            >
              Refresh
            </Button>
          </div>
        }
      />

      <div className={styles.statusSection}>
        {getStatusIcon(syncStatus?.status)}
        <div className={styles.statusInfo}>
          <Title3>{getStatusMessage(syncStatus?.status)}</Title3>
          {syncStatus?.currentOperation && syncStatus.status === 'syncing' && (
            <Body2>{syncStatus.currentOperation}</Body2>
          )}
          {syncStatus?.lastSync && (
            <Body2>Last sync: {new Date(syncStatus.lastSync).toLocaleString()}</Body2>
          )}
        </div>
        <div className={styles.statusActions}>
          {syncStatus?.status === 'idle' && syncStatus.pendingChanges > 0 && (
            <Button
              appearance="primary"
              icon={<PlayRegular />}
              onClick={() => syncMutation.mutate('start')}
              disabled={syncMutation.isPending}
            >
              Start Sync
            </Button>
          )}
          {syncStatus?.status === 'syncing' && (
            <Button
              appearance="secondary"
              icon={<PauseRegular />}
              onClick={() => syncMutation.mutate('pause')}
              disabled={syncMutation.isPending}
            >
              Pause
            </Button>
          )}
          {syncStatus?.status === 'paused' && (
            <Button
              appearance="primary"
              icon={<PlayRegular />}
              onClick={() => syncMutation.mutate('resume')}
              disabled={syncMutation.isPending}
            >
              Resume
            </Button>
          )}
          {syncStatus?.status === 'error' && (
            <Button
              appearance="primary"
              icon={<ArrowRepeatAllRegular />}
              onClick={() => syncMutation.mutate('retry')}
              disabled={syncMutation.isPending}
            >
              Retry All
            </Button>
          )}
          <Button
            appearance="subtle"
            icon={<InfoRegular />}
            onClick={() => setDetailsDialogOpen(true)}
          >
            Details
          </Button>
        </div>
      </div>

      {syncStatus?.status === 'syncing' && syncStatus.progress && (
        <div className={styles.progressSection}>
          <div className={styles.progressHeader}>
            <Body1>Progress: {syncStatus.progress.current} of {syncStatus.progress.total}</Body1>
            <Body1>{syncStatus.progress.percentage}%</Body1>
          </div>
          <ProgressBar
            value={syncStatus.progress.percentage}
            max={100}
            color={getStatusColor(syncStatus.status) as any}
          />
        </div>
      )}

      {syncStatus?.pendingChanges && syncStatus.pendingChanges > 0 && (
        <MessageBar intent={syncStatus.status === 'error' ? 'error' : 'info'}>
          <MessageBarBody>
            <MessageBarTitle>
              {syncStatus.pendingChanges} pending {syncStatus.pendingChanges === 1 ? 'change' : 'changes'}
            </MessageBarTitle>
            {syncStatus.status === 'idle' && (
              <>Click "Start Sync" to apply changes to SharePoint</>
            )}
            {syncStatus.status === 'syncing' && (
              <>Estimated completion: {formatTime(calculateEstimatedTime())}</>
            )}
          </MessageBarBody>
        </MessageBar>
      )}

      {syncStatus?.error && (
        <MessageBar intent="error" className={styles.errorMessage}>
          <MessageBarBody>
            <MessageBarTitle>Sync Error</MessageBarTitle>
            {syncStatus.error}
          </MessageBarBody>
        </MessageBar>
      )}

      {syncStatus?.queue && syncStatus.queue.length > 0 && (
        <div className={styles.queueSection}>
          <div className={styles.queueHeader}>
            <Title3>Queue Position</Title3>
            <Body2>Items waiting to be synchronized</Body2>
          </div>
          <DataGrid
            items={syncStatus.queue}
            columns={queueColumns}
            sortable
            resizableColumns
            size="small"
          >
            <DataGridHeader>
              <DataGridRow>
                {({ renderHeaderCell }) => (
                  <DataGridHeaderCell>{renderHeaderCell()}</DataGridHeaderCell>
                )}
              </DataGridRow>
            </DataGridHeader>
            <DataGridBody<QueueItem>>
              {({ item, rowId }) => (
                <DataGridRow<QueueItem> key={rowId}>
                  {({ renderCell }) => (
                    <DataGridCell>{renderCell(item)}</DataGridCell>
                  )}
                </DataGridRow>
              )}
            </DataGridBody>
          </DataGrid>
        </div>
      )}

      {syncStatus?.failedItems && syncStatus.failedItems.length > 0 && (
        <div className={styles.failedSection}>
          <div className={styles.queueHeader}>
            <Title3>Failed Syncs</Title3>
            <Body2>Items that failed to synchronize</Body2>
          </div>
          <DataGrid
            items={syncStatus.failedItems}
            columns={failedColumns}
            sortable
            resizableColumns
            size="small"
          >
            <DataGridHeader>
              <DataGridRow>
                {({ renderHeaderCell }) => (
                  <DataGridHeaderCell>{renderHeaderCell()}</DataGridHeaderCell>
                )}
              </DataGridRow>
            </DataGridHeader>
            <DataGridBody<FailedItem>>
              {({ item, rowId }) => (
                <DataGridRow<FailedItem> key={rowId}>
                  {({ renderCell }) => (
                    <DataGridCell>{renderCell(item)}</DataGridCell>
                  )}
                </DataGridRow>
              )}
            </DataGridBody>
          </DataGrid>
        </div>
      )}

      <Dialog open={detailsDialogOpen} onOpenChange={(e, data) => setDetailsDialogOpen(data.open)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>Sync Details</DialogTitle>
            <DialogContent>
              <div className={styles.detailsSection}>
                <div className={styles.detailCard}>
                  <Body2 className={styles.detailLabel}>Total Synced</Body2>
                  <Body1 className={styles.detailValue}>{syncStatus?.stats.totalSynced || 0}</Body1>
                </div>
                <div className={styles.detailCard}>
                  <Body2 className={styles.detailLabel}>Average Sync Time</Body2>
                  <Body1 className={styles.detailValue}>{syncStatus?.stats.avgSyncTime || 0}s</Body1>
                </div>
                <div className={styles.detailCard}>
                  <Body2 className={styles.detailLabel}>Success Rate</Body2>
                  <Body1 className={styles.detailValue}>{syncStatus?.stats.successRate || 0}%</Body1>
                </div>
                <div className={styles.detailCard}>
                  <Body2 className={styles.detailLabel}>Last Error</Body2>
                  <Body1 className={styles.detailValue}>{syncStatus?.stats.lastError || 'None'}</Body1>
                </div>
              </div>
            </DialogContent>
            <DialogActions>
              <DialogTrigger disableButtonEnhancement>
                <Button appearance="secondary">Close</Button>
              </DialogTrigger>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      <Dialog open={retryDialogOpen} onOpenChange={(e, data) => setRetryDialogOpen(data.open)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>Retry Failed Sync</DialogTitle>
            <DialogContent>
              <Body1>Are you sure you want to retry this failed synchronization?</Body1>
              {selectedFailedItem && (
                <div style={{ marginTop: '16px' }}>
                  <Body2><strong>Resource:</strong> {selectedFailedItem.resource}</Body2>
                  <Body2><strong>Error:</strong> {selectedFailedItem.error}</Body2>
                  <Body2><strong>Failed at:</strong> {new Date(selectedFailedItem.failedAt).toLocaleString()}</Body2>
                </div>
              )}
            </DialogContent>
            <DialogActions>
              <DialogTrigger disableButtonEnhancement>
                <Button appearance="secondary">Cancel</Button>
              </DialogTrigger>
              <Button
                appearance="primary"
                onClick={() => selectedFailedItem && retryMutation.mutate(selectedFailedItem.id)}
                disabled={retryMutation.isPending}
              >
                {retryMutation.isPending ? 'Retrying...' : 'Retry'}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </Card>
  );
};