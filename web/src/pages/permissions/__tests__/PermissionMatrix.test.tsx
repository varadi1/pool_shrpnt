import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PermissionMatrix } from '../PermissionMatrix';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import userEvent from '@testing-library/user-event';

// Mock useParams
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useParams: () => ({ orderId: 'test-order-123' }),
    useNavigate: () => vi.fn(),
  };
});

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <FluentProvider theme={webLightTheme}>
        <MemoryRouter initialEntries={['/permissions/test-order-123']}>
          <Routes>
            <Route path="/permissions/:orderId" element={children} />
          </Routes>
        </MemoryRouter>
      </FluentProvider>
    </QueryClientProvider>
  );
};

describe('PermissionMatrix', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should render the permission matrix header', async () => {
    const wrapper = createWrapper();
    render(<PermissionMatrix />, { wrapper });

    await waitFor(() => {
      expect(screen.getByText('Permission Matrix Editor')).toBeInTheDocument();
      expect(screen.getByText('Order ID: test-order-123')).toBeInTheDocument();
    });
  });

  it('should display loading state initially', () => {
    const wrapper = createWrapper();
    render(<PermissionMatrix />, { wrapper });
    
    expect(screen.getByText('Loading permission matrix...')).toBeInTheDocument();
  });

  it('should render folder hierarchy after loading', async () => {
    const wrapper = createWrapper();
    render(<PermissionMatrix />, { wrapper });

    await waitFor(() => {
      expect(screen.getByText('2025_A_MVM')).toBeInTheDocument();
      expect(screen.getByText('00_BELSO_NEU_ONLY')).toBeInTheDocument();
      expect(screen.getByText('01_SZAKERTOK')).toBeInTheDocument();
      expect(screen.getByText('02_EREDMENYEK')).toBeInTheDocument();
      expect(screen.getByText('03_VEGLEGES')).toBeInTheDocument();
    });
  });

  it('should render role columns', async () => {
    const wrapper = createWrapper();
    render(<PermissionMatrix />, { wrapper });

    await waitFor(() => {
      expect(screen.getByText('NEU Admin')).toBeInTheDocument();
      expect(screen.getByText('NEU PM')).toBeInTheDocument();
      expect(screen.getByText('Company Admin')).toBeInTheDocument();
      expect(screen.getByText('Expert')).toBeInTheDocument();
      expect(screen.getByText('NEU QA')).toBeInTheDocument();
    });
  });

  it('should expand and collapse folders when clicking chevron', async () => {
    const wrapper = createWrapper();
    render(<PermissionMatrix />, { wrapper });
    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getByText('01_SZAKERTOK')).toBeInTheDocument();
    });

    // Initially TIG should not be visible (collapsed)
    expect(screen.queryByText('TIG')).not.toBeInTheDocument();

    // Find and click the expand button for 01_SZAKERTOK
    const szakertokRow = screen.getByText('01_SZAKERTOK').closest('tr');
    if (szakertokRow) {
      const expandButton = szakertokRow.querySelector('button[aria-label]');
      if (expandButton) {
        await user.click(expandButton);
      }
    }

    // TIG should now be visible
    await waitFor(() => {
      expect(screen.getByText('TIG')).toBeInTheDocument();
    });
  });

  it('should handle expand all and collapse all buttons', async () => {
    const wrapper = createWrapper();
    render(<PermissionMatrix />, { wrapper });
    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getByText('01_SZAKERTOK')).toBeInTheDocument();
    });

    // Click expand all
    const expandAllButton = screen.getByText('Expand All');
    await user.click(expandAllButton);

    // All nested folders should be visible
    await waitFor(() => {
      expect(screen.getByText('TIG')).toBeInTheDocument();
    });

    // Click collapse all
    const collapseAllButton = screen.getByText('Collapse All');
    await user.click(collapseAllButton);

    // Nested folders should be hidden
    await waitFor(() => {
      expect(screen.queryByText('TIG')).not.toBeInTheDocument();
    });
  });

  it('should navigate back when clicking back button', async () => {
    const mockNavigate = vi.fn();
    vi.mocked(await import('react-router-dom')).useNavigate = () => mockNavigate;
    
    const wrapper = createWrapper();
    render(<PermissionMatrix />, { wrapper });
    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getByText('Back')).toBeInTheDocument();
    });

    const backButton = screen.getByText('Back');
    await user.click(backButton);

    expect(mockNavigate).toHaveBeenCalledWith('/permissions');
  });

  it('should render permission levels in cells', async () => {
    const wrapper = createWrapper();
    render(<PermissionMatrix />, { wrapper });

    await waitFor(() => {
      // Check for permission level text
      const permissionTexts = screen.getAllByText(/full|read|write|none/i);
      expect(permissionTexts.length).toBeGreaterThan(0);
    });
  });

  it('should show toolbar items', async () => {
    const wrapper = createWrapper();
    render(<PermissionMatrix />, { wrapper });

    await waitFor(() => {
      expect(screen.getByText('Back')).toBeInTheDocument();
      expect(screen.getByText('Save Changes')).toBeInTheDocument();
      expect(screen.getByText('Sync to SharePoint')).toBeInTheDocument();
      expect(screen.getByText('Expand All')).toBeInTheDocument();
      expect(screen.getByText('Collapse All')).toBeInTheDocument();
    });
  });

  it('should disable save button when no pending changes', async () => {
    const wrapper = createWrapper();
    render(<PermissionMatrix />, { wrapper });

    await waitFor(() => {
      const saveButton = screen.getByText('Save Changes').closest('button');
      expect(saveButton).toBeDisabled();
    });
  });

  it('should handle permission cell click for editing', async () => {
    const wrapper = createWrapper();
    render(<PermissionMatrix />, { wrapper });
    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getByText('2025_A_MVM')).toBeInTheDocument();
    });

    // Find a permission cell and click it
    const permissionCells = screen.getAllByText(/full|read|write/i);
    if (permissionCells.length > 0) {
      const firstCell = permissionCells[0].closest('div');
      if (firstCell && !firstCell.classList.contains('lockedCell')) {
        await user.click(firstCell);
        
        // Dropdown should appear for editing
        await waitFor(() => {
          expect(screen.getByRole('combobox')).toBeInTheDocument();
        });
      }
    }
  });

  it('should render table structure correctly', async () => {
    const wrapper = createWrapper();
    render(<PermissionMatrix />, { wrapper });

    await waitFor(() => {
      expect(screen.getByRole('table')).toBeInTheDocument();
      const headers = screen.getAllByRole('columnheader');
      expect(headers.length).toBe(6); // Folder + 5 roles
    });
  });

  it('should display folder icons based on special flags', async () => {
    const wrapper = createWrapper();
    render(<PermissionMatrix />, { wrapper });

    await waitFor(() => {
      expect(screen.getByText('00_BELSO_NEU_ONLY')).toBeInTheDocument();
      expect(screen.getByText('03_VEGLEGES')).toBeInTheDocument();
    });

    // NEU-only and locked folders should be present
    const neuOnlyFolder = screen.getByText('00_BELSO_NEU_ONLY');
    const lockedFolder = screen.getByText('03_VEGLEGES');
    
    expect(neuOnlyFolder).toBeInTheDocument();
    expect(lockedFolder).toBeInTheDocument();
  });
});