import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { ProtectedRoute } from '../ProtectedRoute';

// Mock useAuth hook
vi.mock('@/hooks/useAuth', () => ({
  useAuth: vi.fn(),
  UserRole: {
    NEU_Admin: 'NEU_Admin',
    NEU_PM: 'NEU_PM',
    NEU_Partner: 'NEU_Partner',
    NEU_Guest: 'NEU_Guest',
  },
}));

// Mock Navigate component
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    Navigate: ({ to }: any) => <div>Navigate to {to}</div>,
  };
});

import { useAuth } from '@/hooks/useAuth';

describe('ProtectedRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should show loading spinner when authentication is in progress', () => {
    (useAuth as any).mockReturnValue({
      isAuthenticated: false,
      isLoading: true,
      hasRole: vi.fn(),
      hasAnyRole: vi.fn(),
    });

    render(
      <MemoryRouter>
        <ProtectedRoute>
          <div>Protected Content</div>
        </ProtectedRoute>
      </MemoryRouter>
    );

    expect(screen.getByText('Authenticating...')).toBeInTheDocument();
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it('should redirect to login when user is not authenticated', () => {
    (useAuth as any).mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
      hasRole: vi.fn(),
      hasAnyRole: vi.fn(),
    });

    render(
      <MemoryRouter>
        <ProtectedRoute>
          <div>Protected Content</div>
        </ProtectedRoute>
      </MemoryRouter>
    );

    expect(screen.getByText('Navigate to /login')).toBeInTheDocument();
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it('should render children when user is authenticated and no roles required', () => {
    (useAuth as any).mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      hasRole: vi.fn(),
      hasAnyRole: vi.fn(),
    });

    render(
      <MemoryRouter>
        <ProtectedRoute>
          <div>Protected Content</div>
        </ProtectedRoute>
      </MemoryRouter>
    );

    expect(screen.getByText('Protected Content')).toBeInTheDocument();
  });

  it('should render children when user has required role', () => {
    const mockHasRole = vi.fn().mockReturnValue(true);
    const mockHasAnyRole = vi.fn().mockReturnValue(true);

    (useAuth as any).mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      hasRole: mockHasRole,
      hasAnyRole: mockHasAnyRole,
    });

    render(
      <MemoryRouter>
        <ProtectedRoute requiredRoles={['NEU_Admin']}>
          <div>Admin Content</div>
        </ProtectedRoute>
      </MemoryRouter>
    );

    expect(screen.getByText('Admin Content')).toBeInTheDocument();
    expect(mockHasAnyRole).toHaveBeenCalledWith(['NEU_Admin']);
  });

  it('should show access denied when user lacks required role', () => {
    const mockHasRole = vi.fn().mockReturnValue(false);
    const mockHasAnyRole = vi.fn().mockReturnValue(false);

    (useAuth as any).mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      hasRole: mockHasRole,
      hasAnyRole: mockHasAnyRole,
    });

    render(
      <MemoryRouter>
        <ProtectedRoute requiredRoles={['NEU_Admin']}>
          <div>Admin Content</div>
        </ProtectedRoute>
      </MemoryRouter>
    );

    expect(screen.getByText(/Access Denied/)).toBeInTheDocument();
    expect(screen.getByText('Navigate to /dashboard')).toBeInTheDocument();
    expect(screen.queryByText('Admin Content')).not.toBeInTheDocument();
  });

  it('should check ANY role when requireAny is true', () => {
    const mockHasRole = vi.fn().mockReturnValue(false);
    const mockHasAnyRole = vi.fn().mockReturnValue(true);

    (useAuth as any).mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      hasRole: mockHasRole,
      hasAnyRole: mockHasAnyRole,
    });

    render(
      <MemoryRouter>
        <ProtectedRoute requiredRoles={['NEU_Admin', 'NEU_PM']} requireAny={true}>
          <div>Admin or PM Content</div>
        </ProtectedRoute>
      </MemoryRouter>
    );

    expect(screen.getByText('Admin or PM Content')).toBeInTheDocument();
    expect(mockHasAnyRole).toHaveBeenCalledWith(['NEU_Admin', 'NEU_PM']);
  });

  it('should check ALL roles when requireAny is false', () => {
    const mockHasRole = vi.fn()
      .mockReturnValueOnce(true)  // NEU_Admin
      .mockReturnValueOnce(false); // NEU_PM

    const mockHasAnyRole = vi.fn().mockReturnValue(true);

    (useAuth as any).mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      hasRole: mockHasRole,
      hasAnyRole: mockHasAnyRole,
    });

    render(
      <MemoryRouter>
        <ProtectedRoute requiredRoles={['NEU_Admin', 'NEU_PM']} requireAny={false}>
          <div>Admin AND PM Content</div>
        </ProtectedRoute>
      </MemoryRouter>
    );

    expect(screen.getByText(/Access Denied/)).toBeInTheDocument();
    expect(screen.queryByText('Admin AND PM Content')).not.toBeInTheDocument();
  });

  it('should render children when user has all required roles', () => {
    const mockHasRole = vi.fn().mockReturnValue(true);
    const mockHasAnyRole = vi.fn().mockReturnValue(true);

    (useAuth as any).mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      hasRole: mockHasRole,
      hasAnyRole: mockHasAnyRole,
    });

    render(
      <MemoryRouter>
        <ProtectedRoute requiredRoles={['NEU_Admin', 'NEU_PM']} requireAny={false}>
          <div>Admin AND PM Content</div>
        </ProtectedRoute>
      </MemoryRouter>
    );

    expect(screen.getByText('Admin AND PM Content')).toBeInTheDocument();
  });
});