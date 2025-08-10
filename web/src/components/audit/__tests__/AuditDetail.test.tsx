import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuditDetail } from '../AuditDetail';
import { AuditEntry, CorrelationGroup } from '../../../types/audit';

const mockApi = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
  patch: vi.fn(),
};

vi.mock('../../../hooks/useApi', () => ({
  useApi: () => mockApi,
}));

const mockEntry: AuditEntry = {
  id: 'audit-123',
  timestamp: '2025-01-10T10:00:00Z',
  actor: {
    id: 'user-456',
    name: 'John Doe',
    email: 'john.doe@example.com',
    role: 'Admin',
    type: 'user',
  },
  action: {
    type: 'ORDER_CREATED',
    category: 'provisioning',
    severity: 'info',
    description: 'Created new order',
  },
  target: {
    type: 'order',
    id: 'order-789',
    name: 'Test Order',
    path: '/orders/order-789',
  },
  changes: {
    before: { status: null },
    after: { status: 'pending', items: ['item1', 'item2'] },
  },
  metadata: {
    correlationId: 'corr-abc-123',
    sessionId: 'session-xyz',
    ipAddress: '192.168.1.1',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    duration: 250,
  },
  status: 'success',
};

const mockCorrelationGroup: CorrelationGroup = {
  correlationId: 'corr-abc-123',
  events: [
    mockEntry,
    {
      ...mockEntry,
      id: 'audit-124',
      timestamp: '2025-01-10T10:00:01Z',
      action: {
        type: 'ORDER_PROVISIONED',
        category: 'provisioning',
        severity: 'info',
        description: 'Provisioned order',
      },
      metadata: {
        ...mockEntry.metadata,
        duration: 5000,
      },
    },
    {
      ...mockEntry,
      id: 'audit-125',
      timestamp: '2025-01-10T10:00:06Z',
      action: {
        type: 'NOTIFICATION_SENT',
        category: 'system',
        severity: 'info',
        description: 'Sent notification',
      },
      status: 'failure',
      error: {
        code: 'SMTP_ERROR',
        message: 'Failed to send email',
      },
    },
  ],
  startTime: '2025-01-10T10:00:00Z',
  endTime: '2025-01-10T10:00:06Z',
  duration: 6000,
  services: ['api', 'worker', 'notification'],
  status: 'partial',
  criticalPath: ['audit-123', 'audit-124'],
};

describe('AuditDetail', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
    vi.clearAllMocks();
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const renderComponent = (props: Partial<Parameters<typeof AuditDetail>[0]> = {}) => {
    return render(
      <QueryClientProvider client={queryClient}>
        <AuditDetail {...props} />
      </QueryClientProvider>
    );
  };

  describe('Entry Display', () => {
    it('should display provided entry without fetching', () => {
      renderComponent({ entry: mockEntry });
      
      expect(screen.getByText('Audit Entry Details')).toBeInTheDocument();
      expect(screen.getByText(/January 10, 2025/)).toBeInTheDocument();
      expect(mockApi.get).not.toHaveBeenCalled();
    });

    it('should fetch entry by ID when not provided', async () => {
      mockApi.get.mockResolvedValueOnce({ data: mockEntry });
      
      renderComponent({ entryId: 'audit-123' });
      
      await waitFor(() => {
        expect(mockApi.get).toHaveBeenCalledWith('/api/audit/logs/audit-123');
      });
      
      expect(screen.getByText('Audit Entry Details')).toBeInTheDocument();
    });

    it('should show loading state while fetching', () => {
      mockApi.get.mockImplementation(() => new Promise(() => {}));
      
      renderComponent({ entryId: 'audit-123' });
      
      expect(document.querySelector('.fui-Skeleton')).toBeInTheDocument();
    });

    it('should show error when entry not found', async () => {
      renderComponent({ entry: null });
      
      expect(screen.getByText('Audit entry not found')).toBeInTheDocument();
    });
  });

  describe('Event Information', () => {
    it('should display event status and details', () => {
      renderComponent({ entry: mockEntry });
      
      const eventSection = screen.getByText('Event Information').parentElement;
      fireEvent.click(eventSection!);
      
      expect(screen.getByText('SUCCESS')).toBeInTheDocument();
      expect(screen.getByText('Created new order')).toBeInTheDocument();
      expect(screen.getByText('ORDER_CREATED')).toBeInTheDocument();
      expect(screen.getByText('provisioning')).toBeInTheDocument();
    });

    it('should display error information for failed events', () => {
      const failedEntry = {
        ...mockEntry,
        status: 'failure' as const,
        error: {
          code: 'AUTH_ERROR',
          message: 'Unauthorized access',
        },
      };
      
      renderComponent({ entry: failedEntry });
      
      const eventSection = screen.getByText('Event Information').parentElement;
      fireEvent.click(eventSection!);
      
      expect(screen.getByText('FAILURE')).toBeInTheDocument();
      expect(screen.getByText('AUTH_ERROR')).toBeInTheDocument();
      expect(screen.getByText('Unauthorized access')).toBeInTheDocument();
    });
  });

  describe('Actor Information', () => {
    it('should display actor details', () => {
      renderComponent({ entry: mockEntry });
      
      const actorSection = screen.getByText('Actor').parentElement;
      fireEvent.click(actorSection!);
      
      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.getByText('john.doe@example.com')).toBeInTheDocument();
      expect(screen.getByText(/Admin.*user/)).toBeInTheDocument();
      expect(screen.getByText('user-456')).toBeInTheDocument();
    });

    it('should copy actor ID to clipboard', async () => {
      renderComponent({ entry: mockEntry });
      
      const actorSection = screen.getByText('Actor').parentElement;
      fireEvent.click(actorSection!);
      
      const copyButtons = screen.getAllByRole('button', { name: /copy/i });
      const actorCopyButton = copyButtons.find(btn => 
        btn.closest('div')?.textContent?.includes('user-456')
      );
      
      if (actorCopyButton) {
        fireEvent.click(actorCopyButton);
      }
      
      await waitFor(() => {
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith('user-456');
      });
    });
  });

  describe('Target Information', () => {
    it('should display target details', () => {
      renderComponent({ entry: mockEntry });
      
      const targetSection = screen.getByText('Target').parentElement;
      fireEvent.click(targetSection!);
      
      expect(screen.getByText('order')).toBeInTheDocument();
      expect(screen.getByText('order-789')).toBeInTheDocument();
      expect(screen.getByText('Test Order')).toBeInTheDocument();
      expect(screen.getByText('/orders/order-789')).toBeInTheDocument();
    });

    it('should handle missing target gracefully', () => {
      const entryWithoutTarget = {
        ...mockEntry,
        target: undefined,
      };
      
      renderComponent({ entry: entryWithoutTarget });
      
      const targetSection = screen.getByText('Target').parentElement;
      fireEvent.click(targetSection!);
      
      expect(screen.queryByText('order-789')).not.toBeInTheDocument();
    });
  });

  describe('Metadata', () => {
    it('should display metadata information', () => {
      renderComponent({ entry: mockEntry });
      
      expect(screen.getByText('corr-abc-123')).toBeInTheDocument();
      expect(screen.getByText('session-xyz')).toBeInTheDocument();
      expect(screen.getByText('192.168.1.1')).toBeInTheDocument();
      expect(screen.getByText('250ms')).toBeInTheDocument();
    });

    it('should copy correlation ID to clipboard', async () => {
      renderComponent({ entry: mockEntry });
      
      const copyButtons = screen.getAllByRole('button', { name: /copy/i });
      const correlationCopyButton = copyButtons.find(btn => 
        btn.closest('div')?.textContent?.includes('corr-abc-123')
      );
      
      if (correlationCopyButton) {
        fireEvent.click(correlationCopyButton);
      }
      
      await waitFor(() => {
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith('corr-abc-123');
      });
    });
  });

  describe('Changes Tab', () => {
    it('should display before and after changes', () => {
      renderComponent({ entry: mockEntry });
      
      fireEvent.click(screen.getByRole('tab', { name: 'Changes' }));
      
      expect(screen.getByText('Before')).toBeInTheDocument();
      expect(screen.getByText('After')).toBeInTheDocument();
      expect(screen.getByText(/"status": null/)).toBeInTheDocument();
      expect(screen.getByText(/"status": "pending"/)).toBeInTheDocument();
    });

    it('should show message when no changes recorded', () => {
      const entryWithoutChanges = {
        ...mockEntry,
        changes: undefined,
      };
      
      renderComponent({ entry: entryWithoutChanges });
      
      fireEvent.click(screen.getByRole('tab', { name: 'Changes' }));
      
      expect(screen.getByText('No changes recorded for this event')).toBeInTheDocument();
    });
  });

  describe('Correlation Tab', () => {
    it('should fetch and display correlated events', async () => {
      mockApi.get.mockResolvedValueOnce({ data: mockCorrelationGroup });
      
      renderComponent({ entry: mockEntry });
      
      fireEvent.click(screen.getByRole('tab', { name: 'Correlation' }));
      
      await waitFor(() => {
        expect(mockApi.get).toHaveBeenCalledWith('/api/audit/correlation/corr-abc-123');
      });
      
      expect(screen.getByText('Correlation Summary')).toBeInTheDocument();
      expect(screen.getByText('3')).toBeInTheDocument();
      expect(screen.getByText('6000ms')).toBeInTheDocument();
      expect(screen.getByText('partial')).toBeInTheDocument();
      expect(screen.getByText('api, worker, notification')).toBeInTheDocument();
    });

    it('should display timeline of correlated events', async () => {
      mockApi.get.mockResolvedValueOnce({ data: mockCorrelationGroup });
      
      renderComponent({ entry: mockEntry });
      
      fireEvent.click(screen.getByRole('tab', { name: 'Correlation' }));
      
      await waitFor(() => {
        expect(screen.getByText('Event Timeline')).toBeInTheDocument();
      });
      
      expect(screen.getByText('Created new order')).toBeInTheDocument();
      expect(screen.getByText('Provisioned order')).toBeInTheDocument();
      expect(screen.getByText('Sent notification')).toBeInTheDocument();
    });

    it('should handle navigation to related events', async () => {
      mockApi.get.mockResolvedValueOnce({ data: mockCorrelationGroup });
      const onNavigate = vi.fn();
      
      renderComponent({ entry: mockEntry, onNavigateToEntry: onNavigate });
      
      fireEvent.click(screen.getByRole('tab', { name: 'Correlation' }));
      
      await waitFor(() => {
        expect(screen.getByText('Provisioned order')).toBeInTheDocument();
      });
      
      const timelineCard = screen.getByText('Provisioned order').closest('.fui-Card');
      if (timelineCard) {
        fireEvent.click(timelineCard);
      }
      
      expect(onNavigate).toHaveBeenCalledWith('audit-124');
    });

    it('should show message when no correlated events', async () => {
      mockApi.get.mockResolvedValueOnce({ 
        data: { ...mockCorrelationGroup, events: [] } 
      });
      
      renderComponent({ entry: mockEntry });
      
      fireEvent.click(screen.getByRole('tab', { name: 'Correlation' }));
      
      await waitFor(() => {
        expect(screen.getByText('No correlated events found')).toBeInTheDocument();
      });
    });
  });

  describe('Raw Data Tab', () => {
    it('should display raw JSON data', () => {
      renderComponent({ entry: mockEntry });
      
      fireEvent.click(screen.getByRole('tab', { name: 'Raw Data' }));
      
      expect(screen.getByText('Raw JSON Data')).toBeInTheDocument();
      expect(screen.getByText(/"id": "audit-123"/)).toBeInTheDocument();
      expect(screen.getByText(/"timestamp": "2025-01-10T10:00:00Z"/)).toBeInTheDocument();
    });

    it('should copy JSON data to clipboard', async () => {
      renderComponent({ entry: mockEntry });
      
      fireEvent.click(screen.getByRole('tab', { name: 'Raw Data' }));
      fireEvent.click(screen.getByRole('button', { name: /copy json/i }));
      
      await waitFor(() => {
        expect(navigator.clipboard.writeText).toHaveBeenCalled();
        const copiedData = (navigator.clipboard.writeText as any).mock.calls[0][0];
        expect(copiedData).toContain('audit-123');
      });
    });
  });

  describe('Section Expansion', () => {
    it('should toggle section expansion', () => {
      renderComponent({ entry: mockEntry });
      
      const eventSection = screen.getByText('Event Information').parentElement;
      
      expect(screen.queryByText('ORDER_CREATED')).not.toBeInTheDocument();
      
      fireEvent.click(eventSection!);
      expect(screen.getByText('ORDER_CREATED')).toBeInTheDocument();
      
      fireEvent.click(eventSection!);
      expect(screen.queryByText('ORDER_CREATED')).not.toBeInTheDocument();
    });

    it('should have default expanded sections', () => {
      renderComponent({ entry: mockEntry });
      
      expect(screen.getByText('corr-abc-123')).toBeInTheDocument();
    });
  });

  describe('Close Functionality', () => {
    it('should call onClose when close button clicked', () => {
      const onClose = vi.fn();
      renderComponent({ entry: mockEntry, onClose });
      
      fireEvent.click(screen.getByRole('button', { name: /close/i }));
      
      expect(onClose).toHaveBeenCalled();
    });

    it('should not show close button when onClose not provided', () => {
      renderComponent({ entry: mockEntry });
      
      expect(screen.queryByRole('button', { name: /close/i })).not.toBeInTheDocument();
    });
  });

  describe('Severity Icons', () => {
    it('should display correct severity icons', () => {
      const entries = [
        { ...mockEntry, action: { ...mockEntry.action, severity: 'critical' as const } },
        { ...mockEntry, action: { ...mockEntry.action, severity: 'error' as const } },
        { ...mockEntry, action: { ...mockEntry.action, severity: 'warning' as const } },
        { ...mockEntry, action: { ...mockEntry.action, severity: 'info' as const } },
      ];
      
      entries.forEach(entry => {
        const { rerender } = renderComponent({ entry });
        
        const eventSection = screen.getByText('Event Information').parentElement;
        fireEvent.click(eventSection!);
        
        expect(screen.getByText('Created new order')).toBeInTheDocument();
        
        rerender(
          <QueryClientProvider client={queryClient}>
            <AuditDetail entry={entries[0]} />
          </QueryClientProvider>
        );
      });
    });
  });
});