import React, { useState, useMemo } from 'react';
import {
  Card,
  CardHeader,
  Title3,
  Body1,
  Caption1,
  Button,
  Badge,
  Divider,
  makeStyles,
  tokens,
  shorthands,
  Accordion,
  AccordionItem,
  AccordionHeader,
  AccordionPanel,
  Tooltip,
  Tag,
  TagGroup,
  Subtitle2,
  Body2,
  Link,
  Spinner,
  MessageBar,
  MessageBarTitle,
  MessageBarBody,
} from '@fluentui/react-components';
import {
  ChevronRight20Regular,
  ChevronDown20Regular,
  Clock20Regular,
  CheckmarkCircle20Regular,
  ErrorCircle20Regular,
  Info20Regular,
  ArrowExportLtr20Regular,
  Flow20Regular,
  Timeline20Regular,
  ArrowBetweenDown20Regular,
  DocumentBulletList20Regular,
} from '@fluentui/react-icons';
import type { AuditEntry, CorrelationGroup } from '../../types/audit';
import { EventTypeIcon } from './EventTypeIcon';
import { AUDIT_EVENT_METADATA } from '../../types/audit';

const useStyles = makeStyles({
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statsRow: {
    display: 'flex',
    gap: tokens.spacingHorizontalM,
    flexWrap: 'wrap',
    marginTop: tokens.spacingVerticalS,
  },
  stat: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
  },
  viewToggle: {
    display: 'flex',
    gap: tokens.spacingHorizontalS,
  },
  timeline: {
    position: 'relative',
    paddingLeft: tokens.spacingHorizontalXXL,
  },
  timelineItem: {
    position: 'relative',
    paddingBottom: tokens.spacingVerticalL,
    '&:last-child': {
      paddingBottom: 0,
    },
  },
  timelineLine: {
    position: 'absolute',
    left: '10px',
    top: '20px',
    bottom: 0,
    width: '2px',
    backgroundColor: tokens.colorNeutralStroke1,
  },
  timelineNode: {
    position: 'absolute',
    left: '0',
    top: '4px',
    width: '22px',
    height: '22px',
    borderRadius: '50%',
    backgroundColor: tokens.colorNeutralBackground1,
    border: `2px solid ${tokens.colorNeutralStroke1}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  timelineNodeCritical: {
    border: `3px solid ${tokens.colorPaletteRedBorder1}`,
    backgroundColor: tokens.colorPaletteRedBackground1,
  },
  timelineNodeSuccess: {
    border: `2px solid ${tokens.colorPaletteGreenBorder1}`,
  },
  timelineNodeError: {
    border: `2px solid ${tokens.colorPaletteRedBorder1}`,
  },
  timelineContent: {
    backgroundColor: tokens.colorNeutralBackground2,
    ...shorthands.borderRadius(tokens.borderRadiusMedium),
    ...shorthands.padding(tokens.spacingVerticalS, tokens.spacingHorizontalM),
    ...shorthands.border('1px', 'solid', tokens.colorNeutralStroke2),
  },
  timelineContentCritical: {
    backgroundColor: tokens.colorPaletteRedBackground1,
    ...shorthands.border('2px', 'solid', tokens.colorPaletteRedBorder1),
  },
  eventHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: tokens.spacingVerticalS,
  },
  eventTitle: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
  },
  eventMeta: {
    display: 'flex',
    gap: tokens.spacingHorizontalM,
    marginTop: tokens.spacingVerticalXS,
  },
  eventMetaItem: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    color: tokens.colorNeutralForeground3,
  },
  flowDiagram: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
    ...shorthands.padding(tokens.spacingVerticalM),
  },
  flowService: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    ...shorthands.padding(tokens.spacingVerticalS, tokens.spacingHorizontalM),
    backgroundColor: tokens.colorNeutralBackground2,
    ...shorthands.borderRadius(tokens.borderRadiusMedium),
  },
  flowArrow: {
    display: 'flex',
    justifyContent: 'center',
    ...shorthands.padding(tokens.spacingVerticalXS),
  },
  criticalPath: {
    backgroundColor: tokens.colorPaletteYellowBackground1,
    ...shorthands.border('2px', 'solid', tokens.colorPaletteYellowBorder1),
  },
  expandedContent: {
    ...shorthands.padding(tokens.spacingVerticalS),
  },
  errorMessage: {
    marginTop: tokens.spacingVerticalM,
  },
  noData: {
    ...shorthands.padding(tokens.spacingVerticalXL),
    textAlign: 'center',
  },
});

interface CorrelationViewProps {
  correlationId: string;
  events?: AuditEntry[];
  loading?: boolean;
  error?: string;
  onExport?: (correlationId: string, events: AuditEntry[]) => void;
  onEventClick?: (eventId: string) => void;
}

type ViewMode = 'timeline' | 'flow' | 'list';

export const CorrelationView: React.FC<CorrelationViewProps> = ({
  correlationId,
  events = [],
  loading = false,
  error,
  onExport,
  onEventClick,
}) => {
  const styles = useStyles();
  const [viewMode, setViewMode] = useState<ViewMode>('timeline');
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  const correlationGroup = useMemo<CorrelationGroup | null>(() => {
    if (!events.length) return null;

    const sortedEvents = [...events].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    const services = new Set<string>();
    const criticalPath: string[] = [];
    let hasError = false;

    sortedEvents.forEach(event => {
      services.add(event.actor.type === 'system' ? event.actor.name : 'user');
      
      if (event.status === 'failure') {
        hasError = true;
        criticalPath.push(event.id);
      } else if (event.action.severity === 'critical' || event.action.severity === 'error') {
        criticalPath.push(event.id);
      }
    });

    const startTime = sortedEvents[0].timestamp;
    const endTime = sortedEvents[sortedEvents.length - 1].timestamp;
    const duration = new Date(endTime).getTime() - new Date(startTime).getTime();

    return {
      correlationId,
      events: sortedEvents,
      startTime,
      endTime,
      duration,
      services: Array.from(services),
      status: hasError ? 'failure' : sortedEvents.some(e => e.status === 'failure') ? 'partial' : 'success',
      criticalPath,
    };
  }, [correlationId, events]);

  const toggleExpanded = (eventId: string) => {
    setExpandedItems(prev => {
      const next = new Set(prev);
      if (next.has(eventId)) {
        next.delete(eventId);
      } else {
        next.add(eventId);
      }
      return next;
    });
  };

  const formatDuration = (ms: number): string => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60000)}m ${((ms % 60000) / 1000).toFixed(0)}s`;
  };

  const formatTimestamp = (timestamp: string): string => {
    return new Date(timestamp).toLocaleString();
  };

  const getRelativeTime = (timestamp: string): string => {
    if (!correlationGroup) return '';
    const ms = new Date(timestamp).getTime() - new Date(correlationGroup.startTime).getTime();
    return `+${formatDuration(ms)}`;
  };

  const getStatusIcon = (status: 'success' | 'failure') => {
    return status === 'success' ? (
      <CheckmarkCircle20Regular style={{ color: tokens.colorPaletteGreenForeground1 }} />
    ) : (
      <ErrorCircle20Regular style={{ color: tokens.colorPaletteRedForeground1 }} />
    );
  };

  const renderTimelineView = () => {
    if (!correlationGroup) return null;

    return (
      <div className={styles.timeline}>
        {correlationGroup.events.map((event, index) => {
          const isCritical = correlationGroup.criticalPath.includes(event.id);
          const isExpanded = expandedItems.has(event.id);
          const isLast = index === correlationGroup.events.length - 1;

          return (
            <div key={event.id} className={styles.timelineItem}>
              {!isLast && <div className={styles.timelineLine} />}
              <div
                className={`${styles.timelineNode} ${
                  isCritical ? styles.timelineNodeCritical : 
                  event.status === 'success' ? styles.timelineNodeSuccess : 
                  styles.timelineNodeError
                }`}
              >
                {index + 1}
              </div>
              <div className={`${styles.timelineContent} ${isCritical ? styles.timelineContentCritical : ''}`}>
                <div className={styles.eventHeader}>
                  <div className={styles.eventTitle}>
                    <EventTypeIcon eventType={event.action.type} size="small" />
                    <Subtitle2>{AUDIT_EVENT_METADATA[event.action.type]?.label || event.action.type}</Subtitle2>
                    {getStatusIcon(event.status)}
                    {isCritical && (
                      <Tooltip content="Critical path event" relationship="label">
                        <Badge appearance="filled" color="warning">Critical</Badge>
                      </Tooltip>
                    )}
                  </div>
                  <Button
                    appearance="subtle"
                    icon={isExpanded ? <ChevronDown20Regular /> : <ChevronRight20Regular />}
                    onClick={() => toggleExpanded(event.id)}
                    size="small"
                  />
                </div>

                <div className={styles.eventMeta}>
                  <div className={styles.eventMetaItem}>
                    <Clock20Regular fontSize={14} />
                    <Caption1>{getRelativeTime(event.timestamp)}</Caption1>
                  </div>
                  <div className={styles.eventMetaItem}>
                    <Caption1>{event.actor.name || event.actor.id}</Caption1>
                  </div>
                  {event.target.name && (
                    <div className={styles.eventMetaItem}>
                      <Caption1>→ {event.target.name}</Caption1>
                    </div>
                  )}
                </div>

                {isExpanded && (
                  <div className={styles.expandedContent}>
                    <Divider />
                    <Body2>{event.action.description}</Body2>
                    {event.error && (
                      <MessageBar intent="error" className={styles.errorMessage}>
                        <MessageBarBody>
                          <MessageBarTitle>Error</MessageBarTitle>
                          {event.error.message}
                        </MessageBarBody>
                      </MessageBar>
                    )}
                    {event.metadata.duration && (
                      <Caption1>Duration: {formatDuration(event.metadata.duration)}</Caption1>
                    )}
                    {onEventClick && (
                      <Link onClick={() => onEventClick(event.id)}>View details →</Link>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderFlowView = () => {
    if (!correlationGroup) return null;

    const serviceEvents = correlationGroup.services.map(service => ({
      service,
      events: correlationGroup.events.filter(e => 
        (e.actor.type === 'system' ? e.actor.name : 'user') === service
      ),
    }));

    return (
      <div className={styles.flowDiagram}>
        {serviceEvents.map((group, index) => (
          <React.Fragment key={group.service}>
            <div className={styles.flowService}>
              <Flow20Regular />
              <Body1 weight="semibold">{group.service}</Body1>
              <Badge appearance="filled" size="small">
                {group.events.length} event{group.events.length !== 1 ? 's' : ''}
              </Badge>
            </div>
            
            {group.events.map(event => {
              const isCritical = correlationGroup.criticalPath.includes(event.id);
              return (
                <div 
                  key={event.id} 
                  className={`${styles.timelineContent} ${isCritical ? styles.criticalPath : ''}`}
                  style={{ marginLeft: tokens.spacingHorizontalXL }}
                >
                  <div className={styles.eventTitle}>
                    <EventTypeIcon eventType={event.action.type} size="small" />
                    <Body2>{AUDIT_EVENT_METADATA[event.action.type]?.label || event.action.type}</Body2>
                    {getStatusIcon(event.status)}
                  </div>
                  <Caption1>{getRelativeTime(event.timestamp)}</Caption1>
                </div>
              );
            })}
            
            {index < serviceEvents.length - 1 && (
              <div className={styles.flowArrow}>
                <ArrowBetweenDown20Regular />
              </div>
            )}
          </React.Fragment>
        ))}
      </div>
    );
  };

  const renderListView = () => {
    if (!correlationGroup) return null;

    return (
      <Accordion multiple collapsible>
        {correlationGroup.events.map((event, index) => {
          const isCritical = correlationGroup.criticalPath.includes(event.id);
          
          return (
            <AccordionItem key={event.id} value={event.id}>
              <AccordionHeader expandIconPosition="end">
                <div className={styles.eventTitle}>
                  <Badge appearance="ghost" size="small">{index + 1}</Badge>
                  <EventTypeIcon eventType={event.action.type} size="small" />
                  <Body2>{AUDIT_EVENT_METADATA[event.action.type]?.label || event.action.type}</Body2>
                  {getStatusIcon(event.status)}
                  {isCritical && <Badge appearance="filled" color="warning" size="small">Critical</Badge>}
                </div>
              </AccordionHeader>
              <AccordionPanel>
                <div className={styles.expandedContent}>
                  <TagGroup size="small">
                    <Tag>{formatTimestamp(event.timestamp)}</Tag>
                    <Tag>{event.actor.name || event.actor.id}</Tag>
                    {event.target.name && <Tag>Target: {event.target.name}</Tag>}
                    {event.metadata.duration && <Tag>Duration: {formatDuration(event.metadata.duration)}</Tag>}
                  </TagGroup>
                  
                  <Body2>{event.action.description}</Body2>
                  
                  {event.error && (
                    <MessageBar intent="error">
                      <MessageBarBody>{event.error.message}</MessageBarBody>
                    </MessageBar>
                  )}
                  
                  {onEventClick && (
                    <Link onClick={() => onEventClick(event.id)}>View full details →</Link>
                  )}
                </div>
              </AccordionPanel>
            </AccordionItem>
          );
        })}
      </Accordion>
    );
  };

  if (loading) {
    return (
      <Card>
        <CardHeader header={<Title3>Correlation View</Title3>} />
        <div className={styles.noData}>
          <Spinner label="Loading correlation events..." />
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader header={<Title3>Correlation View</Title3>} />
        <MessageBar intent="error">
          <MessageBarBody>
            <MessageBarTitle>Error loading correlation</MessageBarTitle>
            {error}
          </MessageBarBody>
        </MessageBar>
      </Card>
    );
  }

  if (!correlationGroup) {
    return (
      <Card>
        <CardHeader header={<Title3>Correlation View</Title3>} />
        <div className={styles.noData}>
          <Info20Regular fontSize={48} />
          <Body1>No events found for correlation ID: {correlationId}</Body1>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div className={styles.container}>
        <div className={styles.header}>
          <div>
            <Title3>Correlation View</Title3>
            <Caption1>ID: {correlationId}</Caption1>
          </div>
          <div className={styles.viewToggle}>
            <Button
              appearance={viewMode === 'timeline' ? 'primary' : 'subtle'}
              icon={<Timeline20Regular />}
              onClick={() => setViewMode('timeline')}
              size="small"
            >
              Timeline
            </Button>
            <Button
              appearance={viewMode === 'flow' ? 'primary' : 'subtle'}
              icon={<Flow20Regular />}
              onClick={() => setViewMode('flow')}
              size="small"
            >
              Flow
            </Button>
            <Button
              appearance={viewMode === 'list' ? 'primary' : 'subtle'}
              icon={<DocumentBulletList20Regular />}
              onClick={() => setViewMode('list')}
              size="small"
            >
              List
            </Button>
            {onExport && (
              <Button
                appearance="subtle"
                icon={<ArrowExportLtr20Regular />}
                onClick={() => onExport(correlationId, correlationGroup.events)}
                size="small"
              >
                Export
              </Button>
            )}
          </div>
        </div>

        <div className={styles.statsRow}>
          <div className={styles.stat}>
            <Caption1>Duration</Caption1>
            <Body1 weight="semibold">{formatDuration(correlationGroup.duration)}</Body1>
          </div>
          <div className={styles.stat}>
            <Caption1>Events</Caption1>
            <Body1 weight="semibold">{correlationGroup.events.length}</Body1>
          </div>
          <div className={styles.stat}>
            <Caption1>Services</Caption1>
            <Body1 weight="semibold">{correlationGroup.services.length}</Body1>
          </div>
          <div className={styles.stat}>
            <Caption1>Status</Caption1>
            <Badge 
              appearance="filled" 
              color={
                correlationGroup.status === 'success' ? 'success' : 
                correlationGroup.status === 'partial' ? 'warning' : 
                'danger'
              }
            >
              {correlationGroup.status}
            </Badge>
          </div>
          {correlationGroup.criticalPath.length > 0 && (
            <div className={styles.stat}>
              <Caption1>Critical Events</Caption1>
              <Body1 weight="semibold">{correlationGroup.criticalPath.length}</Body1>
            </div>
          )}
        </div>

        <Divider />

        {viewMode === 'timeline' && renderTimelineView()}
        {viewMode === 'flow' && renderFlowView()}
        {viewMode === 'list' && renderListView()}
      </div>
    </Card>
  );
};