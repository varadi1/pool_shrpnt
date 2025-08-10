import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTrigger,
  DialogSurface,
  DialogTitle,
  DialogBody,
  DialogActions,
  DialogContent,
  Button,
  Checkbox,
  Spinner,
  MessageBar,
  MessageBarBody,
  makeStyles,
  tokens,
  Label,
  Text,
  Caption1,
} from '@fluentui/react-components';
import {
  PeopleTeam20Regular,
  Shield20Regular,
  Save20Regular,
  Dismiss20Regular,
} from '@fluentui/react-icons';
import { api } from '@/services/api';

const useStyles = makeStyles({
  dialogContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    minWidth: '500px',
  },
  groupList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    maxHeight: '400px',
    overflowY: 'auto',
    border: `1px solid ${tokens.colorNeutralStroke1}`,
    borderRadius: tokens.borderRadiusMedium,
    padding: '12px',
  },
  groupItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px',
    borderRadius: tokens.borderRadiusSmall,
    ':hover': {
      backgroundColor: tokens.colorNeutralBackground1Hover,
    },
  },
  groupInfo: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
  },
  groupName: {
    fontWeight: tokens.fontWeightSemibold,
  },
  groupDescription: {
    color: tokens.colorNeutralForeground3,
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginTop: '8px',
    marginBottom: '4px',
    fontWeight: tokens.fontWeightSemibold,
  },
  loading: {
    display: 'flex',
    justifyContent: 'center',
    padding: '24px',
  },
  error: {
    marginBottom: '12px',
  },
  success: {
    marginBottom: '12px',
  },
});

interface Group {
  id: string;
  name: string;
  description?: string;
  type: 'partner' | 'project' | 'system';
}

interface GuestGroupAssignmentProps {
  guestId: string;
  guestName: string;
  currentGroups?: string[];
  onUpdate?: () => void;
}

export const GuestGroupAssignment = ({
  guestId,
  guestName,
  currentGroups = [],
  onUpdate,
}: GuestGroupAssignmentProps) => {
  const styles = useStyles();
  const [open, setOpen] = useState(false);
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set(currentGroups));
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const fetchAvailableGroups = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get('/api/groups');
      const availableGroups: Group[] = response.data.items || [];
      
      const categorizedGroups = availableGroups.map((group) => {
        let type: Group['type'] = 'system';
        if (group.name.includes('partner_')) {
          type = 'partner';
        } else if (group.name.includes('project_')) {
          type = 'project';
        }
        return { ...group, type };
      });
      
      setGroups(categorizedGroups);
    } catch (_err: unknown) {
      setError('Nem sikerült betölteni az elérhető csoportokat');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      fetchAvailableGroups();
      setSelectedGroups(new Set(currentGroups));
      setSuccess(null);
      setError(null);
    }
  }, [open, currentGroups]);

  const handleGroupToggle = (groupId: string) => {
    const newSelection = new Set(selectedGroups);
    if (newSelection.has(groupId)) {
      newSelection.delete(groupId);
    } else {
      newSelection.add(groupId);
    }
    setSelectedGroups(newSelection);
    setError(null);
    setSuccess(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      await api.patch(`/api/guests/${guestId}/groups`, {
        group_ids: Array.from(selectedGroups),
      });
      
      setSuccess('Csoport hozzárendelések sikeresen frissítve');
      
      setTimeout(() => {
        setOpen(false);
        onUpdate?.();
      }, 1500);
    } catch (err: unknown) {
      setError((err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Nem sikerült frissíteni a csoport hozzárendeléseket');
    } finally {
      setSaving(false);
    }
  };

  const groupsByType = groups.reduce((acc, group) => {
    if (!acc[group.type]) {
      acc[group.type] = [];
    }
    acc[group.type].push(group);
    return acc;
  }, {} as Record<Group['type'], Group[]>);

  const getSectionIcon = (type: Group['type']) => {
    switch (type) {
      case 'partner':
        return <PeopleTeam20Regular />;
      case 'project':
        return <Shield20Regular />;
      default:
        return <Shield20Regular />;
    }
  };

  const getSectionTitle = (type: Group['type']) => {
    switch (type) {
      case 'partner':
        return 'Partner Csoportok';
      case 'project':
        return 'Projekt Csoportok';
      default:
        return 'Rendszer Csoportok';
    }
  };

  return (
    <Dialog open={open} onOpenChange={(e, data) => setOpen(data.open)}>
      <DialogTrigger disableButtonEnhancement>
        <Button icon={<PeopleTeam20Regular />} appearance="subtle">
          Csoportok Kezelése
        </Button>
      </DialogTrigger>
      <DialogSurface>
        <DialogBody>
          <DialogTitle>Csoport Hozzárendelések Kezelése</DialogTitle>
          <DialogContent className={styles.dialogContent}>
            <Text>
              Válassza ki a csoportokat, amelyekhez <strong>{guestName}</strong> hozzá legyen rendelve:
            </Text>

            {error && (
              <MessageBar intent="error" className={styles.error}>
                <MessageBarBody>{error}</MessageBarBody>
              </MessageBar>
            )}

            {success && (
              <MessageBar intent="success" className={styles.success}>
                <MessageBarBody>{success}</MessageBarBody>
              </MessageBar>
            )}

            {loading ? (
              <div className={styles.loading}>
                <Spinner size="medium" label="Csoportok betöltése..." />
              </div>
            ) : (
              <div className={styles.groupList}>
                {Object.entries(groupsByType).map(([type, typeGroups]) => (
                  <div key={type}>
                    <div className={styles.sectionHeader}>
                      {getSectionIcon(type as Group['type'])}
                      <Label>{getSectionTitle(type as Group['type'])}</Label>
                    </div>
                    {typeGroups.map((group) => (
                      <div key={group.id} className={styles.groupItem}>
                        <Checkbox
                          checked={selectedGroups.has(group.id)}
                          onChange={() => handleGroupToggle(group.id)}
                          disabled={saving}
                        />
                        <div className={styles.groupInfo}>
                          <span className={styles.groupName}>{group.name}</span>
                          {group.description && (
                            <Caption1 className={styles.groupDescription}>
                              {group.description}
                            </Caption1>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}

            <Caption1>
              Kijelölve: {selectedGroups.size} csoport
            </Caption1>
          </DialogContent>
          <DialogActions>
            <DialogTrigger disableButtonEnhancement>
              <Button appearance="secondary" icon={<Dismiss20Regular />} disabled={saving}>
                Mégse
              </Button>
            </DialogTrigger>
            <Button
              appearance="primary"
              icon={saving ? <Spinner size="tiny" /> : <Save20Regular />}
              onClick={handleSave}
              disabled={saving || loading}
            >
              {saving ? 'Mentés...' : 'Változtatások mentése'}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
};