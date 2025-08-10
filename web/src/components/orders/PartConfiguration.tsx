import React, { useCallback, useMemo, useState } from 'react';
import {
  makeStyles,
  shorthands,
  tokens,
  Checkbox,
  Input,
  Label,
  Card,
  Button,
  Tooltip,
  Text,
} from '@fluentui/react-components';
import {
  Copy16Regular,
  Clock16Regular,
  Warning16Regular,
  LockClosed16Regular,
  DocumentText16Regular,
} from '@fluentui/react-icons';
import type { PartConfiguration as PartConfig, LockTimeline, LockTimelineEvent } from '@/types/orders';

const useStyles = makeStyles({
  container: {
    display: 'flex',
    flexDirection: 'column',
    ...shorthands.gap('16px'),
  },
  partCard: {
    ...shorthands.padding('16px'),
    ...shorthands.borderRadius('4px'),
    ...shorthands.border('1px', 'solid', tokens.colorNeutralStroke1),
  },
  partHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '16px',
  },
  partContent: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    ...shorthands.gap('16px'),
  },
  timelineContainer: {
    marginTop: '24px',
    ...shorthands.padding('16px'),
    backgroundColor: tokens.colorNeutralBackground2,
    ...shorthands.borderRadius('4px'),
  },
  timeline: {
    position: 'relative',
    height: '60px',
    marginTop: '32px',
  },
  timelineBar: {
    position: 'absolute',
    top: '50%',
    left: '0',
    right: '0',
    height: '2px',
    backgroundColor: tokens.colorNeutralStroke1,
    transform: 'translateY(-50%)',
  },
  timelineMarker: {
    position: 'absolute',
    top: '50%',
    transform: 'translate(-50%, -50%)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    cursor: 'pointer',
  },
  markerDot: {
    width: '12px',
    height: '12px',
    ...shorthands.borderRadius('50%'),
    ...shorthands.border('2px', 'solid', tokens.colorNeutralBackground1),
  },
  markerLabel: {
    position: 'absolute',
    top: '-24px',
    fontSize: '12px',
    fontWeight: '600',
    whiteSpace: 'nowrap',
  },
  markerTime: {
    position: 'absolute',
    bottom: '-24px',
    fontSize: '11px',
    color: tokens.colorNeutralForeground3,
    whiteSpace: 'nowrap',
  },
  fieldGroup: {
    display: 'flex',
    flexDirection: 'column',
    ...shorthands.gap('8px'),
  },
  copyButton: {
    marginLeft: '8px',
  },
});

interface Props {
  value: PartConfig[];
  onChange: (parts: PartConfig[]) => void;
}

const PART_TYPES: ('A' | 'B' | 'C')[] = ['A', 'B', 'C'];

const calculateLockSchedule = (deadline: Date): PartConfig['lockSchedule'] => {
  const t0 = new Date(deadline);
  const t3 = new Date(deadline);
  t3.setDate(t3.getDate() - 3);
  const t1 = new Date(deadline);
  t1.setDate(t1.getDate() - 1);
  const t8 = new Date(deadline);
  t8.setDate(t8.getDate() + 8);

  return { t3, t1, t0, t8 };
};

const generateTimelineEvents = (lockSchedule: PartConfig['lockSchedule']): LockTimelineEvent[] => {
  return [
    {
      timestamp: lockSchedule.t3,
      type: 'T-3',
      action: 'notify',
      color: tokens.colorPaletteYellowBackground3,
      label: 'T-3',
    },
    {
      timestamp: lockSchedule.t1,
      type: 'T-1',
      action: 'notify',
      color: tokens.colorPaletteOrangeBackground3,
      label: 'T-1',
    },
    {
      timestamp: lockSchedule.t0,
      type: 'T+0',
      action: 'lock_write',
      color: tokens.colorPaletteRedBackground3,
      label: 'T+0',
    },
    {
      timestamp: lockSchedule.t8,
      type: 'T+8',
      action: 'lock_read',
      color: tokens.colorNeutralBackground6,
      label: 'T+8',
    },
  ];
};

const formatDate = (date: Date): string => {
  return date.toLocaleDateString('hu-HU', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
};

const formatDateTime = (date: Date): string => {
  return date.toLocaleString('hu-HU', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const PartConfiguration: React.FC<Props> = ({ value = [], onChange }) => {
  const styles = useStyles();
  const [selectedParts, setSelectedParts] = useState<Set<'A' | 'B' | 'C'>>(
    new Set(value.map(p => p.type))
  );

  const partConfigs = useMemo(() => {
    const configs: Record<string, PartConfig> = {};
    value.forEach(part => {
      configs[part.type] = part;
    });
    return configs;
  }, [value]);

  const handlePartToggle = useCallback(
    (partType: 'A' | 'B' | 'C', checked: boolean) => {
      const newSelectedParts = new Set(selectedParts);
      if (checked) {
        newSelectedParts.add(partType);
        const deadline = new Date();
        deadline.setDate(deadline.getDate() + 30);
        const newConfig: PartConfig = {
          type: partType,
          deadline,
          lockSchedule: calculateLockSchedule(deadline),
        };
        onChange([...value.filter(p => p.type !== partType), newConfig]);
      } else {
        newSelectedParts.delete(partType);
        onChange(value.filter(p => p.type !== partType));
      }
      setSelectedParts(newSelectedParts);
    },
    [selectedParts, value, onChange]
  );

  const handleDeadlineChange = useCallback(
    (partType: 'A' | 'B' | 'C', dateString: string) => {
      if (!dateString) return;
      
      const existingConfig = partConfigs[partType];
      const newDeadline = new Date(dateString);
      
      if (existingConfig && existingConfig.deadline instanceof Date) {
        const hours = existingConfig.deadline.getHours();
        const minutes = existingConfig.deadline.getMinutes();
        newDeadline.setHours(hours, minutes);
      }
      
      const updatedConfig: PartConfig = {
        ...existingConfig,
        type: partType,
        deadline: newDeadline,
        lockSchedule: calculateLockSchedule(newDeadline),
      };
      onChange(value.map(p => (p.type === partType ? updatedConfig : p)));
    },
    [partConfigs, value, onChange]
  );

  const handleTimeChange = useCallback(
    (partType: 'A' | 'B' | 'C', timeString: string) => {
      if (!timeString) return;
      
      const existingConfig = partConfigs[partType];
      if (!existingConfig) return;
      
      const [hours, minutes] = timeString.split(':').map(Number);
      const newDeadline = new Date(existingConfig.deadline);
      newDeadline.setHours(hours, minutes);
      
      const updatedConfig: PartConfig = {
        ...existingConfig,
        deadline: newDeadline,
        lockSchedule: calculateLockSchedule(newDeadline),
      };
      onChange(value.map(p => (p.type === partType ? updatedConfig : p)));
    },
    [partConfigs, value, onChange]
  );

  const copyConfiguration = useCallback(
    (fromPart: 'A' | 'B' | 'C', toPart: 'A' | 'B' | 'C') => {
      const sourceConfig = partConfigs[fromPart];
      if (!sourceConfig) return;

      const copiedConfig: PartConfig = {
        ...sourceConfig,
        type: toPart,
      };
      
      const newSelectedParts = new Set(selectedParts);
      newSelectedParts.add(toPart);
      setSelectedParts(newSelectedParts);
      
      onChange([...value.filter(p => p.type !== toPart), copiedConfig]);
    },
    [partConfigs, selectedParts, value, onChange]
  );

  const renderTimelineMarker = (event: LockTimelineEvent, position: number) => {
    const getIcon = () => {
      switch (event.type) {
        case 'T-3':
          return <Clock16Regular />;
        case 'T-1':
          return <Warning16Regular />;
        case 'T+0':
          return <LockClosed16Regular />;
        case 'T+8':
          return <DocumentText16Regular />;
        default:
          return null;
      }
    };

    const getTooltipContent = () => {
      switch (event.type) {
        case 'T-3':
          return 'Notification sent 3 days before deadline';
        case 'T-1':
          return 'Warning sent 1 day before deadline';
        case 'T+0':
          return 'Write access locked at deadline';
        case 'T+8':
          return 'Read-only access 8 days after deadline';
        default:
          return '';
      }
    };

    return (
      <Tooltip content={`${getTooltipContent()}\n${formatDateTime(event.timestamp)}`} relationship="label">
        <div
          className={styles.timelineMarker}
          style={{ left: `${position}%` }}
        >
          <span className={styles.markerLabel}>{event.label}</span>
          <div
            className={styles.markerDot}
            style={{ backgroundColor: event.color }}
          >
            {getIcon()}
          </div>
          <span className={styles.markerTime}>{formatDate(event.timestamp)}</span>
        </div>
      </Tooltip>
    );
  };

  const renderTimeline = (part: PartConfig) => {
    const events = generateTimelineEvents(part.lockSchedule);
    const minDate = events[0].timestamp;
    const maxDate = events[events.length - 1].timestamp;
    const totalDuration = maxDate.getTime() - minDate.getTime();

    return (
      <div className={styles.timelineContainer}>
        <Label>Lock Timeline</Label>
        <div className={styles.timeline}>
          <div className={styles.timelineBar} />
          {events.map((event, index) => {
            const position = ((event.timestamp.getTime() - minDate.getTime()) / totalDuration) * 100;
            return (
              <React.Fragment key={index}>
                {renderTimelineMarker(event, position)}
              </React.Fragment>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className={styles.container}>
      <Label>Select Parts to Configure</Label>
      
      {PART_TYPES.map(partType => (
        <Card key={partType} className={styles.partCard}>
          <div className={styles.partHeader}>
            <Checkbox
              label={`Part ${partType}`}
              checked={selectedParts.has(partType)}
              onChange={(_, data) => handlePartToggle(partType, data.checked as boolean)}
            />
            {selectedParts.has(partType) && selectedParts.size > 1 && (
              <div>
                {PART_TYPES.filter(p => p !== partType && selectedParts.has(p)).map(targetPart => (
                  <Button
                    key={targetPart}
                    size="small"
                    appearance="subtle"
                    icon={<Copy16Regular />}
                    className={styles.copyButton}
                    onClick={() => copyConfiguration(partType, targetPart)}
                  >
                    Copy to {targetPart}
                  </Button>
                ))}
              </div>
            )}
          </div>

          {selectedParts.has(partType) && partConfigs[partType] && (
            <>
              <div className={styles.partContent}>
                <div className={styles.fieldGroup}>
                  <Label required>Deadline Date</Label>
                  <Input
                    type="date"
                    value={partConfigs[partType].deadline.toISOString().split('T')[0]}
                    onChange={(_, data) => handleDeadlineChange(partType, data.value)}
                    min={new Date().toISOString().split('T')[0]}
                  />
                </div>
                <div className={styles.fieldGroup}>
                  <Label required>Deadline Time</Label>
                  <Input
                    type="time"
                    value={`${partConfigs[partType].deadline.getHours().toString().padStart(2, '0')}:${partConfigs[partType].deadline.getMinutes().toString().padStart(2, '0')}`}
                    onChange={(_, data) => handleTimeChange(partType, data.value)}
                  />
                </div>
              </div>

              {renderTimeline(partConfigs[partType])}
            </>
          )}
        </Card>
      ))}

      {selectedParts.size === 0 && (
        <Text>Please select at least one part to configure.</Text>
      )}
    </div>
  );
};

export default PartConfiguration;