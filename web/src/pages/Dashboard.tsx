import { Title1, makeStyles } from '@fluentui/react-components';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import {
  ShoppingBag24Regular,
  Clock24Regular,
  ErrorCircle24Regular,
  Document24Regular,
  LockClosed24Regular,
  People24Regular,
} from '@fluentui/react-icons';
import { MetricCard } from '@/components/dashboard/MetricCard';
import { ActivityFeed } from '@/components/dashboard/ActivityFeed';
import { SystemHealth } from '@/components/dashboard/SystemHealth';
import { apiClient } from '@/services/api/axios-client';

const useStyles = makeStyles({
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  header: {
    marginBottom: '20px',
  },
  metricsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
    gap: '16px',
    '@media (min-width: 1920px)': {
      gridTemplateColumns: 'repeat(4, 1fr)',
    },
  },
  bottomGrid: {
    display: 'grid',
    gridTemplateColumns: '2fr 1fr',
    gap: '16px',
    '@media (max-width: 1024px)': {
      gridTemplateColumns: '1fr',
    },
  },
});

interface DashboardMetrics {
  orders: {
    active: number;
    pending: number;
    failed24h: number;
    total: number;
  };
  contracts: {
    active: number;
    expiring30d: number;
  };
  locks: {
    timeLocked: number;
    crUnlocked: number;
    manualLocked: number;
  };
  guests: {
    active: number;
    expiring7d: number;
  };
  system: {
    health: 'healthy' | 'degraded' | 'unhealthy';
    queueDepth: number;
    lastProvisionTime: number;
    apiLatency: number;
  };
}

const fetchDashboardMetrics = async (): Promise<DashboardMetrics> => {
  // Performance tracking
  const startTime = performance.now();
  
  // Parallel API calls for better performance
  const [activeOrders, pendingOrders, failedOrders, activeContracts, locks, activeGuests, health] = await Promise.all([
    apiClient.get('/api/orders?status=active'),
    apiClient.get('/api/orders?status=pending_provision'),
    apiClient.get('/api/orders?status=failed&since=24h'),
    apiClient.get('/api/contracts?status=active'),
    apiClient.get('/api/locks/summary'),
    apiClient.get('/api/guests?status=active'),
    apiClient.get('/api/health'),
  ]);

  const endTime = performance.now();
  const loadTime = endTime - startTime;
  
  // Log warning if load time exceeds 3 seconds
  if (loadTime > 3000) {
    console.warn(`Dashboard metrics load time exceeded target: ${loadTime.toFixed(0)}ms`);
  }

  // Extract counts and metrics
  return {
    orders: {
      active: activeOrders?.count || activeOrders?.length || 0,
      pending: pendingOrders?.count || pendingOrders?.length || 0,
      failed24h: failedOrders?.count || failedOrders?.length || 0,
      total: 0, // Will be calculated if needed
    },
    contracts: {
      active: activeContracts?.count || activeContracts?.length || 0,
      expiring30d: 0, // Additional API call if needed
    },
    locks: {
      timeLocked: locks?.timeLocked || 0,
      crUnlocked: locks?.crUnlocked || 0,
      manualLocked: locks?.manualLocked || 0,
    },
    guests: {
      active: activeGuests?.count || activeGuests?.length || 0,
      expiring7d: 0, // TODO: Add endpoint for expiring guests
    },
    system: {
      health: health?.status || 'healthy',
      queueDepth: health?.queueDepth || 0,
      lastProvisionTime: health?.lastProvisionTime || 0,
      apiLatency: health?.latency || 0,
    },
  };
};

const fetchRecentActivity = async () => {
  const result = await apiClient.get('/api/audit/recent?limit=10');
  return result || [];
};

export const Dashboard = () => {
  const styles = useStyles();

  // Performance measurement
  useEffect(() => {
    performance.mark('dashboard-start');
    return () => {
      performance.mark('dashboard-end');
      performance.measure('dashboard-load', 'dashboard-start', 'dashboard-end');
      const measure = performance.getEntriesByName('dashboard-load')[0];
      if (measure) {
        console.log(`Dashboard rendered in ${measure.duration.toFixed(0)}ms`);
        // Clear the marks
        performance.clearMarks('dashboard-start');
        performance.clearMarks('dashboard-end');
        performance.clearMeasures('dashboard-load');
      }
    };
  }, []);

  const { data: metrics, isLoading: metricsLoading, error: metricsError } = useQuery({
    queryKey: ['dashboard-metrics'],
    queryFn: fetchDashboardMetrics,
    staleTime: 30000, // 30 seconds
    refetchInterval: 60000, // 1 minute
  });

  const { data: activities = [], isLoading: activitiesLoading } = useQuery({
    queryKey: ['recent-activities'],
    queryFn: fetchRecentActivity,
    staleTime: 30000,
    refetchInterval: 60000,
    initialData: [],
  });

  return (
    <div className={styles.container} role="region" aria-label="Vezérlőpult">
      <div className={styles.header}>
        <Title1 as="h1">Vezérlőpult</Title1>
      </div>

      <section className={styles.metricsGrid} aria-label="Fő mutatók" role="region">
        <MetricCard
          title="Aktív Megrendelések"
          value={metrics?.orders.active}
          icon={<ShoppingBag24Regular />}
          loading={metricsLoading}
          error={!!metricsError}
        />
        <MetricCard
          title="Függő Telepítések"
          value={metrics?.orders.pending}
          icon={<Clock24Regular />}
          loading={metricsLoading}
          error={!!metricsError}
          status={metrics?.orders.pending && metrics.orders.pending > 5 ? 'warning' : 'normal'}
        />
        <MetricCard
          title="Sikertelen (24ó)"
          value={metrics?.orders.failed24h}
          icon={<ErrorCircle24Regular />}
          loading={metricsLoading}
          error={!!metricsError}
          status={metrics?.orders.failed24h && metrics.orders.failed24h > 0 ? 'error' : 'success'}
        />
        <MetricCard
          title="Aktív Szerződések"
          value={metrics?.contracts.active}
          icon={<Document24Regular />}
          loading={metricsLoading}
          error={!!metricsError}
        />
        <MetricCard
          title="Időzárak"
          value={metrics?.locks.timeLocked}
          icon={<LockClosed24Regular />}
          loading={metricsLoading}
          error={!!metricsError}
          subtitle="Aktív időalapú zárolások"
        />
        <MetricCard
          title="CR Feloldások"
          value={metrics?.locks.crUnlocked}
          icon={<LockClosed24Regular />}
          loading={metricsLoading}
          error={!!metricsError}
          subtitle="Aktív CR feloldások"
        />
        <MetricCard
          title="Aktív Vendégek"
          value={metrics?.guests.active}
          icon={<People24Regular />}
          loading={metricsLoading}
          error={!!metricsError}
        />
        <MetricCard
          title="Hamarosan Lejár"
          value={metrics?.guests.expiring7d}
          icon={<People24Regular />}
          loading={metricsLoading}
          error={!!metricsError}
          status={metrics?.guests.expiring7d && metrics.guests.expiring7d > 0 ? 'warning' : 'normal'}
          subtitle="7 napon belül lejáró vendégek"
        />
      </section>

      <div className={styles.bottomGrid} role="region" aria-label="Aktivitás és rendszerállapot">
        <ActivityFeed
          activities={activities}
          loading={activitiesLoading}
        />
        <SystemHealth
          health={metrics?.system.health}
          queueDepth={metrics?.system.queueDepth}
          lastProvisionTime={metrics?.system.lastProvisionTime}
          apiLatency={metrics?.system.apiLatency}
          loading={metricsLoading}
        />
      </div>
    </div>
  );
};
