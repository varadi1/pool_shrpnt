import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter, MemoryRouter } from 'react-router-dom';
import { Navigation } from './Navigation';
import userEvent from '@testing-library/user-event';

// Mock useAuth hook
vi.mock('@/hooks/useAuth', () => ({
  useAuth: vi.fn(),
}));

import { useAuth } from '@/hooks/useAuth';

describe('Navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders basic navigation items for all users', () => {
    (useAuth as any).mockReturnValue({
      hasAnyRole: vi.fn().mockReturnValue(false),
      isAdmin: vi.fn().mockReturnValue(false),
    });

    render(
      <BrowserRouter>
        <Navigation />
      </BrowserRouter>
    );

    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('renders admin-only items for admin users', () => {
    const mockHasAnyRole = vi.fn((roles) => {
      return roles.includes('NEU_Admin');
    });

    (useAuth as any).mockReturnValue({
      hasAnyRole: mockHasAnyRole,
      isAdmin: vi.fn().mockReturnValue(true),
    });

    render(
      <BrowserRouter>
        <Navigation />
      </BrowserRouter>
    );

    expect(screen.getByText('Templates')).toBeInTheDocument();
    expect(screen.getByText('Users & Groups')).toBeInTheDocument();
    expect(screen.getByText('Permissions')).toBeInTheDocument();
    expect(screen.getByText('Audit')).toBeInTheDocument();
  });

  it('renders PM-accessible items for PM users', () => {
    const mockHasAnyRole = vi.fn((roles) => {
      return roles.includes('NEU_PM');
    });

    (useAuth as any).mockReturnValue({
      hasAnyRole: mockHasAnyRole,
      isAdmin: vi.fn().mockReturnValue(false),
    });

    render(
      <BrowserRouter>
        <Navigation />
      </BrowserRouter>
    );

    expect(screen.getByText('Contracts')).toBeInTheDocument();
    expect(screen.getByText('Orders')).toBeInTheDocument();
    expect(screen.getByText('Locks')).toBeInTheDocument();
    expect(screen.getByText('Guest Management')).toBeInTheDocument();
    expect(screen.getByText('Reports')).toBeInTheDocument();
    
    // Should not see admin-only items
    expect(screen.queryByText('Templates')).not.toBeInTheDocument();
    expect(screen.queryByText('Users & Groups')).not.toBeInTheDocument();
    expect(screen.queryByText('Permissions')).not.toBeInTheDocument();
    expect(screen.queryByText('Audit')).not.toBeInTheDocument();
  });

  it('hides role-restricted items from unauthorized users', () => {
    (useAuth as any).mockReturnValue({
      hasAnyRole: vi.fn().mockReturnValue(false),
      isAdmin: vi.fn().mockReturnValue(false),
    });

    render(
      <BrowserRouter>
        <Navigation />
      </BrowserRouter>
    );

    // Should not see role-restricted items
    expect(screen.queryByText('Contracts')).not.toBeInTheDocument();
    expect(screen.queryByText('Orders')).not.toBeInTheDocument();
    expect(screen.queryByText('Templates')).not.toBeInTheDocument();
    expect(screen.queryByText('Users & Groups')).not.toBeInTheDocument();
    
    // Should see unrestricted items
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('highlights active route', () => {
    (useAuth as any).mockReturnValue({
      hasAnyRole: vi.fn().mockReturnValue(true),
      isAdmin: vi.fn().mockReturnValue(true),
    });

    render(
      <MemoryRouter initialEntries={['/contracts']}>
        <Navigation />
      </MemoryRouter>
    );

    const contractsLink = screen.getByRole('link', { name: /Contracts/i });
    expect(contractsLink).toHaveAttribute('aria-current', 'page');
    
    const dashboardLink = screen.getByRole('link', { name: /Dashboard/i });
    expect(dashboardLink).not.toHaveAttribute('aria-current');
  });

  it('highlights parent route when on sub-route', () => {
    (useAuth as any).mockReturnValue({
      hasAnyRole: vi.fn().mockReturnValue(true),
      isAdmin: vi.fn().mockReturnValue(true),
    });

    render(
      <MemoryRouter initialEntries={['/contracts/123/details']}>
        <Navigation />
      </MemoryRouter>
    );

    const contractsLink = screen.getByRole('link', { name: /Contracts/i });
    expect(contractsLink).toHaveAttribute('aria-current', 'page');
  });

  it('has correct links with proper href attributes', () => {
    (useAuth as any).mockReturnValue({
      hasAnyRole: vi.fn().mockReturnValue(true),
      isAdmin: vi.fn().mockReturnValue(true),
    });

    const { container } = render(
      <BrowserRouter>
        <Navigation />
      </BrowserRouter>
    );

    const links = container.querySelectorAll('a');
    const hrefs = Array.from(links).map((link) => link.getAttribute('href'));

    expect(hrefs).toContain('/dashboard');
    expect(hrefs).toContain('/contracts');
    expect(hrefs).toContain('/orders');
    expect(hrefs).toContain('/templates');
    expect(hrefs).toContain('/locks');
    expect(hrefs).toContain('/users');
    expect(hrefs).toContain('/permissions');
    expect(hrefs).toContain('/guests');
    expect(hrefs).toContain('/reports');
    expect(hrefs).toContain('/audit');
    expect(hrefs).toContain('/settings');
  });

  it('supports keyboard navigation', async () => {
    const user = userEvent.setup();
    
    (useAuth as any).mockReturnValue({
      hasAnyRole: vi.fn().mockReturnValue(true),
      isAdmin: vi.fn().mockReturnValue(true),
    });

    render(
      <BrowserRouter>
        <Navigation />
      </BrowserRouter>
    );

    const dashboardLink = screen.getByRole('link', { name: /Dashboard/i });
    const contractsLink = screen.getByRole('link', { name: /Contracts/i });

    // All links should be tabbable
    expect(dashboardLink).toHaveAttribute('tabIndex', '0');
    expect(contractsLink).toHaveAttribute('tabIndex', '0');

    // Test keyboard navigation
    dashboardLink.focus();
    expect(document.activeElement).toBe(dashboardLink);

    await user.tab();
    expect(document.activeElement).toBe(contractsLink);
  });

  it('renders section headings for grouped items', () => {
    (useAuth as any).mockReturnValue({
      hasAnyRole: vi.fn().mockReturnValue(true),
      isAdmin: vi.fn().mockReturnValue(true),
    });

    render(
      <BrowserRouter>
        <Navigation />
      </BrowserRouter>
    );

    expect(screen.getByText('Administration')).toBeInTheDocument();
    expect(screen.getByText('System')).toBeInTheDocument();
  });

  it('does not render empty sections', () => {
    (useAuth as any).mockReturnValue({
      hasAnyRole: vi.fn().mockReturnValue(false),
      isAdmin: vi.fn().mockReturnValue(false),
    });

    render(
      <BrowserRouter>
        <Navigation />
      </BrowserRouter>
    );

    // Should not see section headings when no items in section
    expect(screen.queryByText('Administration')).not.toBeInTheDocument();
  });

  it('has proper ARIA attributes', () => {
    (useAuth as any).mockReturnValue({
      hasAnyRole: vi.fn().mockReturnValue(true),
      isAdmin: vi.fn().mockReturnValue(true),
    });

    render(
      <BrowserRouter>
        <Navigation />
      </BrowserRouter>
    );

    const nav = screen.getByRole('navigation');
    expect(nav).toHaveAttribute('aria-label', 'Main navigation');

    const sectionHeadings = screen.getAllByRole('heading', { level: 3 });
    expect(sectionHeadings).toHaveLength(2);
  });
});