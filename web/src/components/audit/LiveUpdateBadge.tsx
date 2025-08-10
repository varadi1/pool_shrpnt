import React from 'react';
import {
  Badge,
  Button,
  makeStyles,
  tokens,
  Text,
  Tooltip,
} from '@fluentui/react-components';
import {
  ArrowSyncRegular,
  CheckmarkCircleRegular,
  ErrorCircleRegular,
  PlugDisconnectedRegular,
  PlugConnectedRegular,
} from '@fluentui/react-icons';
import type { ConnectionStatus } from '@/services/auditWebSocket';

const useStyles = makeStyles({
  container: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
  },
  liveIndicator: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
  },
  liveDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    animation: 'pulse 2s infinite',
  },
  connectedDot: {
    backgroundColor: tokens.colorPaletteGreenBackground2,
  },
  disconnectedDot: {
    backgroundColor: tokens.colorNeutralForeground4,
  },
  reconnectingDot: {
    backgroundColor: tokens.colorPaletteYellowBackground2,
  },
  errorDot: {
    backgroundColor: tokens.colorPaletteRedBackground2,
  },
  '@keyframes pulse': {
    '0%': {
      opacity: 1,
    },
    '50%': {
      opacity: 0.4,
    },
    '100%': {
      opacity: 1,
    },
  },
  newEventsBadge: {
    cursor: 'pointer',
    '&:hover': {
      transform: 'scale(1.05)',
    },
  },
  statusText: {
    fontSize: tokens.fontSizeBase200,
  },
  autoScrollButton: {
    minWidth: 'auto',
  },
});

interface LiveUpdateBadgeProps {
  status: ConnectionStatus;
  newEventCount: number;
  lastEventTime: Date | null;
  autoScrollEnabled: boolean;
  onClearNewEvents: () => void;
  onToggleAutoScroll: () => void;
  onReconnect: () => void;
  isLiveUpdatesEnabled: boolean;
  onToggleLiveUpdates: () => void;
}

export const LiveUpdateBadge: React.FC<LiveUpdateBadgeProps> = ({
  status,
  newEventCount,
  lastEventTime,
  autoScrollEnabled,
  onClearNewEvents,
  onToggleAutoScroll,
  onReconnect,
  isLiveUpdatesEnabled,
  onToggleLiveUpdates,
}) => {
  const styles = useStyles();

  const getStatusIcon = () => {
    switch (status) {
      case 'connected':
        return <PlugConnectedRegular fontSize={16} primaryFill={tokens.colorPaletteGreenForeground1} />;
      case 'connecting':
      case 'reconnecting':
        return <ArrowSyncRegular fontSize={16} primaryFill={tokens.colorPaletteYellowForeground1} />;
      case 'error':
        return <ErrorCircleRegular fontSize={16} primaryFill={tokens.colorPaletteRedForeground1} />;
      case 'disconnected':
      default:
        return <PlugDisconnectedRegular fontSize={16} primaryFill={tokens.colorNeutralForeground3} />;
    }
  };

  const getStatusText = () => {
    switch (status) {
      case 'connected':
        return 'Connected';
      case 'connecting':
        return 'Connecting...';
      case 'reconnecting':
        return 'Reconnecting...';
      case 'error':
        return 'Connection Error';
      case 'disconnected':
      default:
        return 'Disconnected';
    }
  };

  const getDotClassName = () => {
    switch (status) {
      case 'connected':
        return `${styles.liveDot} ${styles.connectedDot}`;
      case 'connecting':
      case 'reconnecting':
        return `${styles.liveDot} ${styles.reconnectingDot}`;
      case 'error':
        return `${styles.liveDot} ${styles.errorDot}`;
      case 'disconnected':
      default:
        return `${styles.liveDot} ${styles.disconnectedDot}`;
    }
  };

  const formatLastEventTime = () => {
    if (!lastEventTime) return '';
    
    const now = new Date();
    const diff = now.getTime() - lastEventTime.getTime();
    const seconds = Math.floor(diff / 1000);
    
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  return (
    <div className={styles.container}>
      {isLiveUpdatesEnabled && (
        <>
          <div className={styles.liveIndicator}>
            <div className={getDotClassName()} />
            <Tooltip
              content={
                <div>
                  <Text weight="semibold">Connection Status</Text>
                  <br />
                  <Text size={200}>{getStatusText()}</Text>
                  {lastEventTime && (
                    <>
                      <br />
                      <Text size={200}>Last event: {formatLastEventTime()}</Text>
                    </>
                  )}
                </div>
              }
              relationship="label"
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                {getStatusIcon()}
                <Text className={styles.statusText}>
                  {status === 'connected' ? 'Live' : getStatusText()}
                </Text>
              </div>
            </Tooltip>
          </div>

          {newEventCount > 0 && (
            <Tooltip content="Click to scroll to new events" relationship="label">
              <Badge
                appearance="filled"
                color="brand"
                className={styles.newEventsBadge}
                onClick={onClearNewEvents}
              >
                {newEventCount} new {newEventCount === 1 ? 'event' : 'events'}
              </Badge>
            </Tooltip>
          )}

          <Tooltip
            content={autoScrollEnabled ? 'Auto-scroll is ON' : 'Auto-scroll is OFF'}
            relationship="label"
          >
            <Button
              appearance={autoScrollEnabled ? 'primary' : 'subtle'}
              size="small"
              className={styles.autoScrollButton}
              onClick={onToggleAutoScroll}
              icon={autoScrollEnabled ? <CheckmarkCircleRegular /> : undefined}
            >
              Auto-scroll
            </Button>
          </Tooltip>

          {status === 'error' && (
            <Button
              appearance="subtle"
              size="small"
              onClick={onReconnect}
              icon={<ArrowSyncRegular />}
            >
              Reconnect
            </Button>
          )}
        </>
      )}

      <Button
        appearance={isLiveUpdatesEnabled ? 'outline' : 'primary'}
        size="small"
        onClick={onToggleLiveUpdates}
      >
        {isLiveUpdatesEnabled ? 'Disable Live Updates' : 'Enable Live Updates'}
      </Button>
    </div>
  );
};