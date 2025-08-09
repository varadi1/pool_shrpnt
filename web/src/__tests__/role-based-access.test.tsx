import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FluentProvider } from '@fluentui/react-components';
import { Navigation } from '@/components/layout/Navigation';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { lightTheme } from '@/config/theme.config';

// Mock useAuth hook
vi.mock('@/hooks/useAuth', () => ({
  useAuth: vi.fn(),
}));

import { useAuth } from '@/hooks/useAuth';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false },
  },
});

const renderWithProviders = (component: React.ReactElement) => {
  return render(
    <BrowserRouter>
      <FluentProvider theme={lightTheme}>
        <QueryClientProvider client={queryClient}>
          {component}
        </QueryClientProvider>
      </FluentProvider>
    </BrowserRouter>
  );
};

describe('Role-Based Access Control Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Navigation Component - Role-Based Visibility', () => {
    it('should show all items for NEU_Admin role', () => {
      (useAuth as any).mockReturnValue({
        isAuthenticated: true,
        hasAnyRole: (roles: string[]) => roles.includes('NEU_Admin'),
        hasAllRoles: (roles: string[]) => roles.includes('NEU_Admin'),
        isAdmin: true,
        user: {
          username: 'admin@example.com',
          idTokenClaims: { roles: ['NEU_Admin'] }
        }
      });

      renderWithProviders(<Navigation />);

      // Admin should see all navigation items
      expect(screen.getByText('Dashboard')).toBeInTheDocument();
      expect(screen.getByText('Contracts')).toBeInTheDocument();
      expect(screen.getByText('Orders')).toBeInTheDocument();
      expect(screen.getByText('Templates')).toBeInTheDocument();
      expect(screen.getByText('Locks')).toBeInTheDocument();
      expect(screen.getByText('Users & Groups')).toBeInTheDocument();
      expect(screen.getByText('Permissions')).toBeInTheDocument();
      expect(screen.getByText('Guest Management')).toBeInTheDocument();
      expect(screen.getByText('Reports')).toBeInTheDocument();
      expect(screen.getByText('Audit')).toBeInTheDocument();
      expect(screen.getByText('Settings')).toBeInTheDocument();
    });

    it('should show limited items for NEU_PM role', () => {
      (useAuth as any).mockReturnValue({
        isAuthenticated: true,
        hasAnyRole: (roles: string[]) => roles.includes('NEU_PM'),
        hasAllRoles: (roles: string[]) => roles.includes('NEU_PM'),
        isAdmin: false,
        user: {
          username: 'pm@example.com',
          idTokenClaims: { roles: ['NEU_PM'] }
        }
      });

      renderWithProviders(<Navigation />);

      // PM should see limited navigation items
      expect(screen.getByText('Dashboard')).toBeInTheDocument();
      expect(screen.getByText('Contracts')).toBeInTheDocument();
      expect(screen.getByText('Orders')).toBeInTheDocument();
      expect(screen.queryByText('Templates')).not.toBeInTheDocument(); // Admin only
      expect(screen.getByText('Locks')).toBeInTheDocument();
      expect(screen.queryByText('Users & Groups')).not.toBeInTheDocument(); // Admin only
      expect(screen.queryByText('Permissions')).not.toBeInTheDocument(); // Admin only
      expect(screen.getByText('Guest Management')).toBeInTheDocument();
      expect(screen.getByText('Reports')).toBeInTheDocument();
      expect(screen.queryByText('Audit')).not.toBeInTheDocument(); // Admin only
      expect(screen.getByText('Settings')).toBeInTheDocument();
    });

    it('should show minimal items for users with no roles', () => {
      (useAuth as any).mockReturnValue({
        isAuthenticated: true,
        hasAnyRole: () => false,
        hasAllRoles: () => false,
        isAdmin: false,
        user: {
          username: 'user@example.com',
          idTokenClaims: { roles: [] }
        }
      });

      renderWithProviders(<Navigation />);

      // Users with no roles should only see basic items
      expect(screen.getByText('Dashboard')).toBeInTheDocument();
      expect(screen.queryByText('Contracts')).not.toBeInTheDocument();
      expect(screen.queryByText('Orders')).not.toBeInTheDocument();
      expect(screen.queryByText('Templates')).not.toBeInTheDocument();
      expect(screen.queryByText('Locks')).not.toBeInTheDocument();
      expect(screen.queryByText('Users & Groups')).not.toBeInTheDocument();
      expect(screen.queryByText('Permissions')).not.toBeInTheDocument();
      expect(screen.queryByText('Guest Management')).not.toBeInTheDocument();
      expect(screen.queryByText('Reports')).not.toBeInTheDocument();
      expect(screen.queryByText('Audit')).not.toBeInTheDocument();
      expect(screen.getByText('Settings')).toBeInTheDocument();
    });

    it('should handle users with multiple roles correctly', () => {
      (useAuth as any).mockReturnValue({
        isAuthenticated: true,
        hasAnyRole: (roles: string[]) => 
          roles.some(role => ['NEU_Admin', 'NEU_PM'].includes(role)),
        hasAllRoles: (roles: string[]) => 
          roles.every(role => ['NEU_Admin', 'NEU_PM'].includes(role)),
        isAdmin: true,
        user: {
          username: 'superuser@example.com',
          idTokenClaims: { roles: ['NEU_Admin', 'NEU_PM'] }
        }
      });

      renderWithProviders(<Navigation />);

      // User with both roles should see all items (Admin takes precedence)
      expect(screen.getByText('Dashboard')).toBeInTheDocument();
      expect(screen.getByText('Templates')).toBeInTheDocument();
      expect(screen.getByText('Users & Groups')).toBeInTheDocument();
      expect(screen.getByText('Permissions')).toBeInTheDocument();
      expect(screen.getByText('Audit')).toBeInTheDocument();
    });
  });

  describe('ProtectedRoute Component - Access Control', () => {
    const TestComponent = () => <div>Protected Content</div>;
    const UnauthorizedComponent = () => <div>Unauthorized</div>;

    it('should render protected content for authorized users', () => {
      (useAuth as any).mockReturnValue({
        isAuthenticated: true,
        hasAnyRole: (roles: string[]) => roles.includes('NEU_Admin'),
        hasAllRoles: (roles: string[]) => roles.includes('NEU_Admin'),
        isAdmin: true,
        isLoading: false,
        user: {
          username: 'admin@example.com',
          idTokenClaims: { roles: ['NEU_Admin'] }
        }
      });

      renderWithProviders(
        <ProtectedRoute requiredRoles={['NEU_Admin']}>
          <TestComponent />
        </ProtectedRoute>
      );

      expect(screen.getByText('Protected Content')).toBeInTheDocument();
    });

    it('should redirect unauthorized users', () => {
      (useAuth as any).mockReturnValue({
        isAuthenticated: true,
        hasAnyRole: () => false,
        hasAllRoles: () => false,
        isAdmin: false,
        isLoading: false,
        user: {
          username: 'user@example.com',
          idTokenClaims: { roles: [] }
        }
      });

      renderWithProviders(
        <ProtectedRoute requiredRoles={['NEU_Admin']}>
          <TestComponent />
        </ProtectedRoute>
      );

      expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
    });

    it('should show loading state while authentication is pending', () => {
      (useAuth as any).mockReturnValue({
        isAuthenticated: false,
        hasAnyRole: () => false,
        hasAllRoles: () => false,
        isAdmin: false,
        isLoading: true,
        user: null
      });

      renderWithProviders(
        <ProtectedRoute requiredRoles={['NEU_Admin']}>
          <TestComponent />
        </ProtectedRoute>
      );

      expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
      // Loading state should be handled by the component
    });

    it('should handle requireAny flag correctly', () => {
      (useAuth as any).mockReturnValue({
        isAuthenticated: true,
        hasAnyRole: (roles: string[]) => 
          roles.some(role => ['NEU_PM'].includes(role)),
        hasRole: (role: string) => role === 'NEU_PM',
        hasAllRoles: (roles: string[]) => false,
        isAdmin: false,
        isLoading: false,
        user: {
          username: 'pm@example.com',
          idTokenClaims: { roles: ['NEU_PM'] }
        }
      });

      const { rerender } = renderWithProviders(
        <ProtectedRoute requiredRoles={['NEU_Admin', 'NEU_PM']} requireAny={false}>
          <TestComponent />
        </ProtectedRoute>
      );

      // Should not render because user doesn't have ALL required roles (requireAny=false means require all)
      expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();

      // Now test with requireAny=true (default)
      rerender(
        <BrowserRouter>
          <FluentProvider theme={lightTheme}>
            <QueryClientProvider client={queryClient}>
              <ProtectedRoute requiredRoles={['NEU_Admin', 'NEU_PM']} requireAny={true}>
                <TestComponent />
              </ProtectedRoute>
            </QueryClientProvider>
          </FluentProvider>
        </BrowserRouter>
      );

      // Should render because user has at least one required role (requireAny=true)
      expect(screen.getByText('Protected Content')).toBeInTheDocument();
    });
  });

  describe('Dynamic Role Updates', () => {
    it('should update navigation when user role changes', () => {
      const mockUseAuth = vi.fn();
      (useAuth as any).mockImplementation(mockUseAuth);

      // Initial render with PM role
      mockUseAuth.mockReturnValue({
        isAuthenticated: true,
        hasAnyRole: (roles: string[]) => roles.includes('NEU_PM'),
        hasAllRoles: (roles: string[]) => roles.includes('NEU_PM'),
        isAdmin: false,
        user: {
          username: 'user@example.com',
          idTokenClaims: { roles: ['NEU_PM'] }
        }
      });

      const { rerender } = renderWithProviders(<Navigation />);
      expect(screen.queryByText('Templates')).not.toBeInTheDocument();

      // Update to Admin role
      mockUseAuth.mockReturnValue({
        isAuthenticated: true,
        hasAnyRole: (roles: string[]) => roles.includes('NEU_Admin'),
        hasAllRoles: (roles: string[]) => roles.includes('NEU_Admin'),
        isAdmin: true,
        user: {
          username: 'user@example.com',
          idTokenClaims: { roles: ['NEU_Admin'] }
        }
      });

      rerender(
        <BrowserRouter>
          <FluentProvider theme={lightTheme}>
            <QueryClientProvider client={queryClient}>
              <Navigation />
            </QueryClientProvider>
          </FluentProvider>
        </BrowserRouter>
      );

      expect(screen.getByText('Templates')).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('should handle null/undefined roles gracefully', () => {
      (useAuth as any).mockReturnValue({
        isAuthenticated: true,
        hasAnyRole: () => false,
        hasAllRoles: () => false,
        isAdmin: false,
        user: {
          username: 'user@example.com',
          idTokenClaims: { roles: null }
        }
      });

      renderWithProviders(<Navigation />);
      
      // Should still render basic navigation
      expect(screen.getByText('Dashboard')).toBeInTheDocument();
      expect(screen.getByText('Settings')).toBeInTheDocument();
    });

    it('should handle empty roles array', () => {
      (useAuth as any).mockReturnValue({
        isAuthenticated: true,
        hasAnyRole: () => false,
        hasAllRoles: () => false,
        isAdmin: false,
        user: {
          username: 'user@example.com',
          idTokenClaims: { roles: [] }
        }
      });

      renderWithProviders(<Navigation />);
      
      // Should still render basic navigation
      expect(screen.getByText('Dashboard')).toBeInTheDocument();
      expect(screen.getByText('Settings')).toBeInTheDocument();
    });

    it('should handle malformed role claims', () => {
      (useAuth as any).mockReturnValue({
        isAuthenticated: true,
        hasAnyRole: () => false,
        hasAllRoles: () => false,
        isAdmin: false,
        user: {
          username: 'user@example.com',
          idTokenClaims: { roles: 'NEU_Admin' } // String instead of array
        }
      });

      renderWithProviders(<Navigation />);
      
      // Should handle gracefully and show basic navigation
      expect(screen.getByText('Dashboard')).toBeInTheDocument();
      expect(screen.getByText('Settings')).toBeInTheDocument();
    });
  });
});