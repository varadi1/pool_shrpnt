import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  DataGrid,
  DataGridHeader,
  DataGridHeaderCell,
  DataGridBody,
  DataGridRow,
  DataGridCell,
  TableCellLayout,
  TableColumnDefinition,
  createTableColumn,
  Button,
  Badge,
  Input,
  Select,
  Spinner,
  MessageBar,
  MessageBarBody,
  makeStyles,
  tokens,
  Card,
  CardHeader,
  Title3,
  Caption1,
  Toolbar,
  ToolbarButton,
  ToolbarDivider,
  Checkbox,
  Dialog,
  DialogTrigger,
  DialogSurface,
  DialogTitle,
  DialogBody,
  DialogActions,
  DialogContent,
} from '@fluentui/react-components';
import {
  Search20Regular,
  ArrowSync20Regular,
  PersonAdd20Regular,
  Mail20Regular,
  Building20Regular,
  Clock20Regular,
  CheckmarkCircle20Filled,
  DismissCircle20Filled,
  Warning20Filled,
  Clock20Filled,
  Delete20Regular,
  Calendar20Regular,
  CheckboxChecked20Regular,
  CheckboxUnchecked20Regular,
} from '@fluentui/react-icons';
import { api } from '@/services/api';
import { GuestRevocationModal } from './GuestRevocationModal';
import { GuestExtensionForm } from './GuestExtensionForm';

const useStyles = makeStyles({
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    height: '100%',
  },
  toolbar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 0',
  },
  searchBar: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
    flex: 1,
    maxWidth: '500px',
  },
  statusBadge: {
    minWidth: '100px',
  },
  actionButtons: {
    display: 'flex',
    gap: '4px',
  },
  loading: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    padding: '48px',
  },
  error: {
    marginBottom: '16px',
  },
  emptyState: {
    textAlign: 'center',
    padding: '48px',
    color: tokens.colorNeutralForeground3,
  },
});

interface Guest {
  id: string;
  email: string;
  display_name: string;
  partner_company_id: string;
  partner_company_name?: string;
  status: 'PENDING' | 'INVITED' | 'ACCEPTED' | 'EXPIRED' | 'REVOKED' | 'PURGED';
  invited_at: string;
  accepted_at?: string;
  expires_at?: string;
  extended_count?: number;
  revoked_at?: string;
  revoked_by?: string;
  revocation_reason?: string;
  azure_ad_id?: string;
  groups?: string[];
}

interface GuestListProps {
  onInviteClick?: () => void;
  onGuestSelect?: (guest: Guest) => void;
}

export const GuestList = ({ onInviteClick, onGuestSelect }: GuestListProps) => {
  const styles = useStyles();
  const [guests, setGuests] = useState<Guest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [refreshing, setRefreshing] = useState(false);
  const [selectedGuests, setSelectedGuests] = useState<Set<string>>(new Set());
  const [revocationModalOpen, setRevocationModalOpen] = useState(false);
  const [revocationTarget, setRevocationTarget] = useState<Guest | Guest[] | null>(null);
  const [extensionTarget, setExtensionTarget] = useState<Guest | null>(null);

  const fetchGuests = async () => {
    try {
      setError(null);
      const response = await api.get('/api/guests');
      setGuests(response.data.items || []);
    } catch (err: unknown) {
      setError((err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Failed to load guests');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchGuests();
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchGuests();
  };

  const handleResendInvitation = async (guestId: string) => {
    try {
      await api.post(`/api/guests/${guestId}/resend`);
      await fetchGuests();
    } catch (err: unknown) {
      setError((err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Failed to resend invitation');
    }
  };

  const handleRevokeGuest = (guest: Guest) => {
    setRevocationTarget(guest);
    setRevocationModalOpen(true);
  };

  const handleBulkRevoke = () => {
    const guestsToRevoke = guests.filter(g => selectedGuests.has(g.id));
    setRevocationTarget(guestsToRevoke);
    setRevocationModalOpen(true);
  };

  const handleExtendGuest = (guest: Guest) => {
    setExtensionTarget(guest);
    // Extension form will be opened in a separate modal/component
  };

  const toggleGuestSelection = (guestId: string) => {
    const newSelection = new Set(selectedGuests);
    if (newSelection.has(guestId)) {
      newSelection.delete(guestId);
    } else {
      newSelection.add(guestId);
    }
    setSelectedGuests(newSelection);
  };

  const toggleSelectAll = () => {
    if (selectedGuests.size === filteredGuests.length) {
      setSelectedGuests(new Set());
    } else {
      setSelectedGuests(new Set(filteredGuests.map(g => g.id)));
    }
  };

  const getExpiryBadge = (guest: Guest) => {
    if (!guest.expires_at || guest.status === 'REVOKED' || guest.status === 'EXPIRED') {
      return null;
    }

    const now = new Date();
    const expiryDate = new Date(guest.expires_at);
    const daysUntilExpiry = Math.floor((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (daysUntilExpiry < 0) {
      return (
        <Badge appearance="filled" color="danger" size="small">
          Expired
        </Badge>
      );
    } else if (daysUntilExpiry <= 7) {
      return (
        <Badge appearance="filled" color="warning" size="small">
          {daysUntilExpiry} days
        </Badge>
      );
    } else if (daysUntilExpiry <= 30) {
      return (
        <Badge appearance="tint" color="informative" size="small">
          {daysUntilExpiry} days
        </Badge>
      );
    } else {
      return (
        <Badge appearance="tint" color="success" size="small">
          {daysUntilExpiry} days
        </Badge>
      );
    }
  };

  const getStatusBadge = (status: Guest['status']) => {
    switch (status) {
      case 'PENDING':
        return (
          <Badge
            appearance="tint"
            color="warning"
            icon={<Clock20Filled />}
            className={styles.statusBadge}
          >
            Pending
          </Badge>
        );
      case 'INVITED':
        return (
          <Badge
            appearance="tint"
            color="informative"
            icon={<Mail20Regular />}
            className={styles.statusBadge}
          >
            Invited
          </Badge>
        );
      case 'ACCEPTED':
        return (
          <Badge
            appearance="tint"
            color="success"
            icon={<CheckmarkCircle20Filled />}
            className={styles.statusBadge}
          >
            Accepted
          </Badge>
        );
      case 'EXPIRED':
        return (
          <Badge
            appearance="tint"
            color="subtle"
            icon={<Warning20Filled />}
            className={styles.statusBadge}
          >
            Expired
          </Badge>
        );
      case 'REVOKED':
        return (
          <Badge
            appearance="tint"
            color="danger"
            icon={<DismissCircle20Filled />}
            className={styles.statusBadge}
          >
            Revoked
          </Badge>
        );
      default:
        return <Badge appearance="tint">Unknown</Badge>;
    }
  };

  const filteredGuests = useMemo(() => {
    return guests.filter((guest) => {
      const matchesSearch =
        searchTerm === '' ||
        guest.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        guest.display_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        guest.partner_company_name?.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesStatus = statusFilter === 'all' || guest.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [guests, searchTerm, statusFilter]);

  const columns: TableColumnDefinition<Guest>[] = [
    createTableColumn<Guest>({
      columnId: 'selection',
      renderHeaderCell: () => (
        <Checkbox
          checked={selectedGuests.size === filteredGuests.length && filteredGuests.length > 0}
          onChange={toggleSelectAll}
          aria-label="Select all"
        />
      ),
      renderCell: (guest) => (
        <TableCellLayout>
          <Checkbox
            checked={selectedGuests.has(guest.id)}
            onChange={() => toggleGuestSelection(guest.id)}
            aria-label={`Select ${guest.display_name}`}
          />
        </TableCellLayout>
      ),
    }),
    createTableColumn<Guest>({
      columnId: 'display_name',
      renderHeaderCell: () => 'Name',
      renderCell: (guest) => (
        <TableCellLayout>
          <strong>{guest.display_name}</strong>
        </TableCellLayout>
      ),
      compare: (a, b) => a.display_name.localeCompare(b.display_name),
    }),
    createTableColumn<Guest>({
      columnId: 'email',
      renderHeaderCell: () => 'Email',
      renderCell: (guest) => (
        <TableCellLayout media={<Mail20Regular />}>
          {guest.email}
        </TableCellLayout>
      ),
      compare: (a, b) => a.email.localeCompare(b.email),
    }),
    createTableColumn<Guest>({
      columnId: 'partner_company',
      renderHeaderCell: () => 'Partner Company',
      renderCell: (guest) => (
        <TableCellLayout media={<Building20Regular />}>
          {guest.partner_company_name || guest.partner_company_id}
        </TableCellLayout>
      ),
    }),
    createTableColumn<Guest>({
      columnId: 'status',
      renderHeaderCell: () => 'Status',
      renderCell: (guest) => (
        <TableCellLayout>{getStatusBadge(guest.status)}</TableCellLayout>
      ),
    }),
    createTableColumn<Guest>({
      columnId: 'invited_at',
      renderHeaderCell: () => 'Invited',
      renderCell: (guest) => (
        <TableCellLayout media={<Clock20Regular />}>
          <Caption1>
            {new Date(guest.invited_at).toLocaleDateString()}
          </Caption1>
        </TableCellLayout>
      ),
      compare: (a, b) => new Date(a.invited_at).getTime() - new Date(b.invited_at).getTime(),
    }),
    createTableColumn<Guest>({
      columnId: 'accepted_at',
      renderHeaderCell: () => 'Accepted',
      renderCell: (guest) => (
        <TableCellLayout>
          {guest.accepted_at ? (
            <Caption1>{new Date(guest.accepted_at).toLocaleDateString()}</Caption1>
          ) : (
            <Caption1>-</Caption1>
          )}
        </TableCellLayout>
      ),
    }),
    createTableColumn<Guest>({
      columnId: 'expires_at',
      renderHeaderCell: () => 'Expiry',
      renderCell: (guest) => (
        <TableCellLayout>
          {guest.expires_at ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Caption1>{new Date(guest.expires_at).toLocaleDateString()}</Caption1>
              {getExpiryBadge(guest)}
            </div>
          ) : (
            <Caption1>-</Caption1>
          )}
        </TableCellLayout>
      ),
    }),
    createTableColumn<Guest>({
      columnId: 'actions',
      renderHeaderCell: () => 'Actions',
      renderCell: (guest) => (
        <TableCellLayout>
          <div className={styles.actionButtons}>
            {guest.status === 'INVITED' && (
              <Button
                size="small"
                appearance="subtle"
                onClick={() => handleResendInvitation(guest.id)}
              >
                Resend
              </Button>
            )}
            {guest.status === 'ACCEPTED' && guest.expires_at && (
              <>
                <Button
                  size="small"
                  appearance="subtle"
                  icon={<Calendar20Regular />}
                  onClick={() => handleExtendGuest(guest)}
                  title="Extend access"
                >
                  Extend
                </Button>
                <Button
                  size="small"
                  appearance="subtle"
                  icon={<Delete20Regular />}
                  onClick={() => handleRevokeGuest(guest)}
                  title="Revoke access"
                >
                  Revoke
                </Button>
              </>
            )}
            <Button
              size="small"
              appearance="subtle"
              onClick={() => onGuestSelect?.(guest)}
            >
              View
            </Button>
          </div>
        </TableCellLayout>
      ),
    }),
  ];

  if (loading) {
    return (
      <div className={styles.loading}>
        <Spinner size="large" label="Loading guests..." />
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <Card>
        <CardHeader
          header={<Title3>Guest Users</Title3>}
          action={
            <Button
              appearance="primary"
              icon={<PersonAdd20Regular />}
              onClick={onInviteClick}
            >
              Invite Guest
            </Button>
          }
        />

        {error && (
          <MessageBar intent="error" className={styles.error}>
            <MessageBarBody>{error}</MessageBarBody>
          </MessageBar>
        )}

        {selectedGuests.size > 0 ? (
          <Toolbar className={styles.toolbar}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <Badge appearance="filled" color="informative">
                {selectedGuests.size} selected
              </Badge>
              <Button
                appearance="primary"
                icon={<Delete20Regular />}
                onClick={handleBulkRevoke}
              >
                Revoke Selected ({selectedGuests.size})
              </Button>
              <Button
                appearance="subtle"
                onClick={() => setSelectedGuests(new Set())}
              >
                Clear Selection
              </Button>
            </div>
          </Toolbar>
        ) : (
          <Toolbar className={styles.toolbar}>
            <div className={styles.searchBar}>
              <Input
                contentBefore={<Search20Regular />}
                placeholder="Search by name, email, or company..."
                value={searchTerm}
                onChange={(e, data) => setSearchTerm(data.value)}
                aria-label="Search guests"
              />
              <Select
                value={statusFilter}
                onChange={(e, data) => setStatusFilter(data.value)}
                aria-label="Filter by status"
              >
                <option value="all">All Status</option>
                <option value="PENDING">Pending</option>
                <option value="INVITED">Invited</option>
                <option value="ACCEPTED">Accepted</option>
                <option value="EXPIRED">Expired</option>
                <option value="REVOKED">Revoked</option>
              </Select>
            </div>
            <ToolbarDivider />
            <ToolbarButton
              icon={<ArrowSync20Regular />}
              onClick={handleRefresh}
              disabled={refreshing}
            >
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </ToolbarButton>
          </Toolbar>
        )}

        {filteredGuests.length === 0 ? (
          <div className={styles.emptyState}>
            {searchTerm || statusFilter !== 'all' ? (
              <>
                <Warning20Filled style={{ fontSize: '48px', marginBottom: '16px' }} />
                <p>No guests found matching your filters.</p>
                <Button
                  appearance="subtle"
                  onClick={() => {
                    setSearchTerm('');
                    setStatusFilter('all');
                  }}
                >
                  Clear Filters
                </Button>
              </>
            ) : (
              <>
                <PersonAdd20Regular style={{ fontSize: '48px', marginBottom: '16px' }} />
                <p>No guest users have been invited yet.</p>
                <Button appearance="primary" onClick={onInviteClick}>
                  Invite First Guest
                </Button>
              </>
            )}
          </div>
        ) : (
          <DataGrid
            items={filteredGuests}
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
            <DataGridBody<Guest>>
              {({ item, rowId }) => (
                <DataGridRow<Guest> key={rowId}>
                  {({ renderCell }) => (
                    <DataGridCell>{renderCell(item)}</DataGridCell>
                  )}
                </DataGridRow>
              )}
            </DataGridBody>
          </DataGrid>
        )}
      </Card>
      
      <GuestRevocationModal
        open={revocationModalOpen}
        onClose={() => {
          setRevocationModalOpen(false);
          setRevocationTarget(null);
        }}
        guests={revocationTarget}
        onRevocationComplete={() => {
          fetchGuests();
          setSelectedGuests(new Set());
        }}
      />
      
      {extensionTarget && (
        <GuestExtensionForm
          open={!!extensionTarget}
          onClose={() => setExtensionTarget(null)}
          guest={extensionTarget}
          onExtensionComplete={() => {
            fetchGuests();
            setExtensionTarget(null);
          }}
        />
      )}
    </div>
  );
};