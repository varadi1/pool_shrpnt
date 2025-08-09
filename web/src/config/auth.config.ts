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
  scopes: ['User.Read', 'openid', 'profile'],
  prompt: 'select_account' as const,
};

export const apiScopes = ['User.Read'];

export const graphScopes = ['User.Read'];

export const msalInstance = new PublicClientApplication(msalConfig);
