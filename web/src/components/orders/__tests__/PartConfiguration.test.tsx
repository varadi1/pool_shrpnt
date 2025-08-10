import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import PartConfiguration from '../PartConfiguration';
import type { PartConfiguration as PartConfig } from '@/types/orders';

const renderWithTheme = (component: React.ReactElement) => {
  return render(
    <FluentProvider theme={webLightTheme}>
      {component}
    </FluentProvider>
  );
};

describe('PartConfiguration', () => {
  const mockOnChange = vi.fn();

  beforeEach(() => {
    mockOnChange.mockClear();
  });

  it('renders with no parts selected initially', () => {
    renderWithTheme(<PartConfiguration value={[]} onChange={mockOnChange} />);
    
    expect(screen.getByText('Select Parts to Configure')).toBeInTheDocument();
    expect(screen.getByText('Part A')).toBeInTheDocument();
    expect(screen.getByText('Part B')).toBeInTheDocument();
    expect(screen.getByText('Part C')).toBeInTheDocument();
    expect(screen.getByText('Please select at least one part to configure.')).toBeInTheDocument();
  });

  it('allows selecting a part', async () => {
    renderWithTheme(<PartConfiguration value={[]} onChange={mockOnChange} />);
    
    const partACheckbox = screen.getByRole('checkbox', { name: /Part A/i });
    fireEvent.click(partACheckbox);

    await waitFor(() => {
      expect(mockOnChange).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'A',
            deadline: expect.any(Date),
            lockSchedule: expect.objectContaining({
              t3: expect.any(Date),
              t1: expect.any(Date),
              t0: expect.any(Date),
              t8: expect.any(Date),
            }),
          }),
        ])
      );
    });
  });

  it('allows deselecting a part', async () => {
    const initialParts: PartConfig[] = [
      {
        type: 'A',
        deadline: new Date('2025-02-15T10:00:00'),
        lockSchedule: {
          t3: new Date('2025-02-12T10:00:00'),
          t1: new Date('2025-02-14T10:00:00'),
          t0: new Date('2025-02-15T10:00:00'),
          t8: new Date('2025-02-23T10:00:00'),
        },
      },
    ];

    renderWithTheme(<PartConfiguration value={initialParts} onChange={mockOnChange} />);
    
    const partACheckbox = screen.getByRole('checkbox', { name: /Part A/i });
    expect(partACheckbox).toBeChecked();
    
    fireEvent.click(partACheckbox);

    await waitFor(() => {
      expect(mockOnChange).toHaveBeenCalledWith([]);
    });
  });

  it('displays timeline when part is selected', () => {
    const parts: PartConfig[] = [
      {
        type: 'A',
        deadline: new Date('2025-02-15T10:00:00'),
        lockSchedule: {
          t3: new Date('2025-02-12T10:00:00'),
          t1: new Date('2025-02-14T10:00:00'),
          t0: new Date('2025-02-15T10:00:00'),
          t8: new Date('2025-02-23T10:00:00'),
        },
      },
    ];

    renderWithTheme(<PartConfiguration value={parts} onChange={mockOnChange} />);
    
    expect(screen.getByText('Lock Timeline')).toBeInTheDocument();
    expect(screen.getByText('T-3')).toBeInTheDocument();
    expect(screen.getByText('T-1')).toBeInTheDocument();
    expect(screen.getByText('T+0')).toBeInTheDocument();
    expect(screen.getByText('T+8')).toBeInTheDocument();
  });

  it('allows copying configuration between parts', async () => {
    const parts: PartConfig[] = [
      {
        type: 'A',
        deadline: new Date('2025-02-15T10:00:00'),
        lockSchedule: {
          t3: new Date('2025-02-12T10:00:00'),
          t1: new Date('2025-02-14T10:00:00'),
          t0: new Date('2025-02-15T10:00:00'),
          t8: new Date('2025-02-23T10:00:00'),
        },
      },
    ];

    renderWithTheme(<PartConfiguration value={parts} onChange={mockOnChange} />);
    
    const partBCheckbox = screen.getByRole('checkbox', { name: /Part B/i });
    fireEvent.click(partBCheckbox);

    await waitFor(() => {
      expect(mockOnChange).toHaveBeenCalled();
    });
    
    mockOnChange.mockClear();
    
    const updatedParts = [
      ...parts,
      {
        type: 'B',
        deadline: new Date('2025-02-20T10:00:00'),
        lockSchedule: {
          t3: new Date('2025-02-17T10:00:00'),
          t1: new Date('2025-02-19T10:00:00'),
          t0: new Date('2025-02-20T10:00:00'),
          t8: new Date('2025-02-28T10:00:00'),
        },
      },
    ] as PartConfig[];
    
    renderWithTheme(<PartConfiguration value={updatedParts} onChange={mockOnChange} />);
    
    const copyButtons = screen.getAllByRole('button', { name: /Copy to B/i });
    fireEvent.click(copyButtons[0]);

    await waitFor(() => {
      expect(mockOnChange).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ type: 'A' }),
          expect.objectContaining({
            type: 'B',
            deadline: parts[0].deadline,
            lockSchedule: parts[0].lockSchedule,
          }),
        ])
      );
    });
  });

  it('validates that deadline must be in the future', async () => {
    renderWithTheme(<PartConfiguration value={[]} onChange={mockOnChange} />);
    
    const partACheckbox = screen.getByRole('checkbox', { name: /Part A/i });
    fireEvent.click(partACheckbox);

    await waitFor(() => {
      expect(mockOnChange).toHaveBeenCalled();
    });
    
    const initialParts = mockOnChange.mock.calls[0][0];
    renderWithTheme(<PartConfiguration value={initialParts} onChange={mockOnChange} />);
    
    const deadlineDateInput = screen.getByDisplayValue(initialParts[0].deadline.toISOString().split('T')[0]);
    expect(deadlineDateInput).toHaveAttribute('min');
  });

  it('calculates lock schedule correctly', () => {
    const deadline = new Date('2025-02-15T10:00:00');
    const parts: PartConfig[] = [
      {
        type: 'A',
        deadline,
        lockSchedule: {
          t3: new Date('2025-02-12T10:00:00'),
          t1: new Date('2025-02-14T10:00:00'),
          t0: new Date('2025-02-15T10:00:00'),
          t8: new Date('2025-02-23T10:00:00'),
        },
      },
    ];

    renderWithTheme(<PartConfiguration value={parts} onChange={mockOnChange} />);
    
    const t3Date = new Date(deadline);
    t3Date.setDate(t3Date.getDate() - 3);
    
    const t1Date = new Date(deadline);
    t1Date.setDate(t1Date.getDate() - 1);
    
    const t8Date = new Date(deadline);
    t8Date.setDate(t8Date.getDate() + 8);
    
    expect(parts[0].lockSchedule.t3.getDate()).toBe(t3Date.getDate());
    expect(parts[0].lockSchedule.t1.getDate()).toBe(t1Date.getDate());
    expect(parts[0].lockSchedule.t0.getDate()).toBe(deadline.getDate());
    expect(parts[0].lockSchedule.t8.getDate()).toBe(t8Date.getDate());
  });
});