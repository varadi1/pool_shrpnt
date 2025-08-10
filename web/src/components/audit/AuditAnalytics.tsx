import React, { useMemo, useState } from 'react';
import {
  Card,
  Title3,
  Caption1,
  Subtitle2,
  Select,
  Spinner,
  MessageBar,
  tokens,
  makeStyles,
  Button,
  TabList,
  Tab,
} from '@fluentui/react-components';
import {
  ArrowDownloadRegular,
  DocumentTableRegular,
} from '@fluentui/react-icons';
import type { AuditEntry, AuditActionType, AuditCategory, AuditStats } from '../../types/audit';
import type { AuditFilter } from '../../types/audit';

const useStyles = makeStyles({
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: tokens.spacingVerticalM,
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: tokens.spacingHorizontalM,
    marginBottom: tokens.spacingVerticalXL,
  },
  statCard: {
    padding: tokens.spacingHorizontalL,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
    border: `1px solid ${tokens.colorNeutralStroke1}`,
  },
  statValue: {
    fontSize: tokens.fontSizeBase600,
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground1,
  },
  statLabel: {
    color: tokens.colorNeutralForeground3,
    marginTop: tokens.spacingVerticalXS,
  },
  chartContainer: {
    minHeight: '300px',
    padding: tokens.spacingHorizontalL,
    backgroundColor: tokens.colorNeutralBackground1,
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorNeutralStroke1}`,
    marginBottom: tokens.spacingVerticalL,
  },
  chartPlaceholder: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '300px',
    color: tokens.colorNeutralForeground3,
  },
  tabContent: {
    marginTop: tokens.spacingVerticalL,
  },
  reportList: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
  },
  reportItem: {
    padding: tokens.spacingHorizontalM,
    backgroundColor: tokens.colorNeutralBackground1,
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorNeutralStroke1}`,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  reportInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
  },
  topList: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
  },
  topItem: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: tokens.spacingHorizontalS,
    backgroundColor: tokens.colorNeutralBackground2,
    borderRadius: tokens.borderRadiusSmall,
  },
});

interface AuditAnalyticsProps {
  entries: AuditEntry[];
  filters: AuditFilter;
  loading?: boolean;
  error?: Error | null;
  onGenerateReport: (type: ReportType, filters: AuditFilter) => void;
  stats?: AuditStats;
}

export type ReportType = 'user-access' | 'permission-changes' | 'system-access' | 'custom';

interface ReportTemplate {
  id: ReportType;
  name: string;
  description: string;
  icon: typeof DocumentTableRegular;
  filters?: Partial<AuditFilter>;
}

const REPORT_TEMPLATES: ReportTemplate[] = [
  {
    id: 'user-access',
    name: 'User Access Report',
    description: 'Shows all user access activities including logins, resource access, and authentication events',
    icon: DocumentTableRegular,
    filters: {
      categories: ['user', 'security'],
    },
  },
  {
    id: 'permission-changes',
    name: 'Permission Changes Report',
    description: 'Tracks all permission grants, revocations, and modifications',
    icon: DocumentTableRegular,
    filters: {
      actionTypes: ['PERMISSION_GRANTED', 'PERMISSION_REVOKED', 'PERMISSION_MODIFIED'] as AuditActionType[],
    },
  },
  {
    id: 'system-access',
    name: 'System Access Report',
    description: 'Details system-level access and administrative actions',
    icon: DocumentTableRegular,
    filters: {
      categories: ['system'],
    },
  },
];

const AuditAnalytics: React.FC<AuditAnalyticsProps> = ({
  entries,
  filters,
  loading,
  error,
  onGenerateReport,
  stats,
}) => {
  const styles = useStyles();
  const [selectedTab, setSelectedTab] = useState<'statistics' | 'reports'>('statistics');
  const [selectedTimeRange, setSelectedTimeRange] = useState<'7d' | '30d' | '90d'>('7d');

  const eventsByDay = useMemo(() => {
    const dayMap = new Map<string, number>();
    entries.forEach((entry) => {
      const date = new Date(entry.timestamp).toLocaleDateString();
      dayMap.set(date, (dayMap.get(date) || 0) + 1);
    });
    return Array.from(dayMap.entries())
      .sort(([a], [b]) => new Date(a).getTime() - new Date(b).getTime())
      .slice(-30);
  }, [entries]);

  const topUsers = useMemo(() => {
    const userMap = new Map<string, { name: string; count: number }>();
    entries.forEach((entry) => {
      const key = entry.actor.id;
      if (!userMap.has(key)) {
        userMap.set(key, { name: entry.actor.name, count: 0 });
      }
      const user = userMap.get(key)!;
      user.count++;
    });
    return Array.from(userMap.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [entries]);

  const actionCounts = useMemo(() => {
    const actionMap = new Map<AuditActionType, number>();
    entries.forEach((entry) => {
      actionMap.set(entry.action.type, (actionMap.get(entry.action.type) || 0) + 1);
    });
    return Array.from(actionMap.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10);
  }, [entries]);

  const failureRate = useMemo(() => {
    if (entries.length === 0) return 0;
    const failures = entries.filter((e) => e.status === 'failure').length;
    return ((failures / entries.length) * 100).toFixed(2);
  }, [entries]);

  const handleGenerateReport = (template: ReportTemplate) => {
    const reportFilters = {
      ...filters,
      ...template.filters,
    };
    onGenerateReport(template.id, reportFilters);
  };

  if (loading) {
    return (
      <div className={styles.container}>
        <Spinner label="Loading analytics..." />
      </div>
    );
  }

  if (error) {
    return (
      <MessageBar intent="error">
        Failed to load analytics: {error.message}
      </MessageBar>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <Title3>Audit Analytics & Compliance</Title3>
        <Select
          value={selectedTimeRange}
          onChange={(_, data) => setSelectedTimeRange(data.value as '7d' | '30d' | '90d')}
        >
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="90d">Last 90 days</option>
        </Select>
      </div>

      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statValue}>{stats?.totalEvents || entries.length}</div>
          <Caption1 className={styles.statLabel}>Total Events</Caption1>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue}>{stats?.uniqueUsers || topUsers.length}</div>
          <Caption1 className={styles.statLabel}>Unique Users</Caption1>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue}>{failureRate}%</div>
          <Caption1 className={styles.statLabel}>Failure Rate</Caption1>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue}>{stats?.avgResponseTime || 'N/A'}</div>
          <Caption1 className={styles.statLabel}>Avg Response Time</Caption1>
        </div>
      </div>

      <TabList
        selectedValue={selectedTab}
        onTabSelect={(_, data) => setSelectedTab(data.value as 'statistics' | 'reports')}
      >
        <Tab value="statistics">
          Statistics
        </Tab>
        <Tab value="reports" icon={<DocumentTableRegular />}>
          Compliance Reports
        </Tab>
      </TabList>

      <div className={styles.tabContent}>
        {selectedTab === 'statistics' && (
          <>
            <Card>
              <Subtitle2>Events Per Day</Subtitle2>
              <div className={styles.chartContainer}>
                <div className={styles.chartPlaceholder}>
                  <div>
                    {eventsByDay.length > 0 ? (
                      <div>
                        {/* Chart would be rendered here with a charting library */}
                        <Caption1>
                          {eventsByDay.map(([date, count]) => (
                            <div key={date}>
                              {date}: {count} events
                            </div>
                          ))}
                        </Caption1>
                      </div>
                    ) : (
                      'No data available'
                    )}
                  </div>
                </div>
              </div>
            </Card>

            <Card>
              <Subtitle2>Top Users by Activity</Subtitle2>
              <div className={styles.topList}>
                {topUsers.map((user) => (
                  <div key={user.name} className={styles.topItem}>
                    <span>{user.name}</span>
                    <strong>{user.count}</strong>
                  </div>
                ))}
              </div>
            </Card>

            <Card>
              <Subtitle2>Most Common Actions</Subtitle2>
              <div className={styles.topList}>
                {actionCounts.map(([action, count]) => (
                  <div key={action} className={styles.topItem}>
                    <span>{action.replace(/_/g, ' ').toLowerCase()}</span>
                    <strong>{count}</strong>
                  </div>
                ))}
              </div>
            </Card>
          </>
        )}

        {selectedTab === 'reports' && (
          <div className={styles.reportList}>
            {REPORT_TEMPLATES.map((template) => (
              <div key={template.id} className={styles.reportItem}>
                <div className={styles.reportInfo}>
                  <Subtitle2>{template.name}</Subtitle2>
                  <Caption1>{template.description}</Caption1>
                </div>
                <Button
                  appearance="primary"
                  icon={<ArrowDownloadRegular />}
                  onClick={() => handleGenerateReport(template)}
                >
                  Generate Report
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default AuditAnalytics;