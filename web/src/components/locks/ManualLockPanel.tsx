import React, { useState, useEffect } from 'react';
import {
  Card,
  CardHeader,
  CardPreview,
  Button,
  RadioGroup,
  Radio,
  Field,
  Textarea,
  Spinner,
  Text,
  makeStyles,
  tokens,
  Badge,
  Divider,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
} from '@fluentui/react-components';
import {
  LockClosedRegular,
  LockOpenRegular,
  InfoRegular,
} from '@fluentui/react-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiService } from '../../services/api.service';

const useStyles = makeStyles({
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
    padding: tokens.spacingHorizontalL,
  },
  panel: {
    maxWidth: '800px',
    width: '100%',
  },
  formSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
  },
  radioGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
  },
  buttonGroup: {
    display: 'flex',
    gap: tokens.spacingHorizontalM,
    marginTop: tokens.spacingVerticalL,
  },
  statusSection: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    padding: tokens.spacingVerticalM,
    backgroundColor: tokens.colorNeutralBackground2,
    borderRadius: tokens.borderRadiusMedium,
  },
  statusLabel: {
    fontWeight: 600,
  },
  infoSection: {
    marginTop: tokens.spacingVerticalS,
  },
});

interface ManualLockPanelProps {
  emId: string;
  emName?: string;
}

interface LockState {
  experts: 'locked' | 'unlocked' | 'limited';
  deliverables: 'locked' | 'unlocked' | 'limited';
  hasManualLock: boolean;
  manualLockReason?: string;
  manualLockBy?: string;
  manualLockAt?: string;
}

interface ManualLockRequest {
  emId: string;
  scope: 'experts' | 'deliverables';
  action: 'lock' | 'unlock';
  reason: string;
}

interface ManualLockResponse {
  success: boolean;
  correlationId: string;
  appliedAt: string;
  message: string;
}

export const ManualLockPanel: React.FC<ManualLockPanelProps> = ({ emId, emName }) => {
  const styles = useStyles();
  const queryClient = useQueryClient();
  const [selectedScope, setSelectedScope] = useState<'experts' | 'deliverables'>('experts');
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState('');

  const { data: lockState, isLoading: isLoadingState, refetch } = useQuery<LockState>({
    queryKey: ['lockState', emId],
    queryFn: async () => {
      const response = await apiService.get(`/api/locks/state/${emId}`);
      return response.data;
    },
    refetchInterval: 30000, // Auto-refresh every 30 seconds
    refetchOnWindowFocus: true, // Refresh when window regains focus
    staleTime: 10000, // Consider data stale after 10 seconds
  });

  const applyManualLock = useMutation<ManualLockResponse, Error, ManualLockRequest>({
    mutationFn: async (request) => {
      const response = await apiService.post('/api/locks/manual', request);
      return response.data;
    },
    onMutate: async (request) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['lockState', emId] });
      
      // Snapshot the previous value
      const previousLockState = queryClient.getQueryData<LockState>(['lockState', emId]);
      
      // Optimistically update to the new value
      if (previousLockState) {
        const newState = { ...previousLockState };
        const stateKey = request.scope as keyof Pick<LockState, 'experts' | 'deliverables'>;
        newState[stateKey] = request.action === 'lock' ? 'locked' : 'unlocked';
        newState.hasManualLock = request.action === 'lock';
        if (request.action === 'lock') {
          newState.manualLockReason = request.reason;
          newState.manualLockAt = new Date().toISOString();
        }
        queryClient.setQueryData(['lockState', emId], newState);
      }
      
      // Return a context with the previous and new snapshots
      return { previousLockState };
    },
    onError: (error: any, variables, context) => {
      // If the mutation fails, use the context to roll back
      if (context?.previousLockState) {
        queryClient.setQueryData(['lockState', emId], context.previousLockState);
      }
      
      const errorMessage = error.response?.data?.detail || 'Failed to apply manual lock';
      const correlationId = error.response?.data?.correlationId;
      
      if (window.showToast) {
        window.showToast({
          title: 'Operation failed',
          content: correlationId 
            ? `${errorMessage} (Correlation ID: ${correlationId})`
            : errorMessage,
          intent: 'error',
        });
      }
    },
    onSettled: () => {
      // Always refetch after error or success
      queryClient.invalidateQueries({ queryKey: ['lockState', emId] });
    },
    onSuccess: (data) => {
      setReason('');
      setReasonError('');
      
      if (window.showToast) {
        window.showToast({
          title: 'Manual lock applied',
          content: data.message,
          intent: 'success',
        });
      }
    },
  });

  const validateReason = (): boolean => {
    if (!reason.trim()) {
      setReasonError('Reason is mandatory for manual lock operations');
      return false;
    }
    if (reason.length < 10) {
      setReasonError('Please provide a more detailed reason (minimum 10 characters)');
      return false;
    }
    setReasonError('');
    return true;
  };

  const handleLock = () => {
    if (!reason.trim()) {
      setReasonError('Reason is mandatory for manual lock operations');
      return;
    }
    if (!validateReason()) return;
    
    applyManualLock.mutate({
      emId,
      scope: selectedScope,
      action: 'lock',
      reason: reason.trim(),
    });
  };

  const handleUnlock = () => {
    if (!reason.trim()) {
      setReasonError('Reason is mandatory for manual lock operations');
      return;
    }
    if (!validateReason()) return;
    
    applyManualLock.mutate({
      emId,
      scope: selectedScope,
      action: 'unlock',
      reason: reason.trim(),
    });
  };

  const getCurrentStatus = () => {
    if (!lockState) return 'Unknown';
    const status = selectedScope === 'experts' ? lockState.experts : lockState.deliverables;
    
    switch (status) {
      case 'locked':
        return { label: 'Locked', color: 'danger' as const, icon: <LockClosedRegular /> };
      case 'unlocked':
        return { label: 'Unlocked', color: 'success' as const, icon: <LockOpenRegular /> };
      case 'limited':
        return { label: 'Limited Access', color: 'warning' as const, icon: <InfoRegular /> };
      default:
        return { label: 'Unknown', color: 'unknown' as const, icon: null };
    }
  };

  const status = getCurrentStatus();

  if (isLoadingState) {
    return (
      <Card className={styles.panel}>
        <CardPreview>
          <div className={styles.container}>
            <Spinner label="Loading lock state..." />
          </div>
        </CardPreview>
      </Card>
    );
  }

  return (
    <Card className={styles.panel}>
      <CardHeader
        header={<Text size={500} weight="semibold">Manual Lock Control</Text>}
        description={emName ? `Managing locks for: ${emName}` : `EM ID: ${emId}`}
      />
      <CardPreview>
        <div className={styles.container}>
          <div className={styles.statusSection}>
            <Text className={styles.statusLabel}>Current Status:</Text>
            {status.icon}
            <Badge appearance="filled" color={status.color}>
              {status.label}
            </Badge>
            {lockState?.hasManualLock && (
              <Badge appearance="tint" color="informative">
                Manual Lock Active
              </Badge>
            )}
          </div>

          {lockState?.hasManualLock && lockState.manualLockReason && (
            <MessageBar intent="info" className={styles.infoSection}>
              <MessageBarBody>
                <MessageBarTitle>Manual Lock Information</MessageBarTitle>
                <div>Reason: {lockState.manualLockReason}</div>
                {lockState.manualLockBy && <div>Applied by: {lockState.manualLockBy}</div>}
                {lockState.manualLockAt && (
                  <div>Applied at: {new Date(lockState.manualLockAt).toLocaleString()}</div>
                )}
              </MessageBarBody>
            </MessageBar>
          )}

          <Divider />

          <div className={styles.formSection}>
            <Field label="Select Folder Group" required>
              <RadioGroup
                value={selectedScope}
                onChange={(_, data) => setSelectedScope(data.value as 'experts' | 'deliverables')}
                className={styles.radioGroup}
              >
                <Radio value="experts" label="Szakértők (Experts)" />
                <Radio value="deliverables" label="Eredménytermékek (Deliverables)" />
              </RadioGroup>
            </Field>

            <Field
              label="Reason for Action"
              required
              validationMessage={reasonError}
              validationState={reasonError ? 'error' : 'none'}
            >
              <Textarea
                value={reason}
                onChange={(_, data) => {
                  setReason(data.value);
                  if (reasonError) setReasonError('');
                }}
                placeholder="Enter the reason for this manual lock/unlock operation..."
                resize="vertical"
                rows={3}
                maxLength={500}
              />
            </Field>

            <div className={styles.buttonGroup}>
              <Button
                appearance="primary"
                icon={<LockClosedRegular />}
                onClick={handleLock}
                disabled={applyManualLock.isPending || !reason.trim()}
              >
                {applyManualLock.isPending && applyManualLock.variables?.action === 'lock' 
                  ? <Spinner size="tiny" /> 
                  : 'Apply Lock'}
              </Button>
              <Button
                appearance="secondary"
                icon={<LockOpenRegular />}
                onClick={handleUnlock}
                disabled={applyManualLock.isPending || !reason.trim()}
              >
                {applyManualLock.isPending && applyManualLock.variables?.action === 'unlock' 
                  ? <Spinner size="tiny" /> 
                  : 'Remove Lock'}
              </Button>
            </div>
          </div>
        </div>
      </CardPreview>
    </Card>
  );
};