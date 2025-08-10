import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Create a mock msalInstance
const mockMsalInstance = {
  initialize: vi.fn().mockResolvedValue(undefined),
  loginPopup: vi.fn(),
  loginRedirect: vi.fn(),
  logout: vi.fn(),
  acquireTokenSilent: vi.fn().mockResolvedValue({
    accessToken: 'mock-token',
  }),
  acquireTokenRedirect: vi.fn(),
  acquireTokenPopup: vi.fn().mockResolvedValue({
    accessToken: 'mock-token',
  }),
  handleRedirectPromise: vi.fn().mockResolvedValue(null),
  getAllAccounts: vi.fn().mockReturnValue([
    {
      homeAccountId: 'mock-id',
      environment: 'mock-env',
      tenantId: 'mock-tenant',
      username: 'test@example.com',
      name: 'Test User',
    },
  ]),
  getAccountByHomeId: vi.fn(),
  setActiveAccount: vi.fn(),
  getActiveAccount: vi.fn().mockReturnValue({
    homeAccountId: 'mock-id',
    environment: 'mock-env',
    tenantId: 'mock-tenant',
    username: 'test@example.com',
    name: 'Test User',
  }),
  addEventCallback: vi.fn().mockReturnValue('callback-id'),
  removeEventCallback: vi.fn(),
};

// Mock the auth config module
vi.mock('@/config/auth.config', () => ({
  msalConfig: {
    auth: {
      clientId: 'test-client-id',
      authority: 'https://login.microsoftonline.com/test-tenant',
      redirectUri: 'http://localhost:3000',
    },
    cache: {
      cacheLocation: 'sessionStorage',
      storeAuthStateInCookie: false,
    },
  },
  loginRequest: {
    scopes: ['User.Read'],
  },
  apiScopes: ['User.Read'],
  graphScopes: ['User.Read'],
  msalInstance: mockMsalInstance,
  // Ensure tests that check isE2EMode() work
  isE2EMode: () => true,
}));

// Mock MSAL
vi.mock('@azure/msal-browser', () => ({
  PublicClientApplication: vi.fn().mockImplementation(() => ({
    initialize: vi.fn().mockResolvedValue(undefined),
    loginPopup: vi.fn(),
    loginRedirect: vi.fn(),
    logout: vi.fn(),
    acquireTokenSilent: vi.fn().mockResolvedValue({
      accessToken: 'mock-token',
    }),
    acquireTokenRedirect: vi.fn(),
    acquireTokenPopup: vi.fn().mockResolvedValue({
      accessToken: 'mock-token',
    }),
    handleRedirectPromise: vi.fn().mockResolvedValue(null),
    getAllAccounts: vi.fn().mockReturnValue([
      {
        homeAccountId: 'mock-id',
        environment: 'mock-env',
        tenantId: 'mock-tenant',
        username: 'test@example.com',
        name: 'Test User',
      },
    ]),
    getAccountByHomeId: vi.fn(),
    setActiveAccount: vi.fn(),
    getActiveAccount: vi.fn().mockReturnValue({
      homeAccountId: 'mock-id',
      environment: 'mock-env',
      tenantId: 'mock-tenant',
      username: 'test@example.com',
      name: 'Test User',
    }),
    addEventCallback: vi.fn().mockReturnValue('callback-id'),
    removeEventCallback: vi.fn(),
  })),
  InteractionRequiredAuthError: class InteractionRequiredAuthError extends Error {},
  InteractionStatus: {
    None: 'none',
    Login: 'login',
    Logout: 'logout',
    AcquireToken: 'acquireToken',
  },
  EventType: {
    LOGIN_SUCCESS: 'msal:loginSuccess',
    LOGIN_FAILURE: 'msal:loginFailure',
    ACQUIRE_TOKEN_SUCCESS: 'msal:acquireTokenSuccess',
    ACQUIRE_TOKEN_FAILURE: 'msal:acquireTokenFailure',
    SSO_SILENT_SUCCESS: 'msal:ssoSilentSuccess',
    SSO_SILENT_FAILURE: 'msal:ssoSilentFailure',
  },
  LogLevel: {
    Error: 0,
    Warning: 1,
    Info: 2,
    Verbose: 3,
    Trace: 4,
  },
}));

// Mock MSAL React
vi.mock('@azure/msal-react', () => ({
  MsalProvider: ({ children }: { children: React.ReactNode }) => children,
  useMsal: vi.fn(() => ({
    instance: {
      loginRedirect: vi.fn(),
      logout: vi.fn(),
      acquireTokenSilent: vi.fn().mockResolvedValue({
        accessToken: 'mock-token',
      }),
      getAllAccounts: vi.fn().mockReturnValue([
        {
          homeAccountId: 'mock-id',
          environment: 'mock-env',
          tenantId: 'mock-tenant',
          username: 'test@example.com',
          name: 'Test User',
        },
      ]),
    },
    accounts: [
      {
        homeAccountId: 'mock-id',
        environment: 'mock-env',
        tenantId: 'mock-tenant',
        username: 'test@example.com',
        name: 'Test User',
      },
    ],
    inProgress: 'none',
  })),
  useIsAuthenticated: vi.fn(() => true),
  AuthenticatedTemplate: ({ children }: { children: React.ReactNode }) => children,
  UnauthenticatedTemplate: () => null,
}));

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock IntersectionObserver
global.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock ResizeObserver
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Robust clipboard mock for JSDOM; avoid redefining if user-event sets it
try {
  if (!('clipboard' in navigator)) {
    Object.defineProperty(global.navigator, 'clipboard', {
      writable: true,
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
        readText: vi.fn().mockResolvedValue(''),
      },
    });
  }
} catch {
  // ignore
}
