import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { GuestInviteForm } from '../GuestInviteForm';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';

vi.mock('@/services/api', () => ({
  api: {
    inviteGuest: vi.fn(),
    getGuests: vi.fn(),
    post: vi.fn(),
    get: vi.fn(),
  },
}));

describe('GuestInviteForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders all form fields', () => {
    render(
      <FluentProvider theme={webLightTheme}>
        <GuestInviteForm />
      </FluentProvider>
    );
    
    expect(screen.getByText('Invite Guest User')).toBeInTheDocument();
    expect(screen.getByLabelText(/Email Address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Display Name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Partner Company/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Role/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Custom Message/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Send Invitation/i })).toBeInTheDocument();
  });

  it('validates email format', async () => {
    render(
      <FluentProvider theme={webLightTheme}>
        <GuestInviteForm />
      </FluentProvider>
    );
    
    const emailInput = screen.getByLabelText(/Email Address/i);
    const submitButton = screen.getByRole('button', { name: /Send Invitation/i });
    
    fireEvent.change(emailInput, { target: { value: 'invalid-email' } });
    fireEvent.click(submitButton);
    
    await waitFor(() => {
      expect(screen.getByText('Please enter a valid email address')).toBeInTheDocument();
    });
  });

  it('requires display name', async () => {
    render(
      <FluentProvider theme={webLightTheme}>
        <GuestInviteForm />
      </FluentProvider>
    );
    
    const emailInput = screen.getByLabelText(/Email Address/i);
    const submitButton = screen.getByRole('button', { name: /Send Invitation/i });
    
    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.click(submitButton);
    
    await waitFor(() => {
      expect(screen.getByText('Display name is required')).toBeInTheDocument();
    });
  });

  it('requires partner company selection', async () => {
    render(
      <FluentProvider theme={webLightTheme}>
        <GuestInviteForm />
      </FluentProvider>
    );
    
    const emailInput = screen.getByLabelText(/Email Address/i);
    const displayNameInput = screen.getByLabelText(/Display Name/i);
    const submitButton = screen.getByRole('button', { name: /Send Invitation/i });
    
    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.change(displayNameInput, { target: { value: 'Test User' } });
    fireEvent.click(submitButton);
    
    await waitFor(() => {
      expect(screen.getByText('Please select a partner company')).toBeInTheDocument();
    });
  });

  it('submits form with valid data', async () => {
    const { api } = await import('@/services/api');
    const mockResponse = { id: '123', email: 'test@example.com' };
    vi.mocked(api.inviteGuest).mockResolvedValueOnce(mockResponse);
    
    const onSuccess = vi.fn();
    render(
      <FluentProvider theme={webLightTheme}>
        <GuestInviteForm onSuccess={onSuccess} />
      </FluentProvider>
    );
    
    const emailInput = screen.getByLabelText(/Email Address/i);
    const displayNameInput = screen.getByLabelText(/Display Name/i);
    const partnerSelect = screen.getByLabelText(/Partner Company/i);
    const roleSelect = screen.getByLabelText(/Role/i);
    const submitButton = screen.getByRole('button', { name: /Send Invitation/i });
    
    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.change(displayNameInput, { target: { value: 'Test User' } });
    fireEvent.change(partnerSelect, { target: { value: 'partner1' } });
    fireEvent.change(roleSelect, { target: { value: 'partner_expert' } });
    fireEvent.click(submitButton);
    
    await waitFor(() => {
      expect(api.inviteGuest).toHaveBeenCalledWith({
        email: 'test@example.com',
        display_name: 'Test User',
        partner_company_id: 'partner1',
        role: 'partner_expert',
        custom_message: '',
      });
      expect(screen.getByText(/Guest invitation sent successfully/i)).toBeInTheDocument();
    });
    
    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalled();
    }, { timeout: 3000 });
  });

  it('handles API errors', async () => {
    const { api } = await import('@/services/api');
    const errorMessage = 'Failed to send invitation';
    vi.mocked(api.inviteGuest).mockRejectedValueOnce({
      response: { data: { detail: errorMessage } },
    });
    
    render(
      <FluentProvider theme={webLightTheme}>
        <GuestInviteForm />
      </FluentProvider>
    );
    
    const emailInput = screen.getByLabelText(/Email Address/i);
    const displayNameInput = screen.getByLabelText(/Display Name/i);
    const partnerSelect = screen.getByLabelText(/Partner Company/i);
    const submitButton = screen.getByRole('button', { name: /Send Invitation/i });
    
    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.change(displayNameInput, { target: { value: 'Test User' } });
    fireEvent.change(partnerSelect, { target: { value: 'partner1' } });
    fireEvent.click(submitButton);
    
    await waitFor(() => {
      expect(screen.getByText(errorMessage)).toBeInTheDocument();
    });
  });

  it('disables submit button during submission', async () => {
    const { api } = await import('@/services/api');
    vi.mocked(api.inviteGuest).mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100)));
    
    render(
      <FluentProvider theme={webLightTheme}>
        <GuestInviteForm />
      </FluentProvider>
    );
    
    const emailInput = screen.getByLabelText(/Email Address/i);
    const displayNameInput = screen.getByLabelText(/Display Name/i);
    const partnerSelect = screen.getByLabelText(/Partner Company/i);
    const submitButton = screen.getByRole('button', { name: /Send Invitation/i });
    
    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.change(displayNameInput, { target: { value: 'Test User' } });
    fireEvent.change(partnerSelect, { target: { value: 'partner1' } });
    fireEvent.click(submitButton);
    
    expect(submitButton).toBeDisabled();
    expect(screen.getByText(/Sending Invitation.../i)).toBeInTheDocument();
  });

  it('calls onCancel when cancel button is clicked', () => {
    const onCancel = vi.fn();
    render(<GuestInviteForm onCancel={onCancel} />);
    
    const cancelButton = screen.getByRole('button', { name: /Cancel/i });
    fireEvent.click(cancelButton);
    
    expect(onCancel).toHaveBeenCalled();
  });
});