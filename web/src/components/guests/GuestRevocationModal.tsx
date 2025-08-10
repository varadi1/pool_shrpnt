import { useState } from 'react';
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
} from '@fluentui/react-components';
import { Warning20Regular, DismissCircle20Regular } from '@fluentui/react-icons';
import { api } from '@/services/api';

const useStyles = makeStyles({
  content: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  warningSection: {
    padding: '12px',
    backgroundColor: tokens.colorWarningBackground1,
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorWarningBorder1}`,
  },
  warningText: {
    color: tokens.colorNeutralForeground1,
    fontSize: tokens.fontSizeBase300,
  },
  guestList: {
    marginTop: '8px',
    paddingLeft: '20px',
  },
  reasonField: {
    width: '100%',
  },
  loadingContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
});

interface Guest {
  id: string;
  email: string;
  display_name: string;
}

interface GuestRevocationModalProps {
  open: boolean;
  onClose: () => void;
  guests: Guest | Guest[] | null;
  onRevocationComplete: () => void;
}

export const GuestRevocationModal = ({
  open,
  onClose,
  guests,
  onRevocationComplete,
}: GuestRevocationModalProps) => {
  const styles = useStyles();
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isMultiple = Array.isArray(guests);
  const guestList = isMultiple ? guests : guests ? [guests] : [];

  const handleRevoke = async () => {
    if (!reason.trim()) {
      setError('Kérjük, adja meg a visszavonás okát');
      return;
    }

    if (reason.length > 500) {
      setError('Az ok legfeljebb 500 karakter lehet');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      if (isMultiple) {
        // Bulk revocation
        const guestIds = guestList.map(g => g.id);
        await api.post('/api/guests/bulk-revoke', {
          guest_ids: guestIds,
          reason: reason.trim(),
        });
      } else if (guests) {
        // Single revocation
        await api.delete(`/api/guests/${guests.id}`, {
          data: { reason: reason.trim() },
        });
      }

      onRevocationComplete();
      handleClose();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Nem sikerült visszavonni a vendég hozzáférést');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      setReason('');
      setError(null);
      onClose();
    }
  };

  if (!open || !guests) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={(_, data) => !data.open && handleClose()}>
      <DialogSurface aria-describedby="revocation-dialog-content">
        <DialogBody>
          <DialogTitle>
            <DismissCircle20Regular style={{ marginRight: '8px' }} />
            Vendég Hozzáférés Visszavonása
          </DialogTitle>
          <DialogContent id="revocation-dialog-content" className={styles.content}>
            <div className={styles.warningSection}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Warning20Regular />
                <strong>Figyelmeztetés: Ez a művelet azonnali hatású</strong>
              </div>
              <p className={styles.warningText}>
                A vendég hozzáférés visszavonása azonnal:
              </p>
              <ul className={styles.warningText}>
                <li>Eltávolítja a vendéget minden Azure AD csoportból</li>
                <li>Visszavonja az összes SharePoint és Teams engedélyt</li>
                <li>Megakadályozza a vendéget bármely erőforrás elérésében</li>
              </ul>
              {isMultiple && (
                <div>
                  <p className={styles.warningText}>
                    {guestList.length} vendég hozzáférését készül visszavonni:
                  </p>
                  <ul className={styles.guestList}>
                    {guestList.slice(0, 5).map(guest => (
                      <li key={guest.id}>
                        {guest.display_name} ({guest.email})
                      </li>
                    ))}
                    {guestList.length > 5 && (
                      <li>... és még {guestList.length - 5} további</li>
                    )}
                  </ul>
                </div>
              )}
              {!isMultiple && guests && (
                <p className={styles.warningText}>
                  Vendég: <strong>{guests.display_name}</strong> ({guests.email})
                </p>
              )}
            </div>

            {error && (
              <MessageBar intent="error">
                <MessageBarBody>{error}</MessageBarBody>
              </MessageBar>
            )}

            <div>
              <Label htmlFor="revocation-reason" required>
                Visszavonás oka
              </Label>
              <Textarea
                id="revocation-reason"
                className={styles.reasonField}
                placeholder="Kérjük, adja meg a hozzáférés visszavonásának okát (kötelező, maximum 500 karakter)"
                value={reason}
                onChange={(e, data) => setReason(data.value)}
                disabled={loading}
                maxLength={500}
                rows={4}
              />
              <div style={{ textAlign: 'right', marginTop: '4px', fontSize: '12px' }}>
                {reason.length}/500
              </div>
            </div>
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={handleClose} disabled={loading}>
              Mégse
            </Button>
            <Button
              appearance="primary"
              onClick={handleRevoke}
              disabled={loading || !reason.trim()}
              icon={loading ? <Spinner size="tiny" /> : <DismissCircle20Regular />}
            >
              {loading ? 'Visszavonás...' : `Hozzáférés Visszavonása${isMultiple ? ` (${guestList.length})` : ''}`}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
};