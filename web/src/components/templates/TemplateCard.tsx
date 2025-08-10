import React from 'react';
import {
  Card,
  CardHeader,
  CardPreview,
  Text,
  Badge,
  Button,
  Menu,
  MenuTrigger,
  MenuList,
  MenuItem,
  MenuPopover,
  makeStyles,
  tokens,
  shorthands,
} from '@fluentui/react-components';
import {
  MoreVertical24Regular,
  Edit24Regular,
  History24Regular,
  Copy24Regular,
  Delete24Regular,
  Eye24Regular,
} from '@fluentui/react-icons';
import type { Template } from '@/types/templates';

const useStyles = makeStyles({
  card: {
    width: '100%',
    ...shorthands.padding(tokens.spacingVerticalM, tokens.spacingHorizontalM),
    cursor: 'pointer',
    '&:hover': {
      backgroundColor: tokens.colorNeutralBackground1Hover,
    },
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    ...shorthands.gap(tokens.spacingHorizontalM),
  },
  content: {
    display: 'flex',
    flexDirection: 'column',
    flexGrow: 1,
  },
  title: {
    display: 'flex',
    alignItems: 'center',
    ...shorthands.gap(tokens.spacingHorizontalS),
    marginBottom: tokens.spacingVerticalXS,
  },
  description: {
    color: tokens.colorNeutralForeground3,
    marginBottom: tokens.spacingVerticalS,
  },
  metadata: {
    display: 'flex',
    flexWrap: 'wrap',
    ...shorthands.gap(tokens.spacingHorizontalM),
    marginTop: tokens.spacingVerticalS,
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
  },
  metadataItem: {
    display: 'flex',
    alignItems: 'center',
    ...shorthands.gap(tokens.spacingHorizontalXS),
  },
  tags: {
    display: 'flex',
    flexWrap: 'wrap',
    ...shorthands.gap(tokens.spacingHorizontalXS),
    marginTop: tokens.spacingVerticalXS,
  },
});

interface TemplateCardProps {
  template: Template;
  onView: (template: Template) => void;
  onEdit: (template: Template) => void;
  onViewHistory: (template: Template) => void;
  onClone: (template: Template) => void;
  onDelete: (template: Template) => void;
}

const getStatusBadge = (status: Template['status']) => {
  const statusConfig = {
    draft: { color: 'informative' as const, label: 'Draft' },
    active: { color: 'success' as const, label: 'Active' },
    default: { color: 'brand' as const, label: 'Default' },
    deprecated: { color: 'warning' as const, label: 'Deprecated' },
    archived: { color: 'subtle' as const, label: 'Archived' },
  };

  const config = statusConfig[status];
  return <Badge color={config.color} appearance="tint">{config.label}</Badge>;
};

export const TemplateCard: React.FC<TemplateCardProps> = ({
  template,
  onView,
  onEdit,
  onViewHistory,
  onClone,
  onDelete,
}) => {
  const styles = useStyles();

  const handleCardClick = () => {
    onView(template);
  };

  const handleMenuAction = (action: string) => (e: React.MouseEvent) => {
    e.stopPropagation();
    switch (action) {
      case 'view':
        onView(template);
        break;
      case 'edit':
        onEdit(template);
        break;
      case 'history':
        onViewHistory(template);
        break;
      case 'clone':
        onClone(template);
        break;
      case 'delete':
        onDelete(template);
        break;
    }
  };

  const formatDate = (date: Date | string) => {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
  };

  return (
    <Card className={styles.card} onClick={handleCardClick}>
      <CardHeader
        header={
          <div className={styles.header}>
            <div className={styles.content}>
              <div className={styles.title}>
                <Text weight="semibold" size={400}>
                  {template.name}
                </Text>
                {getStatusBadge(template.status)}
              </div>
              {template.description && (
                <Text className={styles.description} size={300}>
                  {template.description}
                </Text>
              )}
              <div className={styles.metadata}>
                <span className={styles.metadataItem}>
                  <Text size={200}>Version:</Text>
                  <Text weight="medium" size={200}>{template.currentVersion}</Text>
                </span>
                <span className={styles.metadataItem}>
                  <Text size={200}>Usage:</Text>
                  <Text weight="medium" size={200}>{template.usageCount} orders</Text>
                </span>
                <span className={styles.metadataItem}>
                  <Text size={200}>Modified:</Text>
                  <Text weight="medium" size={200}>{formatDate(template.updatedAt)}</Text>
                </span>
                <span className={styles.metadataItem}>
                  <Text size={200}>Created by:</Text>
                  <Text weight="medium" size={200}>{template.createdBy}</Text>
                </span>
              </div>
              {template.tags && template.tags.length > 0 && (
                <div className={styles.tags}>
                  {template.tags.map((tag) => (
                    <Badge key={tag} appearance="outline" size="small">
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            <Menu>
              <MenuTrigger disableButtonEnhancement>
                <Button
                  appearance="subtle"
                  icon={<MoreVertical24Regular />}
                  onClick={(e) => e.stopPropagation()}
                />
              </MenuTrigger>
              <MenuPopover>
                <MenuList>
                  <MenuItem icon={<Eye24Regular />} onClick={handleMenuAction('view')}>
                    View Details
                  </MenuItem>
                  <MenuItem 
                    icon={<Edit24Regular />} 
                    onClick={handleMenuAction('edit')}
                    disabled={template.status === 'archived'}
                  >
                    Edit Template
                  </MenuItem>
                  <MenuItem icon={<History24Regular />} onClick={handleMenuAction('history')}>
                    View History
                  </MenuItem>
                  <MenuItem icon={<Copy24Regular />} onClick={handleMenuAction('clone')}>
                    Clone Template
                  </MenuItem>
                  <MenuItem 
                    icon={<Delete24Regular />} 
                    onClick={handleMenuAction('delete')}
                    disabled={template.status === 'default' || template.usageCount > 0}
                  >
                    Delete Template
                  </MenuItem>
                </MenuList>
              </MenuPopover>
            </Menu>
          </div>
        }
      />
    </Card>
  );
};