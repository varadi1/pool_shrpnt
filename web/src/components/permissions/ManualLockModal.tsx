import React, { useState } from 'react';
import {
  Dialog,
  DialogSurface,
  DialogTitle,
  DialogBody,
  DialogActions,
  DialogContent,
  Button,
  Field,
  RadioGroup,
  Radio,
  Textarea,
  Checkbox,
  Input,
  makeStyles,
  tokens,
  Text,
  Badge,
  Divider,
  TabList,
  Tab,
} from '@fluentui/react-components';
import type { TabValue } from '@fluentui/react-components';
import {
  LockClosed16Regular,
  LockOpen16Regular,
  History16Regular,
  Calendar16Regular,
  Warning16Regular,
} from '@fluentui/react-icons';
import type { LockState } from '../../types/permissions';

const useStyles = makeStyles({
  dialog: {
    maxWidth: '600px',
  },
  section: {
    marginBottom: tokens.spacingVerticalL,
  },
  folderGroup: {
    padding: tokens.spacingVerticalS,
    marginBottom: tokens.spacingVerticalS,
    border: `1px solid ${tokens.colorNeutralStroke1}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  selectedGroup: {
    backgroundColor: tokens.colorBrandBackground2,
    border: `1px solid ${tokens.colorBrandStroke1}`,
  },
  warningBox: {
    padding: tokens.spacingVerticalM,
    backgroundColor: tokens.colorPaletteYellowBackground2,
    borderRadius: tokens.borderRadiusMedium,
    marginBottom: tokens.spacingVerticalM,
  },
  historyItem: {
    padding: tokens.spacingVerticalS,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    '&:last-child': {
      borderBottom: 'none',
    },
  },
  historyMeta: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
    marginTop: tokens.spacingVerticalXS,
  },
  statusBadge: {
    marginLeft: tokens.spacingHorizontalS,
  },
});

export interface ManualLockModalProps {
  open: boolean;
  onClose: () => void;
  orderId: string;
  folderGroups: {
    id: string;
    name: string;
    folders: string[];
    currentLockState?: LockState;
  }[];
  onSubmit: (data: LockRequest) => void;
  lockHistory?: LockHistoryItem[];
}

export interface LockRequest {
  action: 'lock' | 'unlock';
  folderGroupIds: string[];
  reason: string;
  unlockAt?: Date;
}

interface LockHistoryItem {
  id: string;
  action: 'lock' | 'unlock';
  folderGroup: string;
  actor: string;
  timestamp: Date;
  reason: string;
  unlockAt?: Date;
}

export const ManualLockModal: React.FC<ManualLockModalProps> = ({
  open,
  onClose,
  orderId,
  folderGroups,
  onSubmit,
  lockHistory = [],
}) => {
  const styles = useStyles();
  const [selectedTab, setSelectedTab] = useState<string>('lock');
  const [action, setAction] = useState<'lock' | 'unlock'>('lock');
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [reason, setReason] = useState('');
  const [scheduleUnlock, setScheduleUnlock] = useState(false);
  const [unlockDate, setUnlockDate] = useState<string>('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleTabSelect = (_: any, data: { value: TabValue }) => {
    setSelectedTab(data.value as string);
  };

  const handleGroupToggle = (groupId: string) => {
    setSelectedGroups(prev => 
      prev.includes(groupId)
        ? prev.filter(id => id !== groupId)
        : [...prev, groupId]
    );
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (selectedGroups.length === 0) {
      newErrors.groups = 'Please select at least one folder group';
    }

    if (!reason.trim()) {
      newErrors.reason = 'Reason is required';
    } else if (reason.trim().length < 10) {
      newErrors.reason = 'Please provide a detailed reason (min 10 characters)';
    }

    if (scheduleUnlock && !unlockDate) {
      newErrors.unlockDate = 'Please select an unlock date';
    }

    if (scheduleUnlock && unlockDate) {
      const unlockDateObj = new Date(unlockDate);
      if (isNaN(unlockDateObj.getTime())) {
        newErrors.unlockDate = 'Please enter a valid date';
      } else if (unlockDateObj <= new Date()) {
        newErrors.unlockDate = 'Unlock date must be in the future';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) return;

    onSubmit({
      action,
      folderGroupIds: selectedGroups,
      reason: reason.trim(),
      unlockAt: scheduleUnlock && unlockDate ? new Date(unlockDate) : undefined,
    });

    // Reset form
    setSelectedGroups([]);
    setReason('');
    setScheduleUnlock(false);
    setUnlockDate('');
    setErrors({});
    onClose();
  };

  const getGroupStatus = (group: typeof folderGroups[0]) => {
    if (!group.currentLockState) return null;
    
    return group.currentLockState.locked ? (
      <Badge 
        appearance="filled" 
        color="danger"
        icon={<LockClosed16Regular />}
        className={styles.statusBadge}
      >
        Locked
      </Badge>
    ) : (
      <Badge 
        appearance="filled" 
        color="success"
        icon={<LockOpen16Regular />}
        className={styles.statusBadge}
      >
        Unlocked
      </Badge>
    );
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date);
  };

  return (
    <Dialog 
      open={open} 
      onOpenChange={(_, data) => !data.open && onClose()}
      modalType="modal"
    >
      <DialogSurface className={styles.dialog}>
        <DialogBody>
          <DialogTitle>Manual Lock/Unlock - Order {orderId}</DialogTitle>
          <DialogContent>
            <TabList 
              selectedValue={selectedTab}
              onTabSelect={handleTabSelect}
            >
              <Tab value="lock" icon={<LockClosed16Regular />}>
                Lock/Unlock
              </Tab>
              <Tab value="history" icon={<History16Regular />}>
                History
              </Tab>
            </TabList>

            {selectedTab === 'lock' && (
              <>
                {/* Warning for manual operations */}
                <div className={styles.warningBox}>
                  <Text weight="semibold">
                    <Warning16Regular /> Important
                  </Text>
                  <Text block size={200}>
                    Manual lock/unlock operations override automatic time-based locks.
                    All changes are audited and require a valid business reason.
                  </Text>
                </div>

                {/* Action selection */}
                <Field
                  label="Action"
                  required
                  className={styles.section}
                >
                  <RadioGroup
                    value={action}
                    onChange={(_, data) => setAction(data.value as 'lock' | 'unlock')}
                  >
                    <Radio
                      value="lock"
                      label={
                        <>
                          <LockClosed16Regular /> Lock folders (read-only access)
                        </>
                      }
                    />
                    <Radio
                      value="unlock"
                      label={
                        <>
                          <LockOpen16Regular /> Unlock folders (restore write access)
                        </>
                      }
                    />
                  </RadioGroup>
                </Field>

                {/* Folder group selection */}
                <Field
                  label="Select Folder Groups"
                  required
                  validationMessage={errors.groups}
                  validationState={errors.groups ? 'error' : undefined}
                  className={styles.section}
                >
                  {folderGroups.map(group => (
                    <div
                      key={group.id}
                      className={`${styles.folderGroup} ${
                        selectedGroups.includes(group.id) ? styles.selectedGroup : ''
                      }`}
                    >
                      <Checkbox
                        checked={selectedGroups.includes(group.id)}
                        onChange={() => handleGroupToggle(group.id)}
                        label={
                          <>
                            <Text weight="semibold">{group.name}</Text>
                            {getGroupStatus(group)}
                          </>
                        }
                      />
                      <Text size={200} block style={{ marginLeft: '28px' }}>
                        Folders: {group.folders.join(', ')}
                      </Text>
                      {group.currentLockState?.reason && (
                        <Text size={200} block style={{ marginLeft: '28px' }}>
                          Current reason: {group.currentLockState.reason}
                        </Text>
                      )}
                    </div>
                  ))}
                </Field>

                {/* Reason field */}
                <Field
                  label="Reason for Change"
                  required
                  validationMessage={errors.reason}
                  validationState={errors.reason ? 'error' : undefined}
                  className={styles.section}
                >
                  <Textarea
                    value={reason}
                    onChange={(_, data) => setReason(data.value)}
                    placeholder="Enter a detailed business reason for this lock/unlock operation..."
                    rows={3}
                  />
                </Field>

                {/* Schedule unlock (only for lock action) */}
                {action === 'lock' && (
                  <div className={styles.section}>
                    <Checkbox
                      checked={scheduleUnlock}
                      onChange={(_, data) => setScheduleUnlock(data.checked === true)}
                      label="Schedule automatic unlock"
                    />
                    
                    {scheduleUnlock && (
                      <Field
                        label="Unlock Date"
                        required
                        validationMessage={errors.unlockDate}
                        validationState={errors.unlockDate ? 'error' : undefined}
                        style={{ marginTop: tokens.spacingVerticalS }}
                      >
                        <Input
                          type="datetime-local"
                          value={unlockDate}
                          onChange={(_, data) => setUnlockDate(data.value)}
                          min={new Date().toISOString().slice(0, 16)}
                        />
                      </Field>
                    )}
                  </div>
                )}
              </>
            )}

            {selectedTab === 'history' && (
              <div className={styles.section}>
                {lockHistory.length === 0 ? (
                  <Text>No lock/unlock history for this order.</Text>
                ) : (
                  lockHistory.map(item => (
                    <div key={item.id} className={styles.historyItem}>
                      <div>
                        {item.action === 'lock' ? (
                          <LockClosed16Regular />
                        ) : (
                          <LockOpen16Regular />
                        )}
                        <Text weight="semibold" style={{ marginLeft: '8px' }}>
                          {item.folderGroup} - {item.action === 'lock' ? 'Locked' : 'Unlocked'}
                        </Text>
                      </div>
                      <div className={styles.historyMeta}>
                        <Text>By: {item.actor}</Text>
                        <Text> • </Text>
                        <Text>{formatDate(item.timestamp)}</Text>
                      </div>
                      <Text block size={200} style={{ marginTop: '4px' }}>
                        Reason: {item.reason}
                      </Text>
                      {item.unlockAt && (
                        <Text block size={200}>
                          <Calendar16Regular /> Scheduled unlock: {formatDate(item.unlockAt)}
                        </Text>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={onClose}>
              Cancel
            </Button>
            {selectedTab === 'lock' && (
              <Button 
                appearance="primary" 
                onClick={handleSubmit}
                icon={action === 'lock' ? <LockClosed16Regular /> : <LockOpen16Regular />}
              >
                {action === 'lock' ? 'Lock Selected' : 'Unlock Selected'}
              </Button>
            )}
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
};

// Note: `LockRequest` is defined once above; do not duplicate to avoid conflicting exports