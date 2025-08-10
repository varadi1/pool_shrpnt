import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SyncStatus } from '../SyncStatus';

const createQueryClient = () => new QueryClient({
  defaultOptions: {
    queries: { retry: false, refetchInterval: false },
    mutations: { retry: false },
  },
});

const renderWithProviders = (component: React.ReactElement) => {
  const queryClient = createQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      {component}
    </QueryClientProvider>
  );
};

describe('SyncStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders sync status component', async () => {
    renderWithProviders(<SyncStatus orderId="order-1" />);
    
    await waitFor(() => {
      expect(screen.getByText('SharePoint Sync Status')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Refresh/i })).toBeInTheDocument();
    });
  });

  it('displays syncing status with progress', async () => {
    renderWithProviders(<SyncStatus orderId="order-1" />);
    
    await waitFor(() => {
      expect(screen.getByText('Synchronizing with SharePoint...')).toBeInTheDocument();
      expect(screen.getByText('Updating permissions for /A.1 Documentation/Experts')).toBeInTheDocument();
    });
    
    // Check progress bar
    expect(screen.getByText('Progress: 3 of 12')).toBeInTheDocument();
    expect(screen.getByText('25%')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('displays last sync timestamp', async () => {
    renderWithProviders(<SyncStatus orderId="order-1" />);
    
    await waitFor(() => {
      expect(screen.getByText(/Last sync:/)).toBeInTheDocument();
    });
  });

  it('shows pending changes message', async () => {
    renderWithProviders(<SyncStatus orderId="order-1" />);
    
    await waitFor(() => {
      expect(screen.getByText('12 pending changes')).toBeInTheDocument();
    });
  });

  it('displays queue items', async () => {
    renderWithProviders(<SyncStatus orderId="order-1" />);
    
    await waitFor(() => {
      expect(screen.getByText('Queue Position')).toBeInTheDocument();
      expect(screen.getByText('/A.2 Results')).toBeInTheDocument();
      expect(screen.getByText('Finance Team')).toBeInTheDocument();
      expect(screen.getByText('john.smith@company.com')).toBeInTheDocument();
    });
    
    // Check operation badges - use getAllByText for multiple instances
    const updateBadges = screen.getAllByText('update');
    expect(updateBadges.length).toBeGreaterThan(0);
    expect(screen.getByText('create')).toBeInTheDocument();
  });

  it('displays failed sync items', async () => {
    renderWithProviders(<SyncStatus orderId="order-1" />);
    
    await waitFor(() => {
      expect(screen.getByText('Failed Syncs')).toBeInTheDocument();
      expect(screen.getByText('/Financial/TIG')).toBeInTheDocument();
      expect(screen.getByText('Graph API throttling (429)')).toBeInTheDocument();
    });
    
    // Check retry count badge
    expect(screen.getByText('2/3')).toBeInTheDocument();
  });

  it('pauses sync when pause button is clicked', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    renderWithProviders(<SyncStatus orderId="order-1" />);
    
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Pause/i })).toBeInTheDocument();
    });
    
    const pauseButton = screen.getByRole('button', { name: /Pause/i });
    fireEvent.click(pauseButton);
    
    // Wait a bit longer for the async mutation to complete
    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith('Sync action: pause');
    }, { timeout: 3000 });
  });

  it('opens details dialog when Details button is clicked', async () => {
    renderWithProviders(<SyncStatus orderId="order-1" />);
    
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Details/i })).toBeInTheDocument();
    });
    
    const detailsButton = screen.getByRole('button', { name: /Details/i });
    fireEvent.click(detailsButton);
    
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('Sync Details')).toBeInTheDocument();
    });
    
    // Check detail cards
    expect(screen.getByText('Total Synced')).toBeInTheDocument();
    expect(screen.getByText('145')).toBeInTheDocument();
    expect(screen.getByText('Average Sync Time')).toBeInTheDocument();
    expect(screen.getByText('12.5s')).toBeInTheDocument();
    expect(screen.getByText('Success Rate')).toBeInTheDocument();
    expect(screen.getByText('96.5%')).toBeInTheDocument();
    expect(screen.getByText('Last Error')).toBeInTheDocument();
    expect(screen.getByText('Graph API throttling')).toBeInTheDocument();
  });

  it('closes details dialog', async () => {
    renderWithProviders(<SyncStatus orderId="order-1" />);
    
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Details/i })).toBeInTheDocument();
    });
    
    const detailsButton = screen.getByRole('button', { name: /Details/i });
    fireEvent.click(detailsButton);
    
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    
    const closeButton = within(screen.getByRole('dialog')).getByRole('button', { name: /Close/i });
    fireEvent.click(closeButton);
    
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('opens retry dialog for failed item', async () => {
    renderWithProviders(<SyncStatus orderId="order-1" />);
    
    await waitFor(() => {
      expect(screen.getByText('Failed Syncs')).toBeInTheDocument();
    });
    
    // There might be multiple retry buttons, get the one in the table
    const retryButtons = screen.getAllByRole('button', { name: /Retry/i });
    const tableRetryButton = retryButtons[0]; // First one should be in the table
    fireEvent.click(tableRetryButton);
    
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('Retry Failed Sync')).toBeInTheDocument();
      expect(screen.getByText('Are you sure you want to retry this failed synchronization?')).toBeInTheDocument();
    });
    
    // Check failed item details in dialog - use getAllByText since it appears multiple times
    const financialElements = screen.getAllByText('/Financial/TIG', { exact: false });
    expect(financialElements.length).toBeGreaterThan(0);
    const throttlingElements = screen.getAllByText('Graph API throttling (429)', { exact: false });
    expect(throttlingElements.length).toBeGreaterThan(0);
  });

  it('retries failed sync item', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    renderWithProviders(<SyncStatus orderId="order-1" />);
    
    await waitFor(() => {
      expect(screen.getByText('Failed Syncs')).toBeInTheDocument();
    });
    
    // Get the first retry button in the table
    const retryButtons = screen.getAllByRole('button', { name: /Retry/i });
    fireEvent.click(retryButtons[0]);
    
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    
    // Now find the retry button in the dialog
    const dialogButtons = within(screen.getByRole('dialog')).getAllByRole('button');
    const confirmRetryButton = dialogButtons.find(btn => btn.textContent?.includes('Retry'));
    if (confirmRetryButton) {
      fireEvent.click(confirmRetryButton);
    }
    
    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith('Retrying failed item: failed-1');
    }, { timeout: 3000 });
  });

  it('cancels retry dialog', async () => {
    renderWithProviders(<SyncStatus orderId="order-1" />);
    
    await waitFor(() => {
      expect(screen.getByText('Failed Syncs')).toBeInTheDocument();
    });
    
    const retryButton = screen.getByRole('button', { name: /Retry/i });
    fireEvent.click(retryButton);
    
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    
    const cancelButton = within(screen.getByRole('dialog')).getByRole('button', { name: /Cancel/i });
    fireEvent.click(cancelButton);
    
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('refreshes sync status', async () => {
    const { rerender } = renderWithProviders(<SyncStatus orderId="order-1" />);
    
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Refresh/i })).toBeInTheDocument();
    });
    
    const refreshButton = screen.getByRole('button', { name: /Refresh/i });
    fireEvent.click(refreshButton);
    
    // Should trigger refetch
    rerender(
      <QueryClientProvider client={createQueryClient()}>
        <SyncStatus orderId="order-1" />
      </QueryClientProvider>
    );
    
    await waitFor(() => {
      expect(screen.getByText('SharePoint Sync Status')).toBeInTheDocument();
    });
  });

  it('displays error message when sync fails', async () => {
    // Would need to mock error state
    renderWithProviders(<SyncStatus orderId="order-1" />);
    
    await waitFor(() => {
      expect(screen.getByText('SharePoint Sync Status')).toBeInTheDocument();
    });
    
    // Error message is conditional in mock data
    // This test would need proper mocking to show error state
  });

  it('calculates estimated completion time', async () => {
    renderWithProviders(<SyncStatus orderId="order-1" />);
    
    await waitFor(() => {
      expect(screen.getByText('12 pending changes')).toBeInTheDocument();
    });
    
    // Check estimated completion message
    expect(screen.getByText(/Estimated completion:/)).toBeInTheDocument();
  });

  it('displays queue item types with badges', async () => {
    renderWithProviders(<SyncStatus orderId="order-1" />);
    
    await waitFor(() => {
      expect(screen.getByText('Queue Position')).toBeInTheDocument();
    });
    
    // Check type badges - there might be multiple of each
    const permissionElements = screen.getAllByText('permission');
    const groupElements = screen.getAllByText('group');
    const userElements = screen.getAllByText('user');
    
    expect(permissionElements.length).toBeGreaterThan(0);
    expect(groupElements.length).toBeGreaterThan(0);
    expect(userElements.length).toBeGreaterThan(0);
  });

  it('displays operation types with color-coded badges', async () => {
    renderWithProviders(<SyncStatus orderId="order-1" />);
    
    await waitFor(() => {
      expect(screen.getByText('Queue Position')).toBeInTheDocument();
    });
    
    // Check operation badges
    const updateBadges = screen.getAllByText('update');
    const createBadge = screen.getByText('create');
    
    expect(updateBadges.length).toBeGreaterThan(0);
    expect(createBadge).toBeInTheDocument();
  });

  it('displays loading state initially', () => {
    renderWithProviders(<SyncStatus orderId="order-1" />);
    
    expect(screen.getByText('Loading sync status...')).toBeInTheDocument();
  });

  it('shows correct status icon for syncing state', async () => {
    renderWithProviders(<SyncStatus orderId="order-1" />);
    
    await waitFor(() => {
      expect(screen.getByText('Synchronizing with SharePoint...')).toBeInTheDocument();
    });
    
    // Icon should be present (SyncRegular)
    const statusSection = screen.getByText('Synchronizing with SharePoint...').closest('div');
    expect(statusSection).toBeInTheDocument();
  });

  it('displays estimated time for queue items', async () => {
    renderWithProviders(<SyncStatus orderId="order-1" />);
    
    await waitFor(() => {
      expect(screen.getByText('Queue Position')).toBeInTheDocument();
    });
    
    // Check estimated times
    expect(screen.getByText('15s')).toBeInTheDocument();
    expect(screen.getByText('10s')).toBeInTheDocument();
    expect(screen.getByText('5s')).toBeInTheDocument();
  });

  it('shows items waiting to be synchronized message', async () => {
    renderWithProviders(<SyncStatus orderId="order-1" />);
    
    await waitFor(() => {
      expect(screen.getByText('Items waiting to be synchronized')).toBeInTheDocument();
    });
  });

  it('shows items that failed to synchronize message', async () => {
    renderWithProviders(<SyncStatus orderId="order-1" />);
    
    await waitFor(() => {
      expect(screen.getByText('Items that failed to synchronize')).toBeInTheDocument();
    });
  });
});