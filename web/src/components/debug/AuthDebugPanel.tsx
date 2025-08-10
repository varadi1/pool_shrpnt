import { useAuth } from '@/hooks/useAuth';
import { Button, Card, Text, makeStyles, tokens } from '@fluentui/react-components';
import { forceAdminAuth, clearAuthData, getAuthDebugInfo } from '@/utils/authDebug';

const useStyles = makeStyles({
  container: {
    position: 'fixed',
    bottom: '20px',
    right: '20px',
    zIndex: 9999,
    width: '300px',
  },
  card: {
    padding: '16px',
    backgroundColor: tokens.colorNeutralBackground1,
    boxShadow: tokens.shadow28,
  },
  title: {
    fontSize: tokens.fontSizeBase400,
    fontWeight: tokens.fontWeightSemibold,
    marginBottom: '12px',
  },
  info: {
    marginBottom: '8px',
    fontSize: tokens.fontSizeBase200,
  },
  button: {
    marginTop: '8px',
    marginRight: '8px',
  },
  roleTag: {
    display: 'inline-block',
    padding: '2px 8px',
    backgroundColor: tokens.colorBrandBackground,
    color: tokens.colorNeutralForegroundOnBrand,
    borderRadius: tokens.borderRadiusSmall,
    marginRight: '4px',
    fontSize: tokens.fontSizeBase200,
  }
});

export const AuthDebugPanel = () => {
  const styles = useStyles();
  const { isAuthenticated, userRoles, user, isAdmin, isPM } = useAuth();
  const debugInfo = getAuthDebugInfo();

  const handleForceAdmin = () => {
    forceAdminAuth();
  };

  const handleClearAuth = () => {
    clearAuthData();
    window.location.reload();
  };

  // Only show in development mode
  if (!import.meta.env.DEV) {
    return null;
  }

  return (
    <div className={styles.container}>
      <Card className={styles.card}>
        <Text className={styles.title}>🔐 Auth Debug Panel</Text>
        
        <div className={styles.info}>
          <strong>Mock Auth:</strong> {debugInfo.mockAuthEnabled ? '✅ Enabled' : '❌ Disabled'}
        </div>
        
        <div className={styles.info}>
          <strong>Authenticated:</strong> {isAuthenticated ? '✅ Yes' : '❌ No'}
        </div>
        
        <div className={styles.info}>
          <strong>User:</strong> {user?.username || 'None'}
        </div>
        
        <div className={styles.info}>
          <strong>Roles:</strong>
          {userRoles.length > 0 ? (
            <div>
              {userRoles.map(role => (
                <span key={role} className={styles.roleTag}>{role}</span>
              ))}
            </div>
          ) : (
            <span> None</span>
          )}
        </div>
        
        <div className={styles.info}>
          <strong>Is Admin:</strong> {isAdmin() ? '✅ Yes' : '❌ No'}
        </div>
        
        <div className={styles.info}>
          <strong>Is PM:</strong> {isPM() ? '✅ Yes' : '❌ No'}
        </div>

        <div>
          <Button 
            className={styles.button}
            appearance="primary"
            onClick={handleForceAdmin}
            size="small"
          >
            Force NEU_Admin
          </Button>
          <Button 
            className={styles.button}
            appearance="secondary"
            onClick={handleClearAuth}
            size="small"
          >
            Clear Auth
          </Button>
        </div>
      </Card>
    </div>
  );
};