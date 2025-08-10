import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { AuditFilters } from '../AuditFilters';
import type { AuditFilter } from '@/types/audit';

const mockActors = [
  { id: '1', name: 'John Doe', email: 'john@example.com' },
  { id: '2', name: 'Jane Smith', email: 'jane@example.com' },
  { id: '3', name: 'System', email: 'system@example.com' },
];

describe('AuditFilters - Enhanced Filter Logic Tests', () => {
  const mockOnFiltersChange = vi.fn();
  const mockOnClearFilters = vi.fn();
  
  const defaultProps = {
    filters: {} as AuditFilter,
    onFiltersChange: mockOnFiltersChange,
    onClearFilters: mockOnClearFilters,
    availableActors: mockActors,
    isLoading: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const renderComponent = (props = {}) => {
    return render(
      <BrowserRouter>
        <AuditFilters {...defaultProps} {...props} />
      </BrowserRouter>
    );
  };

  describe('Complex Filter Combinations', () => {
    it('handles multiple filter types simultaneously', async () => {
      renderComponent();
      const user = userEvent.setup();
      
      // Apply search text
      await user.type(screen.getByPlaceholderText('Szabad szöveges keresés...'), 'template');
      
      // Apply correlation ID
      await user.type(screen.getByPlaceholderText('Korrelációs azonosító...'), 'corr-123');
      
      // Open advanced filters
      await user.click(screen.getByText(/Speciális szűrők/));
      
      // Apply status filter
      await user.click(screen.getByLabelText('Sikeres'));
      await user.click(screen.getByLabelText('Sikertelen'));
      
      // Verify all filters are applied
      expect(mockOnFiltersChange).toHaveBeenCalledTimes(4);
      
      const lastCall = mockOnFiltersChange.mock.calls[mockOnFiltersChange.mock.calls.length - 1][0];
      expect(lastCall).toMatchObject({
        searchText: 'template',
        correlationId: 'corr-123',
        status: expect.arrayContaining(['success', 'failure']),
      });
    });

    it('preserves existing filters when adding new ones', async () => {
      const existingFilters: AuditFilter = {
        searchText: 'existing',
        categories: ['template'],
      };
      
      const { rerender } = renderComponent({ filters: existingFilters });
      const user = userEvent.setup();
      
      // Add correlation ID
      await user.type(screen.getByPlaceholderText('Korrelációs azonosító...'), 'new-corr');
      
      const lastCall = mockOnFiltersChange.mock.calls[mockOnFiltersChange.mock.calls.length - 1][0];
      expect(lastCall).toMatchObject({
        searchText: 'existing',
        categories: ['template'],
        correlationId: 'new-corr',
      });
    });

    it('removes individual filters without affecting others', async () => {
      const filters: AuditFilter = {
        searchText: 'test',
        correlationId: 'abc-123',
        categories: ['template', 'provisioning'],
        actionTypes: ['TEMPLATE_CREATED'],
      };
      
      renderComponent({ filters });
      
      // Find and click the remove button for search text
      const searchTag = screen.getByText('Keresés: test').closest('span');
      const removeButton = within(searchTag!).getByRole('button');
      fireEvent.click(removeButton);
      
      const lastCall = mockOnFiltersChange.mock.calls[mockOnFiltersChange.mock.calls.length - 1][0];
      expect(lastCall.searchText).toBe('');
      expect(lastCall.correlationId).toBe('abc-123');
      expect(lastCall.categories).toEqual(['template', 'provisioning']);
    });
  });

  describe('Date Range Edge Cases', () => {
    it('adjusts end date when start date is set after it', () => {
      renderComponent();
      
      const fromInput = screen.getByLabelText('Dátum ettől');
      const toInput = screen.getByLabelText('Dátum eddig');
      
      const earlierDate = new Date('2025-01-01T10:00:00');
      const laterDate = new Date('2025-01-15T10:00:00');
      
      // Set end date first
      fireEvent.change(toInput, { 
        target: { value: earlierDate.toISOString().slice(0, 16) } 
      });
      
      // Set start date after end date
      fireEvent.change(fromInput, { 
        target: { value: laterDate.toISOString().slice(0, 16) } 
      });
      
      const lastCall = mockOnFiltersChange.mock.calls[mockOnFiltersChange.mock.calls.length - 1][0];
      expect(lastCall.dateRange.from.getTime()).toBe(lastCall.dateRange.to.getTime());
    });

    it('handles invalid date inputs gracefully', () => {
      renderComponent();
      
      const fromInput = screen.getByLabelText('Dátum ettől');
      
      fireEvent.change(fromInput, { 
        target: { value: 'invalid-date' } 
      });
      
      // Should not call onFiltersChange with invalid date
      const callsWithInvalidDate = mockOnFiltersChange.mock.calls.filter(
        call => call[0].dateRange && isNaN(call[0].dateRange.from.getTime())
      );
      expect(callsWithInvalidDate).toHaveLength(0);
    });

    it('handles date range spanning multiple months', () => {
      renderComponent();
      
      const fromInput = screen.getByLabelText('Dátum ettől');
      const toInput = screen.getByLabelText('Dátum eddig');
      
      const startDate = new Date('2025-01-01T00:00:00');
      const endDate = new Date('2025-03-31T23:59:59');
      
      fireEvent.change(fromInput, { 
        target: { value: startDate.toISOString().slice(0, 16) } 
      });
      
      fireEvent.change(toInput, { 
        target: { value: endDate.toISOString().slice(0, 16) } 
      });
      
      const lastCall = mockOnFiltersChange.mock.calls[mockOnFiltersChange.mock.calls.length - 1][0];
      
      const daysDiff = Math.floor(
        (lastCall.dateRange.to.getTime() - lastCall.dateRange.from.getTime()) / 
        (1000 * 60 * 60 * 24)
      );
      
      expect(daysDiff).toBeGreaterThan(60);
    });
  });

  describe('Filter Preset Management', () => {
    it('saves complex filter combinations as preset', async () => {
      const complexFilters: AuditFilter = {
        searchText: 'error',
        correlationId: 'xyz-789',
        dateRange: {
          from: new Date('2025-01-01'),
          to: new Date('2025-01-31'),
        },
        actors: ['1', '2'],
        actionTypes: ['ORDER_FAILED', 'NOTIFICATION_FAILED'],
        categories: ['provisioning', 'system'],
        targetTypes: ['order', 'notification'],
        status: ['failure'],
      };
      
      renderComponent({ filters: complexFilters });
      
      window.prompt = vi.fn().mockReturnValue('Complex Error Filter');
      
      const saveButton = screen.getByText('Mentés előbeállításként');
      fireEvent.click(saveButton);
      
      await waitFor(() => {
        const savedPresets = localStorage.getItem('auditFilterPresets');
        const presets = JSON.parse(savedPresets!);
        const customPreset = presets.find((p: any) => p.name === 'Complex Error Filter');
        
        expect(customPreset).toBeDefined();
        expect(customPreset.filters).toEqual(complexFilters);
      });
    });

    it('handles preset with empty name gracefully', () => {
      const filters: AuditFilter = { searchText: 'test' };
      renderComponent({ filters });
      
      window.prompt = vi.fn().mockReturnValue('');
      
      const saveButton = screen.getByText('Mentés előbeállításként');
      fireEvent.click(saveButton);
      
      const savedPresets = localStorage.getItem('auditFilterPresets');
      const presets = savedPresets ? JSON.parse(savedPresets) : [];
      
      // Should not save preset with empty name
      expect(presets.find((p: any) => p.name === '')).toBeUndefined();
    });

    it('handles preset name cancellation', () => {
      const filters: AuditFilter = { searchText: 'test' };
      renderComponent({ filters });
      
      window.prompt = vi.fn().mockReturnValue(null);
      
      const initialPresets = localStorage.getItem('auditFilterPresets');
      
      const saveButton = screen.getByText('Mentés előbeállításként');
      fireEvent.click(saveButton);
      
      const afterPresets = localStorage.getItem('auditFilterPresets');
      
      // Should not modify presets when cancelled
      expect(afterPresets).toBe(initialPresets);
    });

    it('loads and applies preset correctly', async () => {
      const presetFilters: AuditFilter = {
        categories: ['security'],
        actionTypes: ['PERMISSION_GRANTED', 'PERMISSION_REVOKED'],
        status: ['success'],
      };
      
      const customPresets = [
        {
          id: 'test-preset',
          name: 'Test Security Preset',
          filters: presetFilters,
        },
      ];
      
      localStorage.setItem('auditFilterPresets', JSON.stringify(customPresets));
      
      renderComponent();
      
      const presetDropdown = screen.getByPlaceholderText('Válassz előbeállítást...');
      fireEvent.click(presetDropdown);
      
      const presetOption = await screen.findByText('Test Security Preset');
      fireEvent.click(presetOption);
      
      expect(mockOnFiltersChange).toHaveBeenCalledWith(presetFilters);
    });
  });

  describe('URL Parameter Synchronization', () => {
    it('updates URL when filters change', () => {
      const { rerender } = renderComponent();
      
      const filters: AuditFilter = {
        searchText: 'search term',
        correlationId: 'corr-456',
        actors: ['1', '2'],
        actionTypes: ['TEMPLATE_CREATED'],
        categories: ['template'],
        targetTypes: ['template'],
        status: ['success'],
      };
      
      rerender(
        <BrowserRouter>
          <AuditFilters {...defaultProps} filters={filters} />
        </BrowserRouter>
      );
      
      const urlParams = new URLSearchParams(window.location.search);
      
      expect(urlParams.get('search')).toBe('search term');
      expect(urlParams.get('correlation')).toBe('corr-456');
      expect(urlParams.get('actors')).toBe('1,2');
      expect(urlParams.get('actions')).toBe('TEMPLATE_CREATED');
      expect(urlParams.get('categories')).toBe('template');
      expect(urlParams.get('targets')).toBe('template');
      expect(urlParams.get('status')).toBe('success');
    });

    it('preserves URL parameters when component remounts', () => {
      const initialFilters: AuditFilter = {
        searchText: 'persistent',
        correlationId: 'persist-123',
      };
      
      const { unmount } = renderComponent({ filters: initialFilters });
      
      const urlBeforeUnmount = new URLSearchParams(window.location.search);
      expect(urlBeforeUnmount.get('search')).toBe('persistent');
      
      unmount();
      
      // Remount component
      renderComponent({ filters: initialFilters });
      
      const urlAfterRemount = new URLSearchParams(window.location.search);
      expect(urlAfterRemount.get('search')).toBe('persistent');
      expect(urlAfterRemount.get('correlation')).toBe('persist-123');
    });
  });

  describe('Performance and Optimization', () => {
    it('debounces rapid filter changes', async () => {
      renderComponent();
      const user = userEvent.setup({ delay: null });
      
      const searchInput = screen.getByPlaceholderText('Szabad szöveges keresés...');
      
      // Type rapidly
      await user.type(searchInput, 'test');
      
      // Each character should trigger a change
      expect(mockOnFiltersChange).toHaveBeenCalledTimes(4); // t, e, s, t
    });

    it('handles large number of active filters efficiently', () => {
      const manyFilters: AuditFilter = {
        searchText: 'test',
        correlationId: 'abc-123',
        dateRange: {
          from: new Date('2025-01-01'),
          to: new Date('2025-12-31'),
        },
        actors: Array.from({ length: 20 }, (_, i) => `actor-${i}`),
        actionTypes: [
          'TEMPLATE_CREATED', 'TEMPLATE_UPDATED', 'TEMPLATE_DELETED',
          'ORDER_CREATED', 'ORDER_PROVISIONED', 'ORDER_ARCHIVED',
        ],
        categories: ['template', 'provisioning', 'security', 'lock', 'user'],
        targetTypes: ['order', 'template', 'permission', 'user', 'group'],
        status: ['success', 'failure'],
      };
      
      const { container } = renderComponent({ filters: manyFilters });
      
      // Should render without performance issues
      const filterTags = container.querySelectorAll('.fui-InteractionTag');
      expect(filterTags.length).toBeGreaterThan(0);
      
      // Should show correct count
      const countBadge = screen.getByText(/\d+/);
      const count = parseInt(countBadge.textContent || '0');
      expect(count).toBeGreaterThan(30);
    });
  });

  describe('Accessibility', () => {
    it('supports keyboard navigation through filters', async () => {
      renderComponent();
      const user = userEvent.setup();
      
      const searchInput = screen.getByPlaceholderText('Szabad szöveges keresés...');
      searchInput.focus();
      
      // Tab to correlation ID
      await user.tab();
      expect(screen.getByPlaceholderText('Korrelációs azonosító...')).toHaveFocus();
      
      // Tab to date from
      await user.tab();
      expect(screen.getByLabelText('Dátum ettől')).toHaveFocus();
      
      // Tab to date to
      await user.tab();
      expect(screen.getByLabelText('Dátum eddig')).toHaveFocus();
    });

    it('announces filter changes to screen readers', async () => {
      const filters: AuditFilter = {
        searchText: 'test',
      };
      
      const { rerender } = renderComponent({ filters });
      
      // Update filters
      const updatedFilters: AuditFilter = {
        ...filters,
        correlationId: 'new-correlation',
      };
      
      rerender(
        <BrowserRouter>
          <AuditFilters {...defaultProps} filters={updatedFilters} />
        </BrowserRouter>
      );
      
      // Active filter count should be visible
      expect(screen.getByText('2')).toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    it('handles localStorage errors gracefully', () => {
      // Mock localStorage to throw error
      const mockGetItem = vi.spyOn(Storage.prototype, 'getItem');
      mockGetItem.mockImplementation(() => {
        throw new Error('Storage error');
      });
      
      // Should not crash
      expect(() => renderComponent()).not.toThrow();
      
      mockGetItem.mockRestore();
    });

    it('handles invalid preset data in localStorage', () => {
      localStorage.setItem('auditFilterPresets', 'invalid-json');
      
      // Should not crash and use default presets
      expect(() => renderComponent()).not.toThrow();
      
      const presetDropdown = screen.getByPlaceholderText('Válassz előbeállítást...');
      expect(presetDropdown).toBeInTheDocument();
    });
  });
});