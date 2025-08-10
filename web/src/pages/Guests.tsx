import { useState } from 'react';
import { Title1, makeStyles, Button, Dialog, DialogTrigger, DialogSurface, DialogBody, DialogTitle, DialogContent, DialogActions } from '@fluentui/react-components';
import { PersonAdd24Regular, Dismiss24Regular } from '@fluentui/react-icons';
import { GuestList } from '@/components/guests/GuestList';
import { GuestInviteForm } from '@/components/guests/GuestInviteForm';
import { GuestDetail } from '@/components/guests/GuestDetail';

const useStyles = makeStyles({
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
    height: '100%',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px',
  },
  content: {
    flex: 1,
    overflow: 'hidden',
  },
});

interface Guest {
  id: string;
  email: string;
  display_name: string;
  partner_company_id: string;
  partner_company_name?: string;
  status: string;
  invited_at: string;
  accepted_at?: string;
  groups?: string[];
}

export const Guests = () => {
  const styles = useStyles();
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [selectedGuest, setSelectedGuest] = useState<Guest | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleInviteSuccess = () => {
    setInviteDialogOpen(false);
    setRefreshKey(prev => prev + 1); // Trigger list refresh
  };

  const handleGuestSelect = (guest: Guest) => {
    setSelectedGuest(guest);
    setDetailDialogOpen(true);
  };

  const handleDetailClose = () => {
    setDetailDialogOpen(false);
    setSelectedGuest(null);
    setRefreshKey(prev => prev + 1); // Refresh list in case of changes
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <Title1 as="h1">Vendég Kezelés</Title1>
        <Dialog
          open={inviteDialogOpen}
          onOpenChange={(event, data) => setInviteDialogOpen(data.open)}
        >
          <DialogTrigger disableButtonEnhancement>
            <Button appearance="primary" icon={<PersonAdd24Regular />}>
              Új Vendég Meghívása
            </Button>
          </DialogTrigger>
          <DialogSurface style={{ maxWidth: '600px', width: '90vw' }}>
            <DialogBody>
              <DialogTitle
                action={
                  <DialogTrigger action="close">
                    <Button
                      appearance="subtle"
                      aria-label="Bezárás"
                      icon={<Dismiss24Regular />}
                    />
                  </DialogTrigger>
                }
              >
                Vendég Felhasználó Meghívása
              </DialogTitle>
              <DialogContent>
                <GuestInviteForm
                  onSuccess={handleInviteSuccess}
                  onCancel={() => setInviteDialogOpen(false)}
                />
              </DialogContent>
            </DialogBody>
          </DialogSurface>
        </Dialog>
      </div>

      <div className={styles.content}>
        <GuestList
          key={refreshKey}
          onInviteClick={() => setInviteDialogOpen(true)}
          onGuestSelect={handleGuestSelect}
        />
      </div>

      {selectedGuest && (
        <Dialog
          open={detailDialogOpen}
          onOpenChange={(event, data) => {
            if (!data.open) {
              handleDetailClose();
            }
          }}
        >
          <DialogSurface style={{ maxWidth: '800px', width: '90vw' }}>
            <DialogBody>
              <DialogTitle
                action={
                  <DialogTrigger action="close">
                    <Button
                      appearance="subtle"
                      aria-label="Bezárás"
                      icon={<Dismiss24Regular />}
                    />
                  </DialogTrigger>
                }
              >
                Vendég Részletei
              </DialogTitle>
              <DialogContent>
                <GuestDetail
                  guest={selectedGuest}
                  onClose={handleDetailClose}
                />
              </DialogContent>
            </DialogBody>
          </DialogSurface>
        </Dialog>
      )}
    </div>
  );
};