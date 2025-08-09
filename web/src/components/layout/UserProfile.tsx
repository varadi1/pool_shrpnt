import { useState, useCallback } from 'react';
import {
  Avatar,
  Button,
  Menu,
  MenuTrigger,
  MenuPopover,
  MenuList,
  MenuItem,
  MenuDivider,
  makeStyles,
  tokens,
  Text,
  Caption1,
  Dialog,
  DialogTrigger,
  DialogSurface,
  DialogTitle,
  DialogBody,
  DialogActions,
  DialogContent,
} from '@fluentui/react-components';
import {
  Person20Regular,
  SignOut20Regular,
  Settings20Regular,
  Info20Regular,
  Clock20Regular,
  Building20Regular,
} from '@fluentui/react-icons';
import { useAuth } from '@/hooks/useAuth';

const useStyles = makeStyles({
  container: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  userInfo: {
    display: 'flex',
    flexDirection: 'column',
    padding: '12px',
    minWidth: '200px',
  },
  userName: {
    fontWeight: tokens.fontWeightSemibold,
    marginBottom: '4px',
  },
  userRole: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
  },
  userDetail: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase100,
    marginTop: '2px',
  },
  menuItem: {
    gap: '8px',
  },
  tenantInfo: {
    display: 'flex',
    flexDirection: 'column',
    padding: '8px 12px',
    backgroundColor: tokens.colorNeutralBackground2,
    borderRadius: tokens.borderRadiusMedium,
    margin: '8px',
  },
  tenantLabel: {
    fontSize: tokens.fontSizeBase100,
    color: tokens.colorNeutralForeground3,
  },
  tenantValue: {
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightSemibold,
    marginTop: '2px',
  },
});

export const UserProfile = () => {
  const styles = useStyles();
  const { user, userRoles, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);

  // Extract user details from MSAL claims
  const userClaims = user?.idTokenClaims as any;
  const userName = userClaims?.name || userClaims?.preferred_username || user?.username || 'User';
  const userEmail = userClaims?.email || userClaims?.preferred_username || '';
  const tenantId = userClaims?.tid || user?.tenantId || '';
  const tenantName = userClaims?.tenant_name || 'NEU Zrt.';
  
  // Get last login from session storage or token issue time
  const getLastLoginTime = useCallback(() => {
    const storedTime = sessionStorage.getItem('lastLoginTime');
    if (storedTime) {
      return new Date(storedTime);
    }
    // Use token issued at time as fallback
    if (userClaims?.iat) {
      return new Date(userClaims.iat * 1000);
    }
    return null;
  }, [userClaims]);

  const lastLoginTime = getLastLoginTime();

  const getUserRole = () => {
    if (userRoles.includes('NEU_Admin')) return 'Administrator';
    if (userRoles.includes('NEU_PM')) return 'Project Manager';
    if (userRoles.includes('NEU_Partner')) return 'Partner';
    if (userRoles.includes('NEU_Guest')) return 'Guest';
    return 'User';
  };

  const getUserInitials = () => {
    return userName
      .split(' ')
      .map((n: string) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const formatLastLogin = (date: Date | null) => {
    if (!date) return 'Never';
    
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    });
  };

  const handleLogout = useCallback(() => {
    setMenuOpen(false);
    setLogoutDialogOpen(false);
    // Store logout time for next session
    sessionStorage.setItem('lastLogoutTime', new Date().toISOString());
    logout();
  }, [logout]);

  const handleProfileSettings = () => {
    // This will be implemented in a future story
    console.log('Profile settings - coming in future story');
    setMenuOpen(false);
  };

  return (
    <div className={styles.container}>
      <Menu open={menuOpen} onOpenChange={(_, data) => setMenuOpen(data.open)}>
        <MenuTrigger disableButtonEnhancement>
          <Button
            appearance="subtle"
            icon={
              <Avatar
                name={userName}
                initials={getUserInitials()}
                size={32}
                badge={{ status: 'available' }}
              />
            }
            aria-label="User profile menu"
            data-testid="user-profile-button"
          />
        </MenuTrigger>
        <MenuPopover>
          <div className={styles.userInfo}>
            <Text className={styles.userName}>{userName}</Text>
            <Caption1 className={styles.userRole}>{getUserRole()}</Caption1>
            {userEmail && (
              <Caption1 className={styles.userDetail}>{userEmail}</Caption1>
            )}
            {lastLoginTime && (
              <Caption1 className={styles.userDetail}>
                <Clock20Regular fontSize={12} /> Last login: {formatLastLogin(lastLoginTime)}
              </Caption1>
            )}
          </div>
          
          <div className={styles.tenantInfo}>
            <Caption1 className={styles.tenantLabel}>Organization</Caption1>
            <Text className={styles.tenantValue}>
              <Building20Regular fontSize={14} /> {tenantName}
            </Text>
            {tenantId && (
              <Caption1 className={styles.userDetail} title={tenantId}>
                ID: {tenantId.substring(0, 8)}...
              </Caption1>
            )}
          </div>
          
          <MenuDivider />
          <MenuList>
            <MenuItem 
              icon={<Person20Regular />} 
              onClick={handleProfileSettings}
              disabled
              data-testid="profile-settings-item"
            >
              Profile Settings
              <Caption1 style={{ marginLeft: 'auto', fontSize: '10px' }}>
                Coming soon
              </Caption1>
            </MenuItem>
            <MenuItem 
              icon={<Settings20Regular />} 
              disabled
              data-testid="preferences-item"
            >
              Preferences
              <Caption1 style={{ marginLeft: 'auto', fontSize: '10px' }}>
                Coming soon
              </Caption1>
            </MenuItem>
            <MenuDivider />
            <MenuItem
              icon={<SignOut20Regular />}
              onClick={() => setLogoutDialogOpen(true)}
              data-testid="logout-item"
            >
              Sign Out
            </MenuItem>
          </MenuList>
        </MenuPopover>
      </Menu>

      <Dialog open={logoutDialogOpen} onOpenChange={(_, data) => setLogoutDialogOpen(data.open)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>Sign Out Confirmation</DialogTitle>
            <DialogContent>
              Are you sure you want to sign out from poolDRV?
            </DialogContent>
            <DialogActions>
              <DialogTrigger disableButtonEnhancement>
                <Button appearance="secondary">Cancel</Button>
              </DialogTrigger>
              <Button 
                appearance="primary" 
                onClick={handleLogout}
                data-testid="confirm-logout-button"
              >
                Sign Out
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  );
};