import React, { useState, useCallback } from 'react';
import {
  Card,
  CardHeader,
  makeStyles,
  Title3,
  Body1,
  Button,
  TabList,
  Tab,
  SelectTabData,
  SelectTabEvent,
  TabValue,
  DataGrid,
  DataGridBody,
  DataGridCell,
  DataGridHeader,
  DataGridHeaderCell,
  DataGridRow,
  createTableColumn,
  TableCellLayout,
  Dropdown,
  Option,
  Dialog,
  DialogTrigger,
  DialogSurface,
  DialogTitle,
  DialogBody,
  DialogActions,
  DialogContent,
  Field,
  RadioGroup,
  Radio,
  Badge,
  Spinner,
  tokens,
  Tooltip,
} from '@fluentui/react-components';
import {
  DocumentTableRegular,
  PersonRegular,
  FolderRegular,
  ArrowDownloadRegular,
  CalendarRegular,
  ClockRegular,
  FilterRegular,
} from '@fluentui/react-icons';
import { useQuery, useMutation } from '@tanstack/react-query';
import { PermissionLevel, FolderPermission } from '../../types/permissions';

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
  tabs: {
    marginBottom: tokens.spacingVerticalM,
  },
  reportContent: {
    minHeight: '400px',
  },
  filters: {
    display: 'flex',
    gap: tokens.spacingHorizontalM,
    marginBottom: tokens.spacingVerticalM,
    flexWrap: 'wrap',
  },
  filterItem: {
    minWidth: '200px',
  },
  badge: {
    marginLeft: tokens.spacingHorizontalS,
  },
  actions: {
    display: 'flex',
    gap: tokens.spacingHorizontalM,
  },
  gridContainer: {
    maxHeight: '500px',
    overflowY: 'auto',
  },
  permissionBadge: {
    textTransform: 'capitalize',
  },
  emptyState: {
    padding: tokens.spacingVerticalXXL,
    textAlign: 'center',
    color: tokens.colorNeutralForeground3,
  },
  loadingState: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '300px',
  },
});

interface FolderAccessReport {
  folderId: string;
  folderPath: string;
  folderName: string;
  specialFlags?: {
    isFinancial?: boolean;
    isNeuOnly?: boolean;
    isLocked?: boolean;
  };
  users: {
    userId: string;
    userName: string;
    email: string;
    role: string;
    permissionLevel: PermissionLevel;
    source: 'role' | 'explicit' | 'inherited' | 'group';
  }[];
  totalUsers: number;
}

interface UserAccessReport {
  userId: string;
  userName: string;
  email: string;
  role: string;
  folders: {
    folderId: string;
    folderPath: string;
    folderName: string;
    permissionLevel: PermissionLevel;
    source: 'role' | 'explicit' | 'inherited' | 'group';
    specialFlags?: {
      isFinancial?: boolean;
      isNeuOnly?: boolean;
      isLocked?: boolean;
    };
  }[];
  totalFolders: number;
}

interface PermissionChangesReport {
  date: string;
  actor: string;
  action: string;
  resource: string;
  oldPermission?: PermissionLevel;
  newPermission?: PermissionLevel;
  affectedUsers: string[];
  reason?: string;
}

interface ConflictReport {
  userId: string;
  userName: string;
  folderId: string;
  folderPath: string;
  conflictingSources: {
    source: string;
    permissionLevel: PermissionLevel;
    priority: number;
  }[];
  resolution: {
    method: 'priority' | 'manual' | 'policy';
    selectedLevel: PermissionLevel;
    reason: string;
  };
  resolvedAt?: string;
  resolvedBy?: string;
}

interface ExportOptions {
  format: 'csv' | 'xlsx';
  includeMetadata: boolean;
  dateRange?: {
    start: string;
    end: string;
  };
}

interface PermissionReportsProps {
  orderId: string;
}

const mockFolderAccessData: FolderAccessReport[] = [
  {
    folderId: 'folder-1',
    folderPath: '/A.1 Documentation/Experts',
    folderName: 'Experts',
    users: [
      {
        userId: 'user-1',
        userName: 'John Smith',
        email: 'john.smith@company.com',
        role: 'Expert',
        permissionLevel: 'write',
        source: 'role',
      },
      {
        userId: 'user-2',
        userName: 'Jane Doe',
        email: 'jane.doe@neu.com',
        role: 'NEU_Admin',
        permissionLevel: 'full',
        source: 'role',
      },
    ],
    totalUsers: 2,
  },
  {
    folderId: 'folder-2',
    folderPath: '/00_BELSO_NEU_ONLY',
    folderName: '00_BELSO_NEU_ONLY',
    specialFlags: {
      isNeuOnly: true,
    },
    users: [
      {
        userId: 'user-2',
        userName: 'Jane Doe',
        email: 'jane.doe@neu.com',
        role: 'NEU_Admin',
        permissionLevel: 'full',
        source: 'role',
      },
    ],
    totalUsers: 1,
  },
];

const mockUserAccessData: UserAccessReport[] = [
  {
    userId: 'user-1',
    userName: 'John Smith',
    email: 'john.smith@company.com',
    role: 'Expert',
    folders: [
      {
        folderId: 'folder-1',
        folderPath: '/A.1 Documentation/Experts',
        folderName: 'Experts',
        permissionLevel: 'write',
        source: 'role',
      },
      {
        folderId: 'folder-3',
        folderPath: '/A.2 Results',
        folderName: 'Results',
        permissionLevel: 'read',
        source: 'inherited',
      },
    ],
    totalFolders: 2,
  },
];

const mockChangesData: PermissionChangesReport[] = [
  {
    date: '2025-01-15T10:30:00Z',
    actor: 'admin@neu.com',
    action: 'Updated permissions',
    resource: '/A.1 Documentation/Experts',
    oldPermission: 'read',
    newPermission: 'write',
    affectedUsers: ['john.smith@company.com'],
    reason: 'Grant write access for document upload',
  },
];

const mockConflictData: ConflictReport[] = [
  {
    userId: 'user-3',
    userName: 'Bob Johnson',
    folderId: 'folder-4',
    folderPath: '/Financial/TIG',
    conflictingSources: [
      { source: 'Role: Company_Admin', permissionLevel: 'full', priority: 2 },
      { source: 'Group: Finance Team', permissionLevel: 'read', priority: 3 },
    ],
    resolution: {
      method: 'priority',
      selectedLevel: 'full',
      reason: 'Higher priority role takes precedence',
    },
    resolvedAt: '2025-01-14T15:00:00Z',
    resolvedBy: 'system',
  },
];

export const PermissionReports: React.FC<PermissionReportsProps> = ({ orderId }) => {
  const styles = useStyles();
  const [selectedTab, setSelectedTab] = useState<TabValue>('folder-access');
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportOptions, setExportOptions] = useState<ExportOptions>({
    format: 'xlsx',
    includeMetadata: true,
  });
  const [selectedFolder, setSelectedFolder] = useState<string>('all');
  const [selectedUser, setSelectedUser] = useState<string>('all');
  const [selectedDateRange, setSelectedDateRange] = useState<string>('7days');

  const { data: folderAccessData, isLoading: loadingFolderAccess } = useQuery({
    queryKey: ['permission-reports', 'folder-access', orderId, selectedFolder],
    queryFn: async () => {
      await new Promise(resolve => setTimeout(resolve, 500));
      return selectedFolder === 'all' 
        ? mockFolderAccessData 
        : mockFolderAccessData.filter(f => f.folderId === selectedFolder);
    },
  });

  const { data: userAccessData, isLoading: loadingUserAccess } = useQuery({
    queryKey: ['permission-reports', 'user-access', orderId, selectedUser],
    queryFn: async () => {
      await new Promise(resolve => setTimeout(resolve, 500));
      return selectedUser === 'all'
        ? mockUserAccessData
        : mockUserAccessData.filter(u => u.userId === selectedUser);
    },
  });

  const { data: changesData, isLoading: loadingChanges } = useQuery({
    queryKey: ['permission-reports', 'changes', orderId, selectedDateRange],
    queryFn: async () => {
      await new Promise(resolve => setTimeout(resolve, 500));
      return mockChangesData;
    },
  });

  const { data: conflictData, isLoading: loadingConflicts } = useQuery({
    queryKey: ['permission-reports', 'conflicts', orderId],
    queryFn: async () => {
      await new Promise(resolve => setTimeout(resolve, 500));
      return mockConflictData;
    },
  });

  const exportMutation = useMutation({
    mutationFn: async (options: ExportOptions) => {
      await new Promise(resolve => setTimeout(resolve, 1000));
      console.log('Exporting report with options:', options);
      return { success: true };
    },
    onSuccess: () => {
      setExportDialogOpen(false);
    },
  });

  const folderAccessColumns = [
    createTableColumn<FolderAccessReport>({
      columnId: 'folder',
      compare: (a, b) => a.folderPath.localeCompare(b.folderPath),
      renderHeaderCell: () => 'Folder',
      renderCell: (item) => (
        <TableCellLayout media={<FolderRegular />}>
          {item.folderName}
          {item.specialFlags?.isNeuOnly && (
            <Badge appearance="filled" color="important" size="small" className={styles.badge}>
              NEU Only
            </Badge>
          )}
          {item.specialFlags?.isFinancial && (
            <Badge appearance="filled" color="warning" size="small" className={styles.badge}>
              Financial
            </Badge>
          )}
          {item.specialFlags?.isLocked && (
            <Badge appearance="filled" color="danger" size="small" className={styles.badge}>
              Locked
            </Badge>
          )}
        </TableCellLayout>
      ),
    }),
    createTableColumn<FolderAccessReport>({
      columnId: 'path',
      compare: (a, b) => a.folderPath.localeCompare(b.folderPath),
      renderHeaderCell: () => 'Path',
      renderCell: (item) => (
        <Tooltip content={item.folderPath} relationship="label">
          <span>{item.folderPath}</span>
        </Tooltip>
      ),
    }),
    createTableColumn<FolderAccessReport>({
      columnId: 'users',
      renderHeaderCell: () => 'Total Users',
      renderCell: (item) => (
        <Badge appearance="filled" size="medium">
          {item.totalUsers}
        </Badge>
      ),
    }),
    createTableColumn<FolderAccessReport>({
      columnId: 'details',
      renderHeaderCell: () => 'User Details',
      renderCell: (item) => (
        <div>
          {item.users.slice(0, 3).map(user => (
            <div key={user.userId} style={{ marginBottom: '4px' }}>
              <Badge 
                appearance="tint" 
                color={user.permissionLevel === 'full' ? 'success' : user.permissionLevel === 'write' ? 'warning' : 'informative'}
                className={styles.permissionBadge}
              >
                {user.userName} ({user.permissionLevel})
              </Badge>
            </div>
          ))}
          {item.users.length > 3 && (
            <Body1>+{item.users.length - 3} more...</Body1>
          )}
        </div>
      ),
    }),
  ];

  const userAccessColumns = [
    createTableColumn<UserAccessReport>({
      columnId: 'user',
      compare: (a, b) => a.userName.localeCompare(b.userName),
      renderHeaderCell: () => 'User',
      renderCell: (item) => (
        <TableCellLayout media={<PersonRegular />}>
          {item.userName}
          <Badge appearance="tint" size="small" className={styles.badge}>
            {item.role}
          </Badge>
        </TableCellLayout>
      ),
    }),
    createTableColumn<UserAccessReport>({
      columnId: 'email',
      renderHeaderCell: () => 'Email',
      renderCell: (item) => item.email,
    }),
    createTableColumn<UserAccessReport>({
      columnId: 'folders',
      renderHeaderCell: () => 'Total Folders',
      renderCell: (item) => (
        <Badge appearance="filled" size="medium">
          {item.totalFolders}
        </Badge>
      ),
    }),
    createTableColumn<UserAccessReport>({
      columnId: 'access',
      renderHeaderCell: () => 'Folder Access',
      renderCell: (item) => (
        <div>
          {item.folders.slice(0, 2).map(folder => (
            <div key={folder.folderId} style={{ marginBottom: '4px' }}>
              <Tooltip content={folder.folderPath} relationship="label">
                <Badge 
                  appearance="tint" 
                  color={folder.permissionLevel === 'full' ? 'success' : folder.permissionLevel === 'write' ? 'warning' : 'informative'}
                  className={styles.permissionBadge}
                >
                  {folder.folderName} ({folder.permissionLevel})
                </Badge>
              </Tooltip>
            </div>
          ))}
          {item.folders.length > 2 && (
            <Body1>+{item.folders.length - 2} more...</Body1>
          )}
        </div>
      ),
    }),
  ];

  const changesColumns = [
    createTableColumn<PermissionChangesReport>({
      columnId: 'date',
      renderHeaderCell: () => 'Date',
      renderCell: (item) => new Date(item.date).toLocaleString(),
    }),
    createTableColumn<PermissionChangesReport>({
      columnId: 'actor',
      renderHeaderCell: () => 'Actor',
      renderCell: (item) => (
        <TableCellLayout media={<PersonRegular />}>
          {item.actor}
        </TableCellLayout>
      ),
    }),
    createTableColumn<PermissionChangesReport>({
      columnId: 'action',
      renderHeaderCell: () => 'Action',
      renderCell: (item) => item.action,
    }),
    createTableColumn<PermissionChangesReport>({
      columnId: 'resource',
      renderHeaderCell: () => 'Resource',
      renderCell: (item) => (
        <Tooltip content={item.resource} relationship="label">
          <span>{item.resource}</span>
        </Tooltip>
      ),
    }),
    createTableColumn<PermissionChangesReport>({
      columnId: 'change',
      renderHeaderCell: () => 'Change',
      renderCell: (item) => (
        <div>
          {item.oldPermission && item.newPermission && (
            <>
              <Badge appearance="tint" color="danger" className={styles.permissionBadge}>
                {item.oldPermission}
              </Badge>
              {' → '}
              <Badge appearance="tint" color="success" className={styles.permissionBadge}>
                {item.newPermission}
              </Badge>
            </>
          )}
        </div>
      ),
    }),
    createTableColumn<PermissionChangesReport>({
      columnId: 'affected',
      renderHeaderCell: () => 'Affected Users',
      renderCell: (item) => (
        <div>
          {item.affectedUsers.map(user => (
            <Badge key={user} appearance="tint" size="small" style={{ marginRight: '4px' }}>
              {user}
            </Badge>
          ))}
        </div>
      ),
    }),
  ];

  const conflictColumns = [
    createTableColumn<ConflictReport>({
      columnId: 'user',
      renderHeaderCell: () => 'User',
      renderCell: (item) => (
        <TableCellLayout media={<PersonRegular />}>
          {item.userName}
        </TableCellLayout>
      ),
    }),
    createTableColumn<ConflictReport>({
      columnId: 'folder',
      renderHeaderCell: () => 'Folder',
      renderCell: (item) => (
        <Tooltip content={item.folderPath} relationship="label">
          <span>{item.folderPath}</span>
        </Tooltip>
      ),
    }),
    createTableColumn<ConflictReport>({
      columnId: 'conflicts',
      renderHeaderCell: () => 'Conflicting Sources',
      renderCell: (item) => (
        <div>
          {item.conflictingSources.map((source, idx) => (
            <div key={idx} style={{ marginBottom: '4px' }}>
              <Badge appearance="tint" className={styles.permissionBadge}>
                {source.source}: {source.permissionLevel}
              </Badge>
            </div>
          ))}
        </div>
      ),
    }),
    createTableColumn<ConflictReport>({
      columnId: 'resolution',
      renderHeaderCell: () => 'Resolution',
      renderCell: (item) => (
        <div>
          <Badge appearance="filled" color="success" className={styles.permissionBadge}>
            {item.resolution.selectedLevel}
          </Badge>
          <Body1> ({item.resolution.method})</Body1>
        </div>
      ),
    }),
    createTableColumn<ConflictReport>({
      columnId: 'resolved',
      renderHeaderCell: () => 'Resolved',
      renderCell: (item) => (
        <div>
          {item.resolvedAt && (
            <>
              <Body1>{new Date(item.resolvedAt).toLocaleDateString()}</Body1>
              <Body1>by {item.resolvedBy}</Body1>
            </>
          )}
        </div>
      ),
    }),
  ];

  const handleTabSelect = (event: SelectTabEvent, data: SelectTabData) => {
    setSelectedTab(data.value);
  };

  const handleExport = useCallback(() => {
    setExportDialogOpen(true);
  }, []);

  const handleScheduleExport = useCallback(() => {
    console.log('Opening schedule dialog');
  }, []);

  const renderReportContent = () => {
    switch (selectedTab) {
      case 'folder-access':
        if (loadingFolderAccess) {
          return (
            <div className={styles.loadingState}>
              <Spinner label="Loading folder access report..." />
            </div>
          );
        }
        if (!folderAccessData || folderAccessData.length === 0) {
          return (
            <div className={styles.emptyState}>
              <FolderRegular fontSize={48} />
              <Title3>No folder access data available</Title3>
              <Body1>Select a folder or adjust filters to see access information</Body1>
            </div>
          );
        }
        return (
          <div className={styles.gridContainer}>
            <DataGrid
              items={folderAccessData}
              columns={folderAccessColumns}
              sortable
              resizableColumns
            >
              <DataGridHeader>
                <DataGridRow>
                  {({ renderHeaderCell }) => (
                    <DataGridHeaderCell>{renderHeaderCell()}</DataGridHeaderCell>
                  )}
                </DataGridRow>
              </DataGridHeader>
              <DataGridBody<FolderAccessReport>>
                {({ item, rowId }) => (
                  <DataGridRow<FolderAccessReport> key={rowId}>
                    {({ renderCell }) => (
                      <DataGridCell>{renderCell(item)}</DataGridCell>
                    )}
                  </DataGridRow>
                )}
              </DataGridBody>
            </DataGrid>
          </div>
        );

      case 'user-access':
        if (loadingUserAccess) {
          return (
            <div className={styles.loadingState}>
              <Spinner label="Loading user access report..." />
            </div>
          );
        }
        if (!userAccessData || userAccessData.length === 0) {
          return (
            <div className={styles.emptyState}>
              <PersonRegular fontSize={48} />
              <Title3>No user access data available</Title3>
              <Body1>Select a user or adjust filters to see access information</Body1>
            </div>
          );
        }
        return (
          <div className={styles.gridContainer}>
            <DataGrid
              items={userAccessData}
              columns={userAccessColumns}
              sortable
              resizableColumns
            >
              <DataGridHeader>
                <DataGridRow>
                  {({ renderHeaderCell }) => (
                    <DataGridHeaderCell>{renderHeaderCell()}</DataGridHeaderCell>
                  )}
                </DataGridRow>
              </DataGridHeader>
              <DataGridBody<UserAccessReport>>
                {({ item, rowId }) => (
                  <DataGridRow<UserAccessReport> key={rowId}>
                    {({ renderCell }) => (
                      <DataGridCell>{renderCell(item)}</DataGridCell>
                    )}
                  </DataGridRow>
                )}
              </DataGridBody>
            </DataGrid>
          </div>
        );

      case 'changes':
        if (loadingChanges) {
          return (
            <div className={styles.loadingState}>
              <Spinner label="Loading permission changes..." />
            </div>
          );
        }
        if (!changesData || changesData.length === 0) {
          return (
            <div className={styles.emptyState}>
              <CalendarRegular fontSize={48} />
              <Title3>No permission changes in selected period</Title3>
              <Body1>Adjust the date range to see historical changes</Body1>
            </div>
          );
        }
        return (
          <div className={styles.gridContainer}>
            <DataGrid
              items={changesData}
              columns={changesColumns}
              sortable
              resizableColumns
            >
              <DataGridHeader>
                <DataGridRow>
                  {({ renderHeaderCell }) => (
                    <DataGridHeaderCell>{renderHeaderCell()}</DataGridHeaderCell>
                  )}
                </DataGridRow>
              </DataGridHeader>
              <DataGridBody<PermissionChangesReport>>
                {({ item, rowId }) => (
                  <DataGridRow<PermissionChangesReport> key={rowId}>
                    {({ renderCell }) => (
                      <DataGridCell>{renderCell(item)}</DataGridCell>
                    )}
                  </DataGridRow>
                )}
              </DataGridBody>
            </DataGrid>
          </div>
        );

      case 'conflicts':
        if (loadingConflicts) {
          return (
            <div className={styles.loadingState}>
              <Spinner label="Loading conflict history..." />
            </div>
          );
        }
        if (!conflictData || conflictData.length === 0) {
          return (
            <div className={styles.emptyState}>
              <DocumentTableRegular fontSize={48} />
              <Title3>No conflicts found</Title3>
              <Body1>All permissions are resolved without conflicts</Body1>
            </div>
          );
        }
        return (
          <div className={styles.gridContainer}>
            <DataGrid
              items={conflictData}
              columns={conflictColumns}
              sortable
              resizableColumns
            >
              <DataGridHeader>
                <DataGridRow>
                  {({ renderHeaderCell }) => (
                    <DataGridHeaderCell>{renderHeaderCell()}</DataGridHeaderCell>
                  )}
                </DataGridRow>
              </DataGridHeader>
              <DataGridBody<ConflictReport>>
                {({ item, rowId }) => (
                  <DataGridRow<ConflictReport> key={rowId}>
                    {({ renderCell }) => (
                      <DataGridCell>{renderCell(item)}</DataGridCell>
                    )}
                  </DataGridRow>
                )}
              </DataGridBody>
            </DataGrid>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <Card className={styles.root}>
      <CardHeader
        header={
          <div className={styles.header}>
            <Title3>Permission Reports</Title3>
            <div className={styles.actions}>
              <Button
                appearance="secondary"
                icon={<ClockRegular />}
                onClick={handleScheduleExport}
              >
                Schedule Export
              </Button>
              <Button
                appearance="primary"
                icon={<ArrowDownloadRegular />}
                onClick={handleExport}
              >
                Export Report
              </Button>
            </div>
          </div>
        }
      />

      <TabList
        selectedValue={selectedTab}
        onTabSelect={handleTabSelect}
        className={styles.tabs}
      >
        <Tab value="folder-access" icon={<FolderRegular />}>
          Folder → Users
        </Tab>
        <Tab value="user-access" icon={<PersonRegular />}>
          User → Folders
        </Tab>
        <Tab value="changes" icon={<CalendarRegular />}>
          Changes Over Time
        </Tab>
        <Tab value="conflicts" icon={<DocumentTableRegular />}>
          Conflict History
        </Tab>
      </TabList>

      <div className={styles.filters}>
        {selectedTab === 'folder-access' && (
          <Field label="Filter by Folder" className={styles.filterItem}>
            <Dropdown
              value={selectedFolder}
              selectedOptions={[selectedFolder]}
              onOptionSelect={(e, data) => setSelectedFolder(data.optionValue as string)}
            >
              <Option value="all">All Folders</Option>
              <Option value="folder-1">Experts</Option>
              <Option value="folder-2">NEU Only</Option>
              <Option value="folder-3">Financial</Option>
            </Dropdown>
          </Field>
        )}

        {selectedTab === 'user-access' && (
          <Field label="Filter by User" className={styles.filterItem}>
            <Dropdown
              value={selectedUser}
              selectedOptions={[selectedUser]}
              onOptionSelect={(e, data) => setSelectedUser(data.optionValue as string)}
            >
              <Option value="all">All Users</Option>
              <Option value="user-1">John Smith</Option>
              <Option value="user-2">Jane Doe</Option>
              <Option value="user-3">Bob Johnson</Option>
            </Dropdown>
          </Field>
        )}

        {selectedTab === 'changes' && (
          <Field label="Date Range" className={styles.filterItem}>
            <Dropdown
              value={selectedDateRange}
              selectedOptions={[selectedDateRange]}
              onOptionSelect={(e, data) => setSelectedDateRange(data.optionValue as string)}
            >
              <Option value="24hours">Last 24 Hours</Option>
              <Option value="7days">Last 7 Days</Option>
              <Option value="30days">Last 30 Days</Option>
              <Option value="90days">Last 90 Days</Option>
              <Option value="custom">Custom Range</Option>
            </Dropdown>
          </Field>
        )}
      </div>

      <div className={styles.reportContent}>
        {renderReportContent()}
      </div>

      <Dialog open={exportDialogOpen} onOpenChange={(e, data) => setExportDialogOpen(data.open)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>Export Report</DialogTitle>
            <DialogContent>
              <Field label="Export Format">
                <RadioGroup
                  value={exportOptions.format}
                  onChange={(e, data) => setExportOptions({ ...exportOptions, format: data.value as 'csv' | 'xlsx' })}
                >
                  <Radio value="csv" label="CSV" />
                  <Radio value="xlsx" label="Excel (XLSX)" />
                </RadioGroup>
              </Field>
              <Field label="Include Metadata">
                <RadioGroup
                  value={exportOptions.includeMetadata ? 'yes' : 'no'}
                  onChange={(e, data) => setExportOptions({ ...exportOptions, includeMetadata: data.value === 'yes' })}
                >
                  <Radio value="yes" label="Yes" />
                  <Radio value="no" label="No" />
                </RadioGroup>
              </Field>
            </DialogContent>
            <DialogActions>
              <DialogTrigger disableButtonEnhancement>
                <Button appearance="secondary">Cancel</Button>
              </DialogTrigger>
              <Button
                appearance="primary"
                onClick={() => exportMutation.mutate(exportOptions)}
                disabled={exportMutation.isPending}
              >
                {exportMutation.isPending ? 'Exporting...' : 'Export'}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </Card>
  );
};