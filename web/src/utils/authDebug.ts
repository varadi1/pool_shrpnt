/**
 * Debug utility to force mock authentication as NEU_Admin
 * This ensures proper role assignment when VITE_USE_MOCK_AUTH is enabled
 */
export const forceAdminAuth = () => {
  // Check if mock auth is enabled
  if (import.meta.env.VITE_USE_MOCK_AUTH === 'true') {
    // Set mock account flag
    sessionStorage.setItem('mock-account', 'true');
    
    // Set admin roles
    sessionStorage.setItem('userRoles', JSON.stringify(['NEU_Admin']));
    
    // Set mock user data
    const mockUserData = {
      username: 'admin@pooldrv.local',
      name: 'NEU Admin User',
      roles: ['NEU_Admin'],
      authenticated: true
    };
    
    sessionStorage.setItem('mockUserData', JSON.stringify(mockUserData));
    
    console.log('Mock authentication forced: NEU_Admin role applied');
    
    // Force reload to apply changes
    window.location.reload();
  } else {
    console.warn('Mock authentication is not enabled. Set VITE_USE_MOCK_AUTH=true to use mock auth.');
  }
};

/**
 * Clear all authentication data from session storage
 */
export const clearAuthData = () => {
  sessionStorage.removeItem('mock-account');
  sessionStorage.removeItem('userRoles');
  sessionStorage.removeItem('mockUserData');
  console.log('Authentication data cleared');
};

/**
 * Get current authentication state for debugging
 */
export const getAuthDebugInfo = () => {
  return {
    mockAuthEnabled: import.meta.env.VITE_USE_MOCK_AUTH === 'true',
    mockAccount: sessionStorage.getItem('mock-account'),
    userRoles: JSON.parse(sessionStorage.getItem('userRoles') || '[]'),
    mockUserData: JSON.parse(sessionStorage.getItem('mockUserData') || '{}'),
    msalAccounts: (window as any).msalInstance?.getAllAccounts() || []
  };
};