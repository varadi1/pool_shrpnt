import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ContractSelector } from '../ContractSelector';
import * as contractsApi from '../../../services/api/contracts';

vi.mock('../../../services/api/contracts');

const mockContracts = [
  {
    id: '1',
    number: 'NEU001',
    name: 'Main Contract',
    client: 'Client A',
    status: 'active',
    startDate: '2025-01-01',
    endDate: '2025-12-31'
  },
  {
    id: '2',
    number: 'NEU002',
    name: 'Secondary Contract',
    client: 'Client B',
    status: 'active',
    startDate: '2025-02-01',
    endDate: '2025-11-30'
  },
  {
    id: '3',
    number: 'NEU003',
    name: 'Expired Contract',
    client: 'Client C',
    status: 'expired',
    startDate: '2024-01-01',
    endDate: '2024-12-31'
  }
];

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
};

describe('ContractSelector', () => {
  const mockOnChange = vi.fn();
  const mockOnValidate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state initially', () => {
    vi.mocked(contractsApi.getUserContracts).mockImplementation(() => 
      new Promise(() => {})
    );

    render(
      <ContractSelector
        value={null}
        onChange={mockOnChange}
        onValidate={mockOnValidate}
      />,
      { wrapper: createWrapper() }
    );

    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('renders contracts after loading', async () => {
    vi.mocked(contractsApi.getUserContracts).mockResolvedValue(mockContracts);

    render(
      <ContractSelector
        value={null}
        onChange={mockOnChange}
        onValidate={mockOnValidate}
      />,
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(screen.getByText('Main Contract')).toBeInTheDocument();
      expect(screen.getByText('Secondary Contract')).toBeInTheDocument();
    });
  });

  it('filters contracts based on search input', async () => {
    vi.mocked(contractsApi.getUserContracts).mockResolvedValue(mockContracts);
    const user = userEvent.setup();

    render(
      <ContractSelector
        value={null}
        onChange={mockOnChange}
        onValidate={mockOnValidate}
      />,
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(screen.getByText('Main Contract')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Search contracts...');
    await user.type(searchInput, 'Main');

    expect(screen.getByText('Main Contract')).toBeInTheDocument();
    expect(screen.queryByText('Secondary Contract')).not.toBeInTheDocument();
  });

  it('selects a contract when clicked', async () => {
    vi.mocked(contractsApi.getUserContracts).mockResolvedValue(mockContracts);
    const user = userEvent.setup();

    render(
      <ContractSelector
        value={null}
        onChange={mockOnChange}
        onValidate={mockOnValidate}
      />,
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(screen.getByText('Main Contract')).toBeInTheDocument();
    });

    const contractCard = screen.getByTestId('contract-card-1');
    await user.click(contractCard);

    expect(mockOnChange).toHaveBeenCalledWith({
      contractId: '1',
      contractName: 'Main Contract',
      contractNumber: 'NEU001'
    });
    expect(mockOnValidate).toHaveBeenCalledWith(true);
  });

  it('shows selected state for current contract', async () => {
    vi.mocked(contractsApi.getUserContracts).mockResolvedValue(mockContracts);

    render(
      <ContractSelector
        value={{
          contractId: '1',
          contractName: 'Main Contract',
          contractNumber: 'NEU001'
        }}
        onChange={mockOnChange}
        onValidate={mockOnValidate}
      />,
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      const selectedCard = screen.getByTestId('contract-card-1');
      expect(selectedCard).toHaveAttribute('aria-selected', 'true');
    });
  });

  it('filters out expired contracts by default', async () => {
    vi.mocked(contractsApi.getUserContracts).mockResolvedValue(mockContracts);

    render(
      <ContractSelector
        value={null}
        onChange={mockOnChange}
        onValidate={mockOnValidate}
      />,
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(screen.getByText('Main Contract')).toBeInTheDocument();
      expect(screen.getByText('Secondary Contract')).toBeInTheDocument();
      expect(screen.queryByText('Expired Contract')).not.toBeInTheDocument();
    });
  });

  it('shows expired contracts when filter is toggled', async () => {
    vi.mocked(contractsApi.getUserContracts).mockResolvedValue(mockContracts);
    const user = userEvent.setup();

    render(
      <ContractSelector
        value={null}
        onChange={mockOnChange}
        onValidate={mockOnValidate}
      />,
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(screen.getByText('Main Contract')).toBeInTheDocument();
    });

    const showExpiredCheckbox = screen.getByLabelText('Show expired contracts');
    await user.click(showExpiredCheckbox);

    expect(screen.getByText('Expired Contract')).toBeInTheDocument();
  });

  it('handles API errors gracefully', async () => {
    vi.mocked(contractsApi.getUserContracts).mockRejectedValue(
      new Error('Failed to fetch contracts')
    );

    render(
      <ContractSelector
        value={null}
        onChange={mockOnChange}
        onValidate={mockOnValidate}
      />,
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(screen.getByText(/Failed to load contracts/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    });
  });

  it('retries fetching contracts on error', async () => {
    vi.mocked(contractsApi.getUserContracts)
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce(mockContracts);
    
    const user = userEvent.setup();

    render(
      <ContractSelector
        value={null}
        onChange={mockOnChange}
        onValidate={mockOnValidate}
      />,
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(screen.getByText(/Failed to load contracts/)).toBeInTheDocument();
    });

    const retryButton = screen.getByRole('button', { name: 'Retry' });
    await user.click(retryButton);

    await waitFor(() => {
      expect(screen.getByText('Main Contract')).toBeInTheDocument();
    });
  });

  it('displays contract details in card', async () => {
    vi.mocked(contractsApi.getUserContracts).mockResolvedValue(mockContracts);

    render(
      <ContractSelector
        value={null}
        onChange={mockOnChange}
        onValidate={mockOnValidate}
      />,
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      const contractCard = screen.getByTestId('contract-card-1');
      expect(contractCard).toHaveTextContent('NEU001');
      expect(contractCard).toHaveTextContent('Main Contract');
      expect(contractCard).toHaveTextContent('Client A');
      expect(contractCard).toHaveTextContent('Active');
    });
  });

  it('validates selection on mount if no value', () => {
    vi.mocked(contractsApi.getUserContracts).mockResolvedValue(mockContracts);

    render(
      <ContractSelector
        value={null}
        onChange={mockOnChange}
        onValidate={mockOnValidate}
      />,
      { wrapper: createWrapper() }
    );

    expect(mockOnValidate).toHaveBeenCalledWith(false);
  });

  it('validates selection on mount if value exists', () => {
    vi.mocked(contractsApi.getUserContracts).mockResolvedValue(mockContracts);

    render(
      <ContractSelector
        value={{
          contractId: '1',
          contractName: 'Main Contract',
          contractNumber: 'NEU001'
        }}
        onChange={mockOnChange}
        onValidate={mockOnValidate}
      />,
      { wrapper: createWrapper() }
    );

    expect(mockOnValidate).toHaveBeenCalledWith(true);
  });

  it('supports keyboard navigation', async () => {
    vi.mocked(contractsApi.getUserContracts).mockResolvedValue(mockContracts);
    const user = userEvent.setup();

    render(
      <ContractSelector
        value={null}
        onChange={mockOnChange}
        onValidate={mockOnValidate}
      />,
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(screen.getByText('Main Contract')).toBeInTheDocument();
    });

    const firstCard = screen.getByTestId('contract-card-1');
    firstCard.focus();

    await user.keyboard('{Enter}');

    expect(mockOnChange).toHaveBeenCalledWith({
      contractId: '1',
      contractName: 'Main Contract',
      contractNumber: 'NEU001'
    });
  });

  it('displays empty state when no contracts available', async () => {
    vi.mocked(contractsApi.getUserContracts).mockResolvedValue([]);

    render(
      <ContractSelector
        value={null}
        onChange={mockOnChange}
        onValidate={mockOnValidate}
      />,
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(screen.getByText('No contracts available')).toBeInTheDocument();
      expect(screen.getByText(/You don't have access to any contracts/)).toBeInTheDocument();
    });
  });

  it('respects user role for contract filtering', async () => {
    const roleBasedContracts = [
      { ...mockContracts[0], assignedPM: 'user123' },
      { ...mockContracts[1], assignedPM: 'other456' }
    ];

    vi.mocked(contractsApi.getUserContracts).mockResolvedValue(roleBasedContracts);

    render(
      <ContractSelector
        value={null}
        onChange={mockOnChange}
        onValidate={mockOnValidate}
        userRole="PM"
        userId="user123"
      />,
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(screen.getByText('Main Contract')).toBeInTheDocument();
      expect(screen.queryByText('Secondary Contract')).not.toBeInTheDocument();
    });
  });
});