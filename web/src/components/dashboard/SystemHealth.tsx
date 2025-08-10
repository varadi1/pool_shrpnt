import {
  Card,
  CardHeader,
  Text,
  makeStyles,
  tokens,
  Badge,
  ProgressBar,
  Caption1,
} from '@fluentui/react-components';
import {
  CheckmarkCircle20Filled,
  Warning20Filled,
  ErrorCircle20Filled,
} from '@fluentui/react-icons';

const useStyles = makeStyles({
  card: {
    minHeight: '180px',
  },
  content: {
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  statusRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  statusIcon: {
    display: 'flex',
    alignItems: 'center',
  },
  metricRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '4px',
  },
  metricLabel: {
    color: tokens.colorNeutralForeground3,
  },
});

interface SystemHealthProps {
  health?: 'healthy' | 'degraded' | 'unhealthy';
  queueDepth?: number;
  lastProvisionTime?: number;
  apiLatency?: number;
  loading?: boolean;
}

export const SystemHealth = ({
  health = 'healthy',
  queueDepth = 0,
  lastProvisionTime = 0,
  apiLatency = 0,
}: SystemHealthProps) => {
  const styles = useStyles();

  const getHealthIcon = () => {
    switch (health) {
      case 'healthy':
        return <CheckmarkCircle20Filled primaryFill={tokens.colorPaletteGreenForeground1} />;
      case 'degraded':
        return <Warning20Filled primaryFill={tokens.colorPaletteYellowForeground1} />;
      case 'unhealthy':
        return <ErrorCircle20Filled primaryFill={tokens.colorPaletteRedForeground1} />;
    }
  };

  const getHealthBadge = () => {
    const colors: Record<typeof health, 'success' | 'warning' | 'danger'> = {
      healthy: 'success',
      degraded: 'warning',
      unhealthy: 'danger',
    };
    const healthText = health === 'healthy' ? 'EGÉSZSÉGES' : health === 'degraded' ? 'ROMLOTT' : 'EGÉSZSÉGTELEN';
    return <Badge appearance="filled" color={colors[health]}>{healthText}</Badge>;
  };

  const getQueueStatus = () => {
    if (queueDepth === 0) return 'success';
    if (queueDepth < 10) return 'warning';
    return 'error';
  };

  return (
    <Card className={styles.card} role="region" aria-label="System health status">
      <CardHeader header={<Text weight="semibold" as="h2">Rendszerállapot</Text>} />
      <div className={styles.content}>
        <div className={styles.statusRow} role="status" aria-live="polite" aria-label={`System status: ${health}`}>
          <div className={styles.statusIcon} aria-hidden="true">{getHealthIcon()}</div>
          {getHealthBadge()}
        </div>

        <div role="group" aria-labelledby="queue-depth-label">
          <div className={styles.metricRow}>
            <Caption1 className={styles.metricLabel} id="queue-depth-label">Várakozási Sor Mérete</Caption1>
            <Text weight="semibold" aria-label={`${queueDepth} feladat a sorban`}>{queueDepth} feladat</Text>
          </div>
          <ProgressBar
            value={Math.min(queueDepth / 50, 1)}
            color={getQueueStatus()}
            thickness="large"
            aria-label={`Queue depth: ${queueDepth} out of 50 maximum`}
          />
        </div>

        <div role="group" aria-labelledby="provision-time-label">
          <div className={styles.metricRow}>
            <Caption1 className={styles.metricLabel} id="provision-time-label">Utolsó Telepítés Ideje</Caption1>
            <Text weight="semibold" aria-label={`${lastProvisionTime} perc`}>{lastProvisionTime} perc</Text>
          </div>
          <ProgressBar
            value={Math.min(lastProvisionTime / 10, 1)}
            color={lastProvisionTime > 10 ? 'error' : lastProvisionTime > 5 ? 'warning' : 'success'}
            thickness="large"
            aria-label={`Provision time: ${lastProvisionTime} out of 10 minute target`}
          />
        </div>

        <div role="group" aria-labelledby="api-latency-label">
          <div className={styles.metricRow}>
            <Caption1 className={styles.metricLabel} id="api-latency-label">API Késleltetés</Caption1>
            <Text weight="semibold" aria-label={`${apiLatency} milliseconds`}>{apiLatency} ms</Text>
          </div>
          <ProgressBar
            value={Math.min(apiLatency / 1000, 1)}
            color={apiLatency > 500 ? 'error' : apiLatency > 200 ? 'warning' : 'success'}
            thickness="large"
            aria-label={`API latency: ${apiLatency} out of 1000 millisecond maximum`}
          />
        </div>
      </div>
    </Card>
  );
};