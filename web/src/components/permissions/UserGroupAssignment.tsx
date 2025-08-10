import React, { useState, useCallback, useMemo } from 'react';
import {
  makeStyles,
  tokens,
  Button,
  Field,
  Input,
  Dropdown,
  Option,
  Checkbox,
  Badge,
  Card,
  CardHeader,
  Text,
  DataGrid,
  DataGridHeader,
  DataGridHeaderCell,
  DataGridBody,
  DataGridRow,
  DataGridCell,
  createTableColumn,
  Spinner,
  Dialog,
  DialogSurface,
  DialogTitle,
  DialogBody,
  DialogActions,
  DialogContent,
  Tag,
  InteractionTag,
  InteractionTagPrimary,
  Divider,
  Menu,
  MenuTrigger,
  MenuPopover,
  MenuList,
  MenuItem,
  Toolbar,
  ToolbarButton,
  Tooltip,
} from '@fluentui/react-components';
import {
  Search20Regular,
  People20Regular,
  PeopleTeam20Regular,
  PersonAdd20Regular,
  PersonDelete20Regular,
  Copy20Regular,
  Delete20Regular,
  MoreHorizontal20Regular,
  Mail20Regular,
  Shield20Regular,
} from '@fluentui/react-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { RoleType, User, Group, UserGroupAssignment as Assignment } from '../../types/permissions';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
    height: '100%',
  },
  searchSection: {
    display: 'flex',
    gap: tokens.spacingHorizontalM,
    alignItems: 'flex-end',
  },
  searchField: {
    flex: 1,
    maxWidth: '400px',
  },
  selectedSection: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: tokens.spacingHorizontalS,
    padding: tokens.spacingVerticalM,
    backgroundColor: tokens.colorNeutralBackground2,
    borderRadius: tokens.borderRadiusMedium,
    minHeight: '60px',
    alignItems: 'center',
  },
  bulkActions: {
    display: 'flex',
    gap: tokens.spacingHorizontalM,
    padding: tokens.spacingVerticalM,
    backgroundColor: tokens.colorNeutralBackground3,
    borderRadius: tokens.borderRadiusMedium,
  },
  assignmentsGrid: {
    flex: 1,
    minHeight: '0',
  },
  roleCell: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
  },
  loadingContainer: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '200px',
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '200px',
    gap: tokens.spacingVerticalM,
  },
  guestInviteDialog: {
    minWidth: '500px',
  },
  dialogField: {
    marginBottom: tokens.spacingVerticalM,
  },
});


interface UserGroupAssignmentProps {
  orderId: string;
  onAssignmentChange?: (assignments: Assignment[]) => void;
  selectedFolders?: string[];
}

export const UserGroupAssignment: React.FC<UserGroupAssignmentProps> = ({
  orderId,
  onAssignmentChange,
  selectedFolders = [],
}) => {
  const styles = useStyles();
  const queryClient = useQueryClient();

  const [searchQuery, setSearchQuery] = useState('');
  const [searchType, setSearchType] = useState<'users' | 'groups'>('users');
  const [selectedItems, setSelectedItems] = useState<Array<User | Group>>([]);
  const [selectedRole, setSelectedRole] = useState<RoleType>('Expert');
  const [showGuestInvite, setShowGuestInvite] = useState(false);
  const [guestEmail, setGuestEmail] = useState('');
  const [guestName, setGuestName] = useState('');
  const [copyFromUser, setCopyFromUser] = useState<string>('');

  // Search users
  const { data: searchResults, isLoading: isSearching } = useQuery({
    queryKey: ['search', searchType, searchQuery],
    queryFn: async () => {
      if (!searchQuery) return [];
      
      // Mock data - will be replaced with actual API calls
      if (searchType === 'users') {
        return mockSearchUsers(searchQuery);
      } else {
        return mockSearchGroups(searchQuery);
      }
    },
    enabled: searchQuery.length > 2,
  });

  // Get current assignments
  const { data: assignments = [], isLoading: isLoadingAssignments } = useQuery({
    queryKey: ['assignments', orderId],
    queryFn: async () => {
      // Mock data - will be replaced with actual API call
      return mockGetAssignments(orderId);
    },
  });

  // Add assignment mutation
  const addAssignmentMutation = useMutation({
    mutationFn: async ({
      principals,
      role,
    }: {
      principals: Array<User | Group>;
      role: RoleType;
    }) => {
      // Will be replaced with actual API call
      await new Promise((resolve) => setTimeout(resolve, 500));
      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assignments', orderId] });
      setSelectedItems([]);
    },
  });

  // Remove assignment mutation
  const removeAssignmentMutation = useMutation({
    mutationFn: async (assignmentId: string) => {
      // Will be replaced with actual API call
      await new Promise((resolve) => setTimeout(resolve, 500));
      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assignments', orderId] });
    },
  });

  // Invite guest mutation
  const inviteGuestMutation = useMutation({
    mutationFn: async ({
      email,
      name,
      role,
    }: {
      email: string;
      name: string;
      role: RoleType;
    }) => {
      // Will be replaced with actual API call to POST /api/guests
      await new Promise((resolve) => setTimeout(resolve, 500));
      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assignments', orderId] });
      setShowGuestInvite(false);
      setGuestEmail('');
      setGuestName('');
    },
  });

  // Copy permissions mutation
  const copyPermissionsMutation = useMutation({
    mutationFn: async ({
      sourceUserId,
      targetUserIds,
    }: {
      sourceUserId: string;
      targetUserIds: string[];
    }) => {
      // Will be replaced with actual API call
      await new Promise((resolve) => setTimeout(resolve, 500));
      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assignments', orderId] });
      setSelectedItems([]);
      setCopyFromUser('');
    },
  });

  // Table columns
  const columns = [
    createTableColumn<Assignment>({
      columnId: 'principal',
      compare: (a, b) => a.displayName.localeCompare(b.displayName),
      renderHeaderCell: () => 'User/Group',
      renderCell: (item) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {item.principalType === 'user' ? (
            <People20Regular />
          ) : (
            <PeopleTeam20Regular />
          )}
          <div>
            <Text weight="semibold">{item.displayName}</Text>
            {item.email && <Text size={200} block>{item.email}</Text>}
          </div>
        </div>
      ),
    }),
    createTableColumn<Assignment>({
      columnId: 'role',
      compare: (a, b) => a.roleType.localeCompare(b.roleType),
      renderHeaderCell: () => 'Role',
      renderCell: (item) => (
        <div className={styles.roleCell}>
          <Shield20Regular />
          <Badge appearance="filled" color="informative">
            {item.roleType.replace('_', ' ')}
          </Badge>
        </div>
      ),
    }),
    createTableColumn<Assignment>({
      columnId: 'assignedInfo',
      renderHeaderCell: () => 'Assigned',
      renderCell: (item) => (
        <div>
          <Text size={200}>{formatDate(item.assignedAt)}</Text>
          <Text size={200} block>by {item.assignedBy}</Text>
        </div>
      ),
    }),
    createTableColumn<Assignment>({
      columnId: 'actions',
      renderHeaderCell: () => 'Actions',
      renderCell: (item) => (
        <Menu>
          <MenuTrigger disableButtonEnhancement>
            <Button
              appearance="subtle"
              icon={<MoreHorizontal20Regular />}
              size="small"
            />
          </MenuTrigger>
          <MenuPopover>
            <MenuList>
              <MenuItem
                icon={<Copy20Regular />}
                onClick={() => handleCopyFrom(item.principalId)}
              >
                Copy permissions
              </MenuItem>
              <MenuItem
                icon={<Delete20Regular />}
                onClick={() => handleRemoveAssignment(item.principalId)}
              >
                Remove
              </MenuItem>
            </MenuList>
          </MenuPopover>
        </Menu>
      ),
    }),
  ];

  // Handlers
  const handleSearch = useCallback(() => {
    // Search is triggered automatically by the query
  }, []);

  const handleSelectItem = useCallback((item: User | Group) => {
    setSelectedItems((prev) => {
      const exists = prev.some((i) => i.id === item.id);
      if (exists) {
        return prev.filter((i) => i.id !== item.id);
      }
      return [...prev, item];
    });
  }, []);

  const handleAssignRole = useCallback(() => {
    if (selectedItems.length === 0 || !selectedRole) return;
    
    addAssignmentMutation.mutate({
      principals: selectedItems,
      role: selectedRole,
    });
  }, [selectedItems, selectedRole, addAssignmentMutation]);

  const handleRemoveAssignment = useCallback((assignmentId: string) => {
    removeAssignmentMutation.mutate(assignmentId);
  }, [removeAssignmentMutation]);

  const handleBulkRemove = useCallback(() => {
    // Remove selected assignments
    const selectedAssignmentIds = selectedItems
      .filter((item) => 'principalId' in item)
      .map((item) => (item as Assignment).principalId);
    
    selectedAssignmentIds.forEach((id) => {
      removeAssignmentMutation.mutate(id);
    });
  }, [selectedItems, removeAssignmentMutation]);

  const handleInviteGuest = useCallback(() => {
    if (!guestEmail || !guestName) return;
    
    inviteGuestMutation.mutate({
      email: guestEmail,
      name: guestName,
      role: selectedRole,
    });
  }, [guestEmail, guestName, selectedRole, inviteGuestMutation]);

  const handleCopyFrom = useCallback((sourceUserId: string) => {
    setCopyFromUser(sourceUserId);
    // In a real implementation, this would open a dialog to select target users
    if (selectedItems.length > 0) {
      const targetUserIds = selectedItems
        .filter((item) => 'email' in item)
        .map((item) => item.id);
      
      copyPermissionsMutation.mutate({
        sourceUserId,
        targetUserIds,
      });
    }
  }, [selectedItems, copyPermissionsMutation]);

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date);
  };

  return (
    <div className={styles.root}>
      <Card>
        <CardHeader
          header={<Text weight="semibold">User & Group Assignment</Text>}
          action={
            <Button
              appearance="primary"
              icon={<PersonAdd20Regular />}
              onClick={() => setShowGuestInvite(true)}
            >
              Invite Guest
            </Button>
          }
        />
        
        {/* Search Section */}
        <div className={styles.searchSection}>
          <Field className={styles.searchField}>
            <Input
              contentBefore={<Search20Regular />}
              placeholder={`Search ${searchType}...`}
              value={searchQuery}
              onChange={(_, data) => setSearchQuery(data.value)}
            />
          </Field>
          
          <Dropdown
            value={searchType}
            onOptionSelect={(_, data) => setSearchType(data.optionValue as 'users' | 'groups')}
          >
            <Option value="users" text="Users">
              <People20Regular /> Users
            </Option>
            <Option value="groups" text="Groups">
              <PeopleTeam20Regular /> Groups
            </Option>
          </Dropdown>
          
          <Dropdown
            value={selectedRole}
            onOptionSelect={(_, data) => setSelectedRole(data.optionValue as RoleType)}
          >
            <Option value="NEU_Admin">NEU Admin</Option>
            <Option value="NEU_PM">NEU PM</Option>
            <Option value="Company_Admin">Company Admin</Option>
            <Option value="Expert">Expert</Option>
            <Option value="NEU_QA">NEU QA</Option>
          </Dropdown>
        </div>

        {/* Search Results */}
        {isSearching && (
          <div className={styles.loadingContainer}>
            <Spinner size="small" label="Searching..." />
          </div>
        )}
        
        {searchResults && searchResults.length > 0 && (
          <div style={{ padding: tokens.spacingVerticalM }}>
            <Text weight="semibold" block style={{ marginBottom: tokens.spacingVerticalS }}>
              Search Results
            </Text>
            {searchResults.map((item) => (
              <div
                key={item.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: tokens.spacingVerticalS,
                  cursor: 'pointer',
                  ':hover': { backgroundColor: tokens.colorNeutralBackground2 },
                }}
                onClick={() => handleSelectItem(item)}
              >
                <Checkbox
                  checked={selectedItems.some((i) => i.id === item.id)}
                  onChange={() => handleSelectItem(item)}
                />
                {'email' in item ? <People20Regular /> : <PeopleTeam20Regular />}
                <div style={{ marginLeft: tokens.spacingHorizontalS }}>
                  <Text>{item.displayName}</Text>
                  {'email' in item && <Text size={200} block>{item.email}</Text>}
                  {'memberCount' in item && <Text size={200} block>{item.memberCount} members</Text>}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Selected Items */}
        {selectedItems.length > 0 && (
          <>
            <Divider />
            <div className={styles.selectedSection}>
              <Text weight="semibold">Selected ({selectedItems.length}):</Text>
              {selectedItems.map((item) => (
                <InteractionTag
                  key={item.id}
                  appearance="brand"
                  shape="circular"
                  size="medium"
                >
                  <InteractionTagPrimary
                    hasSecondaryAction
                    onClick={() => handleSelectItem(item)}
                  >
                    {item.displayName}
                  </InteractionTagPrimary>
                </InteractionTag>
              ))}
            </div>
            
            <div className={styles.bulkActions}>
              <Button
                appearance="primary"
                icon={<PersonAdd20Regular />}
                onClick={handleAssignRole}
                disabled={addAssignmentMutation.isPending}
              >
                Assign {selectedRole} Role
              </Button>
              <Button
                appearance="secondary"
                icon={<PersonDelete20Regular />}
                onClick={handleBulkRemove}
                disabled={removeAssignmentMutation.isPending}
              >
                Remove Selected
              </Button>
              <Button
                appearance="secondary"
                icon={<Copy20Regular />}
                disabled={!copyFromUser}
              >
                Copy Permissions
              </Button>
            </div>
          </>
        )}
      </Card>

      {/* Current Assignments */}
      <Card className={styles.assignmentsGrid}>
        <CardHeader
          header={<Text weight="semibold">Current Assignments ({assignments.length})</Text>}
        />
        
        {isLoadingAssignments ? (
          <div className={styles.loadingContainer}>
            <Spinner size="small" label="Loading assignments..." />
          </div>
        ) : assignments.length === 0 ? (
          <div className={styles.emptyState}>
            <People20Regular style={{ fontSize: '48px' }} />
            <Text>No assignments yet</Text>
            <Text size={200}>Search and add users or groups above</Text>
          </div>
        ) : (
          <DataGrid
            items={assignments}
            columns={columns}
            sortable
            getRowId={(item) => item.principalId}
          >
            <DataGridHeader>
              <DataGridRow>
                {({ renderHeaderCell }) => (
                  <DataGridHeaderCell>{renderHeaderCell()}</DataGridHeaderCell>
                )}
              </DataGridRow>
            </DataGridHeader>
            <DataGridBody<Assignment>>
              {({ item, rowId }) => (
                <DataGridRow<Assignment> key={rowId}>
                  {({ renderCell }) => (
                    <DataGridCell>{renderCell(item)}</DataGridCell>
                  )}
                </DataGridRow>
              )}
            </DataGridBody>
          </DataGrid>
        )}
      </Card>

      {/* Guest Invite Dialog */}
      <Dialog open={showGuestInvite} onOpenChange={(_, data) => setShowGuestInvite(data.open)}>
        <DialogSurface className={styles.guestInviteDialog}>
          <DialogBody>
            <DialogTitle>Invite Guest User</DialogTitle>
            <DialogContent>
              <Field
                label="Email Address"
                required
                className={styles.dialogField}
              >
                <Input
                  type="email"
                  value={guestEmail}
                  onChange={(_, data) => setGuestEmail(data.value)}
                  placeholder="guest@external.com"
                  contentBefore={<Mail20Regular />}
                />
              </Field>
              
              <Field
                label="Display Name"
                required
                className={styles.dialogField}
              >
                <Input
                  value={guestName}
                  onChange={(_, data) => setGuestName(data.value)}
                  placeholder="Guest User Name"
                  contentBefore={<People20Regular />}
                />
              </Field>
              
              <Field
                label="Assign Role"
                className={styles.dialogField}
              >
                <Dropdown
                  value={selectedRole}
                  onOptionSelect={(_, data) => setSelectedRole(data.optionValue as RoleType)}
                >
                  <Option value="Expert">Expert</Option>
                  <Option value="NEU_QA">NEU QA</Option>
                </Dropdown>
              </Field>
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setShowGuestInvite(false)}>
                Cancel
              </Button>
              <Button
                appearance="primary"
                onClick={handleInviteGuest}
                disabled={!guestEmail || !guestName || inviteGuestMutation.isPending}
              >
                Send Invitation
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  );
};

// Mock data functions
function mockSearchUsers(query: string): User[] {
  const users: User[] = [
    { id: 'u1', displayName: 'John Doe', email: 'john.doe@company.com', userPrincipalName: 'john.doe@company.com', type: 'Member', isNEU: true },
    { id: 'u2', displayName: 'Jane Smith', email: 'jane.smith@company.com', userPrincipalName: 'jane.smith@company.com', type: 'Member', isNEU: false },
    { id: 'u3', displayName: 'Bob Johnson', email: 'bob.johnson@company.com', userPrincipalName: 'bob.johnson@company.com', type: 'Member', isNEU: false },
    { id: 'u4', displayName: 'Alice Brown', email: 'alice.brown@external.com', userPrincipalName: 'alice.brown@external.com', type: 'Guest', isNEU: false },
  ];
  
  return users.filter(u => 
    u.displayName.toLowerCase().includes(query.toLowerCase()) ||
    u.email.toLowerCase().includes(query.toLowerCase())
  );
}

function mockSearchGroups(query: string): Group[] {
  const groups: Group[] = [
    { id: 'g1', displayName: 'Project Managers', memberCount: 5, mailEnabled: true, groupType: 'Security' },
    { id: 'g2', displayName: 'External Experts', memberCount: 12, mailEnabled: false, groupType: 'Security' },
    { id: 'g3', displayName: 'Quality Assurance', memberCount: 8, mailEnabled: true, groupType: 'Microsoft365' },
    { id: 'g4', displayName: 'Company Admins', memberCount: 3, mailEnabled: true, groupType: 'Security' },
  ];
  
  return groups.filter(g => 
    g.displayName.toLowerCase().includes(query.toLowerCase())
  );
}

function mockGetAssignments(orderId: string): Assignment[] {
  return [
    {
      id: 'a1',
      principalId: 'u1',
      principalType: 'user',
      displayName: 'John Doe',
      email: 'john.doe@company.com',
      roleType: 'NEU_PM',
      folders: ['Documents', 'Reports'],
      assignedAt: new Date('2025-01-10T10:00:00'),
      assignedBy: 'Admin User',
    },
    {
      id: 'a2',
      principalId: 'g2',
      principalType: 'group',
      displayName: 'External Experts',
      roleType: 'Expert',
      folders: ['Templates'],
      assignedAt: new Date('2025-01-08T14:30:00'),
      assignedBy: 'PM User',
    },
    {
      id: 'a3',
      principalId: 'u4',
      principalType: 'user',
      displayName: 'Alice Brown',
      email: 'alice.brown@external.com',
      roleType: 'Expert',
      folders: ['Documents', 'Archive'],
      assignedAt: new Date('2025-01-12T09:15:00'),
      assignedBy: 'Admin User',
    },
  ];
}