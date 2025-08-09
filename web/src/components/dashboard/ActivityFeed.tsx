import {
  Card,
  CardHeader,
  Text,
  makeStyles,
  tokens,
  Spinner,
  Caption1,
  Badge,
} from '@fluentui/react-components';
import { formatDistanceToNow } from 'date-fns';

const useStyles = makeStyles({
  card: {
    height: '400px',
    display: 'flex',
    flexDirection: 'column',
  },
  content: {
    flex: 1,
    overflow: 'auto',
    padding: '0 16px 16px',
  },
  activityItem: {
    padding: '12px 0',
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    ':last-child': {
      borderBottom: 'none',
    },
  },
  activityHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '4px',
  },
  activityUser: {
    fontWeight: tokens.fontWeightSemibold,
  },
  activityTime: {
    color: tokens.colorNeutralForeground3,
  },
  loading: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
  },
  emptyState: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    color: tokens.colorNeutralForeground3,
  },
});

interface Activity {
  id: string;
  user: string;
  action: string;
  target?: string;
  timestamp: string;
  type: 'create' | 'update' | 'delete' | 'provision' | 'lock' | 'unlock';
}

interface ActivityFeedProps {
  activities?: Activity[];
  loading?: boolean;
  error?: boolean;
}

const getActionBadge = (type: Activity['type']) => {
  const colors: Record<Activity['type'], 'brand' | 'danger' | 'success' | 'warning' | 'informative' | 'subtle'> = {
    create: 'success',
    update: 'informative',
    delete: 'danger',
    provision: 'brand',
    lock: 'warning',
    unlock: 'subtle',
  };

  return <Badge appearance="tint" color={colors[type]}>{type}</Badge>;
};

export const ActivityFeed = ({ activities = [], loading = false, error = false }: ActivityFeedProps) => {
  const styles = useStyles();

  return (
    <Card className={styles.card} role="region" aria-label="Recent activity feed">
      <CardHeader header={<Text weight="semibold" as="h2">Recent Activity</Text>} />
      <div className={styles.content} role="feed" aria-busy={loading} aria-live="polite">
        {loading ? (
          <div className={styles.loading} role="status">
            <Spinner size="small" label="Loading activities..." />
          </div>
        ) : error ? (
          <div className={styles.emptyState} role="alert">
            <Text>Failed to load activities</Text>
          </div>
        ) : activities.length === 0 ? (
          <div className={styles.emptyState}>
            <Text>No recent activity</Text>
          </div>
        ) : (
          activities.map((activity) => (
            <article 
              key={activity.id} 
              className={styles.activityItem}
              aria-label={`${activity.user} ${activity.action} ${activity.target || ''} ${formatDistanceToNow(new Date(activity.timestamp), { addSuffix: true })}`}
            >
              <div className={styles.activityHeader}>
                <div>
                  <Text className={styles.activityUser} aria-label={`User: ${activity.user}`}>
                    {activity.user}
                  </Text>
                  {getActionBadge(activity.type)}
                </div>
                <Caption1 className={styles.activityTime}>
                  <time dateTime={activity.timestamp}>
                    {formatDistanceToNow(new Date(activity.timestamp), { addSuffix: true })}
                  </time>
                </Caption1>
              </div>
              <Text size={200}>
                {activity.action}
                {activity.target && <Text weight="semibold"> {activity.target}</Text>}
              </Text>
            </article>
          ))
        )}
      </div>
    </Card>
  );
};