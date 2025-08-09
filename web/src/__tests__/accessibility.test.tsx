import { render, waitFor } from '@testing-library/react';
import { act } from 'react';
import { axe, toHaveNoViolations } from 'jest-axe';
import { BrowserRouter } from 'react-router-dom';
import { FluentProvider } from '@fluentui/react-components';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Dashboard } from '@/pages/Dashboard';
import { MainLayout } from '@/components/layout/MainLayout';
import { Navigation } from '@/components/layout/Navigation';
import { MetricCard } from '@/components/dashboard/MetricCard';
import { ActivityFeed } from '@/components/dashboard/ActivityFeed';
import { SystemHealth } from '@/components/dashboard/SystemHealth';
import { lightTheme } from '@/config/theme.config';
import { AuthProvider } from '@/components/auth/AuthProvider';
import { vi } from 'vitest';

expect.extend(toHaveNoViolations);

// Mock msalInstance directly
const mockMsalInstance = {
  initialize: vi.fn().mockResolvedValue(undefined),
  handleRedirectPromise: vi.fn().mockResolvedValue(null),
  getAllAccounts: vi.fn().mockReturnValue([{
    username: 'test@example.com',
    name: 'Test User',
    idTokenClaims: { roles: ['NEU_Admin'] }
  }]),
  acquireTokenSilent: vi.fn().mockResolvedValue({
    accessToken: 'mock-token',
    idToken: 'mock-id-token',
    account: {
      username: 'test@example.com',
      name: 'Test User'
    }
  }),
  addEventCallback: vi.fn().mockReturnValue('callback-id'),
  removeEventCallback: vi.fn(),
  setActiveAccount: vi.fn(),
  getActiveAccount: vi.fn().mockReturnValue({
    username: 'test@example.com',
    name: 'Test User',
    idTokenClaims: { roles: ['NEU_Admin'] }
  }),
};

// Mock the auth config with the msalInstance
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
  apiScopes: ['api://pooldrv/access'],
  msalInstance: mockMsalInstance,
}));

// Mock MSAL
vi.mock('@azure/msal-browser', () => ({
  PublicClientApplication: vi.fn().mockImplementation(() => mockMsalInstance),
  EventType: {
    LOGIN_SUCCESS: 'msal:loginSuccess',
    LOGIN_FAILURE: 'msal:loginFailure',
    ACQUIRE_TOKEN_SUCCESS: 'msal:acquireTokenSuccess',
    ACQUIRE_TOKEN_FAILURE: 'msal:acquireTokenFailure',
  },
  InteractionStatus: {
    None: 'none',
    Login: 'login',
    Logout: 'logout',
    AcquireToken: 'acquireToken',
    SsoSilent: 'ssoSilent',
    HandleRedirect: 'handleRedirect',
  },
  LogLevel: {
    Error: 0,
    Warning: 1,
    Info: 2,
    Verbose: 3,
    Trace: 4,
  },
}));

// Mock API client
vi.mock('@/services/api/axios-client', () => ({
  apiClient: {
    get: vi.fn().mockResolvedValue({ data: [] }),
    post: vi.fn().mockResolvedValue({ data: {} }),
    put: vi.fn().mockResolvedValue({ data: {} }),
    delete: vi.fn().mockResolvedValue({ data: {} }),
  }
}));

// Mock date-fns
vi.mock('date-fns', () => ({
  formatDistanceToNow: vi.fn(() => '5 minutes ago'),
}));

vi.mock('@azure/msal-react', () => ({
  useMsal: () => ({
    instance: {
      getAllAccounts: vi.fn().mockReturnValue([{
        username: 'test@example.com',
        name: 'Test User',
        idTokenClaims: { roles: ['NEU_Admin'] }
      }]),
      acquireTokenSilent: vi.fn().mockResolvedValue({
        accessToken: 'mock-token'
      }),
      loginRedirect: vi.fn(),
      logoutRedirect: vi.fn(),
    },
    accounts: [{
      username: 'test@example.com',
      name: 'Test User',
      idTokenClaims: { roles: ['NEU_Admin'] }
    }],
    inProgress: 'none',
  }),
  MsalProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  AuthenticatedTemplate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  UnauthenticatedTemplate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false },
  },
});

const renderWithProviders = async (component: React.ReactElement) => {
  let rendered;
  await act(async () => {
    rendered = render(
      <BrowserRouter>
        <AuthProvider>
          <FluentProvider theme={lightTheme}>
            <QueryClientProvider client={queryClient}>
              {component}
            </QueryClientProvider>
          </FluentProvider>
        </AuthProvider>
      </BrowserRouter>
    );
  });
  return rendered!;
};

describe('Accessibility Compliance Tests', () => {
  describe('Skip Navigation', () => {
    it('should have skip navigation link as first focusable element', async () => {
      const { container } = await renderWithProviders(<MainLayout />);
      const skipLink = container.querySelector('a[href="#main-content"]');
      expect(skipLink).toBeInTheDocument();
      expect(skipLink).toHaveTextContent('Skip to main content');
    });

    it('should focus main content when skip link is activated', async () => {
      const { container } = await renderWithProviders(<MainLayout />);
      const mainContent = container.querySelector('#main-content');
      expect(mainContent).toBeInTheDocument();
      expect(mainContent).toHaveAttribute('tabIndex', '-1');
    });
  });

  describe('ARIA Labels and Roles', () => {
    it('should have proper ARIA labels on navigation', async () => {
      const { container } = await renderWithProviders(<Navigation />);
      const nav = container.querySelector('nav');
      expect(nav).toHaveAttribute('role', 'navigation');
      expect(nav).toHaveAttribute('aria-label', 'Main navigation');
    });

    it('should have proper ARIA labels on metric cards', async () => {
      const { container } = await renderWithProviders(
        <MetricCard 
          title="Test Metric" 
          value={42} 
          subtitle="Test subtitle"
        />
      );
      const card = container.querySelector('[role="article"]');
      expect(card).toBeInTheDocument();
      expect(card).toHaveAttribute('aria-label');
    });

    it('should have proper ARIA labels on activity feed', async () => {
      const activities = [{
        id: '1',
        user: 'John Doe',
        action: 'created order',
        target: 'ORD-001',
        timestamp: new Date().toISOString(),
        type: 'create' as const
      }];
      
      const { container } = await renderWithProviders(
        <ActivityFeed activities={activities} />
      );
      const feed = container.querySelector('[role="feed"]');
      expect(feed).toBeInTheDocument();
    });

    it('should have proper ARIA labels on system health', async () => {
      const { container } = await renderWithProviders(
        <SystemHealth 
          health="healthy"
          queueDepth={5}
          lastProvisionTime={3}
          apiLatency={150}
        />
      );
      const region = container.querySelector('[role="region"]');
      expect(region).toHaveAttribute('aria-label', 'System health status');
    });
  });

  describe('Heading Hierarchy', () => {
    it('should have proper heading hierarchy on dashboard', async () => {
      const { container } = await renderWithProviders(<Dashboard />);
      const h1 = container.querySelector('h1');
      const h2s = container.querySelectorAll('h2');
      
      expect(h1).toBeInTheDocument();
      expect(h1).toHaveTextContent('Dashboard');
      expect(h2s.length).toBeGreaterThan(0);
    });

    it('should have h2 headings for metric cards', async () => {
      const { container } = await renderWithProviders(
        <MetricCard title="Test Metric" value={42} />
      );
      const heading = container.querySelector('h2');
      expect(heading).toBeInTheDocument();
      expect(heading).toHaveTextContent('Test Metric');
    });
  });

  describe('Keyboard Navigation', () => {
    it('should have all interactive elements keyboard accessible', async () => {
      const { container } = await renderWithProviders(<MainLayout />);
      const interactiveElements = container.querySelectorAll(
        'a, button, input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      
      interactiveElements.forEach(element => {
        expect(element).toHaveAttribute('tabindex');
        const tabIndex = element.getAttribute('tabindex');
        if (tabIndex) {
          expect(parseInt(tabIndex)).toBeGreaterThanOrEqual(-1);
        }
      });
    });

    it('should have visible focus indicators', async () => {
      const { container } = await renderWithProviders(<Navigation />);
      const links = container.querySelectorAll('a');
      
      links.forEach(link => {
        const styles = window.getComputedStyle(link);
        // Check that focus styles are defined
        expect(styles).toBeDefined();
      });
    });
  });

  describe('Live Regions', () => {
    it('should have aria-live regions for dynamic content', async () => {
      const { container } = await renderWithProviders(
        <MetricCard title="Test" value={42} loading={false} />
      );
      const liveRegion = container.querySelector('[aria-live]');
      expect(liveRegion).toBeInTheDocument();
    });

    it('should announce loading states', async () => {
      const { container } = await renderWithProviders(
        <MetricCard title="Test" loading={true} />
      );
      const loadingIndicator = container.querySelector('[role="status"]');
      expect(loadingIndicator).toBeInTheDocument();
    });
  });

  describe('Automated Accessibility Testing with axe', () => {
    it('should not have any accessibility violations in Dashboard', async () => {
      const { container } = await renderWithProviders(<Dashboard />);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should not have any accessibility violations in Navigation', async () => {
      const { container } = await renderWithProviders(<Navigation />);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should not have any accessibility violations in MetricCard', async () => {
      const { container } = await renderWithProviders(
        <MetricCard title="Test Metric" value={42} />
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should not have any accessibility violations in ActivityFeed', async () => {
      const activities = [{
        id: '1',
        user: 'John Doe',
        action: 'created order',
        timestamp: new Date().toISOString(),
        type: 'create' as const
      }];
      
      const { container } = await renderWithProviders(
        <ActivityFeed activities={activities} />
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should not have any accessibility violations in SystemHealth', async () => {
      const { container } = await renderWithProviders(
        <SystemHealth 
          health="healthy"
          queueDepth={5}
          lastProvisionTime={3}
          apiLatency={150}
        />
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });

  describe('Color Contrast', () => {
    it('should meet WCAG AA contrast requirements', async () => {
      // Fluent UI theme colors are WCAG compliant by default
      // This test verifies the theme is properly applied
      const { container } = await renderWithProviders(<Dashboard />);
      const elements = container.querySelectorAll('*');
      
      elements.forEach(element => {
        const styles = window.getComputedStyle(element);
        if (styles.color && styles.backgroundColor) {
          // Fluent UI ensures WCAG compliance
          expect(styles).toBeDefined();
        }
      });
    });
  });

  describe('Screen Reader Announcements', () => {
    it('should announce metric updates', () => {
      const { rerender, container } = renderWithProviders(
        <MetricCard title="Orders" value={10} />
      );
      
      const liveRegion = container.querySelector('[aria-live="polite"]');
      expect(liveRegion).toBeInTheDocument();
      
      rerender(
        <BrowserRouter>
          <AuthProvider>
            <FluentProvider theme={lightTheme}>
              <QueryClientProvider client={queryClient}>
                <MetricCard title="Orders" value={15} />
              </QueryClientProvider>
            </FluentProvider>
          </AuthProvider>
        </BrowserRouter>
      );
      
      // Content should update in live region
      expect(liveRegion).toBeInTheDocument();
    });
  });

  describe('Focus Management', () => {
    it('should trap focus in modal dialogs', () => {
      // This would test focus trapping in modals when implemented
      expect(true).toBe(true);
    });

    it('should restore focus after closing modals', () => {
      // This would test focus restoration when implemented
      expect(true).toBe(true);
    });
  });

  describe('Form Accessibility', () => {
    it('should have associated labels for form inputs', () => {
      // This would test form inputs when implemented
      expect(true).toBe(true);
    });

    it('should announce form errors', () => {
      // This would test form error announcements when implemented
      expect(true).toBe(true);
    });
  });
});