import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OrderDetailsForm } from '../OrderDetailsForm';
import * as ordersApi from '../../../services/api/orders';

vi.mock('../../../services/api/orders');

describe('OrderDetailsForm', () => {
  const mockOnChange = vi.fn();
  const mockOnValidate = vi.fn();
  const mockContractCode = 'NEU001';

  const defaultValue = {
    orderName: '',
    orderCode: '',
    description: '',
    startDate: new Date(),
    endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
    orderType: 'standard' as const
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(ordersApi.getNextSequence).mockResolvedValue(42);
  });

  it('renders all form fields', () => {
    render(
      <OrderDetailsForm
        value={defaultValue}
        contractCode={mockContractCode}
        onChange={mockOnChange}
        onValidate={mockOnValidate}
      />
    );

    expect(screen.getByLabelText('Order Name')).toBeInTheDocument();
    expect(screen.getByLabelText('Order Code')).toBeInTheDocument();
    expect(screen.getByLabelText('Description')).toBeInTheDocument();
    expect(screen.getByLabelText('Start Date')).toBeInTheDocument();
    expect(screen.getByLabelText('End Date')).toBeInTheDocument();
    expect(screen.getByLabelText('Order Type')).toBeInTheDocument();
  });

  it('auto-generates order code on mount', async () => {
    render(
      <OrderDetailsForm
        value={defaultValue}
        contractCode={mockContractCode}
        onChange={mockOnChange}
        onValidate={mockOnValidate}
      />
    );

    await waitFor(() => {
      expect(ordersApi.getNextSequence).toHaveBeenCalledWith(mockContractCode);
      expect(mockOnChange).toHaveBeenCalledWith(
        expect.objectContaining({
          orderCode: `EM-${new Date().getFullYear()}-NEU001-042`
        })
      );
    });
  });

  it('validates order name format', async () => {
    const user = userEvent.setup();

    render(
      <OrderDetailsForm
        value={defaultValue}
        contractCode={mockContractCode}
        onChange={mockOnChange}
        onValidate={mockOnValidate}
      />
    );

    const nameInput = screen.getByLabelText('Order Name');
    
    // Invalid format - starts with lowercase
    await user.clear(nameInput);
    await user.type(nameInput, 'invalid name');
    await user.tab();

    expect(screen.getByText(/Invalid name format/)).toBeInTheDocument();
    expect(mockOnValidate).toHaveBeenLastCalledWith(false);

    // Valid format
    await user.clear(nameInput);
    await user.type(nameInput, 'Valid Order Name');
    await user.tab();

    expect(screen.queryByText(/Invalid name format/)).not.toBeInTheDocument();
  });

  it('validates order name length', async () => {
    const user = userEvent.setup();

    render(
      <OrderDetailsForm
        value={defaultValue}
        contractCode={mockContractCode}
        onChange={mockOnChange}
        onValidate={mockOnValidate}
      />
    );

    const nameInput = screen.getByLabelText('Order Name');
    
    // Too short
    await user.clear(nameInput);
    await user.type(nameInput, 'AB');
    await user.tab();

    expect(screen.getByText(/at least 3 characters/)).toBeInTheDocument();

    // Too long (> 100 chars)
    const longName = 'A' + 'x'.repeat(100);
    await user.clear(nameInput);
    await user.type(nameInput, longName);
    await user.tab();

    expect(screen.getByText(/too long/)).toBeInTheDocument();
  });

  it('validates date relationships', async () => {
    const user = userEvent.setup();

    render(
      <OrderDetailsForm
        value={{
          ...defaultValue,
          startDate: new Date('2025-01-15'),
          endDate: new Date('2025-01-10') // End before start
        }}
        contractCode={mockContractCode}
        onChange={mockOnChange}
        onValidate={mockOnValidate}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/End date must be after start date/)).toBeInTheDocument();
      expect(mockOnValidate).toHaveBeenCalledWith(false);
    });
  });

  it('validates start date is not in past', async () => {
    const user = userEvent.setup();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    render(
      <OrderDetailsForm
        value={{
          ...defaultValue,
          startDate: yesterday
        }}
        contractCode={mockContractCode}
        onChange={mockOnChange}
        onValidate={mockOnValidate}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Start date must be today or later/)).toBeInTheDocument();
      expect(mockOnValidate).toHaveBeenCalledWith(false);
    });
  });

  it('updates form values on input change', async () => {
    const user = userEvent.setup();

    render(
      <OrderDetailsForm
        value={defaultValue}
        contractCode={mockContractCode}
        onChange={mockOnChange}
        onValidate={mockOnValidate}
      />
    );

    const nameInput = screen.getByLabelText('Order Name');
    await user.type(nameInput, 'New Order');

    expect(mockOnChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        orderName: 'New Order'
      })
    );

    const descInput = screen.getByLabelText('Description');
    await user.type(descInput, 'Test description');

    expect(mockOnChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        description: 'Test description'
      })
    );
  });

  it('handles order type selection', async () => {
    const user = userEvent.setup();

    render(
      <OrderDetailsForm
        value={defaultValue}
        contractCode={mockContractCode}
        onChange={mockOnChange}
        onValidate={mockOnValidate}
      />
    );

    const typeSelect = screen.getByLabelText('Order Type');
    await user.click(typeSelect);
    
    const urgentOption = screen.getByText('Urgent');
    await user.click(urgentOption);

    expect(mockOnChange).toHaveBeenCalledWith(
      expect.objectContaining({
        orderType: 'urgent'
      })
    );
  });

  it('regenerates order code on request', async () => {
    const user = userEvent.setup();
    vi.mocked(ordersApi.getNextSequence)
      .mockResolvedValueOnce(42)
      .mockResolvedValueOnce(43);

    render(
      <OrderDetailsForm
        value={defaultValue}
        contractCode={mockContractCode}
        onChange={mockOnChange}
        onValidate={mockOnValidate}
      />
    );

    await waitFor(() => {
      expect(mockOnChange).toHaveBeenCalledWith(
        expect.objectContaining({
          orderCode: `EM-${new Date().getFullYear()}-NEU001-042`
        })
      );
    });

    const regenerateButton = screen.getByRole('button', { name: /Generate New Code/i });
    await user.click(regenerateButton);

    await waitFor(() => {
      expect(mockOnChange).toHaveBeenCalledWith(
        expect.objectContaining({
          orderCode: `EM-${new Date().getFullYear()}-NEU001-043`
        })
      );
    });
  });

  it('validates description length', async () => {
    const user = userEvent.setup();

    render(
      <OrderDetailsForm
        value={defaultValue}
        contractCode={mockContractCode}
        onChange={mockOnChange}
        onValidate={mockOnValidate}
      />
    );

    const descInput = screen.getByLabelText('Description');
    const longDescription = 'x'.repeat(501);
    
    await user.type(descInput, longDescription);
    await user.tab();

    expect(screen.getByText(/Description too long/)).toBeInTheDocument();
  });

  it('handles date picker changes', async () => {
    const user = userEvent.setup();

    render(
      <OrderDetailsForm
        value={defaultValue}
        contractCode={mockContractCode}
        onChange={mockOnChange}
        onValidate={mockOnValidate}
      />
    );

    const startDateInput = screen.getByLabelText('Start Date');
    await user.clear(startDateInput);
    await user.type(startDateInput, '2025-02-01');

    expect(mockOnChange).toHaveBeenCalledWith(
      expect.objectContaining({
        startDate: expect.any(Date)
      })
    );
  });

  it('displays all order type options', async () => {
    const user = userEvent.setup();

    render(
      <OrderDetailsForm
        value={defaultValue}
        contractCode={mockContractCode}
        onChange={mockOnChange}
        onValidate={mockOnValidate}
      />
    );

    const typeSelect = screen.getByLabelText('Order Type');
    await user.click(typeSelect);

    expect(screen.getByText('Standard')).toBeInTheDocument();
    expect(screen.getByText('Urgent')).toBeInTheDocument();
    expect(screen.getByText('Special')).toBeInTheDocument();
  });

  it('marks required fields', () => {
    render(
      <OrderDetailsForm
        value={defaultValue}
        contractCode={mockContractCode}
        onChange={mockOnChange}
        onValidate={mockOnValidate}
      />
    );

    const nameLabel = screen.getByText('Order Name');
    const codeLabel = screen.getByText('Order Code');
    const endDateLabel = screen.getByText('End Date');

    expect(nameLabel.closest('label')).toHaveTextContent('*');
    expect(codeLabel.closest('label')).toHaveTextContent('*');
    expect(endDateLabel.closest('label')).toHaveTextContent('*');
  });

  it('disables order code input field', () => {
    render(
      <OrderDetailsForm
        value={defaultValue}
        contractCode={mockContractCode}
        onChange={mockOnChange}
        onValidate={mockOnValidate}
      />
    );

    const codeInput = screen.getByLabelText('Order Code');
    expect(codeInput).toBeDisabled();
  });

  it('validates complete form on all changes', async () => {
    const user = userEvent.setup();

    render(
      <OrderDetailsForm
        value={{
          ...defaultValue,
          orderName: 'Valid Name',
          orderCode: 'EM-2025-NEU001-042'
        }}
        contractCode={mockContractCode}
        onChange={mockOnChange}
        onValidate={mockOnValidate}
      />
    );

    await waitFor(() => {
      expect(mockOnValidate).toHaveBeenLastCalledWith(true);
    });

    // Make form invalid
    const nameInput = screen.getByLabelText('Order Name');
    await user.clear(nameInput);
    await user.type(nameInput, 'AB'); // Too short

    expect(mockOnValidate).toHaveBeenLastCalledWith(false);
  });

  it('handles API error when generating sequence', async () => {
    vi.mocked(ordersApi.getNextSequence).mockRejectedValue(
      new Error('Failed to get sequence')
    );

    render(
      <OrderDetailsForm
        value={defaultValue}
        contractCode={mockContractCode}
        onChange={mockOnChange}
        onValidate={mockOnValidate}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Failed to generate order code/)).toBeInTheDocument();
    });
  });

  it('supports keyboard navigation', async () => {
    const user = userEvent.setup();

    render(
      <OrderDetailsForm
        value={defaultValue}
        contractCode={mockContractCode}
        onChange={mockOnChange}
        onValidate={mockOnValidate}
      />
    );

    await user.tab(); // Focus first field
    expect(screen.getByLabelText('Order Name')).toHaveFocus();

    await user.tab(); // Move to next field
    expect(screen.getByLabelText('Description')).toHaveFocus();

    await user.tab(); // Continue navigation
    expect(screen.getByLabelText('Start Date')).toHaveFocus();
  });
});