import React, { useState } from 'react';
import {
  makeStyles,
  shorthands,
  tokens,
  Switch,
  Text,
  Tooltip,
  Dialog,
  DialogTrigger,
  DialogSurface,
  DialogTitle,
  DialogBody,
  DialogActions,
  DialogContent,
  Button,
  MessageBar,
  MessageBarBody,
} from '@fluentui/react-components';
import {
  Link20Regular,
  LinkDismiss20Regular,
  Warning20Regular,
  Info20Regular,
} from '@fluentui/react-icons';
import type { FolderPermission, InheritanceState } from '../../types/permissions';

const useStyles = makeStyles({
  container: {
    display: 'flex',
    alignItems: 'center',
    ...shorthands.gap('8px'),
    ...shorthands.padding('8px'),
    ...shorthands.borderRadius('4px'),
    backgroundColor: tokens.colorNeutralBackground2,
  },
  inheritedContainer: {
    backgroundColor: tokens.colorNeutralBackground2,
  },
  brokenContainer: {
    backgroundColor: tokens.colorWarningBackground1,
    ...shorthands.border('1px', 'solid', tokens.colorWarningBorder1),
  },
  explicitContainer: {
    backgroundColor: tokens.colorNeutralBackground1,
  },
  toggleSection: {
    display: 'flex',
    alignItems: 'center',
    ...shorthands.gap('8px'),
  },
  statusSection: {
    display: 'flex',
    alignItems: 'center',
    ...shorthands.gap('4px'),
  },
  warningText: {
    color: tokens.colorPaletteDarkOrangeForeground1,
  },
  infoText: {
    color: tokens.colorNeutralForeground3,
  },
  specialFolderIndicator: {
    display: 'flex',
    alignItems: 'center',
    ...shorthands.gap('4px'),
    ...shorthands.padding('2px', '8px'),
    ...shorthands.borderRadius('12px'),
    backgroundColor: tokens.colorBrandBackground2,
    fontSize: '12px',
  },
  dialogContent: {
    display: 'flex',
    flexDirection: 'column',
    ...shorthands.gap('16px'),
  },
  affectedList: {
    ...shorthands.padding('8px'),
    ...shorthands.border('1px', 'solid', tokens.colorNeutralStroke1),
    ...shorthands.borderRadius('4px'),
    maxHeight: '200px',
    overflowY: 'auto',
  },
  affectedItem: {
    ...shorthands.padding('4px', '8px'),
    ...shorthands.borderRadius('2px'),
    ':hover': {
      backgroundColor: tokens.colorNeutralBackground2Hover,
    },
  },
});

interface InheritanceToggleProps {
  folder: FolderPermission;
  onToggle: (folderId: string, breakInheritance: boolean) => Promise<void>;
  isLoading?: boolean;
  disabled?: boolean;
}

export const InheritanceToggle: React.FC<InheritanceToggleProps> = ({
  folder,
  onToggle,
  isLoading = false,
  disabled = false,
}) => {
  const styles = useStyles();
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingAction, setPendingAction] = useState<'break' | 'restore' | null>(null);

  const isInherited = folder.inheritanceState === 'inherited';
  const isBroken = folder.inheritanceState === 'broken';
  const isSpecialFolder = folder.specialFlags?.isFinancial || 
                          folder.specialFlags?.isNeuOnly || 
                          folder.specialFlags?.isLocked;

  const getContainerStyle = () => {
    if (isBroken) return styles.brokenContainer;
    if (isInherited) return styles.inheritedContainer;
    return styles.explicitContainer;
  };

  const handleToggleClick = (checked: boolean) => {
    if (isSpecialFolder && checked) {
      // Breaking inheritance on special folder - show warning
      setPendingAction('break');
      setShowConfirmDialog(true);
    } else if (!checked && isBroken) {
      // Restoring inheritance - show confirmation
      setPendingAction('restore');
      setShowConfirmDialog(true);
    } else if (checked && isInherited) {
      // Breaking inheritance on normal folder
      setPendingAction('break');
      setShowConfirmDialog(true);
    } else {
      // Direct toggle for other cases
      handleConfirmedToggle(checked);
    }
  };

  const handleConfirmedToggle = async (breakInheritance: boolean) => {
    setShowConfirmDialog(false);
    await onToggle(folder.folderId, breakInheritance);
    setPendingAction(null);
  };

  const handleDialogConfirm = () => {
    const shouldBreak = pendingAction === 'break';
    handleConfirmedToggle(shouldBreak);
  };

  const handleDialogCancel = () => {
    setShowConfirmDialog(false);
    setPendingAction(null);
  };

  const getAffectedFolders = (): FolderPermission[] => {
    const affected: FolderPermission[] = [];
    const collectChildren = (f: FolderPermission) => {
      if (f.children) {
        f.children.forEach(child => {
          if (child.inheritanceState === 'inherited') {
            affected.push(child);
            collectChildren(child);
          }
        });
      }
    };
    collectChildren(folder);
    return affected;
  };

  const affectedFolders = getAffectedFolders();

  return (
    <>
      <div className={`${styles.container} ${getContainerStyle()}`}>
        <div className={styles.toggleSection}>
          <Tooltip
            content={
              isInherited
                ? 'Permissions are inherited from parent folder'
                : isBroken
                ? 'Inheritance is broken - using explicit permissions'
                : 'Using explicit permissions'
            }
            relationship="label"
          >
            <div className={styles.statusSection}>
              {isBroken ? (
                <LinkDismiss20Regular primaryFill={tokens.colorWarningForeground1} />
              ) : (
                <Link20Regular primaryFill={tokens.colorNeutralForeground2} />
              )}
              <Text size={200}>
                {isInherited ? 'Inherited' : isBroken ? 'Broken' : 'Explicit'}
              </Text>
            </div>
          </Tooltip>

          <Switch
            checked={!isInherited}
            onChange={(_, data) => handleToggleClick(data.checked)}
            disabled={disabled || isLoading || folder.specialFlags?.isLocked}
            label={isBroken ? 'Restore inheritance' : 'Break inheritance'}
          />
        </div>

        {isSpecialFolder && (
          <div className={styles.specialFolderIndicator}>
            <Warning20Regular fontSize={12} />
            <Text size={100}>
              {folder.specialFlags?.isFinancial && 'Financial'}
              {folder.specialFlags?.isNeuOnly && 'NEU Only'}
              {folder.specialFlags?.isLocked && 'Locked'}
            </Text>
          </div>
        )}

        {affectedFolders.length > 0 && isBroken && (
          <Tooltip
            content={`${affectedFolders.length} child folders inherit from this folder`}
            relationship="label"
          >
            <div className={styles.statusSection}>
              <Info20Regular fontSize={16} />
              <Text size={100} className={styles.infoText}>
                {affectedFolders.length} affected
              </Text>
            </div>
          </Tooltip>
        )}
      </div>

      <Dialog open={showConfirmDialog} onOpenChange={(_, data) => setShowConfirmDialog(data.open)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>
              {pendingAction === 'break' ? 'Break Inheritance' : 'Restore Inheritance'}
            </DialogTitle>
            <DialogContent className={styles.dialogContent}>
              <Text>
                {pendingAction === 'break' ? (
                  <>
                    Breaking inheritance will create unique permissions for this folder.
                    {isSpecialFolder && (
                      <MessageBar intent="warning" style={{ marginTop: '8px' }}>
                        <MessageBarBody>
                          <strong>Warning:</strong> This is a special folder with restricted access.
                          Breaking inheritance may violate security policies.
                        </MessageBarBody>
                      </MessageBar>
                    )}
                  </>
                ) : (
                  <>
                    Restoring inheritance will replace current permissions with those from the parent folder.
                    Any custom permissions will be lost.
                  </>
                )}
              </Text>

              {affectedFolders.length > 0 && (
                <>
                  <Text weight="semibold">
                    The following child folders will be affected:
                  </Text>
                  <div className={styles.affectedList}>
                    {affectedFolders.map(f => (
                      <div key={f.folderId} className={styles.affectedItem}>
                        <Text size={200}>{f.path}</Text>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {folder.specialFlags?.isFinancial && (
                <MessageBar intent="error">
                  <MessageBarBody>
                    This is a financial folder. Access must be segregated according to compliance requirements.
                  </MessageBarBody>
                </MessageBar>
              )}

              {folder.specialFlags?.isNeuOnly && (
                <MessageBar intent="warning">
                  <MessageBarBody>
                    This folder is restricted to NEU personnel only. Partner access is not permitted.
                  </MessageBarBody>
                </MessageBar>
              )}
            </DialogContent>
            <DialogActions>
              <DialogTrigger disableButtonEnhancement>
                <Button appearance="secondary" onClick={handleDialogCancel}>
                  Cancel
                </Button>
              </DialogTrigger>
              <Button 
                appearance={pendingAction === 'break' && isSpecialFolder ? 'primary' : 'primary'}
                onClick={handleDialogConfirm}
              >
                {pendingAction === 'break' ? 'Break Inheritance' : 'Restore Inheritance'}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </>
  );
};

interface InheritanceVisualizationProps {
  folder: FolderPermission;
  parentFolder?: FolderPermission;
}

export const InheritanceVisualization: React.FC<InheritanceVisualizationProps> = ({
  folder,
  parentFolder,
}) => {
  const styles = useStyles();

  const getInheritanceChain = (): string[] => {
    const chain: string[] = [];
    
    if (folder.inheritanceState === 'inherited' && parentFolder) {
      // Build chain from parent up
      let current = parentFolder;
      while (current) {
        chain.unshift(current.name);
        if (current.inheritanceState === 'broken' || current.inheritanceState === 'explicit') {
          break;
        }
        // In real implementation, would traverse up the tree
        break;
      }
    } else {
      chain.push(folder.name);
    }
    
    return chain;
  };

  const chain = getInheritanceChain();

  return (
    <div className={styles.container}>
      <Text size={200} weight="semibold">Inheritance Chain:</Text>
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        {chain.map((name, index) => (
          <React.Fragment key={index}>
            {index > 0 && <Text size={100}>→</Text>}
            <Text size={200}>{name}</Text>
          </React.Fragment>
        ))}
        {folder.inheritanceState === 'inherited' && (
          <>
            <Text size={100}>→</Text>
            <Text size={200} weight="semibold">{folder.name}</Text>
          </>
        )}
      </div>
      {folder.inheritanceState === 'broken' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginLeft: '8px' }}>
          <LinkDismiss20Regular fontSize={14} primaryFill={tokens.colorWarningForeground1} />
          <Text size={100} className={styles.warningText}>
            Inheritance broken at this level
          </Text>
        </div>
      )}
    </div>
  );
};

// Helper function to detect special folders
export const detectSpecialFolder = (folder: FolderPermission): {
  isSpecial: boolean;
  type?: 'financial' | 'neuOnly' | 'locked' | 'final';
  message?: string;
} => {
  const folderName = folder.name.toUpperCase();
  const path = folder.path.toUpperCase();

  // NEU-only folder
  if (folderName.includes('BELSO_NEU') || folderName.includes('NEU_ONLY')) {
    return {
      isSpecial: true,
      type: 'neuOnly',
      message: 'NEU-only folder - No partner access allowed',
    };
  }

  // Financial folder (TIG paths)
  if (path.includes('/TIG/') || folderName === 'TIG') {
    return {
      isSpecial: true,
      type: 'financial',
      message: 'Financial folder - Segregated access required',
    };
  }

  // Final/locked folder
  if (folderName.includes('VEGLEGES') || folderName.includes('FINAL')) {
    return {
      isSpecial: true,
      type: 'final',
      message: 'Final folder - Locked after deadline',
    };
  }

  return { isSpecial: false };
};

// Validation function for inheritance operations
export const validateInheritanceOperation = (
  folder: FolderPermission,
  operation: 'break' | 'restore'
): {
  isValid: boolean;
  warnings: string[];
  errors: string[];
} => {
  const warnings: string[] = [];
  const errors: string[] = [];

  const special = detectSpecialFolder(folder);

  if (operation === 'break') {
    // Check if folder is already broken or explicit
    if (folder.inheritanceState !== 'inherited') {
      errors.push('Inheritance is already broken for this folder');
    }

    // Warn about special folders
    if (special.isSpecial) {
      warnings.push(special.message || 'This is a special folder with restricted access');
    }

    // Check for locked state
    if (folder.specialFlags?.isLocked) {
      errors.push('Cannot modify inheritance on locked folders');
    }

    // Warn about child folders
    if (folder.children && folder.children.length > 0) {
      const inheritedChildren = folder.children.filter(c => c.inheritanceState === 'inherited');
      if (inheritedChildren.length > 0) {
        warnings.push(`${inheritedChildren.length} child folders will be affected by this change`);
      }
    }
  } else if (operation === 'restore') {
    // Check if folder has broken inheritance
    if (folder.inheritanceState !== 'broken') {
      errors.push('Inheritance is not broken for this folder');
    }

    // Check for locked state
    if (folder.specialFlags?.isLocked) {
      errors.push('Cannot modify inheritance on locked folders');
    }

    // Warn about losing custom permissions
    warnings.push('All custom permissions will be replaced with inherited permissions');

    // Special folder warnings
    if (special.isSpecial && special.type === 'financial') {
      warnings.push('Restoring inheritance may violate financial segregation requirements');
    }

    if (special.isSpecial && special.type === 'neuOnly') {
      warnings.push('Restoring inheritance may grant unauthorized partner access');
    }
  }

  return {
    isValid: errors.length === 0,
    warnings,
    errors,
  };
};