import React, { useState, useEffect } from 'react';
import {
  makeStyles,
  tokens,
  shorthands,
  Text,
  Input,
  Textarea,
  Switch,
  Button,
  Label,
  Divider,
  Dropdown,
  Option,
} from '@fluentui/react-components';
import {
  Save24Regular,
  Dismiss24Regular,
} from '@fluentui/react-icons';
import type { FolderNode, FolderProperties } from '@/types/templates';

const useStyles = makeStyles({
  panel: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    ...shorthands.padding(tokens.spacingVerticalM),
    ...shorthands.border('1px', 'solid', tokens.colorNeutralStroke1),
    ...shorthands.borderRadius(tokens.borderRadiusMedium),
    backgroundColor: tokens.colorNeutralBackground1,
  },
  header: {
    marginBottom: tokens.spacingVerticalM,
  },
  section: {
    marginBottom: tokens.spacingVerticalL,
  },
  field: {
    marginBottom: tokens.spacingVerticalM,
  },
  switchField: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: tokens.spacingVerticalM,
  },
  lockSchedule: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    ...shorthands.gap(tokens.spacingVerticalS, tokens.spacingHorizontalS),
    marginTop: tokens.spacingVerticalS,
    ...shorthands.padding(tokens.spacingVerticalS),
    ...shorthands.border('1px', 'solid', tokens.colorNeutralStroke2),
    ...shorthands.borderRadius(tokens.borderRadiusSmall),
  },
  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    ...shorthands.gap(tokens.spacingHorizontalS),
    marginTop: 'auto',
    paddingTop: tokens.spacingVerticalM,
    ...shorthands.borderTop('1px', 'solid', tokens.colorNeutralStroke1),
  },
  emptyState: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    color: tokens.colorNeutralForeground3,
  },
});

interface FolderPropertiesPanelProps {
  selectedNode: FolderNode | null;
  onSave: (nodeId: string, properties: FolderProperties) => void;
  onCancel: () => void;
}

export const FolderPropertiesPanel: React.FC<FolderPropertiesPanelProps> = ({
  selectedNode,
  onSave,
  onCancel,
}) => {
  const styles = useStyles();
  const [properties, setProperties] = useState<FolderProperties>({
    required: false,
    locked: false,
  });

  useEffect(() => {
    if (selectedNode) {
      setProperties(selectedNode.properties);
    }
  }, [selectedNode]);

  const handleChange = (field: keyof FolderProperties, value: any) => {
    setProperties((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleLockScheduleChange = (period: string, value: boolean) => {
    setProperties((prev) => ({
      ...prev,
      lockSchedule: {
        ...prev.lockSchedule,
        [period]: value,
      },
    }));
  };

  const handleSave = () => {
    if (selectedNode) {
      onSave(selectedNode.id, properties);
    }
  };

  const handleCancel = () => {
    if (selectedNode) {
      setProperties(selectedNode.properties);
    }
    onCancel();
  };

  if (!selectedNode) {
    return (
      <div className={styles.panel}>
        <div className={styles.emptyState}>
          <Text size={300}>Select a folder to edit its properties</Text>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <Text size={500} weight="semibold">
          Folder Properties
        </Text>
        <Text size={300} block>
          {selectedNode.name}
        </Text>
      </div>

      <Divider />

      <div className={styles.section}>
        <div className={styles.field}>
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            value={properties.description || ''}
            onChange={(e, data) => handleChange('description', data.value)}
            placeholder="Enter folder description..."
            resize="vertical"
          />
        </div>

        <div className={styles.field}>
          <Label htmlFor="namingPattern">Naming Pattern (Regex)</Label>
          <Input
            id="namingPattern"
            value={properties.namingPattern || ''}
            onChange={(e, data) => handleChange('namingPattern', data.value)}
            placeholder="e.g., ^[A-Z]{3}-\\d{4}$"
          />
        </div>
      </div>

      <div className={styles.section}>
        <Text size={400} weight="semibold" block>
          Folder Settings
        </Text>
        
        <div className={styles.switchField}>
          <Label htmlFor="required">Required Folder</Label>
          <Switch
            id="required"
            checked={properties.required}
            onChange={(e, data) => handleChange('required', data.checked)}
          />
        </div>

        <div className={styles.switchField}>
          <Label htmlFor="locked">Lock Folder</Label>
          <Switch
            id="locked"
            checked={properties.locked}
            onChange={(e, data) => handleChange('locked', data.checked)}
          />
        </div>

        {properties.locked && (
          <div>
            <Text size={300} weight="medium" block>
              Lock Schedule
            </Text>
            <div className={styles.lockSchedule}>
              <div className={styles.switchField}>
                <Label htmlFor="t3">T-3</Label>
                <Switch
                  id="t3"
                  checked={properties.lockSchedule?.t3 || false}
                  onChange={(e, data) => handleLockScheduleChange('t3', data.checked)}
                />
              </div>
              <div className={styles.switchField}>
                <Label htmlFor="t1">T-1</Label>
                <Switch
                  id="t1"
                  checked={properties.lockSchedule?.t1 || false}
                  onChange={(e, data) => handleLockScheduleChange('t1', data.checked)}
                />
              </div>
              <div className={styles.switchField}>
                <Label htmlFor="t0">T-0</Label>
                <Switch
                  id="t0"
                  checked={properties.lockSchedule?.t0 || false}
                  onChange={(e, data) => handleLockScheduleChange('t0', data.checked)}
                />
              </div>
              <div className={styles.switchField}>
                <Label htmlFor="t8">T+8</Label>
                <Switch
                  id="t8"
                  checked={properties.lockSchedule?.t8 || false}
                  onChange={(e, data) => handleLockScheduleChange('t8', data.checked)}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      <div className={styles.section}>
        <Text size={400} weight="semibold" block>
          File Restrictions
        </Text>
        
        <div className={styles.field}>
          <Label htmlFor="maxSize">Max Size (MB)</Label>
          <Input
            id="maxSize"
            type="number"
            value={properties.maxSize?.toString() || ''}
            onChange={(e, data) => {
              const value = data.value ? parseInt(data.value) : undefined;
              handleChange('maxSize', value);
            }}
            placeholder="No limit"
          />
        </div>

        <div className={styles.field}>
          <Label htmlFor="allowedFileTypes">Allowed File Types</Label>
          <Input
            id="allowedFileTypes"
            value={properties.allowedFileTypes?.join(', ') || ''}
            onChange={(e, data) => {
              const types = data.value
                ? data.value.split(',').map((t) => t.trim()).filter(Boolean)
                : [];
              handleChange('allowedFileTypes', types.length > 0 ? types : undefined);
            }}
            placeholder="e.g., pdf, docx, xlsx"
          />
        </div>
      </div>

      <div className={styles.actions}>
        <Button
          appearance="secondary"
          icon={<Dismiss24Regular />}
          onClick={handleCancel}
        >
          Cancel
        </Button>
        <Button
          appearance="primary"
          icon={<Save24Regular />}
          onClick={handleSave}
        >
          Save Properties
        </Button>
      </div>
    </div>
  );
};