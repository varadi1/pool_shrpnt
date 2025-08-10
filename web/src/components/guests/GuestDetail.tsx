import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogSurface,
  DialogTitle,
  DialogBody,
  DialogActions,
  DialogContent,
  Button,
  Badge,
  Spinner,
  MessageBar,
  MessageBarBody,
  makeStyles,
  tokens,
  Text,
  Caption1,
  Divider,
  Title3,
  Body1,
} from '@fluentui/react-components';
import {
  Person20Regular,
  Mail20Regular,
  Building20Regular,
  Calendar20Regular,
  History20Regular,
  CheckmarkCircle20Filled,
  DismissCircle20Regular,
  Info20Regular,
  Shield20Regular,
} from '@fluentui/react-icons';
import { api } from '@/services/api';
import { GuestGroupAssignment } from './GuestGroupAssignment';

const useStyles = makeStyles({
  dialogContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
    minWidth: '600px',
    maxWidth: '800px',
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '8px',
  },
  infoRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '8px 0',
  },
  infoLabel: {
    minWidth: '140px',
    color: tokens.colorNeutralForeground3,
  },
  infoValue: {
    flex: 1,
  },
  statusBadge: {
    minWidth: '100px',
  },
  activityList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    maxHeight: '300px',
    overflowY: 'auto',
    border: `1px solid ${tokens.colorNeutralStroke1}`,
    borderRadius: tokens.borderRadiusMedium,
    padding: '12px',
  },
  activityItem: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px',
    padding: '8px',
    borderRadius: tokens.borderRadiusSmall,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  activityIcon: {
    marginTop: '2px',
  },
  activityContent: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  activityTitle: {
    fontWeight: tokens.fontWeightSemibold,
  },
  activityTime: {
    color: tokens.colorNeutralForeground3,
  },
  groupsList: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
  },
  loading: {
    display: 'flex',
    justifyContent: 'center',
    padding: '24px',
  },
  error: {
    marginBottom: '12px',
  },
  actionButtons: {
    display: 'flex',
    gap: '8px',
  },
});

interface GuestDetailProps {
  guestId: string;
  open: boolean;
  onClose: () => void;
  onUpdate?: () => void;
}

interface GuestDetails {
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
  last_extended_at?: string;
  revoked_at?: string;
  revoked_by?: string;
  revocation_reason?: string;
  azure_ad_id?: string;
  groups?: Array<{ id: string; name: string }>;
  extensions?: Array<{
    id: string;
    extended_by: string;
    extended_at: string;
    previous_expiry_date: string;
    new_expiry_date: string;
    justification: string;
  }>;
  activity?: Array<{
    id: string;
    event_type: string;
    created_at: string;
    metadata?: Record<string, unknown>;
  }>;
}

export const GuestDetail = ({ guestId, open, onClose, onUpdate }: GuestDetailProps) => {
  const styles = useStyles();
  const [guest, setGuest] = useState<GuestDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchGuestDetails = async () => {
    setLoading(true);
    setError(null);
    try {
      const [guestResponse, extensionsResponse] = await Promise.all([
        api.get(`/api/guests/${guestId}`),
        api.get(`/api/guests/${guestId}/extensions`).catch(() => ({ data: { items: [] } }))
      ]);
      
      setGuest({
        ...guestResponse.data,
        extensions: extensionsResponse.data.items || []
      });
    } catch (err: unknown) {
      setError((err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Failed to load guest details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && guestId) {
      fetchGuestDetails();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, guestId]);

  const handleGroupUpdate = () => {
    fetchGuestDetails();
    onUpdate?.();
  };

  const getStatusBadge = (status: GuestDetails['status']) => {
    switch (status) {
      case 'PENDING':
        return (
          <Badge appearance="tint" color="warning" className={styles.statusBadge}>
            Függőben
          </Badge>
        );
      case 'INVITED':
        return (
          <Badge appearance="tint" color="informative" className={styles.statusBadge}>
            Meghívva
          </Badge>
        );
      case 'ACCEPTED':
        return (
          <Badge appearance="tint" color="success" icon={<CheckmarkCircle20Filled />} className={styles.statusBadge}>
            Elfogadva
          </Badge>
        );
      case 'EXPIRED':
        return (
          <Badge appearance="tint" color="subtle" className={styles.statusBadge}>
            Lejárt
          </Badge>
        );
      case 'REVOKED':
        return (
          <Badge appearance="tint" color="danger" className={styles.statusBadge}>
            Visszavonva
          </Badge>
        );
      default:
        return <Badge appearance="tint">Ismeretlen</Badge>;
    }
  };

  const getActivityIcon = (eventType: string) => {
    switch (eventType) {
      case 'GUEST_INVITED':
        return <Mail20Regular className={styles.activityIcon} />;
      case 'GUEST_ACCEPTED':
        return <CheckmarkCircle20Filled className={styles.activityIcon} color={tokens.colorPaletteGreenForeground1} />;
      case 'GUEST_ASSIGNED':
        return <Shield20Regular className={styles.activityIcon} />;
      default:
        return <Info20Regular className={styles.activityIcon} />;
    }
  };

  const formatActivityTitle = (eventType: string, metadata?: Record<string, unknown>) => {
    switch (eventType) {
      case 'GUEST_INVITED':
        return `Meghívó elküldve: ${metadata?.inviter || 'Rendszer'}`;
      case 'GUEST_ACCEPTED':
        return 'Meghívó elfogadva';
      case 'GUEST_ASSIGNED':
        return `Csoporthoz rendelve: ${metadata?.group_name || 'Ismeretlen'}`;
      default:
        return eventType.replace(/_/g, ' ').toLowerCase();
    }
  };

  return (
    <Dialog open={open} onOpenChange={(e, data) => !data.open && onClose()}>
      <DialogSurface>
        <DialogBody>
          <DialogTitle>Vendég Felhasználó Részletei</DialogTitle>
          <DialogContent className={styles.dialogContent}>
            {error && (
              <MessageBar intent="error" className={styles.error}>
                <MessageBarBody>{error}</MessageBarBody>
              </MessageBar>
            )}

            {loading ? (
              <div className={styles.loading}>
                <Spinner size="medium" label="Vendég adatok betöltése..." />
              </div>
            ) : guest ? (
              <>
                <div className={styles.section}>
                  <div className={styles.sectionHeader}>
                    <Person20Regular />
                    <Title3>Alapinformációk</Title3>
                  </div>
                  
                  <div className={styles.infoRow}>
                    <Text className={styles.infoLabel}>Név:</Text>
                    <Body1 className={styles.infoValue}>{guest.display_name}</Body1>
                  </div>
                  
                  <div className={styles.infoRow}>
                    <Text className={styles.infoLabel}>Email Cím:</Text>
                    <Body1 className={styles.infoValue}>
                      <Mail20Regular /> {guest.email}
                    </Body1>
                  </div>
                  
                  <div className={styles.infoRow}>
                    <Text className={styles.infoLabel}>Partner Cég:</Text>
                    <Body1 className={styles.infoValue}>
                      <Building20Regular /> {guest.partner_company_name || guest.partner_company_id}
                    </Body1>
                  </div>
                  
                  <div className={styles.infoRow}>
                    <Text className={styles.infoLabel}>Státusz:</Text>
                    <div className={styles.infoValue}>
                      {getStatusBadge(guest.status)}
                    </div>
                  </div>
                  
                  <div className={styles.infoRow}>
                    <Text className={styles.infoLabel}>Meghívva:</Text>
                    <Body1 className={styles.infoValue}>
                      <Calendar20Regular /> {new Date(guest.invited_at).toLocaleString()}
                    </Body1>
                  </div>
                  
                  {guest.accepted_at && (
                    <div className={styles.infoRow}>
                      <Text className={styles.infoLabel}>Elfogadva:</Text>
                      <Body1 className={styles.infoValue}>
                        <Calendar20Regular /> {new Date(guest.accepted_at).toLocaleString()}
                      </Body1>
                    </div>
                  )}
                  
                  {guest.expires_at && (
                    <div className={styles.infoRow}>
                      <Text className={styles.infoLabel}>Lejár:</Text>
                      <Body1 className={styles.infoValue}>
                        <Calendar20Regular /> {new Date(guest.expires_at).toLocaleString()}
                        {(() => {
                          const now = new Date();
                          const expiryDate = new Date(guest.expires_at);
                          const daysUntilExpiry = Math.floor((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                          
                          if (daysUntilExpiry < 0) {
                            return <Badge appearance="filled" color="danger" size="small" style={{ marginLeft: '8px' }}>Lejárt</Badge>;
                          } else if (daysUntilExpiry <= 7) {
                            return <Badge appearance="filled" color="warning" size="small" style={{ marginLeft: '8px' }}>{daysUntilExpiry} days</Badge>;
                          } else {
                            return <Badge appearance="tint" color="success" size="small" style={{ marginLeft: '8px' }}>{daysUntilExpiry} days</Badge>;
                          }
                        })()}
                      </Body1>
                    </div>
                  )}
                  
                  {guest.revoked_at && (
                    <div className={styles.infoRow}>
                      <Text className={styles.infoLabel}>Visszavonva:</Text>
                      <Body1 className={styles.infoValue}>
                        <DismissCircle20Regular /> {new Date(guest.revoked_at).toLocaleString()}
                        {guest.revoked_by && <Caption1> by {guest.revoked_by}</Caption1>}
                      </Body1>
                    </div>
                  )}
                  
                  {guest.revocation_reason && (
                    <div className={styles.infoRow}>
                      <Text className={styles.infoLabel}>Visszavonás Oka:</Text>
                      <Text className={styles.infoValue}>{guest.revocation_reason}</Text>
                    </div>
                  )}
                  
                  {guest.azure_ad_id && (
                    <div className={styles.infoRow}>
                      <Text className={styles.infoLabel}>Azure AD Azonosító:</Text>
                      <Caption1 className={styles.infoValue}>{guest.azure_ad_id}</Caption1>
                    </div>
                  )}
                </div>

                <Divider />

                {/* Extension History Section */}
                {guest.extensions && guest.extensions.length > 0 && (
                  <>
                    <div className={styles.section}>
                      <div className={styles.sectionHeader}>
                        <Calendar20Regular />
                        <Title3>Meghosszabbítási Előzmények</Title3>
                      </div>
                      
                      <div className={styles.activityList}>
                        {guest.extensions.map((extension) => (
                          <div key={extension.id} className={styles.activityItem}>
                            <CheckmarkCircle20Filled 
                              className={styles.activityIcon}
                              style={{ color: tokens.colorPaletteGreenForeground1 }}
                            />
                            <div className={styles.activityContent}>
                              <Text className={styles.activityTitle}>
                                Meghosszabbítva: {new Date(extension.new_expiry_date).toLocaleDateString()}
                              </Text>
                              <Caption1>
                                {extension.extended_by} által {new Date(extension.extended_at).toLocaleString()}-kor
                              </Caption1>
                              <Text size="200" style={{ marginTop: '4px' }}>
                                Indoklás: {extension.justification}
                              </Text>
                              <Caption1 style={{ color: tokens.colorNeutralForeground3 }}>
                                Korábbi lejárat: {new Date(extension.previous_expiry_date).toLocaleDateString()}
                              </Caption1>
                            </div>
                          </div>
                        ))}
                      </div>
                      
                      {guest.extended_count !== undefined && (
                        <Badge 
                          appearance="filled"
                          color={guest.extended_count === 0 ? 'success' : guest.extended_count >= 2 ? 'warning' : 'informative'}
                        >
                          {guest.extended_count} / 3 meghosszabbítás felhasználva
                        </Badge>
                      )}
                    </div>
                    
                    <Divider />
                  </>
                )}

                <div className={styles.section}>
                  <div className={styles.sectionHeader}>
                    <Shield20Regular />
                    <Title3>Csoport Hozzárendelések</Title3>
                    <GuestGroupAssignment
                      guestId={guest.id}
                      guestName={guest.display_name}
                      currentGroups={guest.groups?.map(g => g.id) || []}
                      onUpdate={handleGroupUpdate}
                    />
                  </div>
                  
                  {guest.groups && guest.groups.length > 0 ? (
                    <div className={styles.groupsList}>
                      {guest.groups.map((group) => (
                        <Badge key={group.id} appearance="tint">
                          {group.name}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <Caption1>Nincs hozzárendelt csoport</Caption1>
                  )}
                </div>

                <Divider />

                <div className={styles.section}>
                  <div className={styles.sectionHeader}>
                    <History20Regular />
                    <Title3>Tevékenységi Előzmények</Title3>
                  </div>
                  
                  {guest.activity && guest.activity.length > 0 ? (
                    <div className={styles.activityList}>
                      {guest.activity.map((activity) => (
                        <div key={activity.id} className={styles.activityItem}>
                          {getActivityIcon(activity.event_type)}
                          <div className={styles.activityContent}>
                            <Text className={styles.activityTitle}>
                              {formatActivityTitle(activity.event_type, activity.metadata)}
                            </Text>
                            <Caption1 className={styles.activityTime}>
                              {new Date(activity.created_at).toLocaleString()}
                            </Caption1>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <Caption1>Nincs rögzített tevékenység</Caption1>
                  )}
                </div>
              </>
            ) : null}
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" icon={<DismissCircle20Regular />} onClick={onClose}>
              Bezárás
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
};