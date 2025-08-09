import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { GuestList } from '../GuestList';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';

vi.mock('@/services/api', () => ({
  api: {
    getGuests: vi.fn(),
    resendInvitation: vi.fn(),
    updateGuestGroups: vi.fn(),
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
  },
}));

const mockGuests = [
  {
    id: '1',
    email: 'john@partner1.com',
    display_name: 'John Doe',
    partner_company_id: 'partner1',
    partner_company_name: 'Partner Company 1',
    status: 'ACCEPTED',
    invited_at: '2024-01-15T10:00:00Z',
    accepted_at: '2024-01-15T11:00:00Z',
    azure_ad_id: 'azure-123',
    groups: ['group1', 'group2'],
  },
  {
    id: '2',
    email: 'jane@partner2.com',
    display_name: 'Jane Smith',
    partner_company_id: 'partner2',
    partner_company_name: 'Partner Company 2',
    status: 'INVITED',
    invited_at: '2024-01-16T10:00:00Z',
    accepted_at: null,
    azure_ad_id: null,
    groups: [],
  },
  {
    id: '3',
    email: 'expired@partner3.com',
    display_name: 'Expired User',
    partner_company_id: 'partner3',
    partner_company_name: 'Partner Company 3',
    status: 'EXPIRED',
    invited_at: '2023-12-01T10:00:00Z',
    accepted_at: null,
    azure_ad_id: null,
    groups: [],
  },
];

describe('GuestList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders guest list with loading state', () => {
    const { api } = require('@/services/api');
    vi.mocked(api.getGuests).mockImplementation(() => new Promise(() => {}));
    
    render(
      <FluentProvider theme={webLightTheme}>
        <GuestList />
      </FluentProvider>
    );
    
    expect(screen.getByText(/Loading guests.../i)).toBeInTheDocument();
  });

  it('renders guest list with data', async () => {
    const { api } = require('@/services/api');
    vi.mocked(api.getGuests).mockResolvedValueOnce({ items: mockGuests, total: 3, page: 1, page_size: 10 });
    
    render(
      <FluentProvider theme={webLightTheme}>
        <GuestList />
      </FluentProvider>
    );
    
    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.getByText('jane@partner2.com')).toBeInTheDocument();
      expect(screen.getByText('Partner Company 3')).toBeInTheDocument();
    });
  });

  it('displays correct status badges', async () => {
    const { api } = require('@/services/api');
    vi.mocked(api.getGuests).mockResolvedValueOnce({ items: mockGuests, total: 3, page: 1, page_size: 10 });
    
    render(
      <FluentProvider theme={webLightTheme}>
        <GuestList />
      </FluentProvider>
    );
    
    await waitFor(() => {
      expect(screen.getByText('Accepted')).toBeInTheDocument();
      expect(screen.getByText('Invited')).toBeInTheDocument();
      expect(screen.getByText('Expired')).toBeInTheDocument();
    });
  });

  it('filters guests by search term', async () => {
    const { api } = require('@/services/api');
    vi.mocked(api.getGuests).mockResolvedValueOnce({ items: mockGuests, total: 3, page: 1, page_size: 10 });
    
    render(
      <FluentProvider theme={webLightTheme}>
        <GuestList />
      </FluentProvider>
    );
    
    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });
    
    const searchInput = screen.getByPlaceholderText(/Search by name, email, or company/i);
    fireEvent.change(searchInput, { target: { value: 'jane' } });
    
    expect(screen.queryByText('John Doe')).not.toBeInTheDocument();
    expect(screen.getByText('Jane Smith')).toBeInTheDocument();
  });

  it('filters guests by status', async () => {
    const { api } = require('@/services/api');
    vi.mocked(api.getGuests).mockResolvedValueOnce({ items: mockGuests, total: 3, page: 1, page_size: 10 });
    
    render(
      <FluentProvider theme={webLightTheme}>
        <GuestList />
      </FluentProvider>
    );
    
    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });
    
    const statusSelect = screen.getByRole('combobox');
    fireEvent.change(statusSelect, { target: { value: 'ACCEPTED' } });
    
    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.queryByText('Jane Smith')).not.toBeInTheDocument();
    expect(screen.queryByText('Expired User')).not.toBeInTheDocument();
  });

  it('handles refresh button click', async () => {
    const { api } = require('@/services/api');
    vi.mocked(api.getGuests).mockResolvedValueOnce({ items: mockGuests, total: 3, page: 1, page_size: 10 });
    
    render(
      <FluentProvider theme={webLightTheme}>
        <GuestList />
      </FluentProvider>
    );
    
    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });
    
    vi.mocked(api.getGuests).mockResolvedValueOnce({ items: [...mockGuests], total: 3, page: 1, page_size: 10 });
    
    const refreshButton = screen.getByRole('button', { name: /Refresh/i });
    fireEvent.click(refreshButton);
    
    expect(refreshButton).toHaveTextContent('Refreshing...');
    
    await waitFor(() => {
      expect(api.getGuests).toHaveBeenCalledTimes(2);
      expect(refreshButton).toHaveTextContent('Refresh');
    });
  });

  it('handles resend invitation', async () => {
    const { api } = require('@/services/api');
    vi.mocked(api.getGuests).mockResolvedValueOnce({ items: mockGuests, total: 3, page: 1, page_size: 10 });
    vi.mocked(api.resendInvitation).mockResolvedValueOnce({ success: true });
    
    render(
      <FluentProvider theme={webLightTheme}>
        <GuestList />
      </FluentProvider>
    );
    
    await waitFor(() => {
      expect(screen.getByText('Jane Smith')).toBeInTheDocument();
    });
    
    const resendButton = screen.getAllByRole('button', { name: /Resend/i })[0];
    fireEvent.click(resendButton);
    
    await waitFor(() => {
      expect(api.resendInvitation).toHaveBeenCalledWith('2');
      expect(screen.getByText(/Invitation resent successfully/i)).toBeInTheDocument();
    });
  });

  it('handles error when fetching guests', async () => {
    const { api } = require('@/services/api');
    vi.mocked(api.getGuests).mockRejectedValueOnce(new Error('Failed to fetch guests'));
    
    render(
      <FluentProvider theme={webLightTheme}>
        <GuestList />
      </FluentProvider>
    );
    
    await waitFor(() => {
      expect(screen.getByText(/Failed to load guests/i)).toBeInTheDocument();
    });
  });

  it('handles pagination', async () => {
    const { api } = require('@/services/api');
    vi.mocked(api.getGuests).mockResolvedValueOnce({ 
      items: mockGuests, 
      total: 30, 
      page: 1, 
      page_size: 10 
    });
    
    render(
      <FluentProvider theme={webLightTheme}>
        <GuestList />
      </FluentProvider>
    );
    
    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });
    
    // Check if pagination controls are present
    expect(screen.getByRole('button', { name: /Next/i })).toBeInTheDocument();
    expect(screen.getByText(/Page 1 of 3/i)).toBeInTheDocument();
    
    // Click next page
    vi.mocked(api.getGuests).mockResolvedValueOnce({ 
      items: [], 
      total: 30, 
      page: 2, 
      page_size: 10 
    });
    
    const nextButton = screen.getByRole('button', { name: /Next/i });
    fireEvent.click(nextButton);
    
    await waitFor(() => {
      expect(api.getGuests).toHaveBeenCalledWith({ page: 2, page_size: 10 });
    });
  });
});