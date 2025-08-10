import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { AuditList } from '../AuditList';
import * as auditService from '@/services/audit';
import type { AuditEntry } from '@/types/audit';

// Extend matchers
expect.extend(toHaveNoViolations);

// Mock auth context
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: 'test-user',
      name: 'Test User',
      email: 'test@example.com',
      role: 'NEU_Admin',
    },
    isAuthenticated: true,
  }),
}));

// Mock WebSocket
vi.mock('@/services/auditWebSocket', () => ({
  AuditWebSocketService: vi.fn().mockImplementation(() => ({
    connect: vi.fn(),
    disconnect: vi.fn(),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    getConnectionStatus: vi.fn().mockReturnValue('connected'),
    getEventQueue: vi.fn().mockReturnValue([]),
  })),
}));

const generateMockAuditEntries = (count: number): AuditEntry[] => {
  return Array.from({ length: count }, (_, i) => ({
    id: `audit-${i}`,
    timestamp: new Date(Date.now() - i * 60000).toISOString(),
    actor: {
      id: `user-${i}`,
      name: `User ${i}`,
      email: `user${i}@example.com`,
      role: 'User',
      type: 'user',
    },
    action: {
      type: 'TEMPLATE_CREATED',
      category: 'template',
      severity: 'info',
      description: `Template action ${i}`,
    },
    target: {
      type: 'template',
      id: `template-${i}`,
      name: `Template ${i}`,
    },
    metadata: {
      correlationId: `corr-${i}`,
    },
    status: 'success',
  }));
};

describe('AuditList - Accessibility and Keyboard Navigation Tests', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    vi.spyOn(auditService, 'getAuditLogs').mockResolvedValue({
      entries: generateMockAuditEntries(10),
      pagination: {
        hasMore: false,
        totalCount: 10,
      },
    });
  });

  const renderComponent = () => {
    return render(
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AuditList />
        </BrowserRouter>
      </QueryClientProvider>
    );
  };

  describe('WCAG Compliance', () => {
    it('passes axe accessibility checks', async () => {
      const { container } = renderComponent();
      
      await waitFor(() => {
        expect(screen.getByText('Audit napló')).toBeInTheDocument();
      });

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('has proper ARIA labels and roles', async () => {
      renderComponent();
      
      await waitFor(() => {
        expect(screen.getByRole('main')).toBeInTheDocument();
      });

      // Check for proper roles
      expect(screen.getByRole('navigation')).toBeInTheDocument();
      expect(screen.getByRole('search')).toBeInTheDocument();
      expect(screen.getByRole('table')).toBeInTheDocument();
      
      // Check for ARIA labels
      expect(screen.getByLabelText(/keresés/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/szűrők/i)).toBeInTheDocument();
    });

    it('provides proper heading hierarchy', async () => {
      renderComponent();
      
      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      const headings = screen.getAllByRole('heading');
      const levels = headings.map(h => parseInt(h.tagName.substring(1)));
      
      // Check that heading levels don't skip
      for (let i = 1; i < levels.length; i++) {
        expect(levels[i] - levels[i - 1]).toBeLessThanOrEqual(1);
      }
    });

    it('has sufficient color contrast', async () => {
      const { container } = renderComponent();
      
      await waitFor(() => {
        expect(screen.getByText('Audit napló')).toBeInTheDocument();
      });

      // Check text color contrast
      const textElements = container.querySelectorAll('p, span, div, button, a');
      
      textElements.forEach(element => {
        const styles = window.getComputedStyle(element);
        const color = styles.color;
        const backgroundColor = styles.backgroundColor;
        
        // This is a simplified check - in reality, you'd calculate the actual contrast ratio
        if (color && backgroundColor && backgroundColor !== 'transparent') {
          // Ensure text is not the same color as background
          expect(color).not.toBe(backgroundColor);
        }
      });
    });
  });

  describe('Keyboard Navigation', () => {
    it('allows navigation through all interactive elements with Tab', async () => {
      renderComponent();
      const user = userEvent.setup();
      
      await waitFor(() => {
        expect(screen.getByPlaceholderText('Szabad szöveges keresés...')).toBeInTheDocument();
      });

      const focusableElements = [
        'Szabad szöveges keresés...',
        'Korrelációs azonosító...',
        'Ma',
        'Elmúlt 7 nap',
        'Elmúlt 30 nap',
        'Speciális szűrők',
        'Szűrők törlése',
        'Exportálás',
      ];

      // Start with first element
      await user.tab();
      
      for (const elementText of focusableElements) {
        const element = elementText.includes('...')
          ? screen.getByPlaceholderText(elementText)
          : screen.getByText(elementText);
        
        // Check if element can receive focus
        expect(element.closest(':focus-visible')).toBeTruthy();
        
        await user.tab();
      }
    });

    it('supports reverse Tab navigation (Shift+Tab)', async () => {
      renderComponent();
      const user = userEvent.setup();
      
      await waitFor(() => {
        expect(screen.getByPlaceholderText('Szabad szöveges keresés...')).toBeInTheDocument();
      });

      // Tab to the last focusable element
      for (let i = 0; i < 10; i++) {
        await user.tab();
      }

      // Now go backwards with Shift+Tab
      await user.tab({ shift: true });
      await user.tab({ shift: true });
      
      // Should be able to navigate backwards
      const activeElement = document.activeElement;
      expect(activeElement).toBeTruthy();
      expect(activeElement?.tagName).toMatch(/BUTTON|INPUT|A/i);
    });

    it('allows keyboard interaction with dropdown menus', async () => {
      renderComponent();
      const user = userEvent.setup();
      
      await waitFor(() => {
        expect(screen.getByText(/speciális szűrők/i)).toBeInTheDocument();
      });

      // Open advanced filters
      const advancedButton = screen.getByText(/speciális szűrők/i);
      advancedButton.focus();
      await user.keyboard('{Enter}');
      
      // Should open advanced filters
      await waitFor(() => {
        expect(screen.getByText('Felhasználó/Aktor')).toBeInTheDocument();
      });

      // Navigate to dropdown
      const dropdown = screen.getByPlaceholderText('Válassz felhasználót...');
      dropdown.focus();
      
      // Open dropdown with Enter or Space
      await user.keyboard('{Enter}');
      
      // Navigate options with arrow keys
      await user.keyboard('{ArrowDown}');
      await user.keyboard('{ArrowDown}');
      
      // Select with Enter
      await user.keyboard('{Enter}');
    });

    it('supports keyboard shortcuts for common actions', async () => {
      renderComponent();
      const user = userEvent.setup();
      
      await waitFor(() => {
        expect(screen.getByPlaceholderText('Szabad szöveges keresés...')).toBeInTheDocument();
      });

      // Ctrl/Cmd + F for search focus
      await user.keyboard('{Control>}f{/Control}');
      expect(document.activeElement).toBe(screen.getByPlaceholderText('Szabad szöveges keresés...'));
      
      // Escape to clear search
      await user.type(screen.getByPlaceholderText('Szabad szöveges keresés...'), 'test');
      await user.keyboard('{Escape}');
      expect(screen.getByPlaceholderText('Szabad szöveges keresés...')).toHaveValue('');
      
      // Ctrl/Cmd + E for export
      await user.keyboard('{Control>}e{/Control}');
      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });
    });

    it('maintains focus visibility indicators', async () => {
      const { container } = renderComponent();
      const user = userEvent.setup();
      
      await waitFor(() => {
        expect(screen.getByPlaceholderText('Szabad szöveges keresés...')).toBeInTheDocument();
      });

      // Tab through elements
      await user.tab();
      
      // Check for focus ring/outline
      const focusedElement = document.activeElement;
      if (focusedElement) {
        const styles = window.getComputedStyle(focusedElement);
        
        // Should have visible focus indicator
        expect(
          styles.outline !== 'none' ||
          styles.boxShadow !== 'none' ||
          styles.border !== 'none'
        ).toBeTruthy();
      }
    });

    it('handles table navigation with arrow keys', async () => {
      renderComponent();
      const user = userEvent.setup();
      
      await waitFor(() => {
        expect(screen.getByRole('table')).toBeInTheDocument();
      });

      const table = screen.getByRole('table');
      const firstRow = within(table).getAllByRole('row')[1]; // Skip header row
      
      // Focus first row
      firstRow.focus();
      
      // Navigate with arrow keys
      await user.keyboard('{ArrowDown}');
      await user.keyboard('{ArrowDown}');
      
      // Should move focus to different rows
      expect(document.activeElement).not.toBe(firstRow);
      
      // Navigate cells with arrow keys
      await user.keyboard('{ArrowRight}');
      await user.keyboard('{ArrowLeft}');
    });
  });

  describe('Screen Reader Support', () => {
    it('announces page structure properly', async () => {
      renderComponent();
      
      await waitFor(() => {
        expect(screen.getByRole('main')).toBeInTheDocument();
      });

      // Check for landmark regions
      expect(screen.getByRole('banner')).toHaveAttribute('aria-label');
      expect(screen.getByRole('main')).toHaveAttribute('aria-label');
      expect(screen.getByRole('navigation')).toHaveAttribute('aria-label');
    });

    it('provides live region updates for dynamic content', async () => {
      const { container } = renderComponent();
      
      await waitFor(() => {
        expect(screen.getByText('Audit napló')).toBeInTheDocument();
      });

      // Check for live regions
      const liveRegions = container.querySelectorAll('[aria-live]');
      expect(liveRegions.length).toBeGreaterThan(0);
      
      // Check for appropriate politeness levels
      liveRegions.forEach(region => {
        const politeness = region.getAttribute('aria-live');
        expect(['polite', 'assertive', 'off']).toContain(politeness);
      });
    });

    it('announces filter changes to screen readers', async () => {
      renderComponent();
      const user = userEvent.setup();
      
      await waitFor(() => {
        expect(screen.getByPlaceholderText('Szabad szöveges keresés...')).toBeInTheDocument();
      });

      // Apply filter
      const searchInput = screen.getByPlaceholderText('Szabad szöveges keresés...');
      await user.type(searchInput, 'test');
      
      // Check for announcement
      await waitFor(() => {
        const announcement = screen.getByRole('status');
        expect(announcement).toHaveTextContent(/szűrő alkalmazva/i);
      });
    });

    it('provides descriptive labels for form controls', async () => {
      renderComponent();
      
      await waitFor(() => {
        expect(screen.getByText(/speciális szűrők/i)).toBeInTheDocument();
      });

      // Open advanced filters
      fireEvent.click(screen.getByText(/speciális szűrők/i));
      
      await waitFor(() => {
        expect(screen.getByLabelText('Dátum ettől')).toBeInTheDocument();
      });

      // Check that all form controls have labels
      const inputs = screen.getAllByRole('textbox');
      inputs.forEach(input => {
        expect(input).toHaveAccessibleName();
      });
      
      const checkboxes = screen.getAllByRole('checkbox');
      checkboxes.forEach(checkbox => {
        expect(checkbox).toHaveAccessibleName();
      });
    });

    it('announces loading and error states', async () => {
      vi.spyOn(auditService, 'getAuditLogs').mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve({
          entries: generateMockAuditEntries(5),
          pagination: { hasMore: false, totalCount: 5 },
        }), 1000))
      );

      const { container } = renderComponent();
      
      // Check for loading announcement
      const loadingAnnouncement = container.querySelector('[role="status"]');
      expect(loadingAnnouncement).toHaveTextContent(/betöltés/i);
      
      await waitFor(() => {
        expect(screen.getByText(/Template action 0/)).toBeInTheDocument();
      });
      
      // Check for completion announcement
      expect(loadingAnnouncement).toHaveTextContent(/betöltve/i);
    });
  });

  describe('Focus Management', () => {
    it('manages focus when opening/closing modals', async () => {
      renderComponent();
      const user = userEvent.setup();
      
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /exportálás/i })).toBeInTheDocument();
      });

      const exportButton = screen.getByRole('button', { name: /exportálás/i });
      const initialFocus = exportButton;
      
      // Open modal
      await user.click(exportButton);
      
      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });
      
      // Focus should move to modal
      const dialog = screen.getByRole('dialog');
      expect(dialog.contains(document.activeElement)).toBeTruthy();
      
      // Close modal
      const closeButton = within(dialog).getByRole('button', { name: /mégse/i });
      await user.click(closeButton);
      
      // Focus should return to trigger element
      await waitFor(() => {
        expect(document.activeElement).toBe(initialFocus);
      });
    });

    it('traps focus within modal dialogs', async () => {
      renderComponent();
      const user = userEvent.setup();
      
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /exportálás/i })).toBeInTheDocument();
      });

      // Open export dialog
      await user.click(screen.getByRole('button', { name: /exportálás/i }));
      
      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      const dialog = screen.getByRole('dialog');
      const focusableElements = within(dialog).getAllByRole('button');
      
      // Tab through all elements in modal
      for (let i = 0; i < focusableElements.length + 2; i++) {
        await user.tab();
        
        // Focus should stay within modal
        expect(dialog.contains(document.activeElement)).toBeTruthy();
      }
    });

    it('restores focus after async operations', async () => {
      renderComponent();
      const user = userEvent.setup();
      
      await waitFor(() => {
        expect(screen.getByPlaceholderText('Szabad szöveges keresés...')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText('Szabad szöveges keresés...');
      searchInput.focus();
      
      // Type to trigger async search
      await user.type(searchInput, 'test');
      
      // Wait for search to complete
      await new Promise(resolve => setTimeout(resolve, 600));
      
      // Focus should remain on search input
      expect(document.activeElement).toBe(searchInput);
    });
  });

  describe('Keyboard Interaction Patterns', () => {
    it('supports keyboard selection in tables', async () => {
      renderComponent();
      const user = userEvent.setup();
      
      await waitFor(() => {
        expect(screen.getByRole('table')).toBeInTheDocument();
      });

      const table = screen.getByRole('table');
      const rows = within(table).getAllByRole('row').slice(1); // Skip header
      
      // Focus first row
      rows[0].focus();
      
      // Select with Space
      await user.keyboard('{Space}');
      expect(rows[0]).toHaveAttribute('aria-selected', 'true');
      
      // Multi-select with Shift
      await user.keyboard('{ArrowDown}');
      await user.keyboard('{Shift>}{Space}{/Shift}');
      
      // Both rows should be selected
      expect(rows[0]).toHaveAttribute('aria-selected', 'true');
      expect(rows[1]).toHaveAttribute('aria-selected', 'true');
    });

    it('supports keyboard activation of buttons and links', async () => {
      renderComponent();
      const user = userEvent.setup();
      
      await waitFor(() => {
        expect(screen.getByText('Ma')).toBeInTheDocument();
      });

      const todayButton = screen.getByText('Ma');
      todayButton.focus();
      
      // Activate with Enter
      await user.keyboard('{Enter}');
      
      // Should apply filter
      await waitFor(() => {
        const activeFilters = screen.queryAllByTestId(/active-filter/);
        expect(activeFilters.length).toBeGreaterThan(0);
      });
      
      // Activate with Space
      const clearButton = screen.getByText('Szűrők törlése');
      clearButton.focus();
      await user.keyboard('{Space}');
      
      // Should clear filters
      await waitFor(() => {
        const activeFilters = screen.queryAllByTestId(/active-filter/);
        expect(activeFilters.length).toBe(0);
      });
    });

    it('supports escape key to cancel operations', async () => {
      renderComponent();
      const user = userEvent.setup();
      
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /exportálás/i })).toBeInTheDocument();
      });

      // Open export dialog
      await user.click(screen.getByRole('button', { name: /exportálás/i }));
      
      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      // Press Escape
      await user.keyboard('{Escape}');
      
      // Dialog should close
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
    });
  });

  describe('Mobile Touch and Gesture Support', () => {
    it('provides adequate touch target sizes', () => {
      const { container } = renderComponent();
      
      const buttons = container.querySelectorAll('button');
      const links = container.querySelectorAll('a');
      const inputs = container.querySelectorAll('input');
      
      [...buttons, ...links, ...inputs].forEach(element => {
        const rect = element.getBoundingClientRect();
        
        // WCAG 2.5.5: Touch targets should be at least 44x44 CSS pixels
        expect(rect.width).toBeGreaterThanOrEqual(44);
        expect(rect.height).toBeGreaterThanOrEqual(44);
      });
    });

    it('supports swipe gestures for navigation', async () => {
      const { container } = renderComponent();
      
      await waitFor(() => {
        expect(screen.getByRole('table')).toBeInTheDocument();
      });

      const table = screen.getByRole('table');
      
      // Simulate swipe gesture
      fireEvent.touchStart(table, {
        touches: [{ clientX: 300, clientY: 100 }],
      });
      
      fireEvent.touchMove(table, {
        touches: [{ clientX: 100, clientY: 100 }],
      });
      
      fireEvent.touchEnd(table, {
        changedTouches: [{ clientX: 100, clientY: 100 }],
      });
      
      // Should handle swipe (e.g., navigate to next page or show actions)
    });
  });

  describe('High Contrast Mode Support', () => {
    it('maintains visibility in high contrast mode', () => {
      const { container } = renderComponent();
      
      // Simulate high contrast mode
      document.documentElement.style.filter = 'contrast(2) invert(1)';
      
      // Check that important elements are still visible
      const buttons = container.querySelectorAll('button');
      buttons.forEach(button => {
        const styles = window.getComputedStyle(button);
        
        // Should have borders or other visual indicators
        expect(
          styles.border !== 'none' ||
          styles.outline !== 'none' ||
          styles.boxShadow !== 'none'
        ).toBeTruthy();
      });
      
      // Reset
      document.documentElement.style.filter = '';
    });
  });

  describe('Reduced Motion Support', () => {
    it('respects prefers-reduced-motion setting', () => {
      // Mock matchMedia for prefers-reduced-motion
      window.matchMedia = vi.fn().mockImplementation(query => ({
        matches: query === '(prefers-reduced-motion: reduce)',
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));
      
      const { container } = renderComponent();
      
      // Check that animations are disabled
      const animatedElements = container.querySelectorAll('[class*="transition"], [class*="animate"]');
      animatedElements.forEach(element => {
        const styles = window.getComputedStyle(element);
        
        // Transitions should be instant or disabled
        expect(
          styles.transitionDuration === '0s' ||
          styles.animationDuration === '0s' ||
          styles.animation === 'none'
        ).toBeTruthy();
      });
    });
  });
});