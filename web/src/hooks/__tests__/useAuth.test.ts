import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAuth } from '../useAuth';
import { InteractionStatus } from '@azure/msal-browser';

// Mock MSAL React
vi.mock('@azure/msal-react', () => ({
  useMsal: vi.fn(),
}));

// Mock auth config
vi.mock('@/config/auth.config', () => ({
  loginRequest: {
    scopes: ['User.Read', 'openid', 'profile'],
    prompt: 'select_account',
  },
  apiScopes: ['User.Read'],
  isE2EMode: vi.fn(() => false),
}));

import { useMsal } from '@azure/msal-react';

describe('useAuth', () => {
  const mockInstance = {
    loginRedirect: vi.fn(),
    logoutRedirect: vi.fn(),
    acquireTokenSilent: vi.fn(),
    acquireTokenRedirect: vi.fn(),
    getAllAccounts: vi.fn(),
  };

  const mockAccount = {
    username: 'test@example.com',
    name: 'Test User',
    idTokenClaims: {
      roles: ['NEU_Admin', 'NEU_PM'],
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  it('should return authenticated state when user is logged in', () => {
    (useMsal as any).mockReturnValue({
      instance: mockInstance,
      accounts: [mockAccount],
      inProgress: InteractionStatus.None,
    });

    const { result } = renderHook(() => useAuth());

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user).toEqual(mockAccount);
    expect(result.current.isLoading).toBe(false);
  });

  it('should return unauthenticated state when no user is logged in', () => {
    (useMsal as any).mockReturnValue({
      instance: mockInstance,
      accounts: [],
      inProgress: InteractionStatus.None,
    });

    const { result } = renderHook(() => useAuth());

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeUndefined();
  });

  it('should return loading state during login', () => {
    (useMsal as any).mockReturnValue({
      instance: mockInstance,
      accounts: [],
      inProgress: InteractionStatus.Login,
    });

    const { result } = renderHook(() => useAuth());

    expect(result.current.isLoading).toBe(true);
  });

  it('should extract user roles correctly', () => {
    (useMsal as any).mockReturnValue({
      instance: mockInstance,
      accounts: [mockAccount],
      inProgress: InteractionStatus.None,
    });

    const { result } = renderHook(() => useAuth());

    expect(result.current.userRoles).toEqual(['NEU_Admin', 'NEU_PM']);
    expect(result.current.hasRole('NEU_Admin')).toBe(true);
    expect(result.current.hasRole('NEU_PM')).toBe(true);
    expect(result.current.hasRole('NEU_Partner')).toBe(false);
  });

  it('should check multiple roles correctly', () => {
    (useMsal as any).mockReturnValue({
      instance: mockInstance,
      accounts: [mockAccount],
      inProgress: InteractionStatus.None,
    });

    const { result } = renderHook(() => useAuth());

    expect(result.current.hasAnyRole(['NEU_Admin', 'NEU_Guest'])).toBe(true);
    expect(result.current.hasAnyRole(['NEU_Partner', 'NEU_Guest'])).toBe(false);
  });

  it('should identify admin and PM roles', () => {
    (useMsal as any).mockReturnValue({
      instance: mockInstance,
      accounts: [mockAccount],
      inProgress: InteractionStatus.None,
    });

    const { result } = renderHook(() => useAuth());

    expect(result.current.isAdmin()).toBe(true);
    expect(result.current.isPM()).toBe(true);
  });

  it('should handle login', async () => {
    // Setup loginRedirect to return a resolved promise
    mockInstance.loginRedirect.mockResolvedValue(undefined);
    
    (useMsal as any).mockReturnValue({
      instance: mockInstance,
      accounts: [],
      inProgress: InteractionStatus.None,
    });

    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.login();
    });

    expect(mockInstance.loginRedirect).toHaveBeenCalledWith({
      scopes: ['User.Read', 'openid', 'profile'],
      prompt: 'select_account',
    });
  });

  it('should handle logout and clear session storage', async () => {
    sessionStorage.setItem('userRoles', JSON.stringify(['NEU_Admin']));
    
    (useMsal as any).mockReturnValue({
      instance: mockInstance,
      accounts: [mockAccount],
      inProgress: InteractionStatus.None,
    });

    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.logout();
    });

    expect(mockInstance.logoutRedirect).toHaveBeenCalledWith({
      postLogoutRedirectUri: window.location.origin,
    });
    expect(sessionStorage.getItem('userRoles')).toBeNull();
  });

  it('should acquire access token successfully', async () => {
    const mockToken = 'mock-access-token';
    mockInstance.acquireTokenSilent.mockResolvedValue({
      accessToken: mockToken,
    });

    (useMsal as any).mockReturnValue({
      instance: mockInstance,
      accounts: [mockAccount],
      inProgress: InteractionStatus.None,
    });

    const { result } = renderHook(() => useAuth());

    const token = await result.current.getAccessToken();

    expect(token).toBe(mockToken);
    expect(mockInstance.acquireTokenSilent).toHaveBeenCalledWith({
      scopes: ['User.Read'],
      account: mockAccount,
    });
  });

  it('should fall back to interactive token acquisition on silent failure', async () => {
    const mockToken = 'mock-access-token';
    mockInstance.acquireTokenSilent.mockRejectedValue(new Error('Silent failed'));
    mockInstance.acquireTokenRedirect.mockResolvedValue({
      accessToken: mockToken,
    });

    (useMsal as any).mockReturnValue({
      instance: mockInstance,
      accounts: [mockAccount],
      inProgress: InteractionStatus.None,
    });

    const { result } = renderHook(() => useAuth());

    const token = await result.current.getAccessToken();

    expect(token).toBe(mockToken);
    expect(mockInstance.acquireTokenRedirect).toHaveBeenCalled();
  });

  it('should load roles from session storage as fallback', () => {
    const storedRoles = ['NEU_PM'];
    sessionStorage.setItem('userRoles', JSON.stringify(storedRoles));

    const accountWithoutRoles = {
      ...mockAccount,
      idTokenClaims: {},
    };

    (useMsal as any).mockReturnValue({
      instance: mockInstance,
      accounts: [accountWithoutRoles],
      inProgress: InteractionStatus.None,
    });

    const { result } = renderHook(() => useAuth());

    expect(result.current.userRoles).toEqual(storedRoles);
  });
});