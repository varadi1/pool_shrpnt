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
      await login();
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
        <p>Sign in with your Microsoft account to continue</p>
        <Button appearance="primary" onClick={handleLogin}>
          Sign In with Microsoft
        </Button>
      </Card>
    </div>
  );
};
