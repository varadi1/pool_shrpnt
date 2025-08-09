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
      setError('Please provide a reason for revocation');
      return;
    }

    if (reason.length > 500) {
      setError('Reason must be 500 characters or less');
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
      setError(err.response?.data?.detail || 'Failed to revoke guest access');
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
            Revoke Guest Access
          </DialogTitle>
          <DialogContent id="revocation-dialog-content" className={styles.content}>
            <div className={styles.warningSection}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Warning20Regular />
                <strong>Warning: This action has immediate effect</strong>
              </div>
              <p className={styles.warningText}>
                Revoking guest access will immediately:
              </p>
              <ul className={styles.warningText}>
                <li>Remove the guest from all Azure AD groups</li>
                <li>Revoke all SharePoint and Teams permissions</li>
                <li>Prevent the guest from accessing any resources</li>
              </ul>
              {isMultiple && (
                <div>
                  <p className={styles.warningText}>
                    You are about to revoke access for {guestList.length} guests:
                  </p>
                  <ul className={styles.guestList}>
                    {guestList.slice(0, 5).map(guest => (
                      <li key={guest.id}>
                        {guest.display_name} ({guest.email})
                      </li>
                    ))}
                    {guestList.length > 5 && (
                      <li>... and {guestList.length - 5} more</li>
                    )}
                  </ul>
                </div>
              )}
              {!isMultiple && guests && (
                <p className={styles.warningText}>
                  Guest: <strong>{guests.display_name}</strong> ({guests.email})
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
                Reason for revocation
              </Label>
              <Textarea
                id="revocation-reason"
                className={styles.reasonField}
                placeholder="Please provide a reason for revoking access (required, max 500 characters)"
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
              Cancel
            </Button>
            <Button
              appearance="primary"
              onClick={handleRevoke}
              disabled={loading || !reason.trim()}
              icon={loading ? <Spinner size="tiny" /> : <DismissCircle20Regular />}
            >
              {loading ? 'Revoking...' : `Revoke Access${isMultiple ? ` (${guestList.length})` : ''}`}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
};