import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Contracts } from '../Contracts';
import { contractsApi } from '@/services/api/contracts';

// Mock dependencies
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: {
      localAccountId: 'user123',
      name: 'Test User',
      email: 'test@example.com',
      roles: ['NEU_Admin'],
    },
    isAdmin: () => true,
    isPM: () => false,
  }),
}));

vi.mock('@/services/api/contracts', () => ({
  contractsApi: {
    getAll: vi.fn(),
    getByPmId: vi.fn(),
    exportToCsv: vi.fn(),
  },
}));

vi.mock('@/hooks/useContractStatusMonitor', () => ({
  useContractStatusMonitor: vi.fn(),
}));

describe('Contracts Page Accessibility', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });

    vi.mocked(contractsApi.getAll).mockResolvedValue({
      items: [
        {
          id: 1,
          contractNumber: 'C001',
          name: 'Test Contract',
          clientName: 'Client A',
          status: 'active',
          startDate: '2024-01-01',
          endDate: '2024-12-31',
          pmName: 'John Doe',
          totalValue: 10000,
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        },
      ],
      total: 1,
      page: 1,
      pageSize: 25,
      totalPages: 1,
    });
  });

  const renderContracts = () => {
    return render(
      <QueryClientProvider client={queryClient}>
        <Contracts />
      </QueryClientProvider>
    );
  };

  describe('Page Structure', () => {
    it('should have proper page structure with ARIA roles', async () => {
      renderContracts();
      
      await waitFor(() => {
        const mainElement = screen.getByRole('main', { name: /contracts management page/i });
        expect(mainElement).toBeInTheDocument();
      });
    });

    it('should have screen reader announcements region', async () => {
      const { container } = renderContracts();
      
      await waitFor(() => {
        const announceRegion = container.querySelector('[role="status"][aria-live="polite"]');
        expect(announceRegion).toBeInTheDocument();
        expect(announceRegion).toHaveAttribute('aria-atomic', 'true');
      });
    });

    it('should render table description for screen readers', async () => {
      renderContracts();
      
      await waitFor(() => {
        const description = document.getElementById('contracts-table-description');
        expect(description).toBeInTheDocument();
        expect(description).toHaveClass('sr-only');
      });
    });
  });

  describe('Keyboard Shortcuts', () => {
    it('should display keyboard shortcuts in button titles', async () => {
      renderContracts();
      
      await waitFor(() => {
        const newButton = screen.getByRole('button', { name: /create new contract/i });
        expect(newButton).toHaveAttribute('title', 'Create new contract (Alt+N)');
        expect(newButton).toHaveAttribute('aria-keyshortcuts', 'Alt+N');
      });
      
      const exportButton = screen.getByRole('button', { name: /export contracts to csv/i });
      expect(exportButton).toHaveAttribute('title', 'Export to CSV (Alt+E)');
      expect(exportButton).toHaveAttribute('aria-keyshortcuts', 'Alt+E');
      
      const refreshButton = screen.getByRole('button', { name: /refresh contracts list/i });
      expect(refreshButton).toHaveAttribute('title', 'Refresh list (Alt+R)');
      expect(refreshButton).toHaveAttribute('aria-keyshortcuts', 'Alt+R');
    });

    it('should trigger new contract dialog with Alt+N', async () => {
      renderContracts();
      
      await waitFor(() => {
        screen.getByText('Contracts');
      });
      
      // Simulate Alt+N keyboard shortcut
      fireEvent.keyDown(document, { key: 'n', altKey: true });
      
      await waitFor(() => {
        expect(screen.getByText('Create New Contract')).toBeInTheDocument();
      });
    });

    it('should trigger export with Alt+E', async () => {
      const exportSpy = vi.spyOn(contractsApi, 'exportToCsv');
      renderContracts();
      
      await waitFor(() => {
        screen.getByText('Contracts');
      });
      
      // Simulate Alt+E keyboard shortcut
      fireEvent.keyDown(document, { key: 'e', altKey: true });
      
      await waitFor(() => {
        expect(exportSpy).toHaveBeenCalled();
      });
    });

    it('should focus search field with Alt+F', async () => {
      renderContracts();
      
      await waitFor(() => {
        screen.getByText('Contracts');
      });
      
      const searchInput = screen.getByLabelText('Search contracts');
      
      // Simulate Alt+F keyboard shortcut
      fireEvent.keyDown(document, { key: 'f', altKey: true });
      
      await waitFor(() => {
        expect(document.activeElement).toBe(searchInput);
      });
    });

    it('should refresh list with Alt+R', async () => {
      const getAllSpy = vi.spyOn(contractsApi, 'getAll');
      renderContracts();
      
      await waitFor(() => {
        screen.getByText('Contracts');
      });
      
      // Clear previous calls
      getAllSpy.mockClear();
      
      // Simulate Alt+R keyboard shortcut
      fireEvent.keyDown(document, { key: 'r', altKey: true });
      
      await waitFor(() => {
        expect(getAllSpy).toHaveBeenCalled();
      });
    });
  });

  describe('Screen Reader Announcements', () => {
    it('should announce when creating new contract', async () => {
      const { container } = renderContracts();
      
      await waitFor(() => {
        screen.getByText('Contracts');
      });
      
      const newButton = screen.getByRole('button', { name: /create new contract/i });
      fireEvent.click(newButton);
      
      await waitFor(() => {
        const announceRegion = container.querySelector('[role="status"]');
        expect(announceRegion?.textContent).toContain('Create new contract dialog opened');
      });
    });

    it('should announce when exporting contracts', async () => {
      const { container } = renderContracts();
      
      await waitFor(() => {
        screen.getByText('Contracts');
      });
      
      const exportButton = screen.getByRole('button', { name: /export contracts to csv/i });
      fireEvent.click(exportButton);
      
      await waitFor(() => {
        const announceRegion = container.querySelector('[role="status"]');
        expect(announceRegion?.textContent).toContain('Exporting contracts to CSV');
      });
    });

    it('should announce when refreshing list', async () => {
      const { container } = renderContracts();
      
      await waitFor(() => {
        screen.getByText('Contracts');
      });
      
      const refreshButton = screen.getByRole('button', { name: /refresh contracts list/i });
      fireEvent.click(refreshButton);
      
      await waitFor(() => {
        const announceRegion = container.querySelector('[role="status"]');
        expect(announceRegion?.textContent).toContain('Refreshing contracts list');
      });
    });

    it('should announce successful contract deletion', async () => {
      const { container } = renderContracts();
      
      await waitFor(() => {
        screen.getByText('Contracts');
      });
      
      // Click delete button on first contract
      const deleteButtons = screen.getAllByLabelText(/delete contract/i);
      fireEvent.click(deleteButtons[0]);
      
      // Confirm deletion
      await waitFor(() => {
        const confirmButton = screen.getByText('Delete Contract');
        fireEvent.click(confirmButton);
      });
      
      await waitFor(() => {
        const announceRegion = container.querySelector('[role="status"]');
        expect(announceRegion?.textContent).toContain('deleted successfully');
      });
    });
  });

  describe('Dialog Focus Management', () => {
    it('should focus first input when create dialog opens', async () => {
      renderContracts();
      
      await waitFor(() => {
        screen.getByText('Contracts');
      });
      
      const newButton = screen.getByRole('button', { name: /create new contract/i });
      fireEvent.click(newButton);
      
      await waitFor(() => {
        const contractNumberInput = screen.getByLabelText('Contract number');
        expect(document.activeElement).toBe(contractNumberInput);
      });
    });

    it('should trap focus within modal dialog', async () => {
      renderContracts();
      
      await waitFor(() => {
        screen.getByText('Contracts');
      });
      
      const newButton = screen.getByRole('button', { name: /create new contract/i });
      fireEvent.click(newButton);
      
      await waitFor(() => {
        screen.getByText('Create New Contract');
      });
      
      // Find focusable elements in dialog
      const dialog = screen.getByRole('dialog');
      const focusableElements = dialog.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      
      expect(focusableElements.length).toBeGreaterThan(0);
      
      // Tab through elements
      const firstElement = focusableElements[0] as HTMLElement;
      const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;
      
      lastElement.focus();
      fireEvent.keyDown(dialog, { key: 'Tab' });
      
      // Should wrap to first element
      expect(document.activeElement).toBe(firstElement);
    });

    it('should close dialog on Escape key', async () => {
      renderContracts();
      
      await waitFor(() => {
        screen.getByText('Contracts');
      });
      
      const newButton = screen.getByRole('button', { name: /create new contract/i });
      fireEvent.click(newButton);
      
      await waitFor(() => {
        screen.getByText('Create New Contract');
      });
      
      fireEvent.keyDown(document, { key: 'Escape' });
      
      await waitFor(() => {
        expect(screen.queryByText('Create New Contract')).not.toBeInTheDocument();
      });
    });
  });

  describe('Filter Accessibility', () => {
    it('should have proper ARIA labels on filter controls', async () => {
      renderContracts();
      
      await waitFor(() => {
        screen.getByText('Contracts');
      });
      
      expect(screen.getByLabelText('Search contracts')).toBeInTheDocument();
      expect(screen.getByLabelText('Filter by status')).toBeInTheDocument();
      expect(screen.getByLabelText('Filter by start date from')).toBeInTheDocument();
      expect(screen.getByLabelText('Filter by end date to')).toBeInTheDocument();
    });

    it('should announce number of active filters on clear button', async () => {
      renderContracts();
      
      await waitFor(() => {
        screen.getByText('Contracts');
      });
      
      // Apply a filter
      const searchInput = screen.getByLabelText('Search contracts');
      fireEvent.change(searchInput, { target: { value: 'test' } });
      
      await waitFor(() => {
        const clearButton = screen.getByRole('button', { name: /clear.*filter/i });
        expect(clearButton).toHaveAttribute('aria-label', expect.stringMatching(/clear \d+ filter/i));
      });
    });
  });

  describe('Table Region', () => {
    it('should have proper ARIA attributes on table container', async () => {
      renderContracts();
      
      await waitFor(() => {
        screen.getByText('Contracts');
      });
      
      const tableContainer = screen.getByRole('region', { name: /contracts table container/i });
      expect(tableContainer).toBeInTheDocument();
    });

    it('should handle empty state with appropriate messaging', async () => {
      vi.mocked(contractsApi.getAll).mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        pageSize: 25,
        totalPages: 0,
      });
      
      renderContracts();
      
      await waitFor(() => {
        expect(screen.getByText('No contracts available.')).toBeInTheDocument();
      });
    });

    it('should handle filtered empty state with clear filters option', async () => {
      renderContracts();
      
      await waitFor(() => {
        screen.getByText('Contracts');
      });
      
      // Apply filter that returns no results
      const searchInput = screen.getByLabelText('Search contracts');
      fireEvent.change(searchInput, { target: { value: 'nonexistent' } });
      
      await waitFor(() => {
        expect(screen.getByText(/no contracts match your filter criteria/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /clear filters/i })).toBeInTheDocument();
      });
    });
  });
});