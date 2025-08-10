import { useEffect, useState } from 'react';
import { 
  MessageBar, 
  MessageBarBody, 
  MessageBarTitle,
  Button,
  makeStyles,
} from '@fluentui/react-components';
import { 
  WifiOff20Regular,
  ArrowClockwise20Regular,
} from '@fluentui/react-icons';
import { showWarningToast, showSuccessToast } from '@/utils/errorHandler';
import { errorLoggingService } from '@/services/errorLogging.service';

const useStyles = makeStyles({
  container: {
    position: 'fixed',
    top: '0',
    left: '0',
    right: '0',
    zIndex: 9999,
    animation: 'slideDown 0.3s ease-in-out',
  },
  '@keyframes slideDown': {
    from: {
      transform: 'translateY(-100%)',
    },
    to: {
      transform: 'translateY(0)',
    },
  },
});

export const NetworkDetector = () => {
  const styles = useStyles();
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showOfflineBar, setShowOfflineBar] = useState(false);
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setShowOfflineBar(false);
      
      if (wasOffline) {
        showSuccessToast('Connection restored. You are back online!');
        setWasOffline(false);
        
        // Log network restoration
        errorLoggingService.logNetworkError({
          url: window.location.href,
          message: 'Network connection restored',
        });
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
      setShowOfflineBar(true);
      setWasOffline(true);
      
      showWarningToast('You are offline. Some features may not work correctly.');
      
      // Log network error
      errorLoggingService.logNetworkError({
        url: window.location.href,
        message: 'Network connection lost',
      });
    };

    // Check network status periodically
    const checkConnection = async () => {
      try {
        // Try to fetch a small resource
        const response = await fetch('/api/health/ping', {
          method: 'HEAD',
          cache: 'no-store',
        });
        
        if (!isOnline && response.ok) {
          handleOnline();
        }
      } catch (error) {
        if (isOnline) {
          handleOffline();
        }
      }
    };

    // Add event listeners
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Check connection every 30 seconds
    const interval = setInterval(checkConnection, 30000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, [isOnline, wasOffline]);

  if (!showOfflineBar) {
    return null;
  }

  return (
    <div className={styles.container}>
      <MessageBar 
        intent="warning"
        icon={<WifiOff20Regular />}
      >
        <MessageBarBody>
          <MessageBarTitle>No Internet Connection</MessageBarTitle>
          You are currently offline. Some features may be unavailable.
        </MessageBarBody>
        <Button 
          appearance="transparent" 
          icon={<ArrowClockwise20Regular />}
          onClick={() => window.location.reload()}
          size="small"
        >
          Retry
        </Button>
      </MessageBar>
    </div>
  );
};

// Component to detect slow network
export const SlowNetworkDetector = () => {
  const [showSlowWarning, setShowSlowWarning] = useState(false);

  useEffect(() => {
    // Check for slow network using Navigation Timing API
    const checkNetworkSpeed = () => {
      if ('connection' in navigator) {
        const connection = (navigator as any).connection;
        
        // Check effective type (slow-2g, 2g, 3g, 4g)
        if (connection.effectiveType && ['slow-2g', '2g'].includes(connection.effectiveType)) {
          setShowSlowWarning(true);
          showWarningToast('Slow network detected. Pages may load slowly.');
        }
        
        // Check round-trip time
        if (connection.rtt && connection.rtt > 500) {
          setShowSlowWarning(true);
        }
      }
    };

    checkNetworkSpeed();
    
    // Listen for connection changes
    if ('connection' in navigator) {
      const connection = (navigator as any).connection;
      connection.addEventListener('change', checkNetworkSpeed);
      
      return () => {
        connection.removeEventListener('change', checkNetworkSpeed);
      };
    }
  }, []);

  if (!showSlowWarning) {
    return null;
  }

  return (
    <MessageBar 
      intent="warning"
      dismiss={{
        onClick: () => setShowSlowWarning(false),
      }}
      style={{ margin: '8px' }}
    >
      <MessageBarBody>
        <MessageBarTitle>Slow Network Detected</MessageBarTitle>
        Your internet connection appears to be slow. Some features may take longer to load.
      </MessageBarBody>
    </MessageBar>
  );
};