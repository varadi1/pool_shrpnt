import { useMsal } from '@azure/msal-react';
import { InteractionStatus } from '@azure/msal-browser';
import { loginRequest, apiScopes } from '@/config/auth.config';
import { useMemo } from 'react';

export type UserRole = 'NEU_Admin' | 'NEU_PM' | 'NEU_Partner' | 'NEU_Guest';

export const useAuth = () => {
  const { instance, accounts, inProgress } = useMsal();
  
  const user = accounts[0];
  
  // Extract user roles from ID token claims
  const userRoles = useMemo(() => {
    // TEMPORARY: Return admin role for development until Azure AD roles are configured
    // TODO: Remove this after configuring App Roles in Azure AD
    console.warn('Using hardcoded NEU_Admin role for development. Configure Azure AD App Roles to fix this.');
    return ['NEU_Admin'] as UserRole[];
    
    /* ORIGINAL CODE - Uncomment after Azure AD configuration:
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
    
    return roles as UserRole[];
    */
  }, [user]);

  const login = async () => {
    try {
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
      // Try silent token acquisition first
      const response = await instance.acquireTokenSilent({
        scopes,
        account: accounts[0],
      });
      
      return response.accessToken;
    } catch (error) {
      console.warn('Silent token acquisition failed, attempting interactive', error);
      
      // Fall back to interactive token acquisition
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
  
  const isAdmin = (): boolean => hasRole('NEU_Admin');
  const isPM = (): boolean => hasRole('NEU_PM');

  return {
    isAuthenticated: accounts.length > 0,
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
