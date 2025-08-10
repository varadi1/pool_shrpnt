import { type Configuration, PublicClientApplication, LogLevel } from '@azure/msal-browser';

export const msalConfig: Configuration = {
  auth: {
    clientId: import.meta.env.VITE_AZURE_CLIENT_ID || '',
    authority: `https://login.microsoftonline.com/${import.meta.env.VITE_AZURE_TENANT_ID}`,
    redirectUri: import.meta.env.VITE_REDIRECT_URI || window.location.origin,
    postLogoutRedirectUri: import.meta.env.VITE_POST_LOGOUT_REDIRECT_URI || window.location.origin,
  },
  cache: {
    cacheLocation: 'sessionStorage',
    storeAuthStateInCookie: false,
  },
  system: {
    loggerOptions: {
      loggerCallback: (_level, message, containsPii) => {
        if (containsPii) return;
        console.log(message);
      },
      logLevel: import.meta.env.MODE === 'development' ? LogLevel.Info : LogLevel.Error,
    },
  },
};

export const loginRequest = {
  scopes: ['api://pooldrv/access', 'User.Read'],
  prompt: 'select_account' as const,
};

export const apiScopes = ['api://pooldrv/access'];

export const graphScopes = ['User.Read'];

export const msalInstance = new PublicClientApplication(msalConfig);

export const isE2EMode = (): boolean => {
  // 1) Explicit env flag set via Vite for mock auth
  if (import.meta.env.VITE_USE_MOCK_AUTH === 'true') return true;
  // 2) Explicit env flag set via Vite for E2E testing
  if (import.meta.env.VITE_E2E === 'true') return true;
  // 3) Playwright/init script flag
  if (typeof window !== 'undefined') {
    try {
      if ((window as any).__MSAL_MOCK__) return true;
      // 4) Test hint: presence of a mocked account in sessionStorage
      if (window.sessionStorage && window.sessionStorage.getItem('mock-account')) return true;
    } catch {
      // ignore storage access errors
    }
  }
  return false;
};
