export const config = {
  api: {
    baseUrl: import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000',
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
