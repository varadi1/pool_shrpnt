import { useEffect, useState, useRef } from 'react';
import {
  Dialog,
  DialogSurface,
  DialogBody,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Spinner,
  makeStyles,
  tokens,
  Text,
  Badge,
  Divider,
  MessageBar,
} from '@fluentui/react-components';
import {
  Dismiss24Regular,
  Edit20Regular,
  Delete20Regular,
} from '@fluentui/react-icons';
import { useQuery } from '@tanstack/react-query';
import type { Contract } from '@/types/contracts';
import { contractsApi } from '@/services/api/contracts';

interface ContractDetailProps {
  contract: Contract | null;
  isOpen: boolean;
  onClose: () => void;
  onEdit?: (contract: Contract) => void;
  onDelete?: (contract: Contract) => void;
  canEdit: boolean;
  canDelete: boolean;
}

const useStyles = makeStyles({
  dialog: {
    maxWidth: '600px',
    width: '100%',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: tokens.spacingHorizontalM,
  },
  title: {
    margin: 0,
  },
  actions: {
    display: 'flex',
    gap: tokens.spacingHorizontalXS,
  },
  content: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
  },
  sectionTitle: {
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground1,
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
  },
  fieldLabel: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
  },
  fieldValue: {
    fontSize: tokens.fontSizeBase300,
    color: tokens.colorNeutralForeground1,
  },
  twoColumn: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: tokens.spacingHorizontalL,
  },
  statusBadge: {
    minWidth: '80px',
  },
  activeStatus: {
    backgroundColor: tokens.colorPaletteGreenBackground2,
    color: tokens.colorPaletteGreenForeground2,
  },
  inactiveStatus: {
    backgroundColor: tokens.colorNeutralBackground3,
    color: tokens.colorNeutralForeground3,
  },
  expiredStatus: {
    backgroundColor: tokens.colorPaletteBlueBorderActive,
    color: tokens.colorNeutralForegroundOnBrand,
  },
  loadingContainer: {
    display: 'flex',
    justifyContent: 'center',
    padding: tokens.spacingVerticalXXL,
  },
  errorContainer: {
    padding: tokens.spacingVerticalM,
  },
  auditInfo: {
    padding: tokens.spacingVerticalS,
    backgroundColor: tokens.colorNeutralBackground2,
    borderRadius: tokens.borderRadiusSmall,
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
  },
  '@media (max-width: 480px)': {
    twoColumn: {
      gridTemplateColumns: '1fr',
    },
  },
});

export const ContractDetail: React.FC<ContractDetailProps> = ({
  contract,
  isOpen,
  onClose,
  onEdit,
  onDelete,
  canEdit,
  canDelete,
}) => {
  const styles = useStyles();
  const [localContract, setLocalContract] = useState<Contract | null>(contract);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Fetch full contract details when opened
  const {
    data: detailedContract,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['contract', contract?.id],
    queryFn: async () => {
      if (!contract?.id) return null;
      return await contractsApi.getById(contract.id);
    },
    enabled: isOpen && !!contract?.id,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  useEffect(() => {
    if (detailedContract) {
      setLocalContract(detailedContract);
    } else if (contract) {
      setLocalContract(contract);
    }
  }, [detailedContract, contract]);

  // Focus management when dialog opens
  useEffect(() => {
    if (isOpen && closeButtonRef.current) {
      closeButtonRef.current.focus();
    }
  }, [isOpen]);

  // Handle Escape key to close dialog
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Focus trap for modal
  useEffect(() => {
    if (!isOpen || !dialogRef.current) return;

    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      const focusableElements = dialogRef.current?.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      
      if (!focusableElements || focusableElements.length === 0) return;

      const firstElement = focusableElements[0] as HTMLElement;
      const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    };

    document.addEventListener('keydown', handleTab);
    return () => document.removeEventListener('keydown', handleTab);
  }, [isOpen]);

  const getStatusBadgeStyle = (status: Contract['status']) => {
    switch (status) {
      case 'active':
        return styles.activeStatus;
      case 'inactive':
        return styles.inactiveStatus;
      case 'expired':
        return styles.expiredStatus;
      default:
        return '';
    }
  };

  const formatDate = (dateString: string | undefined) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const formatCurrency = (amount: number | undefined) => {
    if (amount === undefined || amount === null) return 'N/A';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const formatDateTime = (dateString: string | undefined) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (!isOpen || !localContract) return null;

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(_, data) => {
        if (!data.open) onClose();
      }}
      modalType="modal"
    >
      <DialogSurface className={styles.dialog} ref={dialogRef} aria-labelledby="contract-detail-title" aria-describedby="contract-detail-description">
        <DialogBody>
          <DialogTitle>
            <div className={styles.header}>
              <h2 id="contract-detail-title" className={styles.title}>Szerződés részletei</h2>
              <div className={styles.actions}>
                {canEdit && onEdit && (
                  <Button
                    appearance="subtle"
                    icon={<Edit20Regular />}
                    onClick={() => onEdit(localContract)}
                    aria-label={`Edit contract ${localContract.contractNumber}`}
                    title="Edit contract (Ctrl+E)"
                  />
                )}
                {canDelete && onDelete && (
                  <Button
                    appearance="subtle"
                    icon={<Delete20Regular />}
                    onClick={() => onDelete(localContract)}
                    aria-label={`Delete contract ${localContract.contractNumber}`}
                    title="Delete contract"
                  />
                )}
              </div>
            </div>
          </DialogTitle>
          
          <DialogContent id="contract-detail-description">
            {isLoading ? (
              <div className={styles.loadingContainer}>
                <Spinner size="medium" label="Szerződés részleteinek betöltése..." />
              </div>
            ) : error ? (
              <div className={styles.errorContainer}>
                <MessageBar
                  intent="error"
                  isMultiline
                  actions={
                    <Button onClick={() => refetch()} size="small">
                      Újrapróbálás
                    </Button>
                  }
                >
                  <strong>Hiba a szerződés részleteinek betöltése közben</strong>
                  <br />
                  {error instanceof Error ? error.message : 'An error occurred'}
                  <br />
                  <small>
                    Correlation ID: {(error as { correlationId?: string })?.correlationId || 'Unknown'}
                  </small>
                </MessageBar>
              </div>
            ) : (
              <div className={styles.content}>
                <div className={styles.section}>
                  <Text className={styles.sectionTitle}>Alapinformációk</Text>
                  <div className={styles.twoColumn}>
                    <div className={styles.field}>
                      <Text className={styles.fieldLabel}>Szerződésszám</Text>
                      <Text className={styles.fieldValue}>
                        {localContract.contractNumber || 'N/A'}
                      </Text>
                    </div>
                    <div className={styles.field}>
                      <Text className={styles.fieldLabel}>Státusz</Text>
                      <Badge
                        appearance="filled"
                        className={`${styles.statusBadge} ${getStatusBadgeStyle(localContract.status)}`}
                      >
                        {localContract.status === 'active' ? 'Aktív' : 
                         localContract.status === 'inactive' ? 'Inaktív' :
                         localContract.status === 'expired' ? 'Lejárt' :
                         localContract.status.charAt(0).toUpperCase() + localContract.status.slice(1)}
                      </Badge>
                    </div>
                  </div>
                  <div className={styles.field}>
                    <Text className={styles.fieldLabel}>Szerződés neve</Text>
                    <Text className={styles.fieldValue}>{localContract.name}</Text>
                  </div>
                  {localContract.description && (
                    <div className={styles.field}>
                      <Text className={styles.fieldLabel}>Leírás</Text>
                      <Text className={styles.fieldValue}>{localContract.description}</Text>
                    </div>
                  )}
                </div>

                <Divider />

                <div className={styles.section}>
                  <Text className={styles.sectionTitle}>Szerződés adatai</Text>
                  <div className={styles.twoColumn}>
                    <div className={styles.field}>
                      <Text className={styles.fieldLabel}>Kezdés dátuma</Text>
                      <Text className={styles.fieldValue}>
                        {formatDate(localContract.startDate)}
                      </Text>
                    </div>
                    <div className={styles.field}>
                      <Text className={styles.fieldLabel}>Lejárat dátuma</Text>
                      <Text className={styles.fieldValue}>
                        {formatDate(localContract.endDate)}
                      </Text>
                    </div>
                  </div>
                  <div className={styles.twoColumn}>
                    <div className={styles.field}>
                      <Text className={styles.fieldLabel}>Ügyfél neve</Text>
                      <Text className={styles.fieldValue}>
                        {localContract.clientName || 'N/A'}
                      </Text>
                    </div>
                    <div className={styles.field}>
                      <Text className={styles.fieldLabel}>Összeg</Text>
                      <Text className={styles.fieldValue}>
                        {formatCurrency(localContract.totalValue)}
                      </Text>
                    </div>
                  </div>
                  {localContract.pmName && (
                    <div className={styles.field}>
                      <Text className={styles.fieldLabel}>Projektmenedzser</Text>
                      <Text className={styles.fieldValue}>{localContract.pmName}</Text>
                    </div>
                  )}
                </div>

                <Divider />

                <div className={styles.section}>
                  <Text className={styles.sectionTitle}>Audit információk</Text>
                  <div className={styles.auditInfo}>
                    <div className={styles.twoColumn}>
                      <div>
                        <Text>Létrehozva: {formatDateTime(localContract.createdAt)}</Text>
                        {localContract.createdBy && (
                          <Text>Létrehozó: {localContract.createdBy}</Text>
                        )}
                      </div>
                      <div>
                        <Text>Módosítva: {formatDateTime(localContract.updatedAt)}</Text>
                        {localContract.updatedBy && (
                          <Text>Módosító: {localContract.updatedBy}</Text>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Placeholder for related orders count - will be implemented later */}
                {/* <div className={styles.section}>
                  <Text className={styles.sectionTitle}>Related Information</Text>
                  <div className={styles.field}>
                    <Text className={styles.fieldLabel}>Related Orders</Text>
                    <Text className={styles.fieldValue}>
                      {relatedOrdersCount || 0} orders
                    </Text>
                  </div>
                </div> */}
              </div>
            )}
          </DialogContent>

          <DialogActions>
            <Button
              ref={closeButtonRef}
              appearance="secondary"
              icon={<Dismiss24Regular />}
              onClick={onClose}
              aria-label="Close contract details dialog"
            >
              Bezárás
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
};