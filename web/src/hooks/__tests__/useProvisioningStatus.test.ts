import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useProvisioningStatus } from '../useProvisioningStatus';
import * as ordersApi from '@/services/api/orders';
import type { ProvisioningStep, AuditLogEntry } from '@/types/orders';

// Mock the API module
vi.mock('@/services/api/orders');

describe('useProvisioningStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fetches initial status on mount', async () => {
    const mockStatus = {
      orderId: 'test-123',
      status: 'in_progress' as const,
      progress: 50,
      steps: [
        { id: '1', name: 'Step 1', status: 'completed' as const },
        { id: '2', name: 'Step 2', status: 'in_progress' as const },
      ],
      correlationId: 'corr-123',
    };

    const mockAuditLog = {
      entries: [
        { id: '1', timestamp: '2025-01-10T10:00:00Z', action: 'Order created' },
      ],
      totalCount: 1,
    };

    vi.spyOn(ordersApi, 'getOrderStatus').mockResolvedValue(mockStatus);
    vi.spyOn(ordersApi, 'getOrderAuditLog').mockResolvedValue(mockAuditLog);

    const { result } = renderHook(() => useProvisioningStatus('test-123'));

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.status).toBe('in_progress');
    expect(result.current.steps).toEqual(mockStatus.steps);
    expect(result.current.auditLog).toEqual(mockAuditLog.entries);
    expect(result.current.progress).toBe(50);
    expect(result.current.error).toBeNull();
  });

  it('polls for updates at regular intervals', async () => {
    const mockStatus = {
      orderId: 'test-123',
      status: 'in_progress' as const,
      steps: [],
      correlationId: 'corr-123',
    };

    const mockAuditLog = {
      entries: [],
      totalCount: 0,
    };

    const getStatusSpy = vi.spyOn(ordersApi, 'getOrderStatus').mockResolvedValue(mockStatus);
    const getAuditSpy = vi.spyOn(ordersApi, 'getOrderAuditLog').mockResolvedValue(mockAuditLog);

    renderHook(() => useProvisioningStatus('test-123'));

    // Initial fetch
    await waitFor(() => {
      expect(getStatusSpy).toHaveBeenCalledTimes(1);
      expect(getAuditSpy).toHaveBeenCalledTimes(1);
    });

    // Advance timer by 2 seconds (polling interval)
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    await waitFor(() => {
      expect(getStatusSpy).toHaveBeenCalledTimes(2);
      expect(getAuditSpy).toHaveBeenCalledTimes(2);
    });

    // Advance timer by another 2 seconds
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    await waitFor(() => {
      expect(getStatusSpy).toHaveBeenCalledTimes(3);
      expect(getAuditSpy).toHaveBeenCalledTimes(3);
    });
  });

  it('stops polling when status is completed', async () => {
    const mockStatus = {
      orderId: 'test-123',
      status: 'completed' as const,
      progress: 100,
      steps: [
        { id: '1', name: 'Step 1', status: 'completed' as const },
      ],
      correlationId: 'corr-123',
    };

    const mockAuditLog = {
      entries: [],
      totalCount: 0,
    };

    const getStatusSpy = vi.spyOn(ordersApi, 'getOrderStatus').mockResolvedValue(mockStatus);
    vi.spyOn(ordersApi, 'getOrderAuditLog').mockResolvedValue(mockAuditLog);

    const { result } = renderHook(() => useProvisioningStatus('test-123'));

    await waitFor(() => {
      expect(result.current.status).toBe('completed');
    });

    // Clear the call count
    getStatusSpy.mockClear();

    // Advance timer by 4 seconds (2 polling intervals)
    act(() => {
      vi.advanceTimersByTime(4000);
    });

    // Should not have polled again after completion
    expect(getStatusSpy).not.toHaveBeenCalled();
  });

  it('stops polling when status is failed', async () => {
    const mockStatus = {
      orderId: 'test-123',
      status: 'failed' as const,
      progress: 30,
      steps: [],
      correlationId: 'corr-123',
      error: 'Access denied',
    };

    const mockAuditLog = {
      entries: [],
      totalCount: 0,
    };

    const getStatusSpy = vi.spyOn(ordersApi, 'getOrderStatus').mockResolvedValue(mockStatus);
    vi.spyOn(ordersApi, 'getOrderAuditLog').mockResolvedValue(mockAuditLog);

    const { result } = renderHook(() => useProvisioningStatus('test-123'));

    await waitFor(() => {
      expect(result.current.status).toBe('failed');
      expect(result.current.error).toBe('Access denied');
    });

    // Clear the call count
    getStatusSpy.mockClear();

    // Advance timer
    act(() => {
      vi.advanceTimersByTime(4000);
    });

    // Should not have polled again after failure
    expect(getStatusSpy).not.toHaveBeenCalled();
  });

  it('handles API errors gracefully', async () => {
    const error = new Error('Network error');
    vi.spyOn(ordersApi, 'getOrderStatus').mockRejectedValue(error);
    vi.spyOn(ordersApi, 'getOrderAuditLog').mockResolvedValue({ entries: [], totalCount: 0 });

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { result } = renderHook(() => useProvisioningStatus('test-123'));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(consoleSpy).toHaveBeenCalledWith('Failed to fetch provisioning status:', error);
    
    consoleSpy.mockRestore();
  });

  it('stops polling after max retries on error', async () => {
    const error = new Error('Network error');
    const getStatusSpy = vi.spyOn(ordersApi, 'getOrderStatus').mockRejectedValue(error);
    vi.spyOn(ordersApi, 'getOrderAuditLog').mockRejectedValue(error);

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { result } = renderHook(() => useProvisioningStatus('test-123'));

    // Wait for initial attempt
    await waitFor(() => {
      expect(getStatusSpy).toHaveBeenCalledTimes(1);
    });

    // Advance timer for retry attempts (3 retries)
    for (let i = 0; i < 3; i++) {
      act(() => {
        vi.advanceTimersByTime(2000);
      });
      
      await waitFor(() => {
        expect(getStatusSpy).toHaveBeenCalledTimes(i + 2);
      });
    }

    // After max retries, should show error
    expect(result.current.error).toBe('Failed to fetch provisioning status. Please refresh the page.');

    // Clear the call count
    getStatusSpy.mockClear();

    // Advance timer - should not poll anymore
    act(() => {
      vi.advanceTimersByTime(4000);
    });

    expect(getStatusSpy).not.toHaveBeenCalled();
    
    consoleSpy.mockRestore();
  });

  it('calculates progress correctly', async () => {
    const mockStatus = {
      orderId: 'test-123',
      status: 'in_progress' as const,
      steps: [
        { id: '1', name: 'Step 1', status: 'completed' as const },
        { id: '2', name: 'Step 2', status: 'completed' as const },
        { id: '3', name: 'Step 3', status: 'in_progress' as const },
        { id: '4', name: 'Step 4', status: 'pending' as const },
      ],
      correlationId: 'corr-123',
    };

    vi.spyOn(ordersApi, 'getOrderStatus').mockResolvedValue(mockStatus);
    vi.spyOn(ordersApi, 'getOrderAuditLog').mockResolvedValue({ entries: [], totalCount: 0 });

    const { result } = renderHook(() => useProvisioningStatus('test-123'));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // 2 completed out of 4 steps = 50%
    expect(result.current.progress).toBe(50);
  });

  it('refetch restarts polling', async () => {
    const mockStatus = {
      orderId: 'test-123',
      status: 'failed' as const,
      steps: [],
      correlationId: 'corr-123',
      error: 'Initial error',
    };

    const getStatusSpy = vi.spyOn(ordersApi, 'getOrderStatus').mockResolvedValue(mockStatus);
    vi.spyOn(ordersApi, 'getOrderAuditLog').mockResolvedValue({ entries: [], totalCount: 0 });

    const { result } = renderHook(() => useProvisioningStatus('test-123'));

    await waitFor(() => {
      expect(result.current.status).toBe('failed');
    });

    // Clear the call count
    getStatusSpy.mockClear();

    // Update mock to return in_progress
    getStatusSpy.mockResolvedValue({
      ...mockStatus,
      status: 'in_progress',
      error: undefined,
    });

    // Call refetch
    act(() => {
      result.current.refetch();
    });

    await waitFor(() => {
      expect(getStatusSpy).toHaveBeenCalled();
    });

    // Advance timer to verify polling resumed
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    await waitFor(() => {
      expect(getStatusSpy).toHaveBeenCalledTimes(2);
    });
  });

  it('cleans up interval on unmount', async () => {
    const mockStatus = {
      orderId: 'test-123',
      status: 'in_progress' as const,
      steps: [],
      correlationId: 'corr-123',
    };

    vi.spyOn(ordersApi, 'getOrderStatus').mockResolvedValue(mockStatus);
    vi.spyOn(ordersApi, 'getOrderAuditLog').mockResolvedValue({ entries: [], totalCount: 0 });

    const { unmount } = renderHook(() => useProvisioningStatus('test-123'));

    await waitFor(() => {
      expect(ordersApi.getOrderStatus).toHaveBeenCalled();
    });

    // Unmount the hook
    unmount();

    // Clear the call count
    (ordersApi.getOrderStatus as any).mockClear();

    // Advance timer - should not poll after unmount
    act(() => {
      vi.advanceTimersByTime(4000);
    });

    expect(ordersApi.getOrderStatus).not.toHaveBeenCalled();
  });

  it('handles empty orderId gracefully', async () => {
    const getStatusSpy = vi.spyOn(ordersApi, 'getOrderStatus');
    
    const { result } = renderHook(() => useProvisioningStatus(''));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(getStatusSpy).not.toHaveBeenCalled();
    expect(result.current.status).toBeNull();
    expect(result.current.steps).toEqual([]);
    expect(result.current.auditLog).toEqual([]);
  });
});