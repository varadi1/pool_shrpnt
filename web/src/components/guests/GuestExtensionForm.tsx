import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogSurface,
  DialogTitle,
  DialogBody,
  DialogActions,
  DialogContent,
  Button,
  Textarea,
  makeStyles,
  tokens,
  MessageBar,
  MessageBarBody,
  Spinner,
  Label,
  Badge,
  Text,
} from '@fluentui/react-components';
import { DatePicker } from '@fluentui/react-datepicker-compat';
import { Calendar20Regular, CheckmarkCircle20Regular } from '@fluentui/react-icons';
import { api } from '@/services/api';

const useStyles = makeStyles({
  content: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  currentInfo: {
    padding: '12px',
    backgroundColor: tokens.colorNeutralBackground3,
    borderRadius: tokens.borderRadiusMedium,
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  infoRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  justificationField: {
    width: '100%',
  },
  datePickerContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  extensionHistory: {
    marginTop: '8px',
    padding: '8px',
    backgroundColor: tokens.colorNeutralBackground2,
    borderRadius: tokens.borderRadiusSmall,
  },
  historyItem: {
    fontSize: tokens.fontSizeBase200,
    padding: '4px 0',
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
});

interface Guest {
  id: string;
  email: string;
  display_name: string;
  expires_at?: string;
  extended_count?: number;
  last_extended_at?: string;
}

interface Extension {
  id: string;
  extended_by: string;
  extended_at: string;
  new_expiry_date: string;
  justification: string;
}

interface GuestExtensionFormProps {
  open: boolean;
  onClose: () => void;
  guest: Guest;
  onExtensionComplete: () => void;
}

export const GuestExtensionForm = ({
  open,
  onClose,
  guest,
  onExtensionComplete,
}: GuestExtensionFormProps) => {
  const styles = useStyles();
  const [newExpiryDate, setNewExpiryDate] = useState<Date | null>(null);
  const [justification, setJustification] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [extensions, setExtensions] = useState<Extension[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    if (open && guest) {
      // Set default new expiry date (current + 90 days or from current expiry)
      const baseDate = guest.expires_at ? new Date(guest.expires_at) : new Date();
      const defaultNewDate = new Date(baseDate);
      defaultNewDate.setDate(defaultNewDate.getDate() + 90);
      setNewExpiryDate(defaultNewDate);

      // Load extension history
      loadExtensionHistory();
    }
  }, [open, guest]);

  const loadExtensionHistory = async () => {
    if (!guest) return;
    
    setLoadingHistory(true);
    try {
      const response = await api.get(`/api/guests/${guest.id}/extensions`);
      setExtensions(response.data.items || []);
    } catch (err) {
      console.error('Failed to load extension history:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleExtend = async () => {
    if (!justification.trim()) {
      setError('Kérjük, adja meg a meghosszabbítás indoklását');
      return;
    }

    if (justification.length > 1000) {
      setError('Az indoklás legfeljebb 1000 karakter lehet');
      return;
    }

    if (!newExpiryDate) {
      setError('Kérjük, válasszon egy új lejárati dátumot');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await api.post(`/api/guests/${guest.id}/extend`, {
        new_expiry_date: newExpiryDate.toISOString(),
        justification: justification.trim(),
      });

      onExtensionComplete();
      handleClose();
    } catch (err: any) {
      if (err.response?.data?.detail?.includes('maximum extensions')) {
        setError('Ez a vendég elérte az engedélyezett meghosszabbítások maximális számát');
      } else {
        setError(err.response?.data?.detail || 'Nem sikerült meghosszabbítani a vendég hozzáférést');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      setJustification('');
      setNewExpiryDate(null);
      setError(null);
      setExtensions([]);
      onClose();
    }
  };

  if (!open || !guest) {
    return null;
  }

  const currentExpiry = guest.expires_at ? new Date(guest.expires_at) : null;
  const minDate = new Date();
  minDate.setDate(minDate.getDate() + 1);
  const maxDate = new Date();
  maxDate.setDate(maxDate.getDate() + 180);

  return (
    <Dialog open={open} onOpenChange={(_, data) => !data.open && handleClose()}>
      <DialogSurface aria-describedby="extension-dialog-content">
        <DialogBody>
          <DialogTitle>
            <Calendar20Regular style={{ marginRight: '8px' }} />
            Vendég Hozzáférés Meghosszabbítása
          </DialogTitle>
          <DialogContent id="extension-dialog-content" className={styles.content}>
            <div className={styles.currentInfo}>
              <Text weight="semibold">Jelenlegi Vendég Információk</Text>
              <div className={styles.infoRow}>
                <Text>Vendég:</Text>
                <Text weight="semibold">{guest.display_name} ({guest.email})</Text>
              </div>
              <div className={styles.infoRow}>
                <Text>Jelenlegi Lejárat:</Text>
                <Text weight="semibold">
                  {currentExpiry ? currentExpiry.toLocaleDateString() : 'Nincs beállítva'}
                </Text>
              </div>
              <div className={styles.infoRow}>
                <Text>Meghosszabbítások Száma:</Text>
                <Badge
                  appearance="filled"
                  color={guest.extended_count === 0 ? 'success' : guest.extended_count >= 2 ? 'warning' : 'informative'}
                >
                  {guest.extended_count || 0} / 3
                </Badge>
              </div>
              {guest.last_extended_at && (
                <div className={styles.infoRow}>
                  <Text>Utoljára Meghosszabbítva:</Text>
                  <Text>{new Date(guest.last_extended_at).toLocaleDateString()}</Text>
                </div>
              )}
            </div>

            {error && (
              <MessageBar intent="error">
                <MessageBarBody>{error}</MessageBarBody>
              </MessageBar>
            )}

            <div className={styles.datePickerContainer}>
              <Label htmlFor="new-expiry-date" required>
                Új Lejárati Dátum
              </Label>
              <DatePicker
                id="new-expiry-date"
                placeholder="Válasszon új lejárati dátumot"
                value={newExpiryDate}
                onSelectDate={setNewExpiryDate}
                minDate={minDate}
                maxDate={maxDate}
                disabled={loading}
                formatDate={(date) => date?.toLocaleDateString() || ''}
              />
              <Text size="200">
                Min: {minDate.toLocaleDateString()} | Max: {maxDate.toLocaleDateString()}
              </Text>
            </div>

            <div>
              <Label htmlFor="extension-justification" required>
                Meghosszabbítás Indoklása
              </Label>
              <Textarea
                id="extension-justification"
                className={styles.justificationField}
                placeholder="Kérjük, adja meg a hozzáférés meghosszabbításának indoklását (kötelező, maximum 1000 karakter)"
                value={justification}
                onChange={(e, data) => setJustification(data.value)}
                disabled={loading}
                maxLength={1000}
                rows={4}
              />
              <div style={{ textAlign: 'right', marginTop: '4px', fontSize: '12px' }}>
                {justification.length}/1000
              </div>
            </div>

            {extensions.length > 0 && (
              <div>
                <Text weight="semibold">Meghosszabbítási Előzmények</Text>
                <div className={styles.extensionHistory}>
                  {loadingHistory ? (
                    <Spinner size="tiny" label="Előzmények betöltése..." />
                  ) : (
                    extensions.slice(0, 3).map((ext) => (
                      <div key={ext.id} className={styles.historyItem}>
                        <Text size="200">
                          Meghosszabbítva: {new Date(ext.new_expiry_date).toLocaleDateString()} - {ext.extended_by}
                        </Text>
                        <br />
                        <Text size="100" style={{ color: tokens.colorNeutralForeground3 }}>
                          {ext.justification}
                        </Text>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={handleClose} disabled={loading}>
              Mégse
            </Button>
            <Button
              appearance="primary"
              onClick={handleExtend}
              disabled={loading || !justification.trim() || !newExpiryDate}
              icon={loading ? <Spinner size="tiny" /> : <CheckmarkCircle20Regular />}
            >
              {loading ? 'Meghosszabbítás...' : 'Hozzáférés Meghosszabbítása'}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
};