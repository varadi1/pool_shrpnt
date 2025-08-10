export const config = {
  api: {
    // Prefer relative '/api' in development so Vite proxy can handle routing.
    // Allow overriding via VITE_API_BASE_URL for prod/other environments.
    baseUrl:
      (import.meta.env.VITE_API_BASE_URL as string | undefined) ||
      (import.meta.env.DEV ? '/api' : '/api'),
  },
  auth: {
    tenantId: import.meta.env.VITE_AZURE_TENANT_ID || '',
    clientId: import.meta.env.VITE_AZURE_CLIENT_ID || '',
    redirectUri: import.meta.env.VITE_REDIRECT_URI || window.location.origin,
    postLogoutRedirectUri: import.meta.env.VITE_POST_LOGOUT_REDIRECT_URI || window.location.origin,
  },
  environment: import.meta.env.VITE_ENVIRONMENT || 'development',
  monitoring: {
    appInsightsKey: import.meta.env.VITE_APP_INSIGHTS_KEY || '',
  },
};
