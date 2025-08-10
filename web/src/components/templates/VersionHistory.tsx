import React, { useState } from 'react';
import {
  Text,
  Button,
  Spinner,
  Badge,
  MessageBar,
  MessageBarType,
  makeStyles,
  tokens,
  shorthands,
  Card,
  CardHeader,
  CardPreview,
  Divider,
  Tooltip,
  Dialog,
  DialogTrigger,
  DialogSurface,
  DialogTitle,
  DialogBody,
  DialogActions,
  DialogContent,
  Textarea,
  Field,
  Tag,
  Menu,
  MenuTrigger,
  MenuList,
  MenuItem,
  MenuPopover,
} from '@fluentui/react-components';
import {
  History24Regular,
  Clock24Regular,
  Person24Regular,
  Document24Regular,
  Tag24Regular,
  MoreVertical24Regular,
  ChevronRight24Regular,
  CheckmarkCircle24Regular,
  Warning24Regular,
  Dismiss24Regular,
  Archive24Regular,
  DocumentMultiple24Regular,
} from '@fluentui/react-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, formatDistanceToNow } from 'date-fns';
import { TemplateVersion, VersionTag, VersionUsage } from '../../types/templates';
import { templateService } from '../../services/templates';

const useStyles = makeStyles({
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
    padding: tokens.spacingVerticalL,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  timeline: {
    position: 'relative',
    paddingLeft: tokens.spacingHorizontalXXL,
  },
  timelineConnector: {
    position: 'absolute',
    left: '20px',
    top: '40px',
    bottom: '20px',
    width: '2px',
    backgroundColor: tokens.colorNeutralStroke1,
  },
  versionCard: {
    position: 'relative',
    marginBottom: tokens.spacingVerticalL,
  },
  versionDot: {
    position: 'absolute',
    left: '-28px',
    top: '20px',
    width: '16px',
    height: '16px',
    borderRadius: '50%',
    backgroundColor: tokens.colorBrandBackground,
    border: `2px solid ${tokens.colorNeutralBackground1}`,
    zIndex: 1,
  },
  versionDotCurrent: {
    backgroundColor: tokens.colorPaletteGreenBackground2,
    ...shorthands.borderColor(tokens.colorPaletteGreenBorder1),
  },
  versionDotDeprecated: {
    backgroundColor: tokens.colorPaletteYellowBackground2,
    ...shorthands.borderColor(tokens.colorPaletteYellowBorder1),
  },
  versionDotArchived: {
    backgroundColor: tokens.colorNeutralBackground3,
    ...shorthands.borderColor(tokens.colorNeutralStroke1),
  },
  versionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  versionInfo: {
    display: 'flex',
    gap: tokens.spacingHorizontalM,
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  versionMeta: {
    display: 'flex',
    gap: tokens.spacingHorizontalS,
    alignItems: 'center',
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
  },
  versionTags: {
    marginTop: tokens.spacingVerticalS,
  },
  versionNotes: {
    marginTop: tokens.spacingVerticalM,
    padding: tokens.spacingVerticalS,
    backgroundColor: tokens.colorNeutralBackground2,
    borderRadius: tokens.borderRadiusMedium,
  },
  usageSection: {
    marginTop: tokens.spacingVerticalM,
  },
  usageList: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
    marginTop: tokens.spacingVerticalS,
  },
  usageItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    ...shorthands.padding(tokens.spacingVerticalXS, tokens.spacingHorizontalS),
    backgroundColor: tokens.colorNeutralBackground2,
    borderRadius: tokens.borderRadiusSmall,
  },
  loadMoreButton: {
    alignSelf: 'center',
    marginTop: tokens.spacingVerticalM,
  },
  dialogTextarea: {
    width: '100%',
    minHeight: '120px',
  },
  emptyState: {
    textAlign: 'center',
    padding: tokens.spacingVerticalXXL,
    color: tokens.colorNeutralForeground3,
  },
});

interface VersionHistoryProps {
  templateId: string;
  currentVersion?: string;
  onVersionSelect?: (version: TemplateVersion) => void;
  onRollback?: (version: TemplateVersion) => void;
  readOnly?: boolean;
}

export const VersionHistory: React.FC<VersionHistoryProps> = ({
  templateId,
  currentVersion,
  onVersionSelect,
  onRollback,
  readOnly = false,
}) => {
  const styles = useStyles();
  const queryClient = useQueryClient();
  const [editingNotes, setEditingNotes] = useState<string | null>(null);
  const [notes, setNotes] = useState<string>('');
  const [showUsageDialog, setShowUsageDialog] = useState<string | null>(null);
  const [expandedUsage, setExpandedUsage] = useState<Set<string>>(new Set());

  const { data: versions, isLoading, error } = useQuery({
    queryKey: ['template-versions', templateId],
    queryFn: () => templateService.getVersions(templateId),
    enabled: !!templateId,
  });

  const { data: versionUsage } = useQuery({
    queryKey: ['template-version-usage', showUsageDialog],
    queryFn: () => templateService.getVersionUsage(templateId, showUsageDialog!),
    enabled: !!showUsageDialog,
  });

  const updateTagsMutation = useMutation({
    mutationFn: ({ versionId, tags }: { versionId: string; tags: VersionTag[] }) =>
      templateService.updateVersionTags(templateId, versionId, tags),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['template-versions', templateId] });
    },
  });

  const updateNotesMutation = useMutation({
    mutationFn: ({ versionId, notes }: { versionId: string; notes: string }) =>
      templateService.updateVersionNotes(templateId, versionId, notes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['template-versions', templateId] });
      setEditingNotes(null);
      setNotes('');
    },
  });

  const handleTagToggle = (versionId: string, tag: VersionTag, currentTags: VersionTag[]) => {
    if (readOnly) return;
    
    const newTags = currentTags.includes(tag)
      ? currentTags.filter(t => t !== tag)
      : [...currentTags, tag];
    
    updateTagsMutation.mutate({ versionId, tags: newTags });
  };

  const handleNotesEdit = (version: TemplateVersion) => {
    if (readOnly || version.isPublished) return;
    setEditingNotes(version.id);
    setNotes(version.changelog || '');
  };

  const handleNotesSave = () => {
    if (!editingNotes) return;
    updateNotesMutation.mutate({ versionId: editingNotes, notes });
  };

  const handleUsageToggle = (versionId: string) => {
    setExpandedUsage(prev => {
      const next = new Set(prev);
      if (next.has(versionId)) {
        next.delete(versionId);
      } else {
        next.add(versionId);
      }
      return next;
    });
  };

  const getVersionStatusColor = (version: TemplateVersion) => {
    if (version.version === currentVersion) return styles.versionDotCurrent;
    if (version.tags?.includes('deprecated')) return styles.versionDotDeprecated;
    if (version.tags?.includes('archived')) return styles.versionDotArchived;
    return '';
  };

  const getTagColor = (tag: VersionTag): 'brand' | 'success' | 'warning' | 'neutral' => {
    switch (tag) {
      case 'stable': return 'success';
      case 'beta': return 'warning';
      case 'deprecated': return 'warning';
      case 'archived': return 'neutral';
      default: return 'brand';
    }
  };

  const getTagIcon = (tag: VersionTag) => {
    switch (tag) {
      case 'stable': return <CheckmarkCircle24Regular />;
      case 'beta': return <Warning24Regular />;
      case 'deprecated': return <Warning24Regular />;
      case 'archived': return <Archive24Regular />;
      default: return <Tag24Regular />;
    }
  };

  if (isLoading) {
    return (
      <div className={styles.container} style={{ textAlign: 'center' }}>
        <Spinner label="Loading version history..." />
      </div>
    );
  }

  if (error) {
    return (
      <MessageBar intent="error" className={styles.container}>
        Failed to load version history. Please try again.
      </MessageBar>
    );
  }

  if (!versions || versions.length === 0) {
    return (
      <div className={styles.emptyState}>
        <History24Regular style={{ fontSize: '48px' }} />
        <Text size={400}>No version history available</Text>
        <Text size={200}>Version history will appear here once the template is saved</Text>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <History24Regular />
          <Text size={500} weight="semibold">Version History</Text>
          <Badge appearance="filled" color="neutral">
            {versions.length} {versions.length === 1 ? 'version' : 'versions'}
          </Badge>
        </div>
      </div>

      <div className={styles.timeline}>
        <div className={styles.timelineConnector} />
        
        {versions.map((version, index) => (
          <Card key={version.id} className={styles.versionCard}>
            <div className={`${styles.versionDot} ${getVersionStatusColor(version)}`} />
            
            <CardHeader
              header={
                <div className={styles.versionHeader}>
                  <div>
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                      <Text size={400} weight="semibold">
                        Version {version.version}
                      </Text>
                      {version.version === currentVersion && (
                        <Badge appearance="filled" color="success">Current</Badge>
                      )}
                      {version.isPublished && (
                        <Badge appearance="tint" color="informative">Published</Badge>
                      )}
                    </div>
                    
                    <div className={styles.versionMeta}>
                      <Clock24Regular fontSize={14} />
                      <Text size={200}>
                        {format(new Date(version.publishedAt), 'MMM d, yyyy h:mm a')}
                      </Text>
                      <Text size={200}>•</Text>
                      <Text size={200}>
                        {formatDistanceToNow(new Date(version.publishedAt), { addSuffix: true })}
                      </Text>
                    </div>
                    
                    <div className={styles.versionMeta}>
                      <Person24Regular fontSize={14} />
                      <Text size={200}>{version.author}</Text>
                      {version.usageCount > 0 && (
                        <>
                          <Text size={200}>•</Text>
                          <Document24Regular fontSize={14} />
                          <Text size={200}>
                            Used by {version.usageCount} {version.usageCount === 1 ? 'order' : 'orders'}
                          </Text>
                        </>
                      )}
                    </div>
                  </div>
                  
                  {!readOnly && (
                    <Menu>
                      <MenuTrigger disableButtonEnhancement>
                        <Button
                          icon={<MoreVertical24Regular />}
                          appearance="subtle"
                          aria-label="More actions"
                        />
                      </MenuTrigger>
                      <MenuPopover>
                        <MenuList>
                          <MenuItem
                            onClick={() => onVersionSelect?.(version)}
                            disabled={version.isPublished}
                          >
                            View Details
                          </MenuItem>
                          {!version.isPublished && (
                            <MenuItem onClick={() => handleNotesEdit(version)}>
                              Edit Notes
                            </MenuItem>
                          )}
                          {version.usageCount > 0 && (
                            <MenuItem onClick={() => setShowUsageDialog(version.id)}>
                              View Usage
                            </MenuItem>
                          )}
                          {onRollback && index > 0 && (
                            <MenuItem onClick={() => onRollback(version)}>
                              Rollback to This Version
                            </MenuItem>
                          )}
                        </MenuList>
                      </MenuPopover>
                    </Menu>
                  )}
                </div>
              }
            />
            
            <CardPreview>
              {version.tags && version.tags.length > 0 && (
                <div className={styles.versionTags}>
                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                    {version.tags.map(tag => (
                      <Tag
                        key={tag}
                        appearance="filled"
                        icon={getTagIcon(tag)}
                        dismissible={!readOnly && !version.isPublished}
                        onDismiss={() => handleTagToggle(version.id, tag, version.tags!)}
                      >
                        {tag}
                      </Tag>
                    ))}
                  </div>
                </div>
              )}
              
              {version.changelog && (
                <div className={styles.versionNotes}>
                  <Text size={200} weight="semibold">Notes:</Text>
                  <Text size={200} style={{ whiteSpace: 'pre-wrap', marginTop: '4px' }}>
                    {version.changelog}
                  </Text>
                </div>
              )}
              
              {version.usageCount > 0 && expandedUsage.has(version.id) && (
                <div className={styles.usageSection}>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <DocumentMultiple24Regular fontSize={16} />
                    <Text size={300} weight="semibold">Active Orders</Text>
                  </div>
                  <div className={styles.usageList}>
                    {/* Placeholder for usage items - would be loaded dynamically */}
                    <div className={styles.usageItem}>
                      <Text size={200}>Loading usage information...</Text>
                    </div>
                  </div>
                </div>
              )}
              
              {version.usageCount > 0 && (
                <Button
                  appearance="subtle"
                  icon={<ChevronRight24Regular />}
                  iconPosition="after"
                  size="small"
                  onClick={() => handleUsageToggle(version.id)}
                >
                  {expandedUsage.has(version.id) ? 'Hide' : 'Show'} {version.usageCount} orders using this version
                </Button>
              )}
            </CardPreview>
          </Card>
        ))}
      </div>

      {/* Edit Notes Dialog */}
      <Dialog open={!!editingNotes} onOpenChange={() => setEditingNotes(null)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>Edit Version Notes</DialogTitle>
            <DialogContent>
              <Field label="Version Notes / Changelog">
                <Textarea
                  value={notes}
                  onChange={(e, data) => setNotes(data.value)}
                  placeholder="Describe the changes in this version..."
                  className={styles.dialogTextarea}
                  resize="vertical"
                />
              </Field>
            </DialogContent>
            <DialogActions>
              <DialogTrigger disableButtonEnhancement>
                <Button appearance="secondary">Cancel</Button>
              </DialogTrigger>
              <Button appearance="primary" onClick={handleNotesSave}>
                Save Notes
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      {/* Version Usage Dialog */}
      <Dialog open={!!showUsageDialog} onOpenChange={() => setShowUsageDialog(null)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>Orders Using This Version</DialogTitle>
            <DialogContent>
              {versionUsage ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {versionUsage.orders.map((order: VersionUsage) => (
                    <Card key={order.orderId}>
                      <CardHeader
                        header={
                          <div>
                            <Text weight="semibold">{order.orderName}</Text>
                            <Text size={200} color="neutral">
                              Order ID: {order.orderId}
                            </Text>
                            <Text size={200}>
                              Deployed: {format(new Date(order.deployedAt), 'MMM d, yyyy')}
                            </Text>
                          </div>
                        }
                      />
                    </Card>
                  ))}
                </div>
              ) : (
                <Spinner label="Loading usage information..." />
              )}
            </DialogContent>
            <DialogActions>
              <DialogTrigger disableButtonEnhancement>
                <Button appearance="primary">Close</Button>
              </DialogTrigger>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  );
};