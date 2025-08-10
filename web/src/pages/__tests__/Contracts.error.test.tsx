import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { BrowserRouter } from 'react-router-dom';
import Contracts from '../Contracts';
import { contractsApi } from '../../services/api/contracts';
import { useAuth } from '../../hooks/useAuth';

// Mock modules
vi.mock('../../services/api/contracts', () => ({
  contractsApi: {
    getAll: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    getUserContracts: vi.fn()
  }
}));
vi.mock('../../hooks/useAuth');

const createQueryClient = () => new QueryClient({
  defaultOptions: {
    queries: { retry: false },
    mutations: { retry: false }
  }
});

const renderContractsPage = () => {
  const queryClient = createQueryClient();
  return render(
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <FluentProvider theme={webLightTheme}>
          <Contracts />
        </FluentProvider>
      </QueryClientProvider>
    </BrowserRouter>
  );
};

describe.skip('Contracts Error Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock authenticated user
    vi.mocked(useAuth).mockReturnValue({
      user: {
        id: 'user-001',
        email: 'user@example.com',
        name: 'Test User',
        roles: ['NEU_Admin']
      },
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      getAccessToken: vi.fn()
    });
  });

  it('should display correlation ID in errors', async () => {
    const correlationId = 'abc-123-def-456';
    const error = {
      response: {
        status: 500,
        data: { detail: 'Internal server error' },
        headers: { 'x-correlation-id': correlationId }
      }
    };
    
    vi.mocked(contractsApi.getAll).mockRejectedValue(error);

    renderContractsPage();

    await waitFor(() => {
      expect(screen.getByText(/error loading contracts/i)).toBeInTheDocument();
      expect(screen.getByText(new RegExp(correlationId))).toBeInTheDocument();
    });
  });

  it('should retry transient failures', async () => {
    let attemptCount = 0;
    
    // First two attempts fail, third succeeds
    vi.mocked(contractsApi.getAll).mockImplementation(async () => {
      attemptCount++;
      if (attemptCount < 3) {
        throw new Error('Network error');
      }
      return {
        items: [],
        total: 0,
        page: 1,
        pageSize: 10,
        totalPages: 0
      };
    });

    renderContractsPage();

    // Should show error after initial failures
    await waitFor(() => {
      expect(screen.getByText(/error loading contracts/i)).toBeInTheDocument();
    });

    // Click retry button
    const retryButton = screen.getByRole('button', { name: /retry/i });
    await userEvent.click(retryButton);

    // Should eventually succeed
    await waitFor(() => {
      expect(screen.getByText(/no contracts found/i)).toBeInTheDocument();
    });

    // Verify multiple attempts were made
    expect(attemptCount).toBeGreaterThanOrEqual(2);
  });

  it('should not retry 4xx errors', async () => {
    let attemptCount = 0;
    
    const error = {
      response: {
        status: 403,
        data: { detail: 'Forbidden' }
      }
    };
    
    vi.mocked(contractsApi.getAll).mockImplementation(async () => {
      attemptCount++;
      throw error;
    });

    renderContractsPage();

    await waitFor(() => {
      expect(screen.getByText(/forbidden/i)).toBeInTheDocument();
    });

    // Should not retry 4xx errors
    expect(attemptCount).toBe(1);
  });

  it('should handle rate limiting (429) with retry', async () => {
    let attemptCount = 0;
    const retryAfter = '2';
    
    vi.mocked(contractsApi.getAll).mockImplementation(async () => {
      attemptCount++;
      if (attemptCount === 1) {
        const error: any = new Error('Rate limited');
        error.response = {
          status: 429,
          headers: { 'retry-after': retryAfter },
          data: { detail: 'Too many requests' }
        };
        throw error;
      }
      return {
        items: [],
        total: 0,
        page: 1,
        pageSize: 10,
        totalPages: 0
      };
    });

    vi.useFakeTimers();

    renderContractsPage();

    // Should show rate limit error
    await waitFor(() => {
      expect(screen.getByText(/too many requests/i)).toBeInTheDocument();
    });

    // Fast forward past retry-after time
    vi.advanceTimersByTime(2000);

    // Click retry
    const retryButton = screen.getByRole('button', { name: /retry/i });
    await userEvent.click(retryButton);

    // Should succeed after retry
    await waitFor(() => {
      expect(screen.getByText(/no contracts found/i)).toBeInTheDocument();
    });

    expect(attemptCount).toBe(2);

    vi.useRealTimers();
  });

  it('should handle network errors', async () => {
    const networkError = new Error('Network error');
    networkError.message = 'ERR_NETWORK';
    
    vi.mocked(contractsApi.getAll).mockRejectedValue(networkError);

    renderContractsPage();

    await waitFor(() => {
      expect(screen.getByText(/network error/i)).toBeInTheDocument();
      expect(screen.getByText(/check your internet connection/i)).toBeInTheDocument();
    });

    // Should show retry button
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('should handle timeout errors', async () => {
    const timeoutError = new Error('Request timeout');
    timeoutError.code = 'ECONNABORTED';
    
    vi.mocked(contractsApi.getAll).mockRejectedValue(timeoutError);

    renderContractsPage();

    await waitFor(() => {
      expect(screen.getByText(/request timeout/i)).toBeInTheDocument();
      expect(screen.getByText(/operation took too long/i)).toBeInTheDocument();
    });
  });

  it('should handle validation errors from API', async () => {
    const validationError = {
      response: {
        status: 422,
        data: {
          detail: 'Validation error',
          errors: [
            { field: 'page', message: 'Must be positive integer' },
            { field: 'pageSize', message: 'Must be between 1 and 100' }
          ]
        }
      }
    };
    
    vi.mocked(contractsApi.getAll).mockRejectedValue(validationError);

    renderContractsPage();

    await waitFor(() => {
      expect(screen.getByText(/validation error/i)).toBeInTheDocument();
      expect(screen.getByText(/must be positive integer/i)).toBeInTheDocument();
      expect(screen.getByText(/must be between 1 and 100/i)).toBeInTheDocument();
    });
  });

  it('should handle unauthorized (401) errors', async () => {
    const unauthorizedError = {
      response: {
        status: 401,
        data: { detail: 'Authentication required' }
      }
    };
    
    vi.mocked(contractsApi.getAll).mockRejectedValue(unauthorizedError);

    renderContractsPage();

    await waitFor(() => {
      expect(screen.getByText(/authentication required/i)).toBeInTheDocument();
      expect(screen.getByText(/please log in again/i)).toBeInTheDocument();
    });

    // Should offer to re-authenticate
    const loginButton = screen.getByRole('button', { name: /log in/i });
    expect(loginButton).toBeInTheDocument();
  });

  it('should handle forbidden (403) errors', async () => {
    const forbiddenError = {
      response: {
        status: 403,
        data: { detail: 'Insufficient permissions' }
      }
    };
    
    vi.mocked(contractsApi.getAll).mockRejectedValue(forbiddenError);

    renderContractsPage();

    await waitFor(() => {
      expect(screen.getByText(/insufficient permissions/i)).toBeInTheDocument();
      expect(screen.getByText(/don't have permission/i)).toBeInTheDocument();
    });
  });

  it('should handle partial data loading failures', async () => {
    // Initial load succeeds
    vi.mocked(contractsApi.getAll).mockResolvedValueOnce({
      items: [
        {
          id: 1,
          contractNumber: 'C001',
          name: 'Test Contract',
          clientName: 'Client A',
          status: 'active',
          startDate: '2025-01-01',
          endDate: '2025-12-31',
          createdAt: '2025-01-01T00:00:00Z',
          updatedAt: '2025-01-01T00:00:00Z'
        }
      ],
      total: 1,
      page: 1,
      pageSize: 10,
      totalPages: 1
    });

    renderContractsPage();

    await waitFor(() => {
      expect(screen.getByText('C001')).toBeInTheDocument();
    });

    // Subsequent refresh fails
    vi.mocked(contractsApi.getAll).mockRejectedValueOnce(
      new Error('Failed to refresh')
    );

    // Click refresh button
    const refreshButton = screen.getByRole('button', { name: /refresh/i });
    await userEvent.click(refreshButton);

    // Should show error toast but keep existing data
    await waitFor(() => {
      expect(screen.getByText(/failed to refresh/i)).toBeInTheDocument();
      expect(screen.getByText('C001')).toBeInTheDocument(); // Data still visible
    });
  });

  it('should handle delete operation errors', async () => {
    // Setup initial data
    vi.mocked(contractsApi.getAll).mockResolvedValue({
      items: [{
        id: 1,
        contractNumber: 'C001',
        name: 'Test Contract',
        clientName: 'Client A',
        status: 'active',
        startDate: '2025-01-01',
        endDate: '2025-12-31',
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z'
      }],
      total: 1,
      page: 1,
      pageSize: 10,
      totalPages: 1
    });

    // Mock delete failure
    vi.mocked(contractsApi.delete).mockRejectedValue({
      response: {
        status: 409,
        data: { detail: 'Cannot delete contract with active orders' }
      }
    });

    renderContractsPage();

    await waitFor(() => {
      expect(screen.getByText('C001')).toBeInTheDocument();
    });

    // Click delete button
    const deleteButton = screen.getByRole('button', { name: /delete/i });
    await userEvent.click(deleteButton);

    // Confirm deletion
    await waitFor(() => {
      const confirmButton = screen.getByRole('button', { name: /confirm/i });
      expect(confirmButton).toBeInTheDocument();
    });

    const confirmButton = screen.getByRole('button', { name: /confirm/i });
    await userEvent.click(confirmButton);

    // Should show error message
    await waitFor(() => {
      expect(screen.getByText(/cannot delete contract with active orders/i)).toBeInTheDocument();
    });

    // Contract should still be visible
    expect(screen.getByText('C001')).toBeInTheDocument();
  });

  it('should handle create operation errors', async () => {
    vi.mocked(contractsApi.getAll).mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      pageSize: 10,
      totalPages: 0
    });

    // Mock create failure
    vi.mocked(contractsApi.create).mockRejectedValue({
      response: {
        status: 409,
        data: { detail: 'Contract number already exists' }
      }
    });

    renderContractsPage();

    await waitFor(() => {
      const newButton = screen.getByRole('button', { name: /new contract/i });
      expect(newButton).toBeInTheDocument();
    });

    // Open create dialog
    const newButton = screen.getByRole('button', { name: /new contract/i });
    await userEvent.click(newButton);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    // Fill form
    const numberInput = screen.getByLabelText(/contract number/i);
    const nameInput = screen.getByLabelText(/contract name/i);
    
    await userEvent.type(numberInput, 'C001');
    await userEvent.type(nameInput, 'Test Contract');

    // Submit form
    const saveButton = screen.getByRole('button', { name: /save/i });
    await userEvent.click(saveButton);

    // Should show error
    await waitFor(() => {
      expect(screen.getByText(/contract number already exists/i)).toBeInTheDocument();
    });

    // Dialog should remain open
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('should recover from error boundary catches', async () => {
    // Simulate a rendering error
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    
    // Mock a contract that will cause a render error
    vi.mocked(contractsApi.getAll).mockResolvedValue({
      items: [{
        id: 1,
        contractNumber: null as any, // Invalid data that might cause error
        name: 'Test Contract',
        clientName: 'Client A',
        status: 'active',
        startDate: '2025-01-01',
        endDate: '2025-12-31',
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z'
      }],
      total: 1,
      page: 1,
      pageSize: 10,
      totalPages: 1
    });

    renderContractsPage();

    // Should show error boundary fallback
    await waitFor(() => {
      expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    });

    // Should offer recovery option
    const reloadButton = screen.getByRole('button', { name: /reload page/i });
    expect(reloadButton).toBeInTheDocument();

    consoleError.mockRestore();
  });

  it('should handle expired token with refresh', async () => {
    let tokenExpired = true;
    
    vi.mocked(contractsApi.getAll).mockImplementation(async () => {
      if (tokenExpired) {
        tokenExpired = false; // Simulate token refresh
        const error: any = new Error('Token expired');
        error.response = {
          status: 401,
          data: { detail: 'Token expired', code: 'TOKEN_EXPIRED' }
        };
        throw error;
      }
      return {
        items: [],
        total: 0,
        page: 1,
        pageSize: 10,
        totalPages: 0
      };
    });

    renderContractsPage();

    // Should automatically retry after token refresh
    await waitFor(() => {
      expect(screen.getByText(/no contracts found/i)).toBeInTheDocument();
    }, { timeout: 3000 });

    // Verify retry happened
    expect(contractsApi.getAll).toHaveBeenCalledTimes(2);
  });
});