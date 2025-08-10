import React, { useEffect, useState } from 'react';
import {
  Card,
  ProgressBar,
  Text,
  Title3,
  Body1,
  Caption1,
  Badge,
  Button,
  Spinner,
  makeStyles,
  tokens,
  shorthands,
} from '@fluentui/react-components';
import {
  CheckmarkCircle24Regular,
  ErrorCircle24Regular,
  Clock24Regular,
  ArrowSync24Regular,
  Document24Regular,
} from '@fluentui/react-icons';
import { useProvisioningStatus } from '@/hooks/useProvisioningStatus';
import type { ProvisioningStep, AuditLogEntry } from '@/types/orders';

const useStyles = makeStyles({
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
  },
  statusCard: {
    ...shorthands.padding(tokens.spacingVerticalL, tokens.spacingHorizontalL),
  },
  progressSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
  },
  progressHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  stepsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
    marginTop: tokens.spacingVerticalM,
  },
  stepItem: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    ...shorthands.padding(tokens.spacingVerticalS, tokens.spacingHorizontalM),
    ...shorthands.borderRadius(tokens.borderRadiusMedium),
    backgroundColor: tokens.colorNeutralBackground2,
  },
  stepCompleted: {
    backgroundColor: tokens.colorPaletteGreenBackground2,
  },
  stepInProgress: {
    backgroundColor: tokens.colorPaletteBrandBackground2,
  },
  stepFailed: {
    backgroundColor: tokens.colorPaletteRedBackground2,
  },
  stepPending: {
    opacity: 0.6,
  },
  stepContent: {
    flex: 1,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  timeInfo: {
    display: 'flex',
    gap: tokens.spacingHorizontalS,
    alignItems: 'center',
    color: tokens.colorNeutralForeground3,
  },
  auditSection: {
    marginTop: tokens.spacingVerticalL,
  },
  auditList: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
    marginTop: tokens.spacingVerticalM,
    maxHeight: '300px',
    overflowY: 'auto',
  },
  auditEntry: {
    display: 'flex',
    gap: tokens.spacingHorizontalM,
    ...shorthands.padding(tokens.spacingVerticalXS),
    fontSize: tokens.fontSizeBase200,
  },
  auditTimestamp: {
    color: tokens.colorNeutralForeground3,
    minWidth: '150px',
  },
  errorSection: {
    ...shorthands.padding(tokens.spacingVerticalM),
    ...shorthands.borderRadius(tokens.borderRadiusMedium),
    backgroundColor: tokens.colorPaletteRedBackground2,
    ...shorthands.border('1px', 'solid', tokens.colorPaletteRedBorder1),
  },
  retryButton: {
    marginTop: tokens.spacingVerticalM,
  },
});

interface ProvisioningStatusProps {
  orderId: string;
  onComplete?: (success: boolean) => void;
  onRetry?: () => void;
}

const TIMEOUT_DURATION = 10 * 60 * 1000; // 10 minutes

export const ProvisioningStatus: React.FC<ProvisioningStatusProps> = ({
  orderId,
  onComplete,
  onRetry,
}) => {
  const styles = useStyles();
  const [startTime] = useState(Date.now());
  const [isTimedOut, setIsTimedOut] = useState(false);
  
  const {
    status,
    steps,
    auditLog,
    progress,
    error,
    isLoading,
    refetch,
  } = useProvisioningStatus(orderId);

  // Check for timeout
  useEffect(() => {
    const checkTimeout = setInterval(() => {
      if (Date.now() - startTime > TIMEOUT_DURATION) {
        setIsTimedOut(true);
      }
    }, 1000);

    return () => clearInterval(checkTimeout);
  }, [startTime]);

  // Notify completion
  useEffect(() => {
    if (status === 'completed' || status === 'failed') {
      onComplete?.(status === 'completed');
    }
  }, [status, onComplete]);

  const getStepIcon = (step: ProvisioningStep) => {
    switch (step.status) {
      case 'completed':
        return <CheckmarkCircle24Regular primaryFill={tokens.colorPaletteGreenForeground1} />;
      case 'in_progress':
        return <Spinner size="tiny" />;
      case 'failed':
        return <ErrorCircle24Regular primaryFill={tokens.colorPaletteRedForeground1} />;
      default:
        return <Clock24Regular />;
    }
  };

  const getStepStyle = (step: ProvisioningStep) => {
    const baseStyle = styles.stepItem;
    switch (step.status) {
      case 'completed':
        return `${baseStyle} ${styles.stepCompleted}`;
      case 'in_progress':
        return `${baseStyle} ${styles.stepInProgress}`;
      case 'failed':
        return `${baseStyle} ${styles.stepFailed}`;
      default:
        return `${baseStyle} ${styles.stepPending}`;
    }
  };

  const calculateTimeRemaining = () => {
    if (!progress || progress === 100) return null;
    
    const elapsed = Date.now() - startTime;
    const estimatedTotal = elapsed / (progress / 100);
    const remaining = estimatedTotal - elapsed;
    
    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);
    
    return `${minutes}m ${seconds}s remaining`;
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  };

  const handleRetry = () => {
    refetch();
    onRetry?.();
  };

  if (isLoading && !steps.length) {
    return (
      <Card className={styles.statusCard}>
        <div className={styles.container}>
          <Spinner size="medium" label="Loading provisioning status..." />
        </div>
      </Card>
    );
  }

  return (
    <Card className={styles.statusCard}>
      <div className={styles.container}>
        <div className={styles.progressSection}>
          <div className={styles.progressHeader}>
            <Title3>Provisioning Progress</Title3>
            {status && (
              <Badge
                appearance="filled"
                color={
                  status === 'completed' ? 'success' :
                  status === 'failed' ? 'danger' :
                  status === 'in_progress' ? 'brand' :
                  'neutral'
                }
              >
                {status.replace('_', ' ').toUpperCase()}
              </Badge>
            )}
          </div>

          {progress !== undefined && (
            <>
              <ProgressBar
                value={progress}
                max={100}
                color={status === 'failed' ? 'error' : 'brand'}
              />
              <div className={styles.timeInfo}>
                <Text>{progress}% complete</Text>
                {calculateTimeRemaining() && (
                  <>
                    <Text>•</Text>
                    <Text>{calculateTimeRemaining()}</Text>
                  </>
                )}
              </div>
            </>
          )}

          {isTimedOut && status === 'in_progress' && (
            <div className={styles.errorSection}>
              <Body1 block>Provisioning has timed out after 10 minutes.</Body1>
              <Caption1 block>
                The process may still be running in the background. Please check back later or contact support.
              </Caption1>
            </div>
          )}

          <div className={styles.stepsList}>
            {steps.map((step, index) => (
              <div key={step.id || index} className={getStepStyle(step)}>
                {getStepIcon(step)}
                <div className={styles.stepContent}>
                  <div>
                    <Body1>{step.name}</Body1>
                    {step.description && <Caption1>{step.description}</Caption1>}
                  </div>
                  {step.duration && (
                    <Caption1>{step.duration}ms</Caption1>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {error && (
          <div className={styles.errorSection}>
            <Body1 block>Provisioning failed with error:</Body1>
            <Caption1 block>{error}</Caption1>
            {onRetry && (
              <Button
                appearance="primary"
                icon={<ArrowSync24Regular />}
                onClick={handleRetry}
                className={styles.retryButton}
              >
                Retry Provisioning
              </Button>
            )}
          </div>
        )}

        {auditLog.length > 0 && (
          <div className={styles.auditSection}>
            <Title3>
              <Document24Regular /> Audit Log
            </Title3>
            <div className={styles.auditList}>
              {auditLog.map((entry: AuditLogEntry, index) => (
                <div key={entry.id || index} className={styles.auditEntry}>
                  <span className={styles.auditTimestamp}>
                    {formatTimestamp(entry.timestamp)}
                  </span>
                  <Text>{entry.action}</Text>
                  {entry.details && <Caption1>({entry.details})</Caption1>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
};

export default ProvisioningStatus;