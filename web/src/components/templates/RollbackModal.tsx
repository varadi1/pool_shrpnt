import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTrigger,
  DialogSurface,
  DialogTitle,
  DialogBody,
  DialogActions,
  DialogContent,
  Button,
  Field,
  Textarea,
  Spinner,
  MessageBar,
  MessageBarTitle,
  MessageBarBody,
  MessageBarActions,
  Link,
  Card,
  CardHeader,
  Text,
  tokens,
  makeStyles,
  Badge,
  Divider,
} from '@fluentui/react-components';
import {
  Warning24Regular,
  Info24Regular,
  Checkmark24Regular,
  ArrowUndo24Regular,
  Calendar24Regular,
  Person24Regular,
  DocumentBulletList24Regular,
} from '@fluentui/react-icons';
import { TemplateVersion, Template } from '../../types/templates';
import { useQuery } from '@tanstack/react-query';
import { templateService } from '../../services/templates';

const useStyles = makeStyles({
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
  },
  impactSection: {
    marginTop: tokens.spacingVerticalM,
  },
  impactCard: {
    marginTop: tokens.spacingVerticalS,
    padding: tokens.spacingVerticalM,
    backgroundColor: tokens.colorNeutralBackground3,
  },
  impactList: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
    marginTop: tokens.spacingVerticalS,
  },
  impactItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: tokens.spacingVerticalXS,
  },
  versionInfo: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: tokens.spacingHorizontalL,
    marginTop: tokens.spacingVerticalM,
  },
  versionCard: {
    padding: tokens.spacingVerticalM,
    border: `1px solid ${tokens.colorNeutralStroke1}`,
    borderRadius: tokens.borderRadiusMedium,
  },
  versionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    marginBottom: tokens.spacingVerticalS,
  },
  versionDetails: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
  },
  detailRow: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
  },
  warningSection: {
    marginTop: tokens.spacingVerticalM,
  },
  constraintList: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
    marginTop: tokens.spacingVerticalS,
  },
  constraintItem: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: tokens.spacingHorizontalS,
  },
  reasonField: {
    marginTop: tokens.spacingVerticalL,
  },
  dialogActions: {
    display: 'flex',
    gap: tokens.spacingHorizontalM,
    justifyContent: 'flex-end',
  },
});

interface RollbackModalProps {
  template: Template;
  targetVersion: TemplateVersion;
  currentVersion: TemplateVersion;
  onRollback: (version: TemplateVersion, reason: string) => Promise<void>;
  onCancel: () => void;
  open: boolean;
}

interface ImpactAnalysis {
  affectedOrders: {
    id: string;
    name: string;
    status: string;
    createdAt: string;
  }[];
  breakingChanges: string[];
  warnings: string[];
  constraints: {
    message: string;
    severity: 'error' | 'warning' | 'info';
  }[];
}

export const RollbackModal: React.FC<RollbackModalProps> = ({
  template,
  targetVersion,
  currentVersion,
  onRollback,
  onCancel,
  open,
}) => {
  const styles = useStyles();
  const [reason, setReason] = useState('');
  const [isRollingBack, setIsRollingBack] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  // Fetch impact analysis
  const { data: impactAnalysis, isLoading: isAnalyzing } = useQuery<ImpactAnalysis>({
    queryKey: ['template-rollback-impact', template.id, targetVersion.version],
    queryFn: async () => {
      // Analyze impact of rollback
      const response = await templateService.analyzeRollbackImpact(
        template.id,
        targetVersion.version
      );
      return response;
    },
    enabled: open,
  });

  // Validate rollback constraints
  useEffect(() => {
    if (!open) return;

    const errors: string[] = [];

    // Check if reason is provided
    if (!reason.trim() && !isRollingBack) {
      errors.push('Rollback reason is required');
    }

    // Check if there are breaking changes
    if (impactAnalysis?.breakingChanges && impactAnalysis.breakingChanges.length > 0) {
      errors.push('This rollback contains breaking changes that require manual review');
    }

    // Check for constraint violations
    if (impactAnalysis?.constraints) {
      const criticalConstraints = impactAnalysis.constraints.filter(
        (c) => c.severity === 'error'
      );
      if (criticalConstraints.length > 0) {
        errors.push(...criticalConstraints.map((c) => c.message));
      }
    }

    setValidationErrors(errors);
  }, [reason, impactAnalysis, open, isRollingBack]);

  const handleRollback = async () => {
    if (validationErrors.length > 0 && !validationErrors.every(e => e === 'Rollback reason is required')) {
      return;
    }

    if (!reason.trim()) {
      setError('Please provide a reason for the rollback');
      return;
    }

    setIsRollingBack(true);
    setError(null);

    try {
      await onRollback(targetVersion, reason);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rollback template');
      setIsRollingBack(false);
    }
  };

  const formatDate = (date: string | Date) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <Dialog open={open} onOpenChange={(_, data) => !data.open && onCancel()}>
      <DialogSurface>
        <DialogBody>
          <DialogTitle>
            <div className={styles.header}>
              <ArrowUndo24Regular />
              <Text weight="semibold">Rollback Template Version</Text>
            </div>
          </DialogTitle>
          <DialogContent className={styles.container}>
            {/* Version Comparison */}
            <div className={styles.versionInfo}>
              <div className={styles.versionCard}>
                <div className={styles.versionHeader}>
                  <Badge appearance="filled" color="brand">Current</Badge>
                  <Text weight="semibold">Version {currentVersion.version}</Text>
                </div>
                <div className={styles.versionDetails}>
                  <div className={styles.detailRow}>
                    <Person24Regular fontSize={16} />
                    <Text size={200}>{currentVersion.author}</Text>
                  </div>
                  <div className={styles.detailRow}>
                    <Calendar24Regular fontSize={16} />
                    <Text size={200}>{formatDate(currentVersion.publishedAt)}</Text>
                  </div>
                  <div className={styles.detailRow}>
                    <DocumentBulletList24Regular fontSize={16} />
                    <Text size={200}>{currentVersion.usageCount} orders using</Text>
                  </div>
                </div>
              </div>

              <div className={styles.versionCard}>
                <div className={styles.versionHeader}>
                  <Badge appearance="tint" color="warning">Target</Badge>
                  <Text weight="semibold">Version {targetVersion.version}</Text>
                </div>
                <div className={styles.versionDetails}>
                  <div className={styles.detailRow}>
                    <Person24Regular fontSize={16} />
                    <Text size={200}>{targetVersion.author}</Text>
                  </div>
                  <div className={styles.detailRow}>
                    <Calendar24Regular fontSize={16} />
                    <Text size={200}>{formatDate(targetVersion.publishedAt)}</Text>
                  </div>
                  <div className={styles.detailRow}>
                    <DocumentBulletList24Regular fontSize={16} />
                    <Text size={200}>{targetVersion.usageCount} orders using</Text>
                  </div>
                </div>
              </div>
            </div>

            <Divider />

            {/* Impact Analysis */}
            {isAnalyzing ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '20px' }}>
                <Spinner label="Analyzing rollback impact..." />
              </div>
            ) : impactAnalysis ? (
              <>
                {/* Affected Orders */}
                {impactAnalysis.affectedOrders.length > 0 && (
                  <div className={styles.impactSection}>
                    <MessageBar intent="warning">
                      <MessageBarBody>
                        <MessageBarTitle>
                          {impactAnalysis.affectedOrders.length} Future Orders Will Be Affected
                        </MessageBarTitle>
                        Orders created after this rollback will use the target version template structure.
                      </MessageBarBody>
                    </MessageBar>
                    <Card className={styles.impactCard}>
                      <div className={styles.impactList}>
                        {impactAnalysis.affectedOrders.slice(0, 5).map((order) => (
                          <div key={order.id} className={styles.impactItem}>
                            <Text>{order.name}</Text>
                            <Badge
                              appearance="tint"
                              color={order.status === 'active' ? 'success' : 'warning'}
                            >
                              {order.status}
                            </Badge>
                          </div>
                        ))}
                        {impactAnalysis.affectedOrders.length > 5 && (
                          <Link>
                            View all {impactAnalysis.affectedOrders.length} affected orders
                          </Link>
                        )}
                      </div>
                    </Card>
                  </div>
                )}

                {/* Breaking Changes */}
                {impactAnalysis.breakingChanges.length > 0 && (
                  <div className={styles.warningSection}>
                    <MessageBar intent="error">
                      <MessageBarBody>
                        <MessageBarTitle>Breaking Changes Detected</MessageBarTitle>
                        This rollback contains breaking changes that may affect existing functionality.
                      </MessageBarBody>
                    </MessageBar>
                    <div className={styles.constraintList}>
                      {impactAnalysis.breakingChanges.map((change, index) => (
                        <div key={index} className={styles.constraintItem}>
                          <Warning24Regular color={tokens.colorPaletteRedForeground1} />
                          <Text>{change}</Text>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Warnings */}
                {impactAnalysis.warnings.length > 0 && (
                  <div className={styles.warningSection}>
                    <MessageBar intent="warning">
                      <MessageBarBody>
                        <MessageBarTitle>Warnings</MessageBarTitle>
                        Please review these warnings before proceeding with the rollback.
                      </MessageBarBody>
                    </MessageBar>
                    <div className={styles.constraintList}>
                      {impactAnalysis.warnings.map((warning, index) => (
                        <div key={index} className={styles.constraintItem}>
                          <Info24Regular color={tokens.colorPaletteYellowForeground2} />
                          <Text>{warning}</Text>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Constraints */}
                {impactAnalysis.constraints.length > 0 && (
                  <div className={styles.warningSection}>
                    <MessageBar
                      intent={
                        impactAnalysis.constraints.some((c) => c.severity === 'error')
                          ? 'error'
                          : 'info'
                      }
                    >
                      <MessageBarBody>
                        <MessageBarTitle>Validation Constraints</MessageBarTitle>
                        The following constraints were checked during validation.
                      </MessageBarBody>
                    </MessageBar>
                    <div className={styles.constraintList}>
                      {impactAnalysis.constraints.map((constraint, index) => (
                        <div key={index} className={styles.constraintItem}>
                          {constraint.severity === 'error' ? (
                            <Warning24Regular color={tokens.colorPaletteRedForeground1} />
                          ) : constraint.severity === 'warning' ? (
                            <Info24Regular color={tokens.colorPaletteYellowForeground2} />
                          ) : (
                            <Checkmark24Regular color={tokens.colorPaletteGreenForeground1} />
                          )}
                          <Text>{constraint.message}</Text>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : null}

            {/* Rollback Reason */}
            <Field
              className={styles.reasonField}
              label="Rollback Reason"
              required
              validationState={!reason.trim() && !isRollingBack ? 'error' : undefined}
              validationMessage={!reason.trim() && !isRollingBack ? 'Rollback reason is required' : undefined}
            >
              <Textarea
                value={reason}
                onChange={(_, data) => setReason(data.value)}
                placeholder="Provide a detailed reason for this rollback (e.g., 'Reverting due to permission issues reported in production')"
                rows={4}
                disabled={isRollingBack}
                maxLength={500}
              />
            </Field>

            {/* Error Display */}
            {error && (
              <MessageBar intent="error">
                <MessageBarBody>{error}</MessageBarBody>
              </MessageBar>
            )}

            {/* Additional Information */}
            <MessageBar intent="info">
              <MessageBarBody>
                <MessageBarTitle>Important Information</MessageBarTitle>
                <ul style={{ margin: '8px 0 0 20px', padding: 0 }}>
                  <li>This rollback will create a new version based on the target version</li>
                  <li>Existing orders will not be affected by this rollback</li>
                  <li>The rollback operation cannot be undone</li>
                  <li>All rollback operations are tracked in the audit log</li>
                </ul>
              </MessageBarBody>
            </MessageBar>
          </DialogContent>
          <DialogActions className={styles.dialogActions}>
            <Button
              appearance="secondary"
              onClick={onCancel}
              disabled={isRollingBack}
            >
              Cancel
            </Button>
            <Button
              appearance="primary"
              icon={<ArrowUndo24Regular />}
              onClick={handleRollback}
              disabled={
                isRollingBack ||
                isAnalyzing ||
                !reason.trim() ||
                validationErrors.some(e => e !== 'Rollback reason is required')
              }
            >
              {isRollingBack ? 'Rolling Back...' : 'Confirm Rollback'}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
};