import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Dialog,
  DialogSurface,
  DialogTitle,
  DialogBody,
  DialogActions,
  DialogContent,
  Button,
  ProgressBar,
  Text,
} from '@fluentui/react-components';
import { 
  Timer20Regular,
  LockClosed20Regular,
} from '@fluentui/react-icons';
import { useAuth } from '@/hooks/useAuth';
import { showWarningToast } from '@/utils/errorHandler';

interface SessionTimeoutDetectorProps {
  timeoutMinutes?: number; // Session timeout in minutes
  warningMinutes?: number; // Show warning before timeout
}

export const SessionTimeoutDetector = ({
  timeoutMinutes = 30,
  warningMinutes = 5,
}: SessionTimeoutDetectorProps) => {
  const { logout, getAccessToken } = useAuth();
  const [showWarning, setShowWarning] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(warningMinutes * 60); // in seconds
  const lastActivityRef = useRef(Date.now());
  const warningShownRef = useRef(false);
  const timerRef = useRef<NodeJS.Timeout>();

  // Reset activity timer
  const resetTimer = useCallback(() => {
    lastActivityRef.current = Date.now();
    warningShownRef.current = false;
    setShowWarning(false);
    setTimeRemaining(warningMinutes * 60);
  }, [warningMinutes]);

  // Handle user activity
  const handleActivity = useCallback(() => {
    // Only reset if warning is not shown
    if (!showWarning) {
      resetTimer();
    }
  }, [showWarning, resetTimer]);

  // Extend session
  const handleExtendSession = useCallback(async () => {
    try {
      // Refresh token to extend session
      await getAccessToken();
      resetTimer();
      showWarningToast('Session extended successfully');
    } catch (error) {
      console.error('Failed to extend session:', error);
      showWarningToast('Failed to extend session. Please log in again.');
      logout();
    }
  }, [getAccessToken, resetTimer, logout]);

  // Handle logout
  const handleLogout = useCallback(() => {
    setShowWarning(false);
    logout();
  }, [logout]);

  useEffect(() => {
    // Check for session timeout
    const checkTimeout = () => {
      const now = Date.now();
      const timeSinceLastActivity = now - lastActivityRef.current;
      const timeoutMs = timeoutMinutes * 60 * 1000;
      const warningMs = (timeoutMinutes - warningMinutes) * 60 * 1000;

      if (timeSinceLastActivity >= timeoutMs) {
        // Session expired
        handleLogout();
      } else if (timeSinceLastActivity >= warningMs && !warningShownRef.current) {
        // Show warning
        warningShownRef.current = true;
        setShowWarning(true);
        setTimeRemaining(warningMinutes * 60);
      }
    };

    // Set up activity listeners
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart', 'click'];
    events.forEach(event => {
      window.addEventListener(event, handleActivity);
    });

    // Check timeout every second
    const interval = setInterval(checkTimeout, 1000);

    return () => {
      events.forEach(event => {
        window.removeEventListener(event, handleActivity);
      });
      clearInterval(interval);
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [timeoutMinutes, warningMinutes, handleActivity, handleLogout]);

  // Update countdown timer when warning is shown
  useEffect(() => {
    if (showWarning) {
      timerRef.current = setInterval(() => {
        setTimeRemaining(prev => {
          if (prev <= 1) {
            handleLogout();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [showWarning, handleLogout]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const progressValue = (timeRemaining / (warningMinutes * 60)) * 100;

  return (
    <Dialog open={showWarning} modalType="alert">
      <DialogSurface>
        <DialogBody>
          <DialogTitle>
            <Timer20Regular style={{ verticalAlign: 'middle', marginRight: '8px' }} />
            Session Timeout Warning
          </DialogTitle>
          <DialogContent>
            <Text block style={{ marginBottom: '16px' }}>
              Your session will expire in <strong>{formatTime(timeRemaining)}</strong> due to inactivity.
            </Text>
            <Text block style={{ marginBottom: '16px' }}>
              Would you like to continue working?
            </Text>
            <ProgressBar 
              value={progressValue} 
              color={progressValue > 50 ? 'brand' : progressValue > 25 ? 'warning' : 'error'}
            />
          </DialogContent>
          <DialogActions>
            <Button 
              appearance="secondary"
              icon={<LockClosed20Regular />}
              onClick={handleLogout}
            >
              Logout Now
            </Button>
            <Button 
              appearance="primary"
              onClick={handleExtendSession}
            >
              Continue Working
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
};

// Component to detect token expiration
export const TokenExpirationDetector = () => {
  const { user, getAccessToken, logout } = useAuth();
  const [tokenExpired, setTokenExpired] = useState(false);

  useEffect(() => {
    if (!user) return;

    const checkTokenExpiration = async () => {
      try {
        // Get token expiration from ID token claims
        const exp = (user.idTokenClaims as any)?.exp;
        if (!exp) return;

        const expirationTime = exp * 1000; // Convert to milliseconds
        const now = Date.now();
        const timeUntilExpiry = expirationTime - now;

        if (timeUntilExpiry <= 0) {
          // Token already expired
          setTokenExpired(true);
          showWarningToast('Your session has expired. Please log in again.');
          setTimeout(() => logout(), 2000);
        } else if (timeUntilExpiry <= 5 * 60 * 1000) {
          // Token expires in less than 5 minutes, try to refresh
          try {
            await getAccessToken();
          } catch (error) {
            console.error('Failed to refresh token:', error);
            setTokenExpired(true);
          }
        }
      } catch (error) {
        console.error('Error checking token expiration:', error);
      }
    };

    // Check immediately
    checkTokenExpiration();

    // Check every minute
    const interval = setInterval(checkTokenExpiration, 60000);

    return () => clearInterval(interval);
  }, [user, getAccessToken, logout]);

  if (!tokenExpired) {
    return null;
  }

  return (
    <Dialog open={tokenExpired} modalType="alert">
      <DialogSurface>
        <DialogBody>
          <DialogTitle>Session Expired</DialogTitle>
          <DialogContent>
            Your session has expired. You will be redirected to the login page.
          </DialogContent>
          <DialogActions>
            <Button appearance="primary" onClick={() => logout()}>
              Go to Login
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
};