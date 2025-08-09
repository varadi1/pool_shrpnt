import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import App from './App';

// Mock the router module
vi.mock('@/routes', () => ({
  router: {
    subscribe: vi.fn(),
    navigate: vi.fn(),
    state: {
      location: { pathname: '/' },
      matches: [],
    },
  },
}));

// Mock RouterProvider
vi.mock('react-router-dom', () => ({
  RouterProvider: ({ router }: any) => <div data-testid="router-provider">RouterProvider Mock</div>,
  NavLink: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
  Outlet: () => <div>Outlet</div>,
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: '/' }),
  Navigate: ({ to }: { to: string }) => <div>Navigate to {to}</div>,
}));

describe('App', () => {
  it('renders without crashing', () => {
    const { container } = render(<App />);
    expect(container).toBeTruthy();
  });

  it('contains RouterProvider', () => {
    const { getByTestId } = render(<App />);
    expect(getByTestId('router-provider')).toBeInTheDocument();
  });
});
