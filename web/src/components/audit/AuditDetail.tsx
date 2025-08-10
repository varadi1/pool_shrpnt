import React, { useState, useCallback } from 'react';
import {
  Card,
  Text,
  Button,
  TabList,
  Tab,
  TabValue,
  Label,
  Avatar,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Skeleton,
  SkeletonItem,
  Tooltip,
  Badge,
  Divider,
  makeStyles,
  tokens,
  shorthands,
} from '@fluentui/react-components';
import { 
  Copy20Regular,
  CheckmarkCircle20Regular,
  ErrorCircle20Regular,
  Warning20Regular,
  Info20Regular,
  Timeline20Regular,
  ChevronRight20Regular,
  ChevronDown20Regular,
  Dismiss20Regular,
} from '@fluentui/react-icons';
import { format, formatDistanceToNow } from 'date-fns';
import type { AuditEntry, CorrelationGroup } from '../../types/audit';
import { useApi } from '../../hooks/useApi';
import { useQuery } from '@tanstack/react-query';

const useStyles = makeStyles({
  container: {
    padding: tokens.spacingVerticalXL,
    backgroundColor: tokens.colorNeutralBackground1,
    ...shorthands.borderRadius(tokens.borderRadiusMedium),
    boxShadow: tokens.shadow4,
  },
  header: {
    marginBottom: tokens.spacingVerticalXL,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  section: {
    marginBottom: tokens.spacingVerticalL,
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: tokens.spacingVerticalM,
    cursor: 'pointer',
    '&:hover': {
      backgroundColor: tokens.colorNeutralBackground1Hover,
    },
    padding: tokens.spacingVerticalS,
    ...shorthands.borderRadius(tokens.borderRadiusMedium),
  },
  label: {
    fontWeight: tokens.fontWeightSemibold,
    minWidth: '140px',
    color: tokens.colorNeutralForeground1,
  },
  value: {
    color: tokens.colorNeutralForeground2,
  },
  statusBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
  },
  severityIcon: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
  },
  jsonViewer: {
    backgroundColor: tokens.colorNeutralBackground2,
    padding: tokens.spacingVerticalM,
    ...shorthands.borderRadius(tokens.borderRadiusSmall),
    fontFamily: 'Monaco, Courier, monospace',
    fontSize: tokens.fontSizeBase200,
    overflowX: 'auto',
    maxHeight: '400px',
    overflowY: 'auto',
  },
  diffContainer: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: tokens.spacingHorizontalL,
  },
  diffPanel: {
    backgroundColor: tokens.colorNeutralBackground2,
    padding: tokens.spacingVerticalM,
    ...shorthands.borderRadius(tokens.borderRadiusSmall),
    fontFamily: 'Monaco, Courier, monospace',
    fontSize: tokens.fontSizeBase200,
    overflowX: 'auto',
    maxHeight: '300px',
    overflowY: 'auto',
  },
  diffBefore: {
    borderLeft: `3px solid ${tokens.colorPaletteRedBorder2}`,
  },
  diffAfter: {
    borderLeft: `3px solid ${tokens.colorPaletteGreenBorder2}`,
  },
  timeline: {
    position: 'relative',
    paddingLeft: '32px',
  },
  timelineItem: {
    position: 'relative',
    paddingBottom: tokens.spacingVerticalL,
    '&:before': {
      content: '""',
      position: 'absolute',
      left: '-24px',
      top: '12px',
      bottom: '-12px',
      width: '2px',
      backgroundColor: tokens.colorNeutralStroke1,
    },
    '&:last-child:before': {
      display: 'none',
    },
  },
  timelineMarker: {
    position: 'absolute',
    left: '-28px',
    top: '8px',
    width: '10px',
    height: '10px',
    borderRadius: '50%',
    backgroundColor: tokens.colorBrandBackground,
    border: `2px solid ${tokens.colorNeutralBackground1}`,
    boxShadow: tokens.shadow2,
  },
  timelineContent: {
    backgroundColor: tokens.colorNeutralBackground1,
    padding: tokens.spacingVerticalM,
    ...shorthands.borderRadius(tokens.borderRadiusSmall),
    border: `1px solid ${tokens.colorNeutralStroke1}`,
    cursor: 'pointer',
    transition: 'box-shadow 0.2s',
    '&:hover': {
      boxShadow: tokens.shadow8,
    },
  },
  correlationCard: {
    padding: tokens.spacingVerticalL,
    backgroundColor: tokens.colorNeutralBackground2,
    ...shorthands.borderRadius(tokens.borderRadiusMedium),
    marginBottom: tokens.spacingVerticalM,
  },
  copyButton: {
    minWidth: 'auto',
  },
  expandButton: {
    minWidth: 'auto',
    padding: '2px',
  },
  infoRow: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    marginBottom: tokens.spacingVerticalS,
  },
  tabContent: {
    marginTop: tokens.spacingVerticalL,
  },
  personaSection: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    marginBottom: tokens.spacingVerticalM,
  },
});

interface AuditDetailProps {
  entryId?: string;
  entry?: AuditEntry;
  onClose?: () => void;
  onNavigateToEntry?: (entryId: string) => void;
}

export const AuditDetail: React.FC<AuditDetailProps> = ({
  entryId,
  entry: providedEntry,
  onClose,
  onNavigateToEntry,
}) => {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['details', 'metadata']));
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [selectedTab, setSelectedTab] = useState<TabValue>('details');
  const api = useApi();
  const styles = useStyles();

  const { data: fetchedEntry, isLoading: isLoadingEntry } = useQuery({
    queryKey: ['audit', 'entry', entryId],
    queryFn: async () => {
      if (!entryId) return null;
      const response = await api.get(`/api/audit/logs/${entryId}`);
      return response.data as AuditEntry;
    },
    enabled: !!entryId && !providedEntry,
  });

  const entry = providedEntry || fetchedEntry;

  const { data: correlatedEvents, isLoading: isLoadingCorrelated } = useQuery({
    queryKey: ['audit', 'correlation', entry?.metadata?.correlationId],
    queryFn: async () => {
      if (!entry?.metadata?.correlationId) return null;
      const response = await api.get(`/api/audit/correlation/${entry.metadata.correlationId}`);
      return response.data as CorrelationGroup;
    },
    enabled: !!entry?.metadata?.correlationId,
  });

  const toggleSection = useCallback((section: string) => {
    setExpandedSections(prev => {
      const newSet = new Set(prev);
      if (newSet.has(section)) {
        newSet.delete(section);
      } else {
        newSet.add(section);
      }
      return newSet;
    });
  }, []);

  const copyToClipboard = useCallback(async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedText(label);
      setTimeout(() => setCopiedText(null), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  }, []);

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical':
        return <ErrorCircle20Regular primaryFill={tokens.colorPaletteRedForeground1} />;
      case 'error':
        return <ErrorCircle20Regular primaryFill={tokens.colorPaletteOrangeForeground1} />;
      case 'warning':
        return <Warning20Regular primaryFill={tokens.colorPaletteYellowForeground2} />;
      default:
        return <Info20Regular primaryFill={tokens.colorBrandForeground1} />;
    }
  };

  const getStatusIcon = (status: string) => {
    return status === 'success' ? 
      <CheckmarkCircle20Regular primaryFill={tokens.colorPaletteGreenForeground1} /> :
      <ErrorCircle20Regular primaryFill={tokens.colorPaletteRedForeground1} />;
  };

  const formatJsonData = (data: unknown) => {
    try {
      return JSON.stringify(data, null, 2);
    } catch {
      return String(data);
    }
  };

  const renderDiffView = () => {
    if (!entry?.changes) return null;

    return (
      <div className={styles.diffContainer}>
        <div>
          <Label size="medium" weight="semibold">Before</Label>
          <div className={`${styles.diffPanel} ${styles.diffBefore}`}>
            <pre style={{ margin: 0 }}>
              {formatJsonData(entry.changes.before)}
            </pre>
          </div>
        </div>
        <div>
          <Label size="medium" weight="semibold">After</Label>
          <div className={`${styles.diffPanel} ${styles.diffAfter}`}>
            <pre style={{ margin: 0 }}>
              {formatJsonData(entry.changes.after)}
            </pre>
          </div>
        </div>
      </div>
    );
  };

  const renderTimeline = () => {
    if (!correlatedEvents?.events || correlatedEvents.events.length === 0) return null;

    return (
      <div className={styles.timeline}>
        {correlatedEvents.events.map((event) => (
          <div key={event.id} className={styles.timelineItem}>
            <div 
              className={styles.timelineMarker}
              style={{
                backgroundColor: event.status === 'success' ? 
                  tokens.colorPaletteGreenBackground3 : 
                  tokens.colorPaletteRedBackground3,
                ...(correlatedEvents.criticalPath?.includes(event.id) && {
                  width: '14px',
                  height: '14px',
                  left: '-30px',
                }),
              }}
            />
            <Card 
              className={styles.timelineContent}
              onClick={() => onNavigateToEntry?.(event.id)}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <Text weight="semibold" size={300}>
                    {event.action.description}
                  </Text>
                  <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                    {format(new Date(event.timestamp), 'HH:mm:ss.SSS')}
                    {event.metadata?.duration && ` (${event.metadata.duration}ms)`}
                  </Text>
                </div>
                <div style={{ display: 'flex', gap: tokens.spacingHorizontalS, alignItems: 'center' }}>
                  {getStatusIcon(event.status)}
                  {correlatedEvents.criticalPath?.includes(event.id) && (
                    <Tooltip content="Critical Path" relationship="label">
                      <Timeline20Regular style={{ color: tokens.colorPaletteYellowForeground2 }} />
                    </Tooltip>
                  )}
                </div>
              </div>
              {event.target && (
                <Text size={200} style={{ color: tokens.colorNeutralForeground3, marginTop: tokens.spacingVerticalXS }}>
                  {event.target.type}: {event.target.name || event.target.id}
                </Text>
              )}
            </Card>
          </div>
        ))}
      </div>
    );
  };

  if (isLoadingEntry) {
    return (
      <Card className={styles.container}>
        <Skeleton>
          <SkeletonItem />
        </Skeleton>
        <Skeleton>
          <SkeletonItem />
        </Skeleton>
        <Skeleton>
          <SkeletonItem />
        </Skeleton>
      </Card>
    );
  }

  if (!entry) {
    return (
      <MessageBar intent="error">
        <MessageBarBody>
          <MessageBarTitle>Audit entry not found</MessageBarTitle>
        </MessageBarBody>
      </MessageBar>
    );
  }

  return (
    <Card className={styles.container}>
      <div className={styles.header}>
        <div>
          <Text size={700} weight="semibold" as="h1">
            Audit Entry Details
          </Text>
          <Text size={300} style={{ color: tokens.colorNeutralForeground3 }}>
            {format(new Date(entry.timestamp), 'PPpp')} ({formatDistanceToNow(new Date(entry.timestamp), { addSuffix: true })})
          </Text>
        </div>
        {onClose && (
          <Button
            appearance="subtle"
            icon={<Dismiss20Regular />}
            onClick={onClose}
            aria-label="Close"
          />
        )}
      </div>

      <TabList
        selectedValue={selectedTab}
        onTabSelect={(_, data) => setSelectedTab(data.value)}
      >
        <Tab value="details">Details</Tab>
        <Tab value="changes">Changes</Tab>
        <Tab value="correlation">Correlation</Tab>
        <Tab value="raw">Raw Data</Tab>
      </TabList>

      {selectedTab === 'details' && (
        <div className={styles.tabContent}>
          <div className={styles.section}>
            <div className={styles.sectionHeader} onClick={() => toggleSection('event')}>
              <Text weight="semibold" size={400}>Event Information</Text>
              <Button
                appearance="subtle"
                icon={expandedSections.has('event') ? <ChevronDown20Regular /> : <ChevronRight20Regular />}
                size="small"
              />
            </div>
            {expandedSections.has('event') && (
              <div>
                <div className={styles.infoRow}>
                  <Label className={styles.label}>Status:</Label>
                  <Badge 
                    appearance={entry.status === 'success' ? 'success' : 'danger'}
                    icon={getStatusIcon(entry.status)}
                  >
                    {entry.status.toUpperCase()}
                  </Badge>
                </div>
                <div className={styles.infoRow}>
                  <Label className={styles.label}>Action:</Label>
                  <div className={styles.severityIcon}>
                    {getSeverityIcon(entry.action.severity)}
                    <Text className={styles.value}>{entry.action.description}</Text>
                  </div>
                </div>
                <div className={styles.infoRow}>
                  <Label className={styles.label}>Type:</Label>
                  <Text className={styles.value}>{entry.action.type}</Text>
                </div>
                <div className={styles.infoRow}>
                  <Label className={styles.label}>Category:</Label>
                  <Text className={styles.value}>{entry.action.category}</Text>
                </div>
                {entry.error && (
                  <MessageBar intent="error">
                    <MessageBarBody>
                      <MessageBarTitle>Error Details</MessageBarTitle>
                      <Text size={200}>
                        <strong>Code:</strong> {entry.error.code}<br />
                        <strong>Message:</strong> {entry.error.message}
                      </Text>
                    </MessageBarBody>
                  </MessageBar>
                )}
              </div>
            )}
          </div>

          <Divider />

          <div className={styles.section}>
            <div className={styles.sectionHeader} onClick={() => toggleSection('actor')}>
              <Text weight="semibold" size={400}>Actor</Text>
              <Button
                appearance="subtle"
                icon={expandedSections.has('actor') ? <ChevronDown20Regular /> : <ChevronRight20Regular />}
                size="small"
              />
            </div>
            {expandedSections.has('actor') && (
              <div>
                <div className={styles.personaSection}>
                  <Avatar 
                    name={entry.actor.name}
                    badge={{ status: entry.actor.type === 'user' ? 'available' : 'busy' }}
                  />
                  <div>
                    <Text weight="semibold">{entry.actor.name}</Text>
                    <Text size={200} style={{ display: 'block' }}>{entry.actor.email}</Text>
                    <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                      {entry.actor.role} ({entry.actor.type})
                    </Text>
                  </div>
                </div>
                <div className={styles.infoRow}>
                  <Label className={styles.label}>Actor ID:</Label>
                  <Text className={styles.value}>{entry.actor.id}</Text>
                  <Tooltip content={copiedText === 'actorId' ? 'Copied!' : 'Copy Actor ID'} relationship="label">
                    <Button
                      appearance="subtle"
                      icon={<Copy20Regular />}
                      size="small"
                      onClick={() => copyToClipboard(entry.actor.id, 'actorId')}
                    />
                  </Tooltip>
                </div>
              </div>
            )}
          </div>

          <Divider />

          <div className={styles.section}>
            <div className={styles.sectionHeader} onClick={() => toggleSection('target')}>
              <Text weight="semibold" size={400}>Target</Text>
              <Button
                appearance="subtle"
                icon={expandedSections.has('target') ? <ChevronDown20Regular /> : <ChevronRight20Regular />}
                size="small"
              />
            </div>
            {expandedSections.has('target') && entry.target && (
              <div>
                <div className={styles.infoRow}>
                  <Label className={styles.label}>Type:</Label>
                  <Text className={styles.value}>{entry.target.type}</Text>
                </div>
                <div className={styles.infoRow}>
                  <Label className={styles.label}>ID:</Label>
                  <Text className={styles.value}>{entry.target.id}</Text>
                  <Tooltip content={copiedText === 'targetId' ? 'Copied!' : 'Copy Target ID'} relationship="label">
                    <Button
                      appearance="subtle"
                      icon={<Copy20Regular />}
                      size="small"
                      onClick={() => copyToClipboard(entry.target.id, 'targetId')}
                    />
                  </Tooltip>
                </div>
                {entry.target.name && (
                  <div className={styles.infoRow}>
                    <Label className={styles.label}>Name:</Label>
                    <Text className={styles.value}>{entry.target.name}</Text>
                  </div>
                )}
                {entry.target.path && (
                  <div className={styles.infoRow}>
                    <Label className={styles.label}>Path:</Label>
                    <Text className={styles.value}>{entry.target.path}</Text>
                  </div>
                )}
              </div>
            )}
          </div>

          <Divider />

          <div className={styles.section}>
            <div className={styles.sectionHeader} onClick={() => toggleSection('metadata')}>
              <Text weight="semibold" size={400}>Metadata</Text>
              <Button
                appearance="subtle"
                icon={expandedSections.has('metadata') ? <ChevronDown20Regular /> : <ChevronRight20Regular />}
                size="small"
              />
            </div>
            {expandedSections.has('metadata') && (
              <div>
                <div className={styles.infoRow}>
                  <Label className={styles.label}>Correlation ID:</Label>
                  <Text className={styles.value}>{entry.metadata.correlationId}</Text>
                  <Tooltip content={copiedText === 'correlationId' ? 'Copied!' : 'Copy Correlation ID'} relationship="label">
                    <Button
                      appearance="subtle"
                      icon={<Copy20Regular />}
                      size="small"
                      onClick={() => copyToClipboard(entry.metadata.correlationId, 'correlationId')}
                    />
                  </Tooltip>
                </div>
                {entry.metadata.sessionId && (
                  <div className={styles.infoRow}>
                    <Label className={styles.label}>Session ID:</Label>
                    <Text className={styles.value}>{entry.metadata.sessionId}</Text>
                  </div>
                )}
                {entry.metadata.ipAddress && (
                  <div className={styles.infoRow}>
                    <Label className={styles.label}>IP Address:</Label>
                    <Text className={styles.value}>{entry.metadata.ipAddress}</Text>
                  </div>
                )}
                {entry.metadata.userAgent && (
                  <div className={styles.infoRow}>
                    <Label className={styles.label}>User Agent:</Label>
                    <Text size={200} className={styles.value}>{entry.metadata.userAgent}</Text>
                  </div>
                )}
                {entry.metadata.duration !== undefined && (
                  <div className={styles.infoRow}>
                    <Label className={styles.label}>Duration:</Label>
                    <Text className={styles.value}>{entry.metadata.duration}ms</Text>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {selectedTab === 'changes' && (
        <div className={styles.tabContent}>
          {entry.changes ? (
            renderDiffView()
          ) : (
            <MessageBar>
              <MessageBarBody>
                No changes recorded for this event
              </MessageBarBody>
            </MessageBar>
          )}
        </div>
      )}

      {selectedTab === 'correlation' && (
        <div className={styles.tabContent}>
          {isLoadingCorrelated ? (
            <div>
              <Skeleton>
                <SkeletonItem />
              </Skeleton>
              <Skeleton>
                <SkeletonItem />
              </Skeleton>
              <Skeleton>
                <SkeletonItem />
              </Skeleton>
            </div>
          ) : correlatedEvents && correlatedEvents.events.length > 1 ? (
            <>
              <Card className={styles.correlationCard}>
                <Text weight="semibold" size={400}>
                  Correlation Summary
                </Text>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: tokens.spacingHorizontalL, marginTop: tokens.spacingVerticalM }}>
                  <div>
                    <Label>Total Events:</Label>
                    <Text>{correlatedEvents.events.length}</Text>
                  </div>
                  <div>
                    <Label>Duration:</Label>
                    <Text>{correlatedEvents.duration}ms</Text>
                  </div>
                  <div>
                    <Label>Status:</Label>
                    <Text>{correlatedEvents.status}</Text>
                  </div>
                  <div>
                    <Label>Services:</Label>
                    <Text>{correlatedEvents.services.join(', ')}</Text>
                  </div>
                </div>
              </Card>
              <Text weight="semibold" size={400}>
                Event Timeline
              </Text>
              {renderTimeline()}
            </>
          ) : (
            <MessageBar>
              <MessageBarBody>
                No correlated events found
              </MessageBarBody>
            </MessageBar>
          )}
        </div>
      )}

      {selectedTab === 'raw' && (
        <div className={styles.tabContent}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: tokens.spacingVerticalM }}>
            <Text weight="semibold" size={400}>
              Raw JSON Data
            </Text>
            <Tooltip content={copiedText === 'json' ? 'Copied!' : 'Copy JSON'} relationship="label">
              <Button
                appearance="secondary"
                icon={<Copy20Regular />}
                onClick={() => copyToClipboard(formatJsonData(entry), 'json')}
              >
                Copy JSON
              </Button>
            </Tooltip>
          </div>
          <div className={styles.jsonViewer}>
            <pre style={{ margin: 0 }}>
              {formatJsonData(entry)}
            </pre>
          </div>
        </div>
      )}
    </Card>
  );
};