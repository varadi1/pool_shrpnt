import React, { useState, useMemo } from 'react';
import {
  Card,
  CardHeader,
  DataGrid,
  DataGridHeader,
  DataGridHeaderCell,
  DataGridBody,
  DataGridRow,
  DataGridCell,
  TableColumnDefinition,
  createTableColumn,
  TableCellLayout,
  Button,
  Toolbar,
  ToolbarButton,
  DatePicker,
  Combobox,
  Option,
  Input,
  Badge,
  Menu,
  MenuTrigger,
  MenuPopover,
  MenuList,
  MenuItem,
  Dialog,
  DialogTrigger,
  DialogSurface,
  DialogTitle,
  DialogBody,
  DialogActions,
  DialogContent,
  Text,
  Tooltip,
  makeStyles,
  tokens,
  mergeClasses,
} from '@fluentui/react-components';
import {
  FilterRegular,
  ArrowDownloadRegular,
  ArrowUndoRegular,
  InfoRegular,
  LinkRegular,
  PersonRegular,
  CalendarRegular,
  ClockRegular,
} from '@fluentui/react-icons';
import { useMutation, useQuery } from '@tanstack/react-query';
import { format, parseISO, startOfDay, endOfDay, isWithinInterval } from 'date-fns';

const useStyles = makeStyles({
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
    height: '100%',
  },
  toolbar: {
    display: 'flex',
    gap: tokens.spacingHorizontalM,
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  filterGroup: {
    display: 'flex',
    gap: tokens.spacingHorizontalS,
    alignItems: 'center',
  },
  grid: {
    flex: 1,
    minHeight: 0,
  },
  changeDetail: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
  },
  beforeAfter: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: tokens.spacingHorizontalM,
  },
  changeBox: {
    padding: tokens.spacingHorizontalS,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground3,
  },
  changeLabel: {
    fontWeight: tokens.fontWeightSemibold,
    marginBottom: tokens.spacingVerticalXS,
  },
  affectedList: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: tokens.spacingHorizontalXS,
  },
  exportDialog: {
    minWidth: '400px',
  },
});

export interface AuditEntry {
  id: string;
  timestamp: Date;
  actor: string;
  actorEmail: string;
  action: 'create' | 'update' | 'delete' | 'lock' | 'unlock' | 'inherit' | 'break';
  resourceType: 'permission' | 'lock' | 'group' | 'user';
  resourceId: string;
  resourceName: string;
  changes: {
    field: string;
    before: any;
    after: any;
  }[];
  affectedUsers?: string[];
  affectedFolders?: string[];
  reason?: string;
  correlationId?: string;
  relatedLockId?: string;
  rollbackAvailable: boolean;
}

interface PermissionAuditProps {
  orderId: string;
}

const mockAuditData: AuditEntry[] = [
  {
    id: '1',
    timestamp: new Date('2025-01-10T10:30:00'),
    actor: 'John Doe',
    actorEmail: 'john.doe@company.com',
    action: 'update',
    resourceType: 'permission',
    resourceId: 'perm-1',
    resourceName: '01_SZAKERTOI/CompanyA',
    changes: [
      { field: 'level', before: 'read', after: 'write' },
      { field: 'source', before: 'inherited', after: 'explicit' },
    ],
    affectedUsers: ['user1@company.com', 'user2@company.com'],
    affectedFolders: ['01_SZAKERTOI/CompanyA', '01_SZAKERTOI/CompanyA/docs'],
    reason: 'Granted write access for document upload',
    rollbackAvailable: true,
  },
  {
    id: '2',
    timestamp: new Date('2025-01-10T09:15:00'),
    actor: 'Jane Smith',
    actorEmail: 'jane.smith@neu.com',
    action: 'lock',
    resourceType: 'lock',
    resourceId: 'lock-1',
    resourceName: '02_EREDMENYEK',
    changes: [
      { field: 'locked', before: false, after: true },
      { field: 'lockType', before: null, after: 'manual' },
    ],
    affectedFolders: ['02_EREDMENYEK'],
    reason: 'Deadline reached - locking results folder',
    relatedLockId: 'lock-1',
    rollbackAvailable: true,
  },
  {
    id: '3',
    timestamp: new Date('2025-01-09T14:20:00'),
    actor: 'System',
    actorEmail: 'system@neu.com',
    action: 'inherit',
    resourceType: 'permission',
    resourceId: 'perm-2',
    resourceName: '00_BELSO_NEU_ONLY',
    changes: [
      { field: 'inheritanceState', before: 'broken', after: 'inherited' },
    ],
    affectedFolders: ['00_BELSO_NEU_ONLY', '00_BELSO_NEU_ONLY/sensitive'],
    reason: 'Automatic inheritance restoration',
    rollbackAvailable: false,
  },
  {
    id: '4',
    timestamp: new Date('2025-01-09T11:00:00'),
    actor: 'Admin User',
    actorEmail: 'admin@neu.com',
    action: 'create',
    resourceType: 'group',
    resourceId: 'group-1',
    resourceName: 'CompanyB Experts',
    changes: [
      { field: 'members', before: [], after: ['expert1@companyb.com', 'expert2@companyb.com'] },
      { field: 'role', before: null, after: 'Expert' },
    ],
    affectedUsers: ['expert1@companyb.com', 'expert2@companyb.com'],
    rollbackAvailable: true,
  },
  {
    id: '5',
    timestamp: new Date('2025-01-08T16:45:00'),
    actor: 'PM User',
    actorEmail: 'pm@neu.com',
    action: 'break',
    resourceType: 'permission',
    resourceId: 'perm-3',
    resourceName: 'TIG/Financial',
    changes: [
      { field: 'inheritanceState', before: 'inherited', after: 'broken' },
    ],
    affectedFolders: ['TIG/Financial', 'TIG/Financial/reports'],
    reason: 'Breaking inheritance for financial segregation',
    rollbackAvailable: true,
  },
];

const actionTypeOptions = [
  { key: 'all', text: 'All Actions' },
  { key: 'create', text: 'Create' },
  { key: 'update', text: 'Update' },
  { key: 'delete', text: 'Delete' },
  { key: 'lock', text: 'Lock' },
  { key: 'unlock', text: 'Unlock' },
  { key: 'inherit', text: 'Restore Inheritance' },
  { key: 'break', text: 'Break Inheritance' },
];

const resourceTypeOptions = [
  { key: 'all', text: 'All Resources' },
  { key: 'permission', text: 'Permissions' },
  { key: 'lock', text: 'Locks' },
  { key: 'group', text: 'Groups' },
  { key: 'user', text: 'Users' },
];

const getActionBadgeColor = (action: AuditEntry['action']) => {
  switch (action) {
    case 'create':
      return 'success';
    case 'update':
      return 'informative';
    case 'delete':
      return 'danger';
    case 'lock':
      return 'warning';
    case 'unlock':
      return 'success';
    case 'inherit':
      return 'informative';
    case 'break':
      return 'warning';
    default:
      return 'informative';
  }
};

export const PermissionAudit: React.FC<PermissionAuditProps> = ({ orderId }) => {
  const styles = useStyles();
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [userFilter, setUserFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const [resourceFilter, setResourceFilter] = useState('all');
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [rollbackDialogOpen, setRollbackDialogOpen] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<AuditEntry | null>(null);

  const { data: auditData = mockAuditData, refetch } = useQuery({
    queryKey: ['permission-audit', orderId],
    queryFn: async () => {
      return mockAuditData;
    },
  });

  const rollbackMutation = useMutation({
    mutationFn: async (entryId: string) => {
      await new Promise(resolve => setTimeout(resolve, 1000));
      return { success: true };
    },
    onSuccess: () => {
      refetch();
      setRollbackDialogOpen(false);
      setSelectedEntry(null);
    },
  });

  const exportMutation = useMutation({
    mutationFn: async (format: 'csv' | 'xlsx') => {
      await new Promise(resolve => setTimeout(resolve, 1000));
      const blob = new Blob(['audit data'], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-${orderId}-${format === 'csv' ? 'csv' : 'xlsx'}`;
      a.click();
      URL.revokeObjectURL(url);
    },
  });

  const filteredData = useMemo(() => {
    return auditData.filter(entry => {
      if (startDate && !isWithinInterval(entry.timestamp, { start: startOfDay(startDate), end: endDate ? endOfDay(endDate) : new Date() })) {
        return false;
      }
      if (userFilter && !entry.actor.toLowerCase().includes(userFilter.toLowerCase()) && !entry.actorEmail.toLowerCase().includes(userFilter.toLowerCase())) {
        return false;
      }
      if (actionFilter !== 'all' && entry.action !== actionFilter) {
        return false;
      }
      if (resourceFilter !== 'all' && entry.resourceType !== resourceFilter) {
        return false;
      }
      return true;
    });
  }, [auditData, startDate, endDate, userFilter, actionFilter, resourceFilter]);

  const columns: TableColumnDefinition<AuditEntry>[] = [
    createTableColumn<AuditEntry>({
      columnId: 'timestamp',
      renderHeaderCell: () => 'Timestamp',
      renderCell: (item) => (
        <TableCellLayout>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <ClockRegular />
            <div>
              <div>{format(item.timestamp, 'yyyy-MM-dd')}</div>
              <Text size={200}>{format(item.timestamp, 'HH:mm:ss')}</Text>
            </div>
          </div>
        </TableCellLayout>
      ),
      compare: (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
    }),
    createTableColumn<AuditEntry>({
      columnId: 'actor',
      renderHeaderCell: () => 'Actor',
      renderCell: (item) => (
        <TableCellLayout>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <PersonRegular />
            <div>
              <div>{item.actor}</div>
              <Text size={200}>{item.actorEmail}</Text>
            </div>
          </div>
        </TableCellLayout>
      ),
    }),
    createTableColumn<AuditEntry>({
      columnId: 'action',
      renderHeaderCell: () => 'Action',
      renderCell: (item) => (
        <TableCellLayout>
          <Badge color={getActionBadgeColor(item.action)} appearance="filled">
            {item.action.toUpperCase()}
          </Badge>
        </TableCellLayout>
      ),
    }),
    createTableColumn<AuditEntry>({
      columnId: 'resource',
      renderHeaderCell: () => 'Resource',
      renderCell: (item) => (
        <TableCellLayout>
          <div>
            <div>{item.resourceName}</div>
            <Text size={200}>{item.resourceType}</Text>
          </div>
        </TableCellLayout>
      ),
    }),
    createTableColumn<AuditEntry>({
      columnId: 'changes',
      renderHeaderCell: () => 'Changes',
      renderCell: (item) => (
        <TableCellLayout>
          <div className={styles.changeDetail}>
            {item.changes.map((change, idx) => (
              <div key={idx}>
                <Text weight="semibold">{change.field}:</Text>{' '}
                <Text size={200}>
                  {String(change.before || 'null')} → {String(change.after || 'null')}
                </Text>
              </div>
            ))}
          </div>
        </TableCellLayout>
      ),
    }),
    createTableColumn<AuditEntry>({
      columnId: 'affected',
      renderHeaderCell: () => 'Affected',
      renderCell: (item) => (
        <TableCellLayout>
          <div className={styles.affectedList}>
            {item.affectedUsers?.map(user => (
              <Badge key={user} appearance="tint" size="small">
                {user}
              </Badge>
            ))}
            {item.affectedFolders?.map(folder => (
              <Badge key={folder} appearance="outline" size="small">
                {folder}
              </Badge>
            ))}
          </div>
        </TableCellLayout>
      ),
    }),
    createTableColumn<AuditEntry>({
      columnId: 'reason',
      renderHeaderCell: () => 'Reason',
      renderCell: (item) => (
        <TableCellLayout>
          {item.reason && (
            <Tooltip content={item.reason} relationship="label">
              <div style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {item.reason}
              </div>
            </Tooltip>
          )}
        </TableCellLayout>
      ),
    }),
    createTableColumn<AuditEntry>({
      columnId: 'actions',
      renderHeaderCell: () => 'Actions',
      renderCell: (item) => (
        <TableCellLayout>
          <div style={{ display: 'flex', gap: '4px' }}>
            {item.relatedLockId && (
              <Tooltip content="View related lock event" relationship="label">
                <Button
                  icon={<LinkRegular />}
                  appearance="subtle"
                  size="small"
                  onClick={() => console.log('View lock:', item.relatedLockId)}
                />
              </Tooltip>
            )}
            {item.rollbackAvailable && (
              <Tooltip content="Rollback this change" relationship="label">
                <Button
                  icon={<ArrowUndoRegular />}
                  appearance="subtle"
                  size="small"
                  onClick={() => {
                    setSelectedEntry(item);
                    setRollbackDialogOpen(true);
                  }}
                />
              </Tooltip>
            )}
            <Tooltip content="View details" relationship="label">
              <Button
                icon={<InfoRegular />}
                appearance="subtle"
                size="small"
                onClick={() => console.log('View details:', item)}
              />
            </Tooltip>
          </div>
        </TableCellLayout>
      ),
    }),
  ];

  const handleExport = (format: 'csv' | 'xlsx') => {
    exportMutation.mutate(format);
    setExportDialogOpen(false);
  };

  const handleRollback = () => {
    if (selectedEntry) {
      rollbackMutation.mutate(selectedEntry.id);
    }
  };

  return (
    <div className={styles.container}>
      <Card>
        <CardHeader
          header={
            <Text weight="semibold">Permission Audit Trail</Text>
          }
          description={`Showing ${filteredData.length} audit entries`}
        />
      </Card>

      <Toolbar className={styles.toolbar}>
        <div className={styles.filterGroup}>
          <FilterRegular />
          <Input
            placeholder="Filter by user..."
            value={userFilter}
            onChange={(e, data) => setUserFilter(data.value)}
            style={{ width: '200px' }}
          />
          <Combobox
            placeholder="Action type"
            value={actionFilter}
            onOptionSelect={(e, data) => setActionFilter(data.optionValue || 'all')}
            style={{ width: '150px' }}
          >
            {actionTypeOptions.map(option => (
              <Option key={option.key} value={option.key}>
                {option.text}
              </Option>
            ))}
          </Combobox>
          <Combobox
            placeholder="Resource type"
            value={resourceFilter}
            onOptionSelect={(e, data) => setResourceFilter(data.optionValue || 'all')}
            style={{ width: '150px' }}
          >
            {resourceTypeOptions.map(option => (
              <Option key={option.key} value={option.key}>
                {option.text}
              </Option>
            ))}
          </Combobox>
          <Input
            type="date"
            placeholder="Start date"
            onChange={(e) => setStartDate(e.target.value ? new Date(e.target.value) : null)}
            style={{ width: '150px' }}
          />
          <Input
            type="date"
            placeholder="End date"
            onChange={(e) => setEndDate(e.target.value ? new Date(e.target.value) : null)}
            style={{ width: '150px' }}
          />
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <Button
            icon={<ArrowDownloadRegular />}
            appearance="primary"
            onClick={() => setExportDialogOpen(true)}
          >
            Export
          </Button>
        </div>
      </Toolbar>

      <div className={styles.grid}>
        <DataGrid
          items={filteredData}
          columns={columns}
          sortable
          getRowId={(item) => item.id}
          resizableColumns
        >
          <DataGridHeader>
            <DataGridRow>
              {({ renderHeaderCell }) => (
                <DataGridHeaderCell>{renderHeaderCell()}</DataGridHeaderCell>
              )}
            </DataGridRow>
          </DataGridHeader>
          <DataGridBody<AuditEntry>>
            {({ item, rowId }) => (
              <DataGridRow<AuditEntry> key={rowId}>
                {({ renderCell }) => (
                  <DataGridCell>{renderCell(item)}</DataGridCell>
                )}
              </DataGridRow>
            )}
          </DataGridBody>
        </DataGrid>
      </div>

      <Dialog open={exportDialogOpen} onOpenChange={(e, data) => setExportDialogOpen(data.open)}>
        <DialogSurface className={styles.exportDialog}>
          <DialogBody>
            <DialogTitle>Export Audit Log</DialogTitle>
            <DialogContent>
              <Text>Choose the format for exporting the audit log:</Text>
              <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <Text weight="semibold">Export will include:</Text>
                <Text size={200}>• {filteredData.length} filtered entries</Text>
                <Text size={200}>• All columns and details</Text>
                <Text size={200}>• Applied filters and date range</Text>
              </div>
            </DialogContent>
            <DialogActions>
              <DialogTrigger disableButtonEnhancement>
                <Button appearance="secondary">Cancel</Button>
              </DialogTrigger>
              <Button appearance="primary" onClick={() => handleExport('csv')}>
                Export as CSV
              </Button>
              <Button appearance="primary" onClick={() => handleExport('xlsx')}>
                Export as XLSX
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      <Dialog open={rollbackDialogOpen} onOpenChange={(e, data) => setRollbackDialogOpen(data.open)}>
        <DialogSurface className={styles.exportDialog}>
          <DialogBody>
            <DialogTitle>Rollback Permission Change</DialogTitle>
            <DialogContent>
              {selectedEntry && (
                <div>
                  <Text>Are you sure you want to rollback this change?</Text>
                  <div style={{ marginTop: '16px' }}>
                    <Text weight="semibold">Change Details:</Text>
                    <div style={{ marginTop: '8px', padding: '8px', backgroundColor: tokens.colorNeutralBackground3, borderRadius: tokens.borderRadiusMedium }}>
                      <Text size={200}>Action: {selectedEntry.action}</Text><br />
                      <Text size={200}>Resource: {selectedEntry.resourceName}</Text><br />
                      <Text size={200}>Actor: {selectedEntry.actor}</Text><br />
                      <Text size={200}>Timestamp: {format(selectedEntry.timestamp, 'yyyy-MM-dd HH:mm:ss')}</Text>
                    </div>
                  </div>
                  <div style={{ marginTop: '16px' }}>
                    <Text weight="semibold">Changes to be reverted:</Text>
                    <div className={styles.beforeAfter} style={{ marginTop: '8px' }}>
                      <div className={styles.changeBox}>
                        <div className={styles.changeLabel}>Current (After)</div>
                        {selectedEntry.changes.map((change, idx) => (
                          <Text key={idx} size={200}>
                            {change.field}: {String(change.after || 'null')}
                          </Text>
                        ))}
                      </div>
                      <div className={styles.changeBox}>
                        <div className={styles.changeLabel}>Will Restore To (Before)</div>
                        {selectedEntry.changes.map((change, idx) => (
                          <Text key={idx} size={200}>
                            {change.field}: {String(change.before || 'null')}
                          </Text>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </DialogContent>
            <DialogActions>
              <DialogTrigger disableButtonEnhancement>
                <Button appearance="secondary">Cancel</Button>
              </DialogTrigger>
              <Button 
                appearance="primary" 
                onClick={handleRollback}
                disabled={rollbackMutation.isPending}
              >
                {rollbackMutation.isPending ? 'Rolling back...' : 'Confirm Rollback'}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  );
};