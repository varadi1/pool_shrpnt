import { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogSurface,
  DialogBody,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Input,
  Textarea,
  Label,
  makeStyles,
  tokens,
  MessageBar,
  Dropdown,
  Option,
  Field,
  Spinner,
} from '@fluentui/react-components';
import {
  Dismiss24Regular,
  Save20Regular,
  Delete20Regular,
} from '@fluentui/react-icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Contract, ContractFormData } from '@/types/contracts';
import { contractsApi } from '@/services/api/contracts';
import { useAuth } from '@/hooks/useAuth';

interface ContractFormDialogProps {
  isOpen: boolean;
  onClose: () => void;
  contract?: Contract | null;
  mode: 'create' | 'edit';
}

interface DeleteConfirmationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  contract: Contract | null;
  onDeleteSuccess?: (contractNumber: string) => void;
}

const useStyles = makeStyles({
  dialog: {
    maxWidth: '600px',
    width: '100%',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
  },
  fieldGroup: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: tokens.spacingHorizontalL,
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
  },
  errorMessage: {
    marginBottom: tokens.spacingVerticalM,
  },
  deleteDialog: {
    maxWidth: '400px',
  },
  deleteContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
  },
  contractInfo: {
    padding: tokens.spacingVerticalS,
    backgroundColor: tokens.colorNeutralBackground2,
    borderRadius: tokens.borderRadiusSmall,
  },
  loadingContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
  },
  '@media (max-width: 480px)': {
    fieldGroup: {
      gridTemplateColumns: '1fr',
    },
  },
});

export const ContractFormDialog: React.FC<ContractFormDialogProps> = ({
  isOpen,
  onClose,
  contract,
  mode,
}) => {
  const styles = useStyles();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const firstInputRef = useRef<HTMLInputElement>(null);
  
  const [formData, setFormData] = useState<ContractFormData>({
    contractNumber: '',
    name: '',
    description: '',
    startDate: '',
    endDate: '',
    totalValue: undefined,
    status: 'active',
    pmId: '',
    clientName: '',
  });
  
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Focus first input when dialog opens
  useEffect(() => {
    if (isOpen && firstInputRef.current) {
      setTimeout(() => firstInputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  useEffect(() => {
    if (contract && mode === 'edit') {
      setFormData({
        contractNumber: contract.contractNumber || '',
        name: contract.name,
        description: contract.description || '',
        startDate: contract.startDate,
        endDate: contract.endDate || '',
        totalValue: contract.totalValue,
        status: contract.status,
        pmId: contract.pmId || '',
        clientName: contract.clientName || '',
      });
    } else if (mode === 'create') {
      setFormData({
        contractNumber: '',
        name: '',
        description: '',
        startDate: '',
        endDate: '',
        totalValue: undefined,
        status: 'active',
        pmId: user?.localAccountId || '',
        clientName: '',
      });
    }
    setErrors({});
  }, [contract, mode, user]);

  const createMutation = useMutation({
    mutationFn: (data: ContractFormData) => contractsApi.create(data),
    onSuccess: () => {
      // Invalidate all contract queries to ensure the list refreshes
      // Optimistic refresh: remove item locally to avoid seeing inactive entries
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      onClose();
    },
    onError: (error: any) => {
      setErrors({ submit: error.message || 'Failed to create contract' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: { id: number; formData: Partial<ContractFormData> }) =>
      contractsApi.update(data.id, data.formData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      queryClient.invalidateQueries({ queryKey: ['contract', contract?.id] });
      onClose();
    },
    onError: (error: any) => {
      setErrors({ submit: error.message || 'Failed to update contract' });
    },
  });

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.contractNumber.trim()) {
      newErrors.contractNumber = 'Contract number is required';
    }
    if (!formData.name.trim()) {
      newErrors.name = 'Contract name is required';
    }
    if (!formData.startDate) {
      newErrors.startDate = 'Start date is required';
    }
    if (formData.endDate && formData.startDate && formData.endDate < formData.startDate) {
      newErrors.endDate = 'End date must be after start date';
    }
    if (formData.totalValue !== undefined && formData.totalValue < 0) {
      newErrors.totalValue = 'Total value must be positive';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    setIsSubmitting(true);
    try {
      if (mode === 'create') {
        await createMutation.mutateAsync(formData);
      } else if (contract) {
        await updateMutation.mutateAsync({ id: contract.id, formData });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFieldChange = (field: keyof ContractFormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear field error when user starts typing
    if (errors[field]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(_, data) => {
        if (!data.open && !isSubmitting) onClose();
      }}
      modalType="modal"
    >
      <DialogSurface className={styles.dialog} aria-labelledby="contract-form-title" aria-describedby="contract-form-description">
        <DialogBody>
          <DialogTitle id="contract-form-title">
            {mode === 'create' ? 'Create New Contract' : 'Edit Contract'}
          </DialogTitle>

          <DialogContent id="contract-form-description">
            {errors.submit && (
              <MessageBar
                intent="error"
                className={styles.errorMessage}
              >
                {errors.submit}
              </MessageBar>
            )}

            <form className={styles.form} onSubmit={(e) => e.preventDefault()}>
              <div className={styles.fieldGroup}>
                <Field
                  label="Contract Number *"
                  validationState={errors.contractNumber ? 'error' : undefined}
                  validationMessage={errors.contractNumber}
                >
                  <Input
                    ref={mode === 'create' ? firstInputRef : undefined}
                    value={formData.contractNumber}
                    onChange={(_, data) => handleFieldChange('contractNumber', data.value)}
                    placeholder="e.g., C-2024-001"
                    required
                    disabled={mode === 'edit'}
                    aria-label="Contract number"
                    aria-required="true"
                  />
                </Field>

                <Field
                  label="Status"
                  validationState={errors.status ? 'error' : undefined}
                  validationMessage={errors.status}
                >
                  <Dropdown
                    value={formData.status}
                    onOptionSelect={(_, data) => handleFieldChange('status', data.optionValue)}
                    aria-label="Contract status"
                  >
                    <Option value="active">Active</Option>
                    <Option value="inactive">Inactive</Option>
                    <Option value="expired">Expired</Option>
                  </Dropdown>
                </Field>
              </div>

              <Field
                label="Contract Name *"
                validationState={errors.name ? 'error' : undefined}
                validationMessage={errors.name}
              >
                <Input
                  ref={mode === 'edit' ? firstInputRef : undefined}
                  value={formData.name}
                  onChange={(_, data) => handleFieldChange('name', data.value)}
                  placeholder="Enter contract name"
                  required
                  aria-label="Contract name"
                  aria-required="true"
                />
              </Field>

              <Field
                label="Description"
                validationState={errors.description ? 'error' : undefined}
                validationMessage={errors.description}
              >
                <Textarea
                  value={formData.description}
                  onChange={(_, data) => handleFieldChange('description', data.value)}
                  placeholder="Enter contract description"
                  rows={3}
                />
              </Field>

              <div className={styles.fieldGroup}>
                <Field
                  label="Start Date *"
                  validationState={errors.startDate ? 'error' : undefined}
                  validationMessage={errors.startDate}
                >
                  <Input
                    type="date"
                    value={formData.startDate}
                    onChange={(_, data) => handleFieldChange('startDate', data.value)}
                    required
                  />
                </Field>

                <Field
                  label="End Date"
                  validationState={errors.endDate ? 'error' : undefined}
                  validationMessage={errors.endDate}
                >
                  <Input
                    type="date"
                    value={formData.endDate}
                    onChange={(_, data) => handleFieldChange('endDate', data.value)}
                  />
                </Field>
              </div>

              <div className={styles.fieldGroup}>
                <Field
                  label="Client Name"
                  validationState={errors.clientName ? 'error' : undefined}
                  validationMessage={errors.clientName}
                >
                  <Input
                    value={formData.clientName}
                    onChange={(_, data) => handleFieldChange('clientName', data.value)}
                    placeholder="Enter client name"
                  />
                </Field>

                <Field
                  label="Total Value"
                  validationState={errors.totalValue ? 'error' : undefined}
                  validationMessage={errors.totalValue}
                >
                  <Input
                    type="number"
                    value={formData.totalValue?.toString() || ''}
                    onChange={(_, data) => 
                      handleFieldChange('totalValue', data.value ? parseFloat(data.value) : undefined)
                    }
                    placeholder="0.00"
                    min="0"
                    step="0.01"
                  />
                </Field>
              </div>
            </form>
          </DialogContent>

          <DialogActions>
            <Button
              appearance="secondary"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              appearance="primary"
              icon={<Save20Regular />}
              onClick={handleSubmit}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <div className={styles.loadingContainer}>
                  <Spinner size="tiny" />
                  {mode === 'create' ? 'Creating...' : 'Saving...'}
                </div>
              ) : (
                mode === 'create' ? 'Create Contract' : 'Save Changes'
              )}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
};

export const DeleteConfirmationDialog: React.FC<DeleteConfirmationDialogProps> = ({
  isOpen,
  onClose,
  contract,
  onDeleteSuccess,
}) => {
  const styles = useStyles();
  const queryClient = useQueryClient();
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  // Focus cancel button when dialog opens
  useEffect(() => {
    if (isOpen && cancelButtonRef.current) {
      setTimeout(() => cancelButtonRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const deleteMutation = useMutation({
    mutationFn: (id: number) => contractsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      if (onDeleteSuccess && contract) {
        onDeleteSuccess(contract.contractNumber || contract.name);
      }
      onClose();
    },
    onError: (error: any) => {
      setError(error.message || 'Failed to delete contract');
    },
  });

  const handleDelete = async () => {
    if (!contract) return;

    setIsDeleting(true);
    setError(null);
    try {
      await deleteMutation.mutateAsync(contract.id);
    } finally {
      setIsDeleting(false);
    }
  };

  if (!contract) return null;

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(_, data) => {
        if (!data.open && !isDeleting) onClose();
      }}
      modalType="alert"
    >
      <DialogSurface className={styles.deleteDialog} aria-labelledby="delete-dialog-title" aria-describedby="delete-dialog-description">
        <DialogBody>
          <DialogTitle id="delete-dialog-title">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Delete20Regular style={{ color: tokens.colorPaletteRedForeground1 }} />
              Delete Contract
            </div>
          </DialogTitle>

          <DialogContent id="delete-dialog-description">
            <div className={styles.deleteContent}>
              {error && (
                <MessageBar intent="error">
                  {error}
                </MessageBar>
              )}

              <p>Are you sure you want to delete this contract?</p>

              <div className={styles.contractInfo}>
                <strong>{contract.contractNumber}</strong>
                <br />
                {contract.name}
                <br />
                <small>Client: {contract.clientName || 'N/A'}</small>
              </div>

              <MessageBar intent="warning">
                This action cannot be undone. The contract will be permanently deleted.
              </MessageBar>
            </div>
          </DialogContent>

          <DialogActions>
            <Button
              ref={cancelButtonRef}
              appearance="secondary"
              onClick={onClose}
              disabled={isDeleting}
              aria-label="Cancel delete operation"
            >
              Mégse
            </Button>
            <Button
              appearance="primary"
              icon={<Delete20Regular />}
              onClick={handleDelete}
              disabled={isDeleting}
              aria-label={`Confirm delete contract ${contract?.contractNumber}`}
              style={{
                backgroundColor: tokens.colorPaletteRedBackground3,
                color: tokens.colorNeutralForegroundOnBrand,
              }}
            >
              {isDeleting ? (
                <div className={styles.loadingContainer}>
                  <Spinner size="tiny" />
                  Deleting...
                </div>
              ) : (
                'Delete Contract'
              )}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
};