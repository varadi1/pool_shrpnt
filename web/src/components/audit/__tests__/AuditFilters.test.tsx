import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { AuditFilters } from '../AuditFilters';
import type { AuditFilter } from '@/types/audit';

const mockActors = [
  { id: '1', name: 'John Doe', email: 'john@example.com' },
  { id: '2', name: 'Jane Smith', email: 'jane@example.com' },
  { id: '3', name: 'System', email: 'system@example.com' },
];

describe('AuditFilters', () => {
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

  const renderComponent = (props = {}) => {
    return render(
      <BrowserRouter>
        <AuditFilters {...defaultProps} {...props} />
      </BrowserRouter>
    );
  };

  it('renders filter panel with all sections', () => {
    renderComponent();
    
    expect(screen.getByText('Szűrők')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Szabad szöveges keresés...')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Korrelációs azonosító...')).toBeInTheDocument();
    expect(screen.getByText('Gyors szűrők:')).toBeInTheDocument();
  });

  it('handles quick filter buttons', () => {
    renderComponent();
    
    const todayButton = screen.getByText('Ma');
    fireEvent.click(todayButton);
    
    expect(mockOnFiltersChange).toHaveBeenCalled();
    const call = mockOnFiltersChange.mock.calls[0][0];
    expect(call.dateRange).toBeDefined();
    expect(call.dateRange.from).toBeInstanceOf(Date);
    expect(call.dateRange.to).toBeInstanceOf(Date);
  });

  it('handles search text input', () => {
    renderComponent();
    
    const searchInput = screen.getByPlaceholderText('Szabad szöveges keresés...');
    fireEvent.change(searchInput, { target: { value: 'test search' } });
    
    expect(mockOnFiltersChange).toHaveBeenCalledWith(
      expect.objectContaining({
        searchText: 'test search',
      })
    );
  });

  it('handles correlation ID input', () => {
    renderComponent();
    
    const correlationInput = screen.getByPlaceholderText('Korrelációs azonosító...');
    fireEvent.change(correlationInput, { target: { value: 'abc-123' } });
    
    expect(mockOnFiltersChange).toHaveBeenCalledWith(
      expect.objectContaining({
        correlationId: 'abc-123',
      })
    );
  });

  it('toggles advanced filters section', () => {
    renderComponent();
    
    const toggleButton = screen.getByText(/Speciális szűrők/);
    
    expect(screen.queryByText('Felhasználó/Aktor')).not.toBeInTheDocument();
    
    fireEvent.click(toggleButton);
    
    expect(screen.getByText('Felhasználó/Aktor')).toBeInTheDocument();
    expect(screen.getByText('Művelet típus')).toBeInTheDocument();
    expect(screen.getByText('Kategória')).toBeInTheDocument();
  });

  it('displays active filter count', () => {
    const filters: AuditFilter = {
      searchText: 'test',
      correlationId: 'abc-123',
      actionTypes: ['TEMPLATE_CREATED', 'TEMPLATE_UPDATED'],
      categories: ['template'],
    };
    
    renderComponent({ filters });
    
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('handles clear filters button', () => {
    const filters: AuditFilter = {
      searchText: 'test',
    };
    
    renderComponent({ filters });
    
    const clearButton = screen.getByText('Szűrők törlése');
    fireEvent.click(clearButton);
    
    expect(mockOnClearFilters).toHaveBeenCalled();
  });

  it('disables clear button when no filters active', () => {
    renderComponent();
    
    const clearButton = screen.getByText('Szűrők törlése');
    expect(clearButton).toBeDisabled();
  });

  it('handles date range selection', () => {
    renderComponent();
    
    const fromInput = screen.getByLabelText('Dátum ettől');
    const toInput = screen.getByLabelText('Dátum eddig');
    
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    
    fireEvent.change(fromInput, { 
      target: { value: yesterday.toISOString().slice(0, 16) } 
    });
    
    expect(mockOnFiltersChange).toHaveBeenCalledWith(
      expect.objectContaining({
        dateRange: expect.objectContaining({
          from: expect.any(Date),
        }),
      })
    );
    
    fireEvent.change(toInput, { 
      target: { value: now.toISOString().slice(0, 16) } 
    });
    
    expect(mockOnFiltersChange).toHaveBeenCalledWith(
      expect.objectContaining({
        dateRange: expect.objectContaining({
          to: expect.any(Date),
        }),
      })
    );
  });

  it('handles status checkboxes', () => {
    renderComponent();
    
    const toggleButton = screen.getByText(/Speciális szűrők/);
    fireEvent.click(toggleButton);
    
    const successCheckbox = screen.getByLabelText('Sikeres');
    
    fireEvent.click(successCheckbox);
    expect(mockOnFiltersChange).toHaveBeenCalledWith(
      expect.objectContaining({
        status: ['success'],
      })
    );
    
    mockOnFiltersChange.mockClear();
    
    const failureCheckbox = screen.getByLabelText('Sikertelen');
    fireEvent.click(failureCheckbox);
    expect(mockOnFiltersChange).toHaveBeenCalledWith(
      expect.objectContaining({
        status: expect.arrayContaining(['failure']),
      })
    );
  });

  it('displays active filters as tags', () => {
    const filters: AuditFilter = {
      searchText: 'test search',
      correlationId: 'abc-123',
    };
    
    renderComponent({ filters });
    
    expect(screen.getByText('Keresés: test search')).toBeInTheDocument();
    expect(screen.getByText('Korreláció: abc-123')).toBeInTheDocument();
  });

  it('saves and loads filter presets', async () => {
    renderComponent();
    
    const filters: AuditFilter = {
      searchText: 'test',
      categories: ['template'],
    };
    
    renderComponent({ filters });
    
    const saveButton = screen.getByText('Mentés előbeállításként');
    
    window.prompt = vi.fn().mockReturnValue('My Custom Filter');
    
    fireEvent.click(saveButton);
    
    await waitFor(() => {
      const savedPresets = localStorage.getItem('auditFilterPresets');
      expect(savedPresets).toBeTruthy();
      
      const presets = JSON.parse(savedPresets!);
      expect(presets).toHaveLength(4);
      expect(presets[3].name).toBe('My Custom Filter');
      expect(presets[3].filters).toEqual(filters);
    });
  });

  it('handles quick filter for last 7 days', () => {
    renderComponent();
    
    const weekButton = screen.getByText('Elmúlt 7 nap');
    fireEvent.click(weekButton);
    
    expect(mockOnFiltersChange).toHaveBeenCalled();
    const call = mockOnFiltersChange.mock.calls[0][0];
    expect(call.dateRange).toBeDefined();
    
    const daysDiff = Math.floor(
      (call.dateRange.to.getTime() - call.dateRange.from.getTime()) / 
      (1000 * 60 * 60 * 24)
    );
    expect(daysDiff).toBe(7);
  });

  it('handles quick filter for last 30 days', () => {
    renderComponent();
    
    const monthButton = screen.getByText('Elmúlt 30 nap');
    fireEvent.click(monthButton);
    
    expect(mockOnFiltersChange).toHaveBeenCalled();
    const call = mockOnFiltersChange.mock.calls[0][0];
    expect(call.dateRange).toBeDefined();
    
    const daysDiff = Math.floor(
      (call.dateRange.to.getTime() - call.dateRange.from.getTime()) / 
      (1000 * 60 * 60 * 24)
    );
    expect(daysDiff).toBeGreaterThanOrEqual(29);
    expect(daysDiff).toBeLessThanOrEqual(31);
  });

  it('syncs filters with URL parameters', () => {
    const filters: AuditFilter = {
      searchText: 'test',
      correlationId: 'abc-123',
    };
    
    renderComponent({ filters });
    
    const urlParams = new URLSearchParams(window.location.search);
    expect(urlParams.get('search')).toBe('test');
    expect(urlParams.get('correlation')).toBe('abc-123');
  });
});