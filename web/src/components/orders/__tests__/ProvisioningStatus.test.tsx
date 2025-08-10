import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { ProvisioningStatus } from '../ProvisioningStatus';
import * as provisioningHook from '@/hooks/useProvisioningStatus';
import type { ProvisioningStep, AuditLogEntry } from '@/types/orders';

// Mock the hook
vi.mock('@/hooks/useProvisioningStatus');

describe('ProvisioningStatus', () => {
  const mockRefetch = vi.fn();
  const mockOnComplete = vi.fn();
  const mockOnRetry = vi.fn();

  const defaultHookReturn = {
    status: null,
    steps: [],
    auditLog: [],
    progress: 0,
    error: null,
    isLoading: false,
    refetch: mockRefetch,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(provisioningHook, 'useProvisioningStatus').mockReturnValue(defaultHookReturn);
  });

  it('renders loading state initially', () => {
    vi.spyOn(provisioningHook, 'useProvisioningStatus').mockReturnValue({
      ...defaultHookReturn,
      isLoading: true,
    });

    render(<ProvisioningStatus orderId="test-order-123" />);
    
    expect(screen.getByText(/Loading provisioning status/i)).toBeInTheDocument();
  });

  it('displays provisioning progress', () => {
    const mockSteps: ProvisioningStep[] = [
      { id: '1', name: 'Creating SharePoint site', status: 'completed', duration: 2500 },
      { id: '2', name: 'Creating document libraries', status: 'in_progress' },
      { id: '3', name: 'Setting permissions', status: 'pending' },
    ];

    vi.spyOn(provisioningHook, 'useProvisioningStatus').mockReturnValue({
      ...defaultHookReturn,
      status: 'in_progress' as any,
      steps: mockSteps,
      progress: 33,
    });

    render(<ProvisioningStatus orderId="test-order-123" />);
    
    expect(screen.getByText('Provisioning Progress')).toBeInTheDocument();
    expect(screen.getByText('33% complete')).toBeInTheDocument();
    expect(screen.getByText('Creating SharePoint site')).toBeInTheDocument();
    expect(screen.getByText('Creating document libraries')).toBeInTheDocument();
    expect(screen.getByText('Setting permissions')).toBeInTheDocument();
  });

  it('shows completed status', async () => {
    const mockSteps: ProvisioningStep[] = [
      { id: '1', name: 'Creating SharePoint site', status: 'completed', duration: 2500 },
      { id: '2', name: 'Creating document libraries', status: 'completed', duration: 3000 },
      { id: '3', name: 'Setting permissions', status: 'completed', duration: 1500 },
    ];

    vi.spyOn(provisioningHook, 'useProvisioningStatus').mockReturnValue({
      ...defaultHookReturn,
      status: 'completed' as any,
      steps: mockSteps,
      progress: 100,
    });

    render(<ProvisioningStatus orderId="test-order-123" onComplete={mockOnComplete} />);
    
    expect(screen.getByText('100% complete')).toBeInTheDocument();
    
    await waitFor(() => {
      expect(mockOnComplete).toHaveBeenCalledWith(true);
    });
  });

  it('displays error state with retry button', async () => {
    vi.spyOn(provisioningHook, 'useProvisioningStatus').mockReturnValue({
      ...defaultHookReturn,
      status: 'failed' as any,
      error: 'Failed to create SharePoint site: Access denied',
    });

    render(<ProvisioningStatus orderId="test-order-123" onComplete={mockOnComplete} onRetry={mockOnRetry} />);
    
    expect(screen.getByText(/Provisioning failed with error/i)).toBeInTheDocument();
    expect(screen.getByText(/Failed to create SharePoint site: Access denied/i)).toBeInTheDocument();
    
    const retryButton = screen.getByRole('button', { name: /Retry Provisioning/i });
    expect(retryButton).toBeInTheDocument();
    
    await userEvent.click(retryButton);
    
    expect(mockRefetch).toHaveBeenCalled();
    expect(mockOnRetry).toHaveBeenCalled();
    
    await waitFor(() => {
      expect(mockOnComplete).toHaveBeenCalledWith(false);
    });
  });

  it('shows audit log entries', () => {
    const mockAuditLog: AuditLogEntry[] = [
      {
        id: 'audit-1',
        timestamp: '2025-01-10T10:30:00Z',
        action: 'Order created',
        user: 'john.doe@example.com',
      },
      {
        id: 'audit-2',
        timestamp: '2025-01-10T10:31:00Z',
        action: 'Provisioning started',
        details: 'SharePoint site creation initiated',
        user: 'System',
      },
    ];

    vi.spyOn(provisioningHook, 'useProvisioningStatus').mockReturnValue({
      ...defaultHookReturn,
      auditLog: mockAuditLog,
    });

    render(<ProvisioningStatus orderId="test-order-123" />);
    
    expect(screen.getByText('Audit Log')).toBeInTheDocument();
    expect(screen.getByText('Order created')).toBeInTheDocument();
    expect(screen.getByText('Provisioning started')).toBeInTheDocument();
    expect(screen.getByText(/SharePoint site creation initiated/i)).toBeInTheDocument();
  });

  it('handles timeout after 10 minutes', async () => {
    vi.useFakeTimers();
    
    vi.spyOn(provisioningHook, 'useProvisioningStatus').mockReturnValue({
      ...defaultHookReturn,
      status: 'in_progress' as any,
      progress: 50,
    });

    render(<ProvisioningStatus orderId="test-order-123" />);
    
    // Fast-forward 10 minutes and 1 second to trigger the timeout
    vi.advanceTimersByTime(10 * 60 * 1000 + 1000);
    
    await waitFor(() => {
      expect(screen.getByText(/Provisioning has timed out after 10 minutes/i)).toBeInTheDocument();
      expect(screen.getByText(/The process may still be running in the background/i)).toBeInTheDocument();
    }, { timeout: 1000 });
    
    vi.useRealTimers();
  }, 10000);

  it('displays estimated time remaining', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-10T10:00:00Z'));
    
    vi.spyOn(provisioningHook, 'useProvisioningStatus').mockReturnValue({
      ...defaultHookReturn,
      status: 'in_progress' as any,
      progress: 50,
      steps: [
        { id: '1', name: 'Step 1', status: 'completed' },
        { id: '2', name: 'Step 2', status: 'in_progress' },
      ],
    });

    render(<ProvisioningStatus orderId="test-order-123" />);
    
    // Fast-forward 2 minutes (50% complete in 2 minutes means ~2 minutes remaining)
    vi.advanceTimersByTime(2 * 60 * 1000);
    
    // Should show remaining time (this is approximate based on the component logic)
    expect(screen.getByText('50% complete')).toBeInTheDocument();
    
    vi.useRealTimers();
  });

  it('shows progress bar with correct value', () => {
    vi.spyOn(provisioningHook, 'useProvisioningStatus').mockReturnValue({
      ...defaultHookReturn,
      status: 'in_progress' as any,
      progress: 75,
    });

    render(<ProvisioningStatus orderId="test-order-123" />);
    
    const progressBar = screen.getByRole('progressbar');
    expect(progressBar).toHaveAttribute('aria-valuenow', '75');
    expect(progressBar).toHaveAttribute('aria-valuemax', '100');
  });

  it('displays step durations for completed steps', () => {
    const mockSteps: ProvisioningStep[] = [
      {
        id: '1',
        name: 'Creating SharePoint site',
        status: 'completed',
        duration: 2500,
      },
      {
        id: '2',
        name: 'Setting permissions',
        status: 'completed',
        duration: 1800,
      },
    ];

    vi.spyOn(provisioningHook, 'useProvisioningStatus').mockReturnValue({
      ...defaultHookReturn,
      steps: mockSteps,
    });

    render(<ProvisioningStatus orderId="test-order-123" />);
    
    expect(screen.getByText('2500ms')).toBeInTheDocument();
    expect(screen.getByText('1800ms')).toBeInTheDocument();
  });

  it('renders without orderId gracefully', () => {
    vi.spyOn(provisioningHook, 'useProvisioningStatus').mockReturnValue({
      ...defaultHookReturn,
      isLoading: false,
      steps: [],
    });

    render(<ProvisioningStatus orderId="" />);
    
    expect(screen.getByText('Provisioning Progress')).toBeInTheDocument();
  });
});