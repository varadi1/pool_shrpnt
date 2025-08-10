import React, { useState, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  makeStyles,
  shorthands,
  tokens,
  Title2,
  Text,
  Button,
  Toolbar,
  ToolbarButton,
  Dropdown,
  Option,
  Spinner,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Table,
  TableBody,
  TableCell,
  TableRow,
  TableHeader,
  TableHeaderCell,
  Tooltip,
  Menu,
  MenuTrigger,
  MenuPopover,
  MenuList,
  MenuItem,
  TabList,
  Tab,
} from '@fluentui/react-components';
import type { SelectTabData, SelectTabEvent } from '@fluentui/react-components';
import {
  ChevronRight20Regular,
  ChevronDown20Regular,
  ArrowLeft20Regular,
  Save20Regular,
  ArrowSync20Regular,
  ChevronDoubleDown20Regular,
  ChevronDoubleUp20Regular,
  Question20Regular,
  LockClosed20Regular,
  Shield20Regular,
  ShieldCheckmark16Regular,
  Money20Regular,
  Folder20Regular,
  Link20Regular,
  DismissCircle20Regular,
  Eye20Regular,
  Edit20Regular,
  ShieldCheckmark20Regular,
  LockMultiple20Regular,
  People20Regular,
  Calculator20Regular,
} from '@fluentui/react-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  PermissionMatrix as IPermissionMatrix,
  FolderPermission,
  PermissionLevel,
  RoleType,
  InheritanceState,
  RolePermission,
} from '../../types/permissions';
import { InheritanceToggle, detectSpecialFolder } from '../../components/permissions/InheritanceToggle';
import { ManualLockModal, type LockRequest } from '../../components/permissions/ManualLockModal';
import { UserGroupAssignment } from '../../components/permissions/UserGroupAssignment';
import { EffectivePermissions } from '../../components/permissions/EffectivePermissions';

const useStyles = makeStyles({
  root: {
    ...shorthands.padding('20px'),
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    marginBottom: '20px',
  },
  matrixContainer: {
    flex: '1',
    minHeight: '0',
    ...shorthands.border('1px', 'solid', tokens.colorNeutralStroke1),
    ...shorthands.borderRadius('4px'),
    ...shorthands.overflow('auto'),
  },
  cellContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    ...shorthands.padding('4px'),
    minWidth: '120px',
    cursor: 'pointer',
    ':hover': {
      backgroundColor: tokens.colorNeutralBackground2,
    },
  },
  inheritedCell: {
    backgroundColor: tokens.colorNeutralBackground2,
  },
  explicitCell: {
    backgroundColor: tokens.colorNeutralBackground1,
  },
  brokenInheritance: {
    ...shorthands.border('2px', 'solid', tokens.colorWarningBorder2),
  },
  conflictCell: {
    ...shorthands.border('2px', 'solid', tokens.colorPaletteDarkOrangeBorder2),
  },
  lockedCell: {
    opacity: '0.6',
    cursor: 'not-allowed',
  },
  folderName: {
    display: 'flex',
    alignItems: 'center',
    ...shorthands.gap('8px'),
  },
  folderIcon: {
    fontSize: '16px',
  },
  permissionDropdown: {
    minWidth: '100px',
  },
  loadingContainer: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100%',
  },
  toolbar: {
    marginBottom: '16px',
  },
  tableWrapper: {
    height: 'calc(100vh - 250px)',
    ...shorthands.overflow('auto'),
  },
  folderCell: {
    minWidth: '250px',
  },
  permissionCell: {
    textAlign: 'center',
    minWidth: '120px',
  },
});

const roleColumns: RoleType[] = [
  'NEU_Admin',
  'NEU_PM',
  'Company_Admin',
  'Expert',
  'NEU_QA',
];

const permissionLevelOptions = [
  { value: 'none', text: 'None' },
  { value: 'read', text: 'Read' },
  { value: 'write', text: 'Write' },
  { value: 'full', text: 'Full' },
];

const getPermissionLevelIcon = (level: PermissionLevel): React.ReactElement => {
  switch (level) {
    case 'none':
      return <DismissCircle20Regular />;
    case 'read':
      return <Eye20Regular />;
    case 'write':
      return <Edit20Regular />;
    case 'full':
      return <ShieldCheckmark20Regular />;
    default:
      return <DismissCircle20Regular />;
  }
};

interface FolderRow {
  key: string;
  folder: FolderPermission;
  level: number;
  isExpanded: boolean;
}

export const PermissionMatrix: React.FC = () => {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const styles = useStyles();

  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set());
  const [editingCell, setEditingCell] = useState<string | null>(null);
  const [showLockModal, setShowLockModal] = useState(false);
  const [selectedTab, setSelectedTab] = useState<string>('matrix');

  // Fetch permission matrix data
  const { data: matrix, isLoading, error } = useQuery<IPermissionMatrix>({
    queryKey: ['permissionMatrix', orderId],
    queryFn: async () => {
      // Mock data for now - will be replaced with actual API call
      return {
        orderId: orderId!,
        folders: generateMockFolders(),
        roles: generateMockRoles(),
        lastModified: new Date(),
        syncStatus: {
          status: 'idle',
          pendingChanges: 0,
        },
      };
    },
    enabled: !!orderId,
  });

  // Update permission mutation
  const updatePermissionMutation = useMutation({
    mutationFn: async ({
      folderId,
      roleType,
      level,
    }: {
      folderId: string;
      roleType: RoleType;
      level: PermissionLevel;
    }) => {
      // Will be replaced with actual API call
      await new Promise((resolve) => setTimeout(resolve, 500));
      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['permissionMatrix', orderId] });
    },
  });

  // Toggle inheritance mutation
  const toggleInheritanceMutation = useMutation({
    mutationFn: async ({
      folderId,
      breakInheritance,
    }: {
      folderId: string;
      breakInheritance: boolean;
    }) => {
      // Will be replaced with actual API call
      await new Promise((resolve) => setTimeout(resolve, 500));
      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['permissionMatrix', orderId] });
    },
  });

  // Manual lock mutation
  const manualLockMutation = useMutation({
    mutationFn: async (lockRequest: LockRequest) => {
      // Will be replaced with actual API call to POST /api/locks/manual
      await new Promise((resolve) => setTimeout(resolve, 500));
      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['permissionMatrix', orderId] });
      queryClient.invalidateQueries({ queryKey: ['lockHistory', orderId] });
    },
  });

  // Flatten folder hierarchy for display
  const flattenFolders = useCallback(
    (folders: FolderPermission[], level = 0): FolderRow[] => {
      const rows: FolderRow[] = [];
      folders.forEach((folder) => {
        const isExpanded = expandedFolders.has(folder.folderId);
        rows.push({
          key: folder.folderId,
          folder,
          level,
          isExpanded,
        });
        if (isExpanded && folder.children) {
          rows.push(...flattenFolders(folder.children, level + 1));
        }
      });
      return rows;
    },
    [expandedFolders]
  );

  const folderRows = useMemo(() => {
    if (!matrix) return [];
    return flattenFolders(matrix.folders);
  }, [matrix, flattenFolders]);

  // Toggle folder expansion
  const toggleFolder = useCallback((folderId: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  }, []);

  // Handle cell click for editing
  const handleCellClick = useCallback(
    (folderId: string, roleType: RoleType) => {
      const cellKey = `${folderId}-${roleType}`;
      if (editingCell === cellKey) {
        setEditingCell(null);
      } else {
        setEditingCell(cellKey);
      }
    },
    [editingCell]
  );

  // Handle permission level change
  const handlePermissionChange = useCallback(
    (folderId: string, roleType: RoleType, level: PermissionLevel) => {
      updatePermissionMutation.mutate({ folderId, roleType, level });
      setEditingCell(null);
    },
    [updatePermissionMutation]
  );

  // Handle inheritance toggle
  const handleInheritanceToggle = useCallback(
    async (folderId: string, breakInheritance: boolean) => {
      await toggleInheritanceMutation.mutateAsync({ folderId, breakInheritance });
    },
    [toggleInheritanceMutation]
  );

  // Handle manual lock
  const handleManualLock = useCallback(
    async (lockRequest: LockRequest) => {
      await manualLockMutation.mutateAsync(lockRequest);
      setShowLockModal(false);
    },
    [manualLockMutation]
  );

  // Get folder groups for lock modal
  const getFolderGroups = useCallback(() => {
    if (!matrix) return [];
    
    const expertFolders = matrix.folders
      .flatMap(f => f.children || [])
      .filter(f => f.name.includes('SZAKERTOK') || f.name.includes('EXPERT'));
    
    const resultFolders = matrix.folders
      .flatMap(f => f.children || [])
      .filter(f => f.name.includes('EREDMENYEK') || f.name.includes('RESULTS'));
    
    const finalFolders = matrix.folders
      .flatMap(f => f.children || [])
      .filter(f => f.name.includes('VEGLEGES') || f.name.includes('FINAL'));

    return [
      {
        id: 'experts',
        name: 'Expert Folders',
        folders: expertFolders.map(f => f.name),
        currentLockState: expertFolders[0]?.specialFlags?.isLocked ? {
          folderId: 'experts',
          lockType: 'manual' as const,
          locked: true,
          reason: 'Locked',
        } : undefined,
      },
      {
        id: 'results',
        name: 'Result Folders',
        folders: resultFolders.map(f => f.name),
        currentLockState: resultFolders[0]?.specialFlags?.isLocked ? {
          folderId: 'results',
          lockType: 'manual' as const,
          locked: true,
          reason: 'Locked',
        } : undefined,
      },
      {
        id: 'final',
        name: 'Final Folders',
        folders: finalFolders.map(f => f.name),
        currentLockState: finalFolders[0]?.specialFlags?.isLocked ? {
          folderId: 'final',
          lockType: 'manual' as const,
          locked: true,
          reason: 'Locked',
        } : undefined,
      },
    ].filter(g => g.folders.length > 0);
  }, [matrix]);

  // Render folder name with icons and indentation
  const renderFolderName = (row: FolderRow) => {
    const indent = row.level * 20;
    const hasChildren = row.folder.children && row.folder.children.length > 0;
    
    return (
      <div
        className={styles.folderName}
        style={{ paddingLeft: `${indent}px` }}
      >
        {hasChildren && (
          <Button
            appearance="subtle"
            icon={row.isExpanded ? <ChevronDown20Regular /> : <ChevronRight20Regular />}
            onClick={() => toggleFolder(row.folder.folderId)}
            size="small"
          />
        )}
        <Tooltip content={row.folder.path} relationship="label">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {row.folder.specialFlags?.isLocked ? (
              <LockClosed20Regular />
            ) : row.folder.specialFlags?.isNeuOnly ? (
              <Shield20Regular />
            ) : row.folder.specialFlags?.isFinancial ? (
              <Money20Regular />
            ) : (
              <Folder20Regular />
            )}
            <Text>{row.folder.name}</Text>
            {row.folder.inheritanceState === 'broken' && (
              <Tooltip content="Inheritance broken">
                <Link20Regular />
              </Tooltip>
            )}
          </div>
        </Tooltip>
      </div>
    );
  };

  // Render permission cell
  const renderPermissionCell = (row: FolderRow, role: RoleType) => {
    const permission = row.folder.permissions.find((p) => p.roleType === role);
    const level = permission?.level || 'none';
    const source = permission?.source || 'inherited';
    const cellKey = `${row.folder.folderId}-${role}`;
    const isEditing = editingCell === cellKey;
    const isLocked = row.folder.specialFlags?.isLocked;

    const cellClasses = [
      styles.cellContainer,
      source === 'inherited' && styles.inheritedCell,
      source === 'explicit' && styles.explicitCell,
      row.folder.inheritanceState === 'broken' && styles.brokenInheritance,
      isLocked && styles.lockedCell,
    ]
      .filter(Boolean)
      .join(' ');

    if (isEditing && !isLocked) {
      return (
        <Dropdown
          value={level}
          onOptionSelect={(_, data) => {
            if (data.optionValue) {
              handlePermissionChange(
                row.folder.folderId,
                role,
                data.optionValue as PermissionLevel
              );
            }
          }}
          className={styles.permissionDropdown}
        >
          {permissionLevelOptions.map((option) => (
            <Option key={option.value} value={option.value}>
              {option.text}
            </Option>
          ))}
        </Dropdown>
      );
    }

    return (
      <Tooltip content={`${level} (${source})`} relationship="label">
        <div
          className={cellClasses}
          onClick={() => !isLocked && handleCellClick(row.folder.folderId, role)}
        >
          {getPermissionLevelIcon(level)}
          <Text size={200}>{level}</Text>
        </div>
      </Tooltip>
    );
  };

  if (isLoading) {
    return (
      <div className={styles.loadingContainer}>
        <Spinner size="large" label="Loading permission matrix..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.root}>
        <MessageBar intent="error">
          <MessageBarBody>
            <MessageBarTitle>Failed to load permission matrix</MessageBarTitle>
            Please try again.
          </MessageBarBody>
        </MessageBar>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <Title2>Permission Matrix Editor</Title2>
        <Text>Order ID: {orderId}</Text>
        {matrix && matrix.syncStatus.pendingChanges > 0 && (
          <MessageBar intent="warning">
            <MessageBarBody>
              You have {matrix.syncStatus.pendingChanges} unsaved changes.
            </MessageBarBody>
          </MessageBar>
        )}
      </div>

      <Toolbar className={styles.toolbar}>
        <ToolbarButton
          icon={<ArrowLeft20Regular />}
          onClick={() => navigate('/permissions')}
        >
          Back
        </ToolbarButton>
        <ToolbarButton
          icon={<Save20Regular />}
          disabled={!matrix || matrix.syncStatus.pendingChanges === 0}
        >
          Save Changes
        </ToolbarButton>
        <ToolbarButton
          icon={<ArrowSync20Regular />}
          disabled={!matrix || matrix.syncStatus.status === 'syncing'}
        >
          Sync to SharePoint
        </ToolbarButton>
        <ToolbarButton
          icon={<ChevronDoubleDown20Regular />}
          onClick={() => {
            if (matrix) {
              const allFolderIds = new Set<string>();
              const collectIds = (folders: FolderPermission[]) => {
                folders.forEach((f) => {
                  allFolderIds.add(f.folderId);
                  if (f.children) collectIds(f.children);
                });
              };
              collectIds(matrix.folders);
              setExpandedFolders(allFolderIds);
            }
          }}
        >
          Expand All
        </ToolbarButton>
        <ToolbarButton
          icon={<ChevronDoubleUp20Regular />}
          onClick={() => setExpandedFolders(new Set())}
        >
          Collapse All
        </ToolbarButton>
        <ToolbarButton
          icon={<LockMultiple20Regular />}
          onClick={() => setShowLockModal(true)}
        >
          Manual Lock/Unlock
        </ToolbarButton>
      </Toolbar>

      {/* Tabs for switching between Matrix, User Assignment, and Effective Permissions */}
      <TabList
        selectedValue={selectedTab}
        onTabSelect={(_, data: any) => setSelectedTab(data.value as string)}
      >
        <Tab value="matrix" icon={<Shield20Regular />}>
          Permission Matrix
        </Tab>
        <Tab value="users" icon={<People20Regular />}>
          User & Group Assignment
        </Tab>
        <Tab value="effective" icon={<Calculator20Regular />}>
          Effective Permissions
        </Tab>
      </TabList>

      {/* Matrix View */}
      {selectedTab === 'matrix' && (
        <div className={styles.matrixContainer}>
          <div className={styles.tableWrapper}>
            <Table>
            <TableHeader>
              <TableRow>
                <TableHeaderCell className={styles.folderCell}>Folder</TableHeaderCell>
                <TableHeaderCell style={{ minWidth: '200px' }}>Inheritance</TableHeaderCell>
                {roleColumns.map((role) => (
                  <TableHeaderCell key={role} className={styles.permissionCell}>
                    {role.replace('_', ' ')}
                  </TableHeaderCell>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {folderRows.map((row) => (
                <TableRow key={row.key}>
                  <TableCell className={styles.folderCell}>
                    {renderFolderName(row)}
                  </TableCell>
                  <TableCell>
                    <InheritanceToggle
                      folder={row.folder}
                      onToggle={handleInheritanceToggle}
                      isLoading={toggleInheritanceMutation.isPending}
                      disabled={row.folder.specialFlags?.isLocked}
                    />
                  </TableCell>
                  {roleColumns.map((role) => (
                    <TableCell key={`${row.key}-${role}`} className={styles.permissionCell}>
                      {renderPermissionCell(row, role)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* User Assignment View */}
      {selectedTab === 'users' && (
        <UserGroupAssignment
          orderId={orderId || ''}
          onAssignmentChange={(assignments) => {
            // Handle assignment changes if needed
            console.log('Assignments changed:', assignments);
          }}
        />
      )}

      {/* Effective Permissions View */}
      {selectedTab === 'effective' && (
        <EffectivePermissions
          orderId={orderId || ''}
          onExport={(data) => {
            // Handle export - could download as JSON or CSV
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `effective-permissions-${orderId}-${new Date().toISOString()}.json`;
            a.click();
            URL.revokeObjectURL(url);
          }}
        />
      )}

      {/* Manual Lock Modal */}
      <ManualLockModal
        open={showLockModal}
        onClose={() => setShowLockModal(false)}
        orderId={orderId || ''}
        folderGroups={getFolderGroups()}
        onSubmit={handleManualLock}
        lockHistory={[]} // Will be populated from API
      />
    </div>
  );
};

// Mock data generators
function generateMockFolders(): FolderPermission[] {
  const folders: FolderPermission[] = [
    {
      folderId: 'f1',
      path: '/2025_A_MVM',
      name: '2025_A_MVM',
      depth: 0,
      inheritanceState: 'explicit',
      permissions: generateMockPermissions(),
      children: [
        {
          folderId: 'f1-1',
          path: '/2025_A_MVM/00_BELSO_NEU_ONLY',
          name: '00_BELSO_NEU_ONLY',
          depth: 1,
          inheritanceState: 'broken',
          permissions: generateMockPermissions(),
          specialFlags: { isNeuOnly: true },
        },
        {
          folderId: 'f1-2',
          path: '/2025_A_MVM/01_SZAKERTOK',
          name: '01_SZAKERTOK',
          depth: 1,
          inheritanceState: 'inherited',
          permissions: generateMockPermissions(),
          children: [
            {
              folderId: 'f1-2-1',
              path: '/2025_A_MVM/01_SZAKERTOK/TIG',
              name: 'TIG',
              depth: 2,
              inheritanceState: 'broken',
              permissions: generateMockPermissions(),
              specialFlags: { isFinancial: true },
            },
          ],
        },
        {
          folderId: 'f1-3',
          path: '/2025_A_MVM/02_EREDMENYEK',
          name: '02_EREDMENYEK',
          depth: 1,
          inheritanceState: 'inherited',
          permissions: generateMockPermissions(),
        },
        {
          folderId: 'f1-4',
          path: '/2025_A_MVM/03_VEGLEGES',
          name: '03_VEGLEGES',
          depth: 1,
          inheritanceState: 'explicit',
          permissions: generateMockPermissions(),
          specialFlags: { isLocked: true },
        },
      ],
    },
  ];
  
  // Apply special folder detection to all folders
  const applySpecialFlags = (folder: FolderPermission) => {
    const special = detectSpecialFolder(folder);
    if (special.isSpecial && special.type) {
      folder.specialFlags = {
        ...folder.specialFlags,
        isFinancial: special.type === 'financial',
        isNeuOnly: special.type === 'neuOnly',
        isLocked: special.type === 'final' || folder.specialFlags?.isLocked,
      };
    }
    if (folder.children) {
      folder.children.forEach(applySpecialFlags);
    }
  };
  
  folders.forEach(applySpecialFlags);
  return folders;
}

function generateMockPermissions(): RolePermission[] {
  return [
    {
      roleType: 'NEU_Admin',
      level: 'full',
      source: 'role',
    },
    {
      roleType: 'NEU_PM',
      level: 'read',
      source: 'role',
    },
    {
      roleType: 'Company_Admin',
      level: 'write',
      source: 'explicit',
    },
    {
      roleType: 'Expert',
      level: 'write',
      source: 'inherited',
    },
    {
      roleType: 'NEU_QA',
      level: 'read',
      source: 'role',
    },
  ];
}

function generateMockRoles() {
  return [
    {
      roleType: 'NEU_Admin',
      displayName: 'NEÜ Admin',
      description: 'Full administrative access',
      defaultPermissions: [],
    },
    {
      roleType: 'NEU_PM',
      displayName: 'NEÜ PM',
      description: 'Project management access',
      defaultPermissions: [],
    },
    {
      roleType: 'Company_Admin',
      displayName: 'Company Admin',
      description: 'Company administrative access',
      defaultPermissions: [],
    },
    {
      roleType: 'Expert',
      displayName: 'Expert',
      description: 'Expert contributor access',
      defaultPermissions: [],
    },
    {
      roleType: 'NEU_QA',
      displayName: 'NEÜ QA',
      description: 'Quality assurance access',
      defaultPermissions: [],
    },
  ];
}