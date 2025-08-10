import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { ContractTable, ContractTableDescription } from '../ContractTable';
import type { Contract } from '@/types/contracts';

describe('ContractTable Accessibility', () => {
  const mockContracts: Contract[] = [
    {
      id: 1,
      contractNumber: 'C001',
      name: 'Test Contract 1',
      clientName: 'Client A',
      status: 'active',
      startDate: '2024-01-01',
      endDate: '2024-12-31',
      pmName: 'John Doe',
      totalValue: 10000,
      createdAt: '2024-01-01',
      updatedAt: '2024-01-01',
    },
    {
      id: 2,
      contractNumber: 'C002',
      name: 'Test Contract 2',
      clientName: 'Client B',
      status: 'inactive',
      startDate: '2024-02-01',
      endDate: '2024-11-30',
      pmName: 'Jane Smith',
      totalValue: 20000,
      createdAt: '2024-02-01',
      updatedAt: '2024-02-01',
    },
  ];

  const defaultProps = {
    contracts: mockContracts,
    onContractClick: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    canEdit: true,
    canDelete: true,
    page: 1,
    pageSize: 10,
    totalPages: 1,
    onPageChange: vi.fn(),
    onPageSizeChange: vi.fn(),
  };

  describe('ARIA Labels', () => {
    it('should have proper ARIA labels on table', () => {
      render(<ContractTable {...defaultProps} />);
      
      const table = screen.getByRole('grid', { name: /contracts table/i });
      expect(table).toBeInTheDocument();
      expect(table).toHaveAttribute('aria-label', 'Contracts table');
      expect(table).toHaveAttribute('aria-describedby', 'contracts-table-description');
    });

    it('should have ARIA labels on action buttons', () => {
      render(<ContractTable {...defaultProps} />);
      
      const viewButtons = screen.getAllByLabelText(/view contract/i);
      expect(viewButtons).toHaveLength(mockContracts.length);
      
      const editButtons = screen.getAllByLabelText(/edit contract/i);
      expect(editButtons).toHaveLength(mockContracts.length);
      
      const deleteButtons = screen.getAllByLabelText(/delete contract/i);
      expect(deleteButtons).toHaveLength(mockContracts.length);
    });

    it('should have ARIA labels on pagination controls', () => {
      render(<ContractTable {...defaultProps} />);
      
      expect(screen.getByLabelText('Previous page')).toBeInTheDocument();
      expect(screen.getByLabelText('Next page')).toBeInTheDocument();
      expect(screen.getByLabelText('Page size')).toBeInTheDocument();
    });

    it('should have proper ARIA sort attributes on sortable columns', () => {
      render(<ContractTable {...defaultProps} />);
      
      const headers = screen.getAllByRole('columnheader');
      const sortableHeader = headers[0]; // Contract Number column
      
      expect(sortableHeader).not.toHaveAttribute('aria-sort');
      
      // Click to sort ascending
      fireEvent.click(sortableHeader);
      expect(sortableHeader).toHaveAttribute('aria-sort', 'ascending');
      
      // Click to sort descending
      fireEvent.click(sortableHeader);
      expect(sortableHeader).toHaveAttribute('aria-sort', 'descending');
    });

    it('should render screen reader description', () => {
      render(<ContractTableDescription />);
      
      const description = screen.getByText(/use arrow keys to navigate rows/i);
      expect(description).toBeInTheDocument();
      expect(description).toHaveClass('sr-only');
    });
  });

  describe('Keyboard Navigation', () => {
    it('should navigate rows with arrow keys', async () => {
      const { container } = render(<ContractTable {...defaultProps} />);
      const rows = container.querySelectorAll('[role="row"]');
      
      // Focus first data row
      const firstRow = rows[1] as HTMLElement; // Skip header row
      firstRow.focus();
      
      // Press ArrowDown
      fireEvent.keyDown(firstRow, { key: 'ArrowDown' });
      await waitFor(() => {
        expect(document.activeElement).toBe(rows[2]);
      });
      
      // Press ArrowUp
      fireEvent.keyDown(rows[2], { key: 'ArrowUp' });
      await waitFor(() => {
        expect(document.activeElement).toBe(firstRow);
      });
    });

    it('should navigate to first/last row with Ctrl+Home/End', async () => {
      const { container } = render(<ContractTable {...defaultProps} />);
      const rows = container.querySelectorAll('[role="row"]');
      
      const firstRow = rows[1] as HTMLElement;
      const lastRow = rows[rows.length - 1] as HTMLElement;
      
      // Focus middle row
      firstRow.focus();
      
      // Press Ctrl+End
      fireEvent.keyDown(firstRow, { key: 'End', ctrlKey: true });
      await waitFor(() => {
        expect(document.activeElement).toBe(lastRow);
      });
      
      // Press Ctrl+Home
      fireEvent.keyDown(lastRow, { key: 'Home', ctrlKey: true });
      await waitFor(() => {
        expect(document.activeElement).toBe(firstRow);
      });
    });

    it('should open contract detail on Enter key', () => {
      const onContractClick = vi.fn();
      const { container } = render(
        <ContractTable {...defaultProps} onContractClick={onContractClick} />
      );
      
      const firstRow = container.querySelectorAll('[role="row"]')[1] as HTMLElement;
      firstRow.focus();
      
      fireEvent.keyDown(firstRow, { key: 'Enter' });
      expect(onContractClick).toHaveBeenCalledWith(mockContracts[0]);
    });

    it('should open contract detail on Space key', () => {
      const onContractClick = vi.fn();
      const { container } = render(
        <ContractTable {...defaultProps} onContractClick={onContractClick} />
      );
      
      const firstRow = container.querySelectorAll('[role="row"]')[1] as HTMLElement;
      firstRow.focus();
      
      fireEvent.keyDown(firstRow, { key: ' ' });
      expect(onContractClick).toHaveBeenCalledWith(mockContracts[0]);
    });

    it('should trigger edit with Ctrl+E', () => {
      const onEdit = vi.fn();
      const { container } = render(
        <ContractTable {...defaultProps} onEdit={onEdit} canEdit={true} />
      );
      
      const firstRow = container.querySelectorAll('[role="row"]')[1] as HTMLElement;
      firstRow.focus();
      
      fireEvent.keyDown(firstRow, { key: 'e', ctrlKey: true });
      expect(onEdit).toHaveBeenCalledWith(mockContracts[0]);
    });

    it('should trigger delete with Delete key', () => {
      const onDelete = vi.fn();
      const { container } = render(
        <ContractTable {...defaultProps} onDelete={onDelete} canDelete={true} />
      );
      
      const firstRow = container.querySelectorAll('[role="row"]')[1] as HTMLElement;
      firstRow.focus();
      
      fireEvent.keyDown(firstRow, { key: 'Delete' });
      expect(onDelete).toHaveBeenCalledWith(mockContracts[0]);
    });

    it('should not trigger delete when canDelete is false', () => {
      const onDelete = vi.fn();
      const { container } = render(
        <ContractTable {...defaultProps} onDelete={onDelete} canDelete={false} />
      );
      
      const firstRow = container.querySelectorAll('[role="row"]')[1] as HTMLElement;
      firstRow.focus();
      
      fireEvent.keyDown(firstRow, { key: 'Delete' });
      expect(onDelete).not.toHaveBeenCalled();
    });
  });

  describe('Focus Management', () => {
    it('should show focus outline on selected row', () => {
      const { container } = render(<ContractTable {...defaultProps} />);
      const firstRow = container.querySelectorAll('[role="row"]')[1] as HTMLElement;
      
      firstRow.focus();
      fireEvent.keyDown(firstRow, { key: 'ArrowDown' });
      
      const secondRow = container.querySelectorAll('[role="row"]')[2] as HTMLElement;
      const styles = window.getComputedStyle(secondRow);
      expect(styles.outline).toContain('2px solid');
    });

    it('should maintain proper tabindex on rows', () => {
      const { container } = render(<ContractTable {...defaultProps} />);
      const rows = container.querySelectorAll('[role="row"]');
      
      // First data row should have tabindex 0
      expect(rows[1]).toHaveAttribute('tabindex', '-1');
      
      // Focus first row
      const firstRow = rows[1] as HTMLElement;
      firstRow.focus();
      fireEvent.keyDown(firstRow, { key: 'ArrowDown' });
      
      // Second row should now have tabindex 0
      expect(rows[2]).toHaveAttribute('tabindex', '0');
    });
  });

  describe('Column Sorting Keyboard Support', () => {
    it('should sort columns with Enter key on header', () => {
      render(<ContractTable {...defaultProps} />);
      
      const headers = screen.getAllByRole('columnheader');
      const contractNumberHeader = headers[0];
      
      // Focus and press Enter
      contractNumberHeader.focus();
      fireEvent.keyDown(contractNumberHeader, { key: 'Enter' });
      
      expect(contractNumberHeader).toHaveAttribute('aria-sort', 'ascending');
    });

    it('should sort columns with Space key on header', () => {
      render(<ContractTable {...defaultProps} />);
      
      const headers = screen.getAllByRole('columnheader');
      const nameHeader = headers[1];
      
      // Focus and press Space
      nameHeader.focus();
      fireEvent.keyDown(nameHeader, { key: ' ' });
      
      expect(nameHeader).toHaveAttribute('aria-sort', 'ascending');
    });

    it('should not sort Actions column', () => {
      render(<ContractTable {...defaultProps} />);
      
      const headers = screen.getAllByRole('columnheader');
      const actionsHeader = headers[headers.length - 1]; // Last column is Actions
      
      expect(actionsHeader).toHaveAttribute('tabindex', '-1');
      
      // Try to sort - should not work
      fireEvent.click(actionsHeader);
      expect(actionsHeader).not.toHaveAttribute('aria-sort');
    });
  });

  describe('Row Selection Visual Feedback', () => {
    it('should highlight row on hover', async () => {
      const { container } = render(<ContractTable {...defaultProps} />);
      const firstRow = container.querySelectorAll('[role="row"]')[1] as HTMLElement;
      
      await userEvent.hover(firstRow);
      
      const styles = window.getComputedStyle(firstRow);
      expect(styles.cursor).toBe('pointer');
    });

    it('should have visual feedback for focused row', () => {
      const { container } = render(<ContractTable {...defaultProps} />);
      const firstRow = container.querySelectorAll('[role="row"]')[1] as HTMLElement;
      
      firstRow.focus();
      expect(firstRow).toHaveAttribute('tabindex', '-1');
      
      // Navigate to make it selected
      fireEvent.keyDown(firstRow, { key: 'ArrowDown' });
      fireEvent.keyDown(container.querySelectorAll('[role="row"]')[2], { key: 'ArrowUp' });
      
      expect(firstRow).toHaveAttribute('tabindex', '0');
    });
  });
});