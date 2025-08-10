import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { ContractFilters } from '../ContractFilters';
import { ContractFilters as FiltersType } from '../../../types/contracts';

const mockOnFiltersChange = vi.fn();
const mockOnClear = vi.fn();

const defaultFilters: FiltersType = {
  search: '',
  status: undefined,
  startDate: undefined,
  endDate: undefined,
  clientName: undefined
};

const renderContractFilters = (props = {}) => {
  return render(
    <FluentProvider theme={webLightTheme}>
      <ContractFilters
        filters={defaultFilters}
        onFiltersChange={mockOnFiltersChange}
        onClear={mockOnClear}
        {...props}
      />
    </FluentProvider>
  );
};

describe.skip('ContractFilters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should debounce search input', async () => {
    const user = userEvent.setup({ delay: null });
    renderContractFilters();
    
    const searchInput = screen.getByPlaceholderText(/search contracts/i);
    
    // Type in search input
    await user.type(searchInput, 'test contract');
    
    // Should not call immediately
    expect(mockOnFiltersChange).not.toHaveBeenCalled();
    
    // Fast forward debounce timer (300ms)
    vi.advanceTimersByTime(300);
    
    // Should call after debounce
    await waitFor(() => {
      expect(mockOnFiltersChange).toHaveBeenCalledWith({
        ...defaultFilters,
        search: 'test contract'
      });
    });
  });

  it('should filter by status', async () => {
    const user = userEvent.setup();
    renderContractFilters();
    
    const statusDropdown = screen.getByRole('combobox', { name: /status/i });
    
    // Select active status
    await user.selectOptions(statusDropdown, 'active');
    
    expect(mockOnFiltersChange).toHaveBeenCalledWith({
      ...defaultFilters,
      status: 'active'
    });
    
    // Select inactive status
    await user.selectOptions(statusDropdown, 'inactive');
    
    expect(mockOnFiltersChange).toHaveBeenCalledWith({
      ...defaultFilters,
      status: 'inactive'
    });
    
    // Select expired status
    await user.selectOptions(statusDropdown, 'expired');
    
    expect(mockOnFiltersChange).toHaveBeenCalledWith({
      ...defaultFilters,
      status: 'expired'
    });
  });

  it('should filter by date range', async () => {
    const user = userEvent.setup();
    renderContractFilters();
    
    // Set start date
    const startDateInput = screen.getByLabelText(/start date/i);
    await user.type(startDateInput, '2025-01-01');
    
    expect(mockOnFiltersChange).toHaveBeenCalledWith({
      ...defaultFilters,
      startDate: '2025-01-01'
    });
    
    // Set end date
    const endDateInput = screen.getByLabelText(/end date/i);
    await user.type(endDateInput, '2025-12-31');
    
    expect(mockOnFiltersChange).toHaveBeenCalledWith({
      ...defaultFilters,
      endDate: '2025-12-31'
    });
  });

  it('should clear all filters', async () => {
    const user = userEvent.setup();
    
    const activeFilters: FiltersType = {
      search: 'test',
      status: 'active',
      startDate: '2025-01-01',
      endDate: '2025-12-31',
      clientName: 'Client A'
    };
    
    renderContractFilters({ filters: activeFilters });
    
    const clearButton = screen.getByRole('button', { name: /clear filters/i });
    await user.click(clearButton);
    
    expect(mockOnClear).toHaveBeenCalled();
  });

  it('should persist filter state in URL params', () => {
    const filters: FiltersType = {
      search: 'contract',
      status: 'active',
      startDate: '2025-01-01',
      endDate: '2025-12-31',
      clientName: undefined
    };
    
    renderContractFilters({ filters });
    
    // Check that inputs reflect the filter state
    const searchInput = screen.getByPlaceholderText(/search contracts/i) as HTMLInputElement;
    expect(searchInput.value).toBe('contract');
    
    const statusDropdown = screen.getByRole('combobox', { name: /status/i }) as HTMLSelectElement;
    expect(statusDropdown.value).toBe('active');
    
    const startDateInput = screen.getByLabelText(/start date/i) as HTMLInputElement;
    expect(startDateInput.value).toBe('2025-01-01');
    
    const endDateInput = screen.getByLabelText(/end date/i) as HTMLInputElement;
    expect(endDateInput.value).toBe('2025-12-31');
  });

  it('should show active filter count', () => {
    const filters: FiltersType = {
      search: 'test',
      status: 'active',
      startDate: '2025-01-01',
      endDate: undefined,
      clientName: undefined
    };
    
    renderContractFilters({ filters });
    
    // Should show count of active filters (3 in this case)
    const clearButton = screen.getByRole('button', { name: /clear filters/i });
    expect(clearButton).toHaveTextContent(/clear.*3/i);
  });

  it('should disable clear button when no filters active', () => {
    renderContractFilters({ filters: defaultFilters });
    
    const clearButton = screen.getByRole('button', { name: /clear filters/i });
    expect(clearButton).toBeDisabled();
  });

  it('should handle client name filter', async () => {
    const user = userEvent.setup({ delay: null });
    renderContractFilters();
    
    const clientInput = screen.getByPlaceholderText(/filter by client/i);
    await user.type(clientInput, 'Client ABC');
    
    // Fast forward debounce
    vi.advanceTimersByTime(300);
    
    await waitFor(() => {
      expect(mockOnFiltersChange).toHaveBeenCalledWith({
        ...defaultFilters,
        clientName: 'Client ABC'
      });
    });
  });

  it('should validate date range (end date after start date)', async () => {
    const user = userEvent.setup();
    renderContractFilters();
    
    // Set end date first
    const endDateInput = screen.getByLabelText(/end date/i);
    await user.type(endDateInput, '2025-01-01');
    
    // Try to set start date after end date
    const startDateInput = screen.getByLabelText(/start date/i);
    await user.type(startDateInput, '2025-12-31');
    
    // Should show validation error
    expect(screen.getByText(/start date must be before end date/i)).toBeInTheDocument();
  });

  it('should handle empty search correctly', async () => {
    const user = userEvent.setup({ delay: null });
    
    const filters: FiltersType = {
      ...defaultFilters,
      search: 'existing search'
    };
    
    renderContractFilters({ filters });
    
    const searchInput = screen.getByPlaceholderText(/search contracts/i);
    
    // Clear the search
    await user.clear(searchInput);
    
    // Fast forward debounce
    vi.advanceTimersByTime(300);
    
    await waitFor(() => {
      expect(mockOnFiltersChange).toHaveBeenCalledWith({
        ...defaultFilters,
        search: ''
      });
    });
  });

  it('should handle rapid filter changes correctly', async () => {
    const user = userEvent.setup({ delay: null });
    renderContractFilters();
    
    const searchInput = screen.getByPlaceholderText(/search contracts/i);
    
    // Type rapidly
    await user.type(searchInput, 't');
    await user.type(searchInput, 'e');
    await user.type(searchInput, 's');
    await user.type(searchInput, 't');
    
    // Should not call onChange yet
    expect(mockOnFiltersChange).not.toHaveBeenCalled();
    
    // Fast forward debounce
    vi.advanceTimersByTime(300);
    
    // Should only call once with final value
    await waitFor(() => {
      expect(mockOnFiltersChange).toHaveBeenCalledTimes(1);
      expect(mockOnFiltersChange).toHaveBeenCalledWith({
        ...defaultFilters,
        search: 'test'
      });
    });
  });

  it('should reset status filter to "all"', async () => {
    const user = userEvent.setup();
    
    const filters: FiltersType = {
      ...defaultFilters,
      status: 'active'
    };
    
    renderContractFilters({ filters });
    
    const statusDropdown = screen.getByRole('combobox', { name: /status/i });
    
    // Select "All" option
    await user.selectOptions(statusDropdown, '');
    
    expect(mockOnFiltersChange).toHaveBeenCalledWith({
      ...defaultFilters,
      status: undefined
    });
  });
});