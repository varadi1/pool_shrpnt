import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ManualLockPanel } from './ManualLockPanel';
import { apiService } from '../../services/api.service';

vi.mock('../../services/api.service', () => ({
  apiService: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

const mockLockState = {
  experts: 'unlocked',
  deliverables: 'locked',
  hasManualLock: false,
  manualLockReason: null,
  manualLockBy: null,
  manualLockAt: null,
};

const mockManualLockResponse = {
  success: true,
  correlationId: 'test-correlation-id',
  appliedAt: '2025-01-15T10:00:00Z',
  message: 'Manual lock applied successfully',
};

describe('ManualLockPanel', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    vi.clearAllMocks();
    window.showToast = vi.fn();
  });

  const renderComponent = (props = {}) => {
    return render(
      <QueryClientProvider client={queryClient}>
        <ManualLockPanel emId="test-em-id" emName="Test EM" {...props} />
      </QueryClientProvider>
    );
  };

  it('should render the component with initial state', async () => {
    vi.mocked(apiService.get).mockResolvedValue({ data: mockLockState });

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Manual Lock Control')).toBeInTheDocument();
      expect(screen.getByText('Managing locks for: Test EM')).toBeInTheDocument();
    });
  });

  it('should display loading state while fetching lock state', () => {
    vi.mocked(apiService.get).mockImplementation(() => new Promise(() => {}));

    renderComponent();

    expect(screen.getByText('Loading lock state...')).toBeInTheDocument();
  });

  it('should display current lock state for selected folder group', async () => {
    vi.mocked(apiService.get).mockResolvedValue({ data: mockLockState });

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Current Status:')).toBeInTheDocument();
      expect(screen.getByText('Unlocked')).toBeInTheDocument();
    });
  });

  it('should display manual lock information when active', async () => {
    const lockStateWithManual = {
      ...mockLockState,
      hasManualLock: true,
      manualLockReason: 'Security review required',
      manualLockBy: 'PM User',
      manualLockAt: '2025-01-15T09:00:00Z',
    };
    vi.mocked(apiService.get).mockResolvedValue({ data: lockStateWithManual });

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Manual Lock Active')).toBeInTheDocument();
      expect(screen.getByText(/Security review required/)).toBeInTheDocument();
      expect(screen.getByText(/PM User/)).toBeInTheDocument();
    });
  });

  it('should render folder group radio buttons', async () => {
    vi.mocked(apiService.get).mockResolvedValue({ data: mockLockState });

    renderComponent();

    await waitFor(() => {
      expect(screen.getByLabelText('Szakértők (Experts)')).toBeInTheDocument();
      expect(screen.getByLabelText('Eredménytermékek (Deliverables)')).toBeInTheDocument();
    });
  });

  it('should render reason textarea field', async () => {
    vi.mocked(apiService.get).mockResolvedValue({ data: mockLockState });

    renderComponent();

    await waitFor(() => {
      const reasonField = screen.getByPlaceholderText(/Enter the reason/);
      expect(reasonField).toBeInTheDocument();
    });
  });

  it('should render lock and unlock buttons', async () => {
    vi.mocked(apiService.get).mockResolvedValue({ data: mockLockState });

    renderComponent();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Apply Lock/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Remove Lock/i })).toBeInTheDocument();
    });
  });

  it('should disable buttons when reason is empty', async () => {
    vi.mocked(apiService.get).mockResolvedValue({ data: mockLockState });

    renderComponent();

    await waitFor(() => {
      const lockButton = screen.getByRole('button', { name: /Apply Lock/i });
      const unlockButton = screen.getByRole('button', { name: /Remove Lock/i });
      
      expect(lockButton).toBeDisabled();
      expect(unlockButton).toBeDisabled();
    });
  });

  it('should validate reason field - empty reason', async () => {
    vi.mocked(apiService.get).mockResolvedValue({ data: mockLockState });

    renderComponent();

    await waitFor(() => {
      const lockButton = screen.getByRole('button', { name: /Apply Lock/i });
      expect(lockButton).toBeInTheDocument();
    });

    const reasonField = screen.getByPlaceholderText(/Enter the reason/);
    fireEvent.change(reasonField, { target: { value: 'a' } });

    await waitFor(() => {
      const lockButton = screen.getByRole('button', { name: /Apply Lock/i });
      expect(lockButton).not.toBeDisabled();
    });

    fireEvent.change(reasonField, { target: { value: '' } });

    const lockButton = screen.getByRole('button', { name: /Apply Lock/i });
    expect(lockButton).toBeDisabled();
  });

  it('should validate reason field - too short', async () => {
    vi.mocked(apiService.get).mockResolvedValue({ data: mockLockState });

    renderComponent();

    await waitFor(() => {
      const lockButton = screen.getByRole('button', { name: /Apply Lock/i });
      expect(lockButton).toBeInTheDocument();
    });

    const reasonField = screen.getByPlaceholderText(/Enter the reason/);
    fireEvent.change(reasonField, { target: { value: 'Test' } });

    const lockButton = screen.getByRole('button', { name: /Apply Lock/i });
    fireEvent.click(lockButton);

    await waitFor(() => {
      expect(screen.getByText(/minimum 10 characters/)).toBeInTheDocument();
    });
  });

  it('should apply manual lock successfully', async () => {
    vi.mocked(apiService.get).mockResolvedValue({ data: mockLockState });
    vi.mocked(apiService.post).mockResolvedValue({ data: mockManualLockResponse });

    renderComponent();

    await waitFor(() => {
      const reasonField = screen.getByPlaceholderText(/Enter the reason/);
      expect(reasonField).toBeInTheDocument();
    });

    const reasonField = screen.getByPlaceholderText(/Enter the reason/);
    fireEvent.change(reasonField, { target: { value: 'Security audit required for this EM' } });

    const lockButton = screen.getByRole('button', { name: /Apply Lock/i });
    fireEvent.click(lockButton);

    await waitFor(() => {
      expect(apiService.post).toHaveBeenCalledWith('/api/locks/manual', {
        emId: 'test-em-id',
        scope: 'experts',
        action: 'lock',
        reason: 'Security audit required for this EM',
      });
      expect(window.showToast).toHaveBeenCalledWith({
        title: 'Manual lock applied',
        content: 'Manual lock applied successfully',
        intent: 'success',
      });
    });
  });

  it('should apply manual unlock successfully', async () => {
    vi.mocked(apiService.get).mockResolvedValue({ data: mockLockState });
    vi.mocked(apiService.post).mockResolvedValue({ data: mockManualLockResponse });

    renderComponent();

    await waitFor(() => {
      const reasonField = screen.getByPlaceholderText(/Enter the reason/);
      expect(reasonField).toBeInTheDocument();
    });

    const reasonField = screen.getByPlaceholderText(/Enter the reason/);
    fireEvent.change(reasonField, { target: { value: 'Audit completed, access restored' } });

    const unlockButton = screen.getByRole('button', { name: /Remove Lock/i });
    fireEvent.click(unlockButton);

    await waitFor(() => {
      expect(apiService.post).toHaveBeenCalledWith('/api/locks/manual', {
        emId: 'test-em-id',
        scope: 'experts',
        action: 'unlock',
        reason: 'Audit completed, access restored',
      });
    });
  });

  it('should handle API errors with correlation ID', async () => {
    vi.mocked(apiService.get).mockResolvedValue({ data: mockLockState });
    vi.mocked(apiService.post).mockRejectedValue({
      response: {
        data: {
          detail: 'Insufficient permissions',
          correlationId: 'error-correlation-id',
        },
      },
    });

    renderComponent();

    await waitFor(() => {
      const reasonField = screen.getByPlaceholderText(/Enter the reason/);
      expect(reasonField).toBeInTheDocument();
    });

    const reasonField = screen.getByPlaceholderText(/Enter the reason/);
    fireEvent.change(reasonField, { target: { value: 'Test reason for lock' } });

    const lockButton = screen.getByRole('button', { name: /Apply Lock/i });
    fireEvent.click(lockButton);

    await waitFor(() => {
      expect(window.showToast).toHaveBeenCalledWith({
        title: 'Operation failed',
        content: 'Insufficient permissions (Correlation ID: error-correlation-id)',
        intent: 'error',
      });
    });
  });

  it('should switch between folder groups', async () => {
    const multiStateLock = {
      experts: 'unlocked',
      deliverables: 'locked',
      hasManualLock: false,
    };
    vi.mocked(apiService.get).mockResolvedValue({ data: multiStateLock });

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Unlocked')).toBeInTheDocument();
    });

    const deliverableRadio = screen.getByLabelText('Eredménytermékek (Deliverables)');
    fireEvent.click(deliverableRadio);

    await waitFor(() => {
      expect(screen.getByText('Locked')).toBeInTheDocument();
    });
  });

  it('should refetch lock state after successful operation', async () => {
    vi.mocked(apiService.get).mockResolvedValue({ data: mockLockState });
    vi.mocked(apiService.post).mockResolvedValue({ data: mockManualLockResponse });

    renderComponent();

    await waitFor(() => {
      const reasonField = screen.getByPlaceholderText(/Enter the reason/);
      expect(reasonField).toBeInTheDocument();
    });

    const reasonField = screen.getByPlaceholderText(/Enter the reason/);
    fireEvent.change(reasonField, { target: { value: 'Valid reason for testing' } });

    const lockButton = screen.getByRole('button', { name: /Apply Lock/i });
    fireEvent.click(lockButton);

    await waitFor(() => {
      expect(apiService.get).toHaveBeenCalledTimes(2);
    });
  });

  it('should clear reason field after successful operation', async () => {
    vi.mocked(apiService.get).mockResolvedValue({ data: mockLockState });
    vi.mocked(apiService.post).mockResolvedValue({ data: mockManualLockResponse });

    renderComponent();

    await waitFor(() => {
      const reasonField = screen.getByPlaceholderText(/Enter the reason/);
      expect(reasonField).toBeInTheDocument();
    });

    const reasonField = screen.getByPlaceholderText(/Enter the reason/) as HTMLTextAreaElement;
    fireEvent.change(reasonField, { target: { value: 'Test reason to be cleared' } });
    expect(reasonField.value).toBe('Test reason to be cleared');

    const lockButton = screen.getByRole('button', { name: /Apply Lock/i });
    fireEvent.click(lockButton);

    await waitFor(() => {
      expect(reasonField.value).toBe('');
    });
  });
});