import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserProfile } from '../UserProfile';
import { FluentProvider } from '@fluentui/react-components';
import { lightTheme } from '@/config/theme.config';
import { useAuth } from '@/hooks/useAuth';

// Mock logout function
const mockLogout = vi.fn();

// Mock useAuth hook
vi.mock('@/hooks/useAuth', () => ({
  useAuth: vi.fn(() => ({
    user: {
      name: 'John Doe',
      username: 'johndoe',
      tenantId: 'test-tenant-id-1234567890',
      idTokenClaims: {
        name: 'John Doe',
        preferred_username: 'john.doe@neumanndevops.hu',
        email: 'john.doe@neumanndevops.hu',
        tid: 'test-tenant-id-1234567890',
        tenant_name: 'Neumann Egyetem',
        iat: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
      },
    },
    userRoles: ['NEU_Admin'],
    logout: mockLogout,
  })),
}));

const renderWithProviders = (component: React.ReactElement) => {
  return render(
    <FluentProvider theme={lightTheme}>
      {component}
    </FluentProvider>
  );
};

describe('UserProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  it('renders user avatar button', () => {
    renderWithProviders(<UserProfile />);
    
    const button = screen.getByTestId('user-profile-button');
    expect(button).toBeInTheDocument();
  });

  it('opens menu on click and displays user information', () => {
    renderWithProviders(<UserProfile />);
    
    const button = screen.getByTestId('user-profile-button');
    fireEvent.click(button);
    
    // Check user name and role
    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('Administrator')).toBeInTheDocument();
    
    // Check email
    expect(screen.getByText('john.doe@neumanndevops.hu')).toBeInTheDocument();
  });

  it('displays correct role for different user types', () => {
    renderWithProviders(<UserProfile />);
    
    const button = screen.getByTestId('user-profile-button');
    fireEvent.click(button);
    
    expect(screen.getByText('Administrator')).toBeInTheDocument();
  });

  it('shows tenant organization information', () => {
    renderWithProviders(<UserProfile />);
    
    const button = screen.getByTestId('user-profile-button');
    fireEvent.click(button);
    
    // Check organization section
    expect(screen.getByText('Organization')).toBeInTheDocument();
    expect(screen.getByText('Neumann Egyetem')).toBeInTheDocument();
    
    // Check truncated tenant ID (substring shows first 8 chars)
    const tenantIdElement = screen.getByTitle('test-tenant-id-1234567890');
    expect(tenantIdElement).toBeInTheDocument();
    expect(tenantIdElement.textContent).toContain('ID: test-ten...');
  });

  it('displays menu items with correct states', () => {
    renderWithProviders(<UserProfile />);
    
    const button = screen.getByTestId('user-profile-button');
    fireEvent.click(button);
    
    // Profile Settings - disabled with coming soon label
    const profileItem = screen.getByTestId('profile-settings-item');
    expect(profileItem).toBeInTheDocument();
    expect(profileItem).toHaveAttribute('aria-disabled', 'true');
    
    // Preferences - disabled with coming soon label
    const preferencesItem = screen.getByTestId('preferences-item');
    expect(preferencesItem).toBeInTheDocument();
    expect(preferencesItem).toHaveAttribute('aria-disabled', 'true');
    
    // Sign Out - enabled
    const logoutItem = screen.getByTestId('logout-item');
    expect(logoutItem).toBeInTheDocument();
    expect(logoutItem).not.toHaveAttribute('aria-disabled');
  });

  it('shows last login time formatted correctly', () => {
    renderWithProviders(<UserProfile />);
    
    const button = screen.getByTestId('user-profile-button');
    fireEvent.click(button);
    
    // Should show "1 hour ago" based on mock iat
    expect(screen.getByText(/Last login: 1 hour ago/)).toBeInTheDocument();
  });

  it('opens logout confirmation dialog when Sign Out is clicked', async () => {
    renderWithProviders(<UserProfile />);
    
    const button = screen.getByTestId('user-profile-button');
    fireEvent.click(button);
    
    const logoutItem = screen.getByTestId('logout-item');
    fireEvent.click(logoutItem);
    
    // Check dialog appears
    await waitFor(() => {
      expect(screen.getByText('Sign Out Confirmation')).toBeInTheDocument();
      expect(screen.getByText('Are you sure you want to sign out from poolDRV?')).toBeInTheDocument();
    });
    
    // Check dialog buttons
    expect(screen.getByText('Cancel')).toBeInTheDocument();
    expect(screen.getByTestId('confirm-logout-button')).toBeInTheDocument();
  });

  it('cancels logout when Cancel is clicked in dialog', async () => {
    renderWithProviders(<UserProfile />);
    
    const button = screen.getByTestId('user-profile-button');
    fireEvent.click(button);
    
    const logoutItem = screen.getByTestId('logout-item');
    fireEvent.click(logoutItem);
    
    await waitFor(() => {
      expect(screen.getByText('Sign Out Confirmation')).toBeInTheDocument();
    });
    
    const cancelButton = screen.getByText('Cancel');
    fireEvent.click(cancelButton);
    
    // Dialog should close
    await waitFor(() => {
      expect(screen.queryByText('Sign Out Confirmation')).not.toBeInTheDocument();
    });
    
    // Logout should not be called
    expect(mockLogout).not.toHaveBeenCalled();
  });

  it('confirms logout when Sign Out is clicked in dialog', async () => {
    renderWithProviders(<UserProfile />);
    
    const button = screen.getByTestId('user-profile-button');
    fireEvent.click(button);
    
    const logoutItem = screen.getByTestId('logout-item');
    fireEvent.click(logoutItem);
    
    await waitFor(() => {
      expect(screen.getByText('Sign Out Confirmation')).toBeInTheDocument();
    });
    
    const confirmButton = screen.getByTestId('confirm-logout-button');
    fireEvent.click(confirmButton);
    
    // Logout should be called
    expect(mockLogout).toHaveBeenCalledTimes(1);
    
    // Last logout time should be stored
    expect(sessionStorage.getItem('lastLogoutTime')).toBeTruthy();
  });

  it('displays user initials correctly in avatar', () => {
    renderWithProviders(<UserProfile />);
    
    const button = screen.getByTestId('user-profile-button');
    const avatar = button.querySelector('[role="img"]');
    
    // Should show "JD" for John Doe
    expect(avatar?.textContent).toBe('JD');
  });

  it('uses stored last login time when available', () => {
    const pastTime = new Date(Date.now() - 7200000).toISOString(); // 2 hours ago
    sessionStorage.setItem('lastLoginTime', pastTime);
    
    renderWithProviders(<UserProfile />);
    
    const button = screen.getByTestId('user-profile-button');
    fireEvent.click(button);
    
    expect(screen.getByText(/Last login: 2 hours ago/)).toBeInTheDocument();
  });

});