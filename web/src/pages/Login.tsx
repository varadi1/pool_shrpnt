import { useEffect } from 'react';
import { Button, Card, Title1, makeStyles, Spinner } from '@fluentui/react-components';
import { useAuth } from '@/hooks/useAuth';
import { useMsal } from '@azure/msal-react';
import { useNavigate } from 'react-router-dom';

const useStyles = makeStyles({
  container: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100vh',
  },
  card: {
    padding: '40px',
    textAlign: 'center',
    minWidth: '300px',
  },
});

export const Login = () => {
  const styles = useStyles();
  const { login, isAuthenticated } = useAuth();
  const { inProgress, accounts } = useMsal();
  const navigate = useNavigate();

  useEffect(() => {
    // Check both isAuthenticated from hook and accounts from MSAL
    if (isAuthenticated || accounts.length > 0) {
      console.log('User authenticated, redirecting to dashboard');
      navigate('/dashboard', { replace: true });
    }
  }, [isAuthenticated, accounts, navigate]);

  const handleLogin = async () => {
    try {
      console.log('Starting login process...');
      await login();
      // In mock mode, login is instant, so navigate immediately
      if (import.meta.env.VITE_USE_MOCK_AUTH === 'true') {
        console.log('Mock auth enabled, redirecting to dashboard');
        navigate('/dashboard', { replace: true });
      }
    } catch (error) {
      console.error('Login error:', error);
    }
  };

  if (inProgress === 'login' || inProgress === 'handleRedirect') {
    return (
      <div className={styles.container}>
        <Spinner label="Signing in..." />
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <Card className={styles.card}>
        <Title1>poolDRV</Title1>
        {import.meta.env.VITE_USE_MOCK_AUTH === 'true' ? (
          <>
            <p style={{ color: 'orange', fontWeight: 'bold' }}>
              ⚠️ Mock Authentication Mode
            </p>
            <p>Development mode - Click below to sign in as Test Admin</p>
          </>
        ) : (
          <p>Sign in with your Microsoft account to continue</p>
        )}
        <Button appearance="primary" onClick={handleLogin}>
          {import.meta.env.VITE_USE_MOCK_AUTH === 'true' 
            ? 'Sign In (Mock Mode)' 
            : 'Sign In with Microsoft'}
        </Button>
      </Card>
    </div>
  );
};
