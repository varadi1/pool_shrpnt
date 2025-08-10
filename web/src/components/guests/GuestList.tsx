import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  DataGrid,
  DataGridHeader,
  DataGridHeaderCell,
  DataGridBody,
  DataGridRow,
  DataGridCell,
  TableCellLayout,
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
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [success, setSuccess] = useState<string | null>(null);

  const fetchGuests = async () => {
    try {
      setError(null);
      const response = await api.getGuests({ page, page_size: pageSize });
      setGuests(response.items || []);
      setTotal(response.total ?? response.items?.length ?? 0);
    } catch (err: unknown) {
      setError((err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Nem sikerült betölteni a vendégeket');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchGuests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchGuests();
  };

  const handleResendInvitation = async (guestId: string) => {
    try {
      await api.resendInvitation(guestId);
      setSuccess('Meghívó sikeresen újraküldve');
      await fetchGuests();
    } catch (err: unknown) {
      setError((err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Nem sikerült újraküldeni a meghívót');
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
          Lejárt
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
            Függőben
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
            Meghívva
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
            Elfogadva
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
            Lejárt
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
            Visszavonva
          </Badge>
        );
      default:
        return <Badge appearance="tint">Ismeretlen</Badge>;
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

  const columnIds = ['selection', 'display_name', 'email', 'partner_company', 'status', 'invited_at', 'accepted_at', 'expires_at', 'actions'];
  const columnHeaders = {
    selection: (
      <Checkbox
        checked={selectedGuests.size === filteredGuests.length && filteredGuests.length > 0}
        onChange={toggleSelectAll}
        aria-label="Összes kijelölése"
      />
    ),
    display_name: 'Név',
    email: 'Email Cím',
    partner_company: 'Partner Cég',
    status: 'Státusz',
    invited_at: 'Meghívva',
    accepted_at: 'Elfogadva',
    expires_at: 'Lejárat',
    actions: 'Műveletek'
  };

  const renderCellContent = (guest: Guest, columnId: string) => {
    switch (columnId) {
      case 'selection':
        return (
          <TableCellLayout>
            <Checkbox
              checked={selectedGuests.has(guest.id)}
              onChange={() => toggleGuestSelection(guest.id)}
              aria-label={`${guest.display_name} kijelölése`}
            />
          </TableCellLayout>
        );
      case 'display_name':
        return (
          <TableCellLayout>
            <strong>{guest.display_name}</strong>
          </TableCellLayout>
        );
      case 'email':
        return (
          <TableCellLayout media={<Mail20Regular />}>
            {guest.email}
          </TableCellLayout>
        );
      case 'partner_company':
        return (
          <TableCellLayout media={<Building20Regular />}>
            {guest.partner_company_name || guest.partner_company_id}
          </TableCellLayout>
        );
      case 'status':
        return <TableCellLayout>{getStatusBadge(guest.status)}</TableCellLayout>;
      case 'invited_at':
        return (
          <TableCellLayout media={<Clock20Regular />}>
            <Caption1>
              {new Date(guest.invited_at).toLocaleDateString()}
            </Caption1>
          </TableCellLayout>
        );
      case 'accepted_at':
        return (
          <TableCellLayout>
            {guest.accepted_at ? (
              <Caption1>{new Date(guest.accepted_at).toLocaleDateString()}</Caption1>
            ) : (
              <Caption1>-</Caption1>
            )}
          </TableCellLayout>
        );
      case 'expires_at':
        return (
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
        );
      case 'actions':
        return (
          <TableCellLayout>
            <div className={styles.actionButtons}>
              {guest.status === 'INVITED' && (
                <Button
                  size="small"
                  appearance="subtle"
                  onClick={() => handleResendInvitation(guest.id)}
                >
                  Újraküldés
                </Button>
              )}
              {guest.status === 'ACCEPTED' && guest.expires_at && (
                <>
                  <Button
                    size="small"
                    appearance="subtle"
                    icon={<Calendar20Regular />}
                    onClick={() => handleExtendGuest(guest)}
                    title="Hozzáférés meghosszabbítása"
                  >
                    Meghosszabbítás
                  </Button>
                  <Button
                    size="small"
                    appearance="subtle"
                    icon={<Delete20Regular />}
                    onClick={() => handleRevokeGuest(guest)}
                    title="Hozzáférés visszavonása"
                  >
                    Visszavonás
                  </Button>
                </>
              )}
              <Button
                size="small"
                appearance="subtle"
                onClick={() => onGuestSelect?.(guest)}
              >
                Részletek
              </Button>
            </div>
          </TableCellLayout>
        );
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className={styles.loading}>
        <Spinner size="large" label="Vendégek betöltése..." />
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <Card>
        <CardHeader
          header={<Title3>Vendég Felhasználók</Title3>}
          action={
            <Button
              appearance="primary"
              icon={<PersonAdd20Regular />}
              onClick={onInviteClick}
            >
              Vendég Meghívása
            </Button>
          }
        />

        {error && (
          <MessageBar intent="error" className={styles.error}>
            <MessageBarBody>{error}</MessageBarBody>
          </MessageBar>
        )}

        {success && (
          <MessageBar intent="success" className={styles.error}>
            <MessageBarBody>{success}</MessageBarBody>
          </MessageBar>
        )}

        {selectedGuests.size > 0 ? (
          <Toolbar className={styles.toolbar}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
               <Badge appearance="filled" color="informative">
                 {selectedGuests.size} kijelölve
              </Badge>
              <Button
                appearance="primary"
                icon={<Delete20Regular />}
                 onClick={handleBulkRevoke}
              >
                 Kijelöltek visszavonása ({selectedGuests.size})
              </Button>
              <Button
                appearance="subtle"
                 onClick={() => setSelectedGuests(new Set())}
              >
                 Kijelölés törlése
              </Button>
            </div>
          </Toolbar>
        ) : (
          <Toolbar className={styles.toolbar}>
            <div className={styles.searchBar}>
              <Input
                contentBefore={<Search20Regular />}
                placeholder="Keresés név, email vagy cég alapján..."
                value={searchTerm}
                onChange={(e, data) => setSearchTerm(data.value)}
                aria-label="Vendégek keresése"
              />
              <Select
                value={statusFilter}
                onChange={(e, data) => setStatusFilter(data.value)}
                aria-label="Szűrés státusz szerint"
              >
                <option value="all">Minden Státusz</option>
                <option value="PENDING">Függőben</option>
                <option value="INVITED">Meghívva</option>
                <option value="ACCEPTED">Elfogadva</option>
                <option value="EXPIRED">Lejárt</option>
                <option value="REVOKED">Visszavonva</option>
              </Select>
            </div>
            <ToolbarDivider />
            <ToolbarButton
              icon={<ArrowSync20Regular />}
              onClick={handleRefresh}
              disabled={refreshing}
            >
              {refreshing ? 'Frissítés...' : 'Frissítés'}
            </ToolbarButton>
          </Toolbar>
        )}

        {filteredGuests.length === 0 ? (
          <div className={styles.emptyState}>
            {searchTerm || statusFilter !== 'all' ? (
              <>
                <Warning20Filled style={{ fontSize: '48px', marginBottom: '16px' }} />
                <p>Nem található vendég a szűrési feltételeknek megfelelően.</p>
                <Button
                  appearance="subtle"
                  onClick={() => {
                    setSearchTerm('');
                    setStatusFilter('all');
                  }}
                >
                  Szűrők törlése
                </Button>
              </>
            ) : (
              <>
                <PersonAdd20Regular style={{ fontSize: '48px', marginBottom: '16px' }} />
                <p>Még nem lett vendég felhasználó meghívva.</p>
                <Button appearance="primary" onClick={onInviteClick}>
                  Első Vendég Meghívása
                </Button>
              </>
            )}
          </div>
        ) : (
          <>
            <DataGrid
              items={filteredGuests}
              sortable
              getRowId={(item) => item.id}
              resizableColumns
            >
              <DataGridHeader>
                <DataGridRow>
                  {columnIds.map((columnId) => (
                    <DataGridHeaderCell key={columnId}>
                      {columnHeaders[columnId as keyof typeof columnHeaders]}
                    </DataGridHeaderCell>
                  ))}
                </DataGridRow>
              </DataGridHeader>
              <DataGridBody>
                {filteredGuests.map((guest) => (
                  <DataGridRow key={guest.id}>
                    {columnIds.map((columnId) => (
                      <DataGridCell key={columnId}>
                        {renderCellContent(guest, columnId)}
                      </DataGridCell>
                    ))}
                  </DataGridRow>
                ))}
              </DataGridBody>
            </DataGrid>

            {/* Simple pagination controls for testing */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12 }}>
              <div>Oldal {page} / {Math.max(1, Math.ceil(total / pageSize))}</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                >
                  Előző
                </Button>
                <Button
                  onClick={() => setPage((p) => p + 1)}
                  disabled={page >= Math.max(1, Math.ceil(total / pageSize))}
                  aria-label="Következő"
                >
                  Következő
                </Button>
              </div>
            </div>
          </>
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