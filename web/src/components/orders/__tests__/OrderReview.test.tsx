import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import OrderReview from '../OrderReview';
import { ordersApi } from '@/services/api/orders';
import type { OrderFormData } from '@/types/orders';

// Mock the orders API
vi.mock('@/services/api/orders', () => ({
  ordersApi: {
    create: vi.fn(),
    provision: vi.fn(),
    saveDraft: vi.fn(),
    deleteDraft: vi.fn(),
  },
}));

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
        {children}
      </FluentProvider>
    </QueryClientProvider>
  );
};

describe('OrderReview', () => {
  const mockOnSubmit = vi.fn();
  const mockOnSaveDraft = vi.fn();
  const mockOnBack = vi.fn();

  const mockOrderData: OrderFormData = {
    contractId: 'contract-1',
    contractName: 'Test Contract',
    orderName: 'Test Order',
    orderCode: 'EM-2025-TC001-001',
    description: 'Test order description',
    startDate: new Date('2025-01-01'),
    endDate: new Date('2025-12-31'),
    orderType: 'standard',
    templateId: 'template-1',
    templateVersion: '2.0',
    parts: [
      {
        type: 'A',
        deadline: new Date('2025-03-01T10:00:00'),
        lockSchedule: {
          t3: new Date('2025-02-26T10:00:00'),
          t1: new Date('2025-02-28T10:00:00'),
          t0: new Date('2025-03-01T10:00:00'),
          t8: new Date('2025-03-09T10:00:00'),
        },
      },
    ],
    partners: [
      {
        companyId: 'partner-1',
        companyName: 'Partner Company',
        accessLevel: 'read',
        folders: ['01_Tervezés', '02_Kivitelezés'],
        parts: ['A'],
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders order summary correctly', () => {
    render(
      <OrderReview
        data={mockOrderData}
        onSubmit={mockOnSubmit}
        onSaveDraft={mockOnSaveDraft}
        onBack={mockOnBack}
      />,
      { wrapper: createWrapper() }
    );

    expect(screen.getByText('Review Your Order')).toBeInTheDocument();
    expect(screen.getByText('Order Details')).toBeInTheDocument();
    expect(screen.getByText('EM-2025-TC001-001')).toBeInTheDocument();
    expect(screen.getByText('Test Order')).toBeInTheDocument();
    expect(screen.getByText('Test Contract')).toBeInTheDocument();
  });

  it('displays template configuration', () => {
    render(
      <OrderReview
        data={mockOrderData}
        onSubmit={mockOnSubmit}
        onSaveDraft={mockOnSaveDraft}
        onBack={mockOnBack}
      />,
      { wrapper: createWrapper() }
    );

    expect(screen.getByText('Template Configuration')).toBeInTheDocument();
    expect(screen.getByText(/template-1 \(v2\.0\)/)).toBeInTheDocument();
  });

  it('displays part configuration with timeline', () => {
    render(
      <OrderReview
        data={mockOrderData}
        onSubmit={mockOnSubmit}
        onSaveDraft={mockOnSaveDraft}
        onBack={mockOnBack}
      />,
      { wrapper: createWrapper() }
    );

    expect(screen.getByText('Part Configuration (1 parts)')).toBeInTheDocument();
    expect(screen.getByText('Part A')).toBeInTheDocument();
    expect(screen.getByText(/T-3:/)).toBeInTheDocument();
    expect(screen.getByText(/T-1:/)).toBeInTheDocument();
    expect(screen.getByText(/Deadline:/)).toBeInTheDocument();
  });

  it('displays partner assignment details', () => {
    render(
      <OrderReview
        data={mockOrderData}
        onSubmit={mockOnSubmit}
        onSaveDraft={mockOnSaveDraft}
        onBack={mockOnBack}
      />,
      { wrapper: createWrapper() }
    );

    expect(screen.getByText('Partner Assignment (1 partners)')).toBeInTheDocument();
    expect(screen.getByText('Partner Company')).toBeInTheDocument();
    expect(screen.getByText(/Parts: A/)).toBeInTheDocument();
    expect(screen.getByText(/Folders: 2 selected/)).toBeInTheDocument();
  });

  it('requires confirmation before submit', () => {
    render(
      <OrderReview
        data={mockOrderData}
        onSubmit={mockOnSubmit}
        onSaveDraft={mockOnSaveDraft}
        onBack={mockOnBack}
      />,
      { wrapper: createWrapper() }
    );

    const submitButton = screen.getByRole('button', { name: /Submit Order/i });
    expect(submitButton).toBeDisabled();

    const confirmCheckbox = screen.getByRole('checkbox');
    fireEvent.click(confirmCheckbox);

    expect(submitButton).toBeEnabled();
  });

  it('calls save draft handler', () => {
    render(
      <OrderReview
        data={mockOrderData}
        onSubmit={mockOnSubmit}
        onSaveDraft={mockOnSaveDraft}
        onBack={mockOnBack}
      />,
      { wrapper: createWrapper() }
    );

    const saveDraftButton = screen.getByRole('button', { name: /Save as Draft/i });
    fireEvent.click(saveDraftButton);

    expect(ordersApi.saveDraft).toHaveBeenCalledWith('contract-1', mockOrderData);
    expect(mockOnSaveDraft).toHaveBeenCalled();
  });

  it('calls back handler', () => {
    render(
      <OrderReview
        data={mockOrderData}
        onSubmit={mockOnSubmit}
        onSaveDraft={mockOnSaveDraft}
        onBack={mockOnBack}
      />,
      { wrapper: createWrapper() }
    );

    const backButton = screen.getByRole('button', { name: /Back/i });
    fireEvent.click(backButton);

    expect(mockOnBack).toHaveBeenCalled();
  });

  it('submits order successfully', async () => {
    const mockOrderResponse = {
      id: 'order-123',
      code: 'EM-2025-TC001-001',
      name: 'Test Order',
      contractId: 'contract-1',
      templateId: 'template-1',
      status: 'provisioning',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    (ordersApi.create as any).mockResolvedValue(mockOrderResponse);
    (ordersApi.provision as any).mockResolvedValue({ 
      taskId: 'task-123', 
      correlationId: 'corr-123' 
    });

    render(
      <OrderReview
        data={mockOrderData}
        onSubmit={mockOnSubmit}
        onSaveDraft={mockOnSaveDraft}
        onBack={mockOnBack}
      />,
      { wrapper: createWrapper() }
    );

    // Confirm order
    const confirmCheckbox = screen.getByRole('checkbox');
    fireEvent.click(confirmCheckbox);

    // Submit order
    const submitButton = screen.getByRole('button', { name: /Submit Order/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(ordersApi.create).toHaveBeenCalledWith(
        expect.objectContaining({
          contractId: 'contract-1',
          name: 'Test Order',
          code: 'EM-2025-TC001-001',
          templateId: 'template-1',
        })
      );
    });

    await waitFor(() => {
      expect(ordersApi.provision).toHaveBeenCalledWith('order-123');
      expect(ordersApi.deleteDraft).toHaveBeenCalledWith('contract-1');
      expect(mockOnSubmit).toHaveBeenCalled();
    });
  });

  it('displays error on submission failure', async () => {
    const mockError = new Error('Failed to create order');
    (mockError as any).correlationId = 'error-corr-123';
    (ordersApi.create as any).mockRejectedValue(mockError);

    render(
      <OrderReview
        data={mockOrderData}
        onSubmit={mockOnSubmit}
        onSaveDraft={mockOnSaveDraft}
        onBack={mockOnBack}
      />,
      { wrapper: createWrapper() }
    );

    // Confirm and submit
    const confirmCheckbox = screen.getByRole('checkbox');
    fireEvent.click(confirmCheckbox);

    const submitButton = screen.getByRole('button', { name: /Submit Order/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      const errorMessages = screen.getAllByText('Failed to create order');
      expect(errorMessages.length).toBeGreaterThan(0);
      expect(screen.getByText(/error-corr-123/)).toBeInTheDocument();
    });
  });

  it('displays urgent order type correctly', () => {
    const urgentOrderData = {
      ...mockOrderData,
      orderType: 'urgent' as const,
    };

    render(
      <OrderReview
        data={urgentOrderData}
        onSubmit={mockOnSubmit}
        onSaveDraft={mockOnSaveDraft}
        onBack={mockOnBack}
      />,
      { wrapper: createWrapper() }
    );

    expect(screen.getByText('Urgent')).toBeInTheDocument();
  });

  it('handles partner with expiry date', () => {
    const dataWithExpiry = {
      ...mockOrderData,
      partners: [
        {
          ...mockOrderData.partners[0],
          expiryDate: new Date('2025-06-30'),
        },
      ],
    };

    render(
      <OrderReview
        data={dataWithExpiry}
        onSubmit={mockOnSubmit}
        onSaveDraft={mockOnSaveDraft}
        onBack={mockOnBack}
      />,
      { wrapper: createWrapper() }
    );

    expect(screen.getByText(/Expires:/)).toBeInTheDocument();
  });
});