import { useEffect, useState } from 'react';
import {
  Card,
  CardHeader,
  Title1,
  Text,
  makeStyles,
  tokens,
  Spinner,
  Caption1,
} from '@fluentui/react-components';
import {
  Wrench24Regular,
  Clock24Regular,
} from '@fluentui/react-icons';
import { errorLoggingService } from '@/services/errorLogging.service';

const useStyles = makeStyles({
  container: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.colorNeutralBackground1,
    zIndex: 10000,
  },
  card: {
    maxWidth: '500px',
    width: '90%',
    textAlign: 'center',
    padding: '32px',
  },
  icon: {
    fontSize: '64px',
    color: tokens.colorBrandForeground1,
    marginBottom: '24px',
  },
  content: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '16px',
  },
  estimatedTime: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginTop: '16px',
    padding: '12px',
    backgroundColor: tokens.colorNeutralBackground3,
    borderRadius: tokens.borderRadiusMedium,
  },
  refreshButton: {
    marginTop: '24px',
  },
});

interface MaintenanceInfo {
  isInMaintenance: boolean;
  message?: string;
  estimatedEndTime?: string;
  contactEmail?: string;
}

export const MaintenanceModeDetector = () => {
  const styles = useStyles();
  const [maintenanceInfo, setMaintenanceInfo] = useState<MaintenanceInfo | null>(null);
  const [isChecking, setIsChecking] = useState(true);
  const [lastCheckTime, setLastCheckTime] = useState<Date | null>(null);

  const checkMaintenanceMode = async () => {
    try {
      setIsChecking(true);
      
      // Check maintenance endpoint
      const response = await fetch('/api/health/maintenance', {
        cache: 'no-store',
      });
      
      if (response.status === 503) {
        // Service unavailable - likely in maintenance
        const data = await response.json().catch(() => ({}));
        setMaintenanceInfo({
          isInMaintenance: true,
          message: data.message || 'The system is currently undergoing maintenance.',
          estimatedEndTime: data.estimatedEndTime,
          contactEmail: data.contactEmail || 'support@neumanndevops.hu',
        });
      } else if (response.ok) {
        const data = await response.json();
        setMaintenanceInfo({
          isInMaintenance: data.maintenanceMode === true,
          message: data.message,
          estimatedEndTime: data.estimatedEndTime,
          contactEmail: data.contactEmail,
        });
      } else {
        // Can't determine maintenance status
        setMaintenanceInfo(null);
      }
      
      setLastCheckTime(new Date());
    } catch (error) {
      // Network error - might be maintenance or network issue
      console.error('Failed to check maintenance mode:', error);
      
      // Log the error
      errorLoggingService.logNetworkError({
        url: '/api/health/maintenance',
        message: 'Failed to check maintenance mode',
      });
      
      // Don't show maintenance mode for network errors
      setMaintenanceInfo(null);
    } finally {
      setIsChecking(false);
    }
  };

  useEffect(() => {
    // Check immediately
    checkMaintenanceMode();

    // Check every 30 seconds
    const interval = setInterval(checkMaintenanceMode, 30000);

    return () => clearInterval(interval);
  }, []);

  // Calculate time until maintenance ends
  const getTimeRemaining = () => {
    if (!maintenanceInfo?.estimatedEndTime) return null;
    
    const endTime = new Date(maintenanceInfo.estimatedEndTime);
    const now = new Date();
    const diff = endTime.getTime() - now.getTime();
    
    if (diff <= 0) return 'Soon';
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 0) {
      return `${hours} hour${hours > 1 ? 's' : ''} ${minutes} minute${minutes > 1 ? 's' : ''}`;
    }
    return `${minutes} minute${minutes > 1 ? 's' : ''}`;
  };

  // Don't show if not in maintenance
  if (!maintenanceInfo?.isInMaintenance) {
    return null;
  }

  const timeRemaining = getTimeRemaining();

  return (
    <div className={styles.container}>
      <Card className={styles.card}>
        <div className={styles.content}>
          <Wrench24Regular className={styles.icon} />
          
          <Title1>System Maintenance</Title1>
          
          <Text size={400}>
            {maintenanceInfo.message || 'We are currently performing scheduled maintenance to improve our services.'}
          </Text>

          {timeRemaining && (
            <div className={styles.estimatedTime}>
              <Clock24Regular />
              <div>
                <Caption1 block>Estimated time remaining:</Caption1>
                <Text weight="semibold">{timeRemaining}</Text>
              </div>
            </div>
          )}

          <Text size={300}>
            We apologize for any inconvenience. If you have urgent matters, please contact us at{' '}
            <a href={`mailto:${maintenanceInfo.contactEmail}`}>
              {maintenanceInfo.contactEmail}
            </a>
          </Text>

          <Button
            appearance="primary"
            className={styles.refreshButton}
            onClick={() => window.location.reload()}
            disabled={isChecking}
            icon={isChecking ? <Spinner size="tiny" /> : undefined}
          >
            {isChecking ? 'Checking...' : 'Check Again'}
          </Button>

          {lastCheckTime && (
            <Caption1>
              Last checked: {lastCheckTime.toLocaleTimeString()}
            </Caption1>
          )}
        </div>
      </Card>
    </div>
  );
};

// Simple maintenance banner for less intrusive notification
export const MaintenanceBanner = () => {
  const [showBanner, setShowBanner] = useState(false);
  const [maintenanceMessage, setMaintenanceMessage] = useState('');

  useEffect(() => {
    const checkForUpcomingMaintenance = async () => {
      try {
        const response = await fetch('/api/health/maintenance/upcoming');
        if (response.ok) {
          const data = await response.json();
          if (data.hasUpcomingMaintenance) {
            setShowBanner(true);
            setMaintenanceMessage(
              data.message || 
              `Scheduled maintenance on ${new Date(data.scheduledTime).toLocaleString()}`
            );
          }
        }
      } catch (error) {
        // Ignore errors for upcoming maintenance check
      }
    };

    checkForUpcomingMaintenance();
    
    // Check every 5 minutes
    const interval = setInterval(checkForUpcomingMaintenance, 5 * 60 * 1000);
    
    return () => clearInterval(interval);
  }, []);

  if (!showBanner) return null;

  return (
    <div
      style={{
        backgroundColor: tokens.colorWarningBackground1,
        color: tokens.colorNeutralForeground1,
        padding: '8px 16px',
        textAlign: 'center',
        position: 'sticky',
        top: 0,
        zIndex: 1000,
      }}
    >
      <Wrench24Regular style={{ verticalAlign: 'middle', marginRight: '8px' }} />
      {maintenanceMessage}
      <Button
        appearance="transparent"
        size="small"
        style={{ marginLeft: '16px' }}
        onClick={() => setShowBanner(false)}
      >
        Dismiss
      </Button>
    </div>
  );
};