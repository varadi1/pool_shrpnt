import { useMsal } from '@azure/msal-react';
import { InteractionStatus } from '@azure/msal-browser';
import { loginRequest, apiScopes, isE2EMode } from '@/config/auth.config';
import { useMemo } from 'react';

export type UserRole = 'NEU_Admin' | 'NEU_PM' | 'NEU_Partner' | 'NEU_Guest';

export const useAuth = () => {
  const { instance, accounts, inProgress } = useMsal();
  
  const user = accounts[0];
  
  // Extract user roles from ID token claims
  const userRoles = useMemo(() => {
    // First check if we're in mock mode with stored roles
    if (isE2EMode()) {
      const storedRoles = sessionStorage.getItem('userRoles');
      if (storedRoles) {
        const roles = JSON.parse(storedRoles) as UserRole[];
        console.log('Using mock roles:', roles);
        return roles;
      }
      // Default to NEU_Admin in mock mode
      console.log('Mock mode detected, defaulting to NEU_Admin role');
      return ['NEU_Admin'] as UserRole[];
    }
    
    if (!user?.idTokenClaims) return [];
    
    const claims = user.idTokenClaims as any;
    const roles = claims.roles || [];
    
    // Also check session storage as backup
    if (roles.length === 0) {
      const storedRoles = sessionStorage.getItem('userRoles');
      if (storedRoles) {
        return JSON.parse(storedRoles) as UserRole[];
      }
    }
    
    // Store roles in session storage for backup
    if (roles.length > 0) {
      sessionStorage.setItem('userRoles', JSON.stringify(roles));
    }
    
    // Development fallback - log warning if no roles configured
    if (roles.length === 0 && import.meta.env.DEV) {
      console.warn('No Azure AD App Roles found in token. Ensure App Roles are configured in Azure AD.');
    }
    
    return roles as UserRole[];
  }, [user]);

  const login = async () => {
    try {
      if (isE2EMode()) {
        // Do nothing in E2E mode; AuthProvider already set a mock account
        return;
      }
      await instance.loginRedirect(loginRequest);
    } catch (error) {
      console.error('Login failed:', error);
    }
  };

  const logout = async () => {
    // Clear session storage
    sessionStorage.removeItem('userRoles');
    
    await instance.logoutRedirect({
      postLogoutRedirectUri: window.location.origin,
    });
  };

  const getAccessToken = async (scopes: string[] = apiScopes) => {
    if (accounts.length === 0) {
      throw new Error('No authenticated user');
    }

    try {
      if (isE2EMode()) {
        return 'mock-access-token';
      }
      // Try silent token acquisition first
      const response = await instance.acquireTokenSilent({
        scopes,
        account: accounts[0],
      });
      
      return response.accessToken;
    } catch (error) {
      console.warn('Silent token acquisition failed, attempting interactive', error);
      
      // Fall back to interactive token acquisition
      if (isE2EMode()) {
        return 'mock-access-token';
      }
      const response = await instance.acquireTokenRedirect({
        scopes,
        account: accounts[0],
      });
      
      return response?.accessToken || '';
    }
  };
  
  const hasRole = (role: UserRole): boolean => {
    return userRoles.includes(role);
  };
  
  const hasAnyRole = (roles: UserRole[]): boolean => {
    return roles.some(role => userRoles.includes(role));
  };
  
  const isAdmin = (): boolean => {
    // In mock mode, check for NEU_Admin role
    if (isE2EMode()) {
      return userRoles.includes('NEU_Admin');
    }
    return hasRole('NEU_Admin');
  };
  
  const isPM = (): boolean => {
    // In mock mode, check for NEU_PM role
    if (isE2EMode()) {
      return userRoles.includes('NEU_PM');
    }
    return hasRole('NEU_PM');
  };

  return {
    isAuthenticated: accounts.length > 0 || isE2EMode(),
    isLoading: inProgress === InteractionStatus.Login,
    user,
    userRoles,
    login,
    logout,
    getAccessToken,
    hasRole,
    hasAnyRole,
    isAdmin,
    isPM,
  };
};
