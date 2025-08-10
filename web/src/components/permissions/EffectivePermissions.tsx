import React, { useState } from 'react';
import {
  Card,
  CardHeader,
  Field,
  Combobox,
  Option,
  Button,
  Badge,
  tokens,
  makeStyles,
  Text,
  Divider,
  Avatar,
  Tooltip,
  InfoLabel,
  Table,
  TableHeader,
  TableHeaderCell,
  TableBody,
  TableRow,
  TableCell,
  TableCellLayout,
  Subtitle2,
  Caption1,
  Body1,
  Tag,
  TagGroup,
  Menu,
  MenuTrigger,
  MenuPopover,
  MenuList,
  MenuItem,
} from '@fluentui/react-components';
import {
  PersonRegular,
  FolderRegular,
  LockClosedRegular,
  ShieldCheckmarkRegular,
  WarningRegular,
  InfoRegular,
  ArrowExportLtrRegular,
  ChevronRightRegular,
  GroupRegular,
  KeyRegular,
  Link20Regular as InheritedRegular,
} from '@fluentui/react-icons';
import type {
  EffectivePermission,
  PermissionSource,
  PermissionConflict,
  PermissionLevel,
} from '../../types/permissions';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
  },
  selectorSection: {
    display: 'flex',
    gap: tokens.spacingHorizontalM,
    alignItems: 'flex-end',
  },
  resultCard: {
    marginTop: tokens.spacingVerticalM,
  },
  permissionResult: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    padding: tokens.spacingVerticalM,
    backgroundColor: tokens.colorNeutralBackground2,
    borderRadius: tokens.borderRadiusMedium,
  },
  permissionBadge: {
    minWidth: '100px',
  },
  sourcesSection: {
    marginTop: tokens.spacingVerticalL,
  },
  sourceItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: tokens.spacingVerticalS,
    borderLeft: `3px solid ${tokens.colorNeutralStroke1}`,
    paddingLeft: tokens.spacingHorizontalM,
    marginBottom: tokens.spacingVerticalS,
    backgroundColor: tokens.colorNeutralBackground1,
    borderRadius: tokens.borderRadiusMedium,
  },
  sourceExplicit: {
    borderLeftColor: tokens.colorPaletteBlueBackground2,
    backgroundColor: tokens.colorPaletteBlueBackground1,
  },
  sourceRole: {
    borderLeftColor: tokens.colorPaletteGreenBackground2,
    backgroundColor: tokens.colorPaletteGreenBackground1,
  },
  sourceGroup: {
    borderLeftColor: tokens.colorPalettePurpleBackground2,
    backgroundColor: tokens.colorPalettePurpleBackground1,
  },
  sourceInherited: {
    borderLeftColor: tokens.colorNeutralStroke2,
    backgroundColor: tokens.colorNeutralBackground3,
  },
  conflictSection: {
    marginTop: tokens.spacingVerticalL,
    padding: tokens.spacingVerticalM,
    backgroundColor: tokens.colorPaletteRedBackground1,
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorPaletteRedBorder1}`,
  },
  conflictHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    marginBottom: tokens.spacingVerticalM,
  },
  pathVisualization: {
    marginTop: tokens.spacingVerticalL,
    padding: tokens.spacingVerticalM,
    backgroundColor: tokens.colorNeutralBackground2,
    borderRadius: tokens.borderRadiusMedium,
  },
  pathItem: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    padding: tokens.spacingVerticalXS,
  },
  exportButton: {
    marginTop: tokens.spacingVerticalM,
  },
});

interface EffectivePermissionsProps {
  orderId: string;
  onExport?: (data: EffectivePermission) => void;
}

const mockUsers = [
  { id: 'user1', name: 'John Doe', email: 'john.doe@example.com' },
  { id: 'user2', name: 'Jane Smith', email: 'jane.smith@example.com' },
  { id: 'user3', name: 'Bob Johnson', email: 'bob.johnson@example.com' },
];

const mockGroups = [
  { id: 'group1', name: 'NEU Admins', memberCount: 5 },
  { id: 'group2', name: 'Company A Experts', memberCount: 12 },
  { id: 'group3', name: 'Quality Assurance', memberCount: 3 },
];

const mockFolders = [
  { id: 'folder1', path: '/01_Partner_A', name: '01_Partner_A' },
  { id: 'folder2', path: '/01_Partner_A/Experts', name: 'Experts' },
  { id: 'folder3', path: '/00_BELSO_NEU_ONLY', name: '00_BELSO_NEU_ONLY' },
  { id: 'folder4', path: '/02_Partner_B/TIG', name: 'TIG (Financial)' },
];

const getPermissionColor = (level: PermissionLevel): string => {
  switch (level) {
    case 'full':
      return 'success';
    case 'write':
      return 'brand';
    case 'read':
      return 'informative';
    case 'none':
      return 'subtle';
    default:
      return 'subtle';
  }
};

const getSourceIcon = (type: string) => {
  switch (type) {
    case 'explicit':
      return <KeyRegular />;
    case 'role':
      return <ShieldCheckmarkRegular />;
    case 'group':
      return <GroupRegular />;
    case 'inherited':
      return <InheritedRegular />;
    default:
      return <InfoRegular />;
  }
};

export const EffectivePermissions: React.FC<EffectivePermissionsProps> = ({
  orderId,
  onExport,
}) => {
  const classes = useStyles();
  const [selectedUser, setSelectedUser] = useState<string>('');
  const [selectedGroup, setSelectedGroup] = useState<string>('');
  const [selectedFolder, setSelectedFolder] = useState<string>('');
  const [effectivePermission, setEffectivePermission] = useState<EffectivePermission | null>(null);

  const handleCalculate = () => {
    // Mock calculation - in real app, would call API
    const mockEffectivePermission: EffectivePermission = {
      userId: selectedUser || selectedGroup,
      folderId: selectedFolder,
      calculatedLevel: 'write',
      sources: [
        {
          type: 'explicit',
          level: 'full',
          priority: 1,
          sourceName: 'Direct assignment',
        },
        {
          type: 'role',
          level: 'write',
          priority: 2,
          sourceName: 'Company Admin',
        },
        {
          type: 'group',
          level: 'read',
          priority: 3,
          sourceName: 'Company A Experts',
        },
        {
          type: 'inherited',
          level: 'read',
          priority: 4,
          sourceName: 'Parent folder',
        },
      ],
      conflicts: [
        {
          sources: [
            {
              type: 'explicit',
              level: 'full',
              priority: 1,
              sourceName: 'Direct assignment',
            },
            {
              type: 'role',
              level: 'write',
              priority: 2,
              sourceName: 'Company Admin',
            },
          ],
          resolution: {
            method: 'priority',
            selectedLevel: 'full',
            reason: 'Explicit assignment takes precedence over role-based permissions',
          },
        },
      ],
    };

    setEffectivePermission(mockEffectivePermission);
  };

  const handleExport = () => {
    if (effectivePermission && onExport) {
      onExport(effectivePermission);
    }
  };

  const renderPermissionPath = () => {
    if (!effectivePermission) return null;

    const folder = mockFolders.find(f => f.id === selectedFolder);
    if (!folder) return null;

    const pathParts = folder.path.split('/').filter(Boolean);
    
    return (
      <div className={classes.pathVisualization}>
        <Subtitle2>Permission Path</Subtitle2>
        <div style={{ marginTop: tokens.spacingVerticalS }}>
          {pathParts.map((part, index) => (
            <div key={index} className={classes.pathItem}>
              <FolderRegular />
              <Text>{part}</Text>
              {index < pathParts.length - 1 && <ChevronRightRegular />}
              <Badge
                appearance="tint"
                color={index === pathParts.length - 1 ? 'brand' : 'subtle'}
              >
                {index === pathParts.length - 1 ? 'Target' : 'Parent'}
              </Badge>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderConflicts = () => {
    if (!effectivePermission?.conflicts || effectivePermission.conflicts.length === 0) {
      return null;
    }

    return (
      <div className={classes.conflictSection}>
        <div className={classes.conflictHeader}>
          <WarningRegular color={tokens.colorPaletteRedForeground1} />
          <Subtitle2>Permission Conflicts Detected</Subtitle2>
        </div>
        {effectivePermission.conflicts.map((conflict, index) => (
          <Card key={index} style={{ marginBottom: tokens.spacingVerticalS }}>
            <CardHeader
              header={
                <Body1>
                  Conflict Resolution: {conflict.resolution.method}
                </Body1>
              }
              description={conflict.resolution.reason}
            />
            <Table size="small">
              <TableHeader>
                <TableRow>
                  <TableHeaderCell>Source</TableHeaderCell>
                  <TableHeaderCell>Permission</TableHeaderCell>
                  <TableHeaderCell>Priority</TableHeaderCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {conflict.sources.map((source, idx) => (
                  <TableRow key={idx}>
                    <TableCell>
                      <TableCellLayout media={getSourceIcon(source.type)}>
                        {source.sourceName}
                      </TableCellLayout>
                    </TableCell>
                    <TableCell>
                      <Badge color={getPermissionColor(source.level)}>
                        {source.level}
                      </Badge>
                    </TableCell>
                    <TableCell>{source.priority}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div style={{ padding: tokens.spacingVerticalS }}>
              <InfoLabel
                info={
                  <Text>
                    Selected: <strong>{conflict.resolution.selectedLevel}</strong>
                  </Text>
                }
              >
                Resolution
              </InfoLabel>
            </div>
          </Card>
        ))}
        <Menu>
          <MenuTrigger disableButtonEnhancement>
            <Button appearance="secondary" size="small">
              Resolution Options
            </Button>
          </MenuTrigger>
          <MenuPopover>
            <MenuList>
              <MenuItem>Apply Most Permissive</MenuItem>
              <MenuItem>Apply Least Permissive</MenuItem>
              <MenuItem>Manual Override</MenuItem>
              <MenuItem>Apply Policy Rules</MenuItem>
            </MenuList>
          </MenuPopover>
        </Menu>
      </div>
    );
  };

  return (
    <div className={classes.root}>
      <Card>
        <CardHeader
          header={<Subtitle2>Calculate Effective Permissions</Subtitle2>}
          description="Select a user or group and folder to view computed permissions"
        />
        
        <div className={classes.selectorSection}>
          <Field label="User">
            <Combobox
              placeholder="Select user"
              value={selectedUser}
              onOptionSelect={(_, data) => {
                setSelectedUser(data.optionValue || '');
                setSelectedGroup('');
              }}
              style={{ minWidth: '250px' }}
            >
              {mockUsers.map(user => (
                <Option key={user.id} value={user.id} text={user.name}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Avatar
                      name={user.name}
                      size={24}
                      icon={<PersonRegular />}
                    />
                    <div>
                      <div>{user.name}</div>
                      <Caption1>{user.email}</Caption1>
                    </div>
                  </div>
                </Option>
              ))}
            </Combobox>
          </Field>

          <Field label="Or Group">
            <Combobox
              placeholder="Select group"
              value={selectedGroup}
              onOptionSelect={(_, data) => {
                setSelectedGroup(data.optionValue || '');
                setSelectedUser('');
              }}
              style={{ minWidth: '250px' }}
              disabled={!!selectedUser}
            >
              {mockGroups.map(group => (
                <Option key={group.id} value={group.id} text={group.name}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <GroupRegular />
                    <div>
                      <div>{group.name}</div>
                      <Caption1>{group.memberCount} members</Caption1>
                    </div>
                  </div>
                </Option>
              ))}
            </Combobox>
          </Field>

          <Field label="Folder">
            <Combobox
              placeholder="Select folder"
              value={selectedFolder}
              onOptionSelect={(_, data) => setSelectedFolder(data.optionValue || '')}
              style={{ minWidth: '300px' }}
            >
              {mockFolders.map(folder => (
                <Option key={folder.id} value={folder.id} text={folder.name}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <FolderRegular />
                    <div>
                      <div>{folder.name}</div>
                      <Caption1>{folder.path}</Caption1>
                    </div>
                  </div>
                </Option>
              ))}
            </Combobox>
          </Field>

          <Button
            appearance="primary"
            onClick={handleCalculate}
            disabled={(!selectedUser && !selectedGroup) || !selectedFolder}
          >
            Calculate
          </Button>
        </div>
      </Card>

      {effectivePermission && (
        <>
          <Card className={classes.resultCard}>
            <CardHeader
              header={<Subtitle2>Effective Permission Result</Subtitle2>}
              action={
                <Button
                  appearance="subtle"
                  icon={<ArrowExportLtrRegular />}
                  onClick={handleExport}
                >
                  Export
                </Button>
              }
            />
            
            <div className={classes.permissionResult}>
              <InfoLabel
                info="The calculated permission level after resolving all sources and conflicts"
              >
                Computed Permission:
              </InfoLabel>
              <Badge
                size="large"
                appearance="filled"
                color={getPermissionColor(effectivePermission.calculatedLevel)}
                className={classes.permissionBadge}
              >
                {effectivePermission.calculatedLevel.toUpperCase()}
              </Badge>
              
              {effectivePermission.calculatedLevel === 'none' && (
                <Tooltip content="User has no access to this folder" relationship="label">
                  <LockClosedRegular color={tokens.colorPaletteRedForeground1} />
                </Tooltip>
              )}
            </div>

            <Divider />

            <div className={classes.sourcesSection}>
              <Subtitle2>Permission Sources</Subtitle2>
              <Caption1>Listed in order of priority (highest to lowest)</Caption1>
              
              <div style={{ marginTop: tokens.spacingVerticalM }}>
                {effectivePermission.sources.map((source, index) => (
                  <div
                    key={index}
                    className={`${classes.sourceItem} ${
                      source.type === 'explicit' ? classes.sourceExplicit :
                      source.type === 'role' ? classes.sourceRole :
                      source.type === 'group' ? classes.sourceGroup :
                      classes.sourceInherited
                    }`}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalS }}>
                      {getSourceIcon(source.type)}
                      <div>
                        <Body1 weight="semibold">{source.sourceName}</Body1>
                        <Caption1>Type: {source.type} | Priority: {source.priority}</Caption1>
                      </div>
                    </div>
                    <Badge
                      appearance="filled"
                      color={getPermissionColor(source.level)}
                    >
                      {source.level}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          {renderPermissionPath()}
          {renderConflicts()}

          <Button
            className={classes.exportButton}
            appearance="secondary"
            icon={<ArrowExportLtrRegular />}
            onClick={handleExport}
          >
            Export Full Permission Report
          </Button>
        </>
      )}
    </div>
  );
};