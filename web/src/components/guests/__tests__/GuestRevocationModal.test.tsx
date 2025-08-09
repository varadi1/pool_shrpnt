import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { GuestRevocationModal } from '../GuestRevocationModal';
import { api } from '@/services/api';

vi.mock('@/services/api', () => ({
  api: {
    post: vi.fn(),
    delete: vi.fn(),
  },
}));

describe('GuestRevocationModal', () => {
  const mockGuest = {
    id: '1',
    email: 'guest@example.com',
    display_name: 'Test Guest',
  };

  const mockMultipleGuests = [
    { id: '1', email: 'guest1@example.com', display_name: 'Guest One' },
    { id: '2', email: 'guest2@example.com', display_name: 'Guest Two' },
    { id: '3', email: 'guest3@example.com', display_name: 'Guest Three' },
  ];

  const defaultProps = {
    open: true,
    onClose: vi.fn(),
    guests: mockGuest,
    onRevocationComplete: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Single Guest Revocation', () => {
    it('should render modal with guest information', () => {
      render(<GuestRevocationModal {...defaultProps} />);

      expect(screen.getByText('Revoke Guest Access')).toBeInTheDocument();
      expect(screen.getByText(/Test Guest/)).toBeInTheDocument();
      expect(screen.getByText(/guest@example.com/)).toBeInTheDocument();
    });

    it('should show warning message about immediate effect', () => {
      render(<GuestRevocationModal {...defaultProps} />);

      expect(screen.getByText(/This action has immediate effect/)).toBeInTheDocument();
      expect(screen.getByText(/Remove the guest from all Azure AD groups/)).toBeInTheDocument();
      expect(screen.getByText(/Revoke all SharePoint and Teams permissions/)).toBeInTheDocument();
    });

    it('should require reason for revocation', async () => {
      render(<GuestRevocationModal {...defaultProps} />);

      const revokeButton = screen.getByRole('button', { name: /Revoke Access/i });
      expect(revokeButton).toBeDisabled();

      const reasonInput = screen.getByPlaceholderText(/provide a reason/i);
      await userEvent.type(reasonInput, 'Contract expired');

      expect(revokeButton).not.toBeDisabled();
    });

    it('should enforce 500 character limit on reason', async () => {
      render(<GuestRevocationModal {...defaultProps} />);

      const reasonInput = screen.getByPlaceholderText(/provide a reason/i);
      const longReason = 'a'.repeat(501);
      
      await userEvent.type(reasonInput, longReason);
      
      expect(screen.getByText('500/500')).toBeInTheDocument();
    });

    it('should call API to revoke single guest', async () => {
      (api.delete as any).mockResolvedValue({ data: { success: true } });

      render(<GuestRevocationModal {...defaultProps} />);

      const reasonInput = screen.getByPlaceholderText(/provide a reason/i);
      await userEvent.type(reasonInput, 'Security violation');

      const revokeButton = screen.getByRole('button', { name: /Revoke Access/i });
      fireEvent.click(revokeButton);

      await waitFor(() => {
        expect(api.delete).toHaveBeenCalledWith('/api/guests/1', {
          data: { reason: 'Security violation' },
        });
        expect(defaultProps.onRevocationComplete).toHaveBeenCalled();
        expect(defaultProps.onClose).toHaveBeenCalled();
      });
    });

    it('should display error message on API failure', async () => {
      (api.delete as any).mockRejectedValue({
        response: { data: { detail: 'Failed to revoke access' } },
      });

      render(<GuestRevocationModal {...defaultProps} />);

      const reasonInput = screen.getByPlaceholderText(/provide a reason/i);
      await userEvent.type(reasonInput, 'Test reason');

      const revokeButton = screen.getByRole('button', { name: /Revoke Access/i });
      fireEvent.click(revokeButton);

      await waitFor(() => {
        expect(screen.getByText('Failed to revoke access')).toBeInTheDocument();
      });
    });
  });

  describe('Bulk Revocation', () => {
    it('should display list of guests to be revoked', () => {
      render(
        <GuestRevocationModal
          {...defaultProps}
          guests={mockMultipleGuests}
        />
      );

      expect(screen.getByText(/You are about to revoke access for 3 guests/)).toBeInTheDocument();
      expect(screen.getByText(/Guest One/)).toBeInTheDocument();
      expect(screen.getByText(/Guest Two/)).toBeInTheDocument();
      expect(screen.getByText(/Guest Three/)).toBeInTheDocument();
    });

    it('should truncate list if more than 5 guests', () => {
      const manyGuests = Array.from({ length: 10 }, (_, i) => ({
        id: `${i}`,
        email: `guest${i}@example.com`,
        display_name: `Guest ${i}`,
      }));

      render(
        <GuestRevocationModal
          {...defaultProps}
          guests={manyGuests}
        />
      );

      expect(screen.getByText(/... and 5 more/)).toBeInTheDocument();
    });

    it('should call bulk revoke API', async () => {
      (api.post as any).mockResolvedValue({ data: { succeeded: 3, failed: 0 } });

      render(
        <GuestRevocationModal
          {...defaultProps}
          guests={mockMultipleGuests}
        />
      );

      const reasonInput = screen.getByPlaceholderText(/provide a reason/i);
      await userEvent.type(reasonInput, 'Partner contract ended');

      const revokeButton = screen.getByRole('button', { name: /Revoke Access \(3\)/i });
      fireEvent.click(revokeButton);

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith('/api/guests/bulk-revoke', {
          guest_ids: ['1', '2', '3'],
          reason: 'Partner contract ended',
        });
        expect(defaultProps.onRevocationComplete).toHaveBeenCalled();
      });
    });
  });

  describe('Modal Behavior', () => {
    it('should close modal when cancel is clicked', () => {
      render(<GuestRevocationModal {...defaultProps} />);

      const cancelButton = screen.getByRole('button', { name: /Cancel/i });
      fireEvent.click(cancelButton);

      expect(defaultProps.onClose).toHaveBeenCalled();
    });

    it('should disable buttons while processing', async () => {
      (api.delete as any).mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100)));

      render(<GuestRevocationModal {...defaultProps} />);

      const reasonInput = screen.getByPlaceholderText(/provide a reason/i);
      await userEvent.type(reasonInput, 'Test');

      const revokeButton = screen.getByRole('button', { name: /Revoke Access/i });
      const cancelButton = screen.getByRole('button', { name: /Cancel/i });

      fireEvent.click(revokeButton);

      expect(revokeButton).toBeDisabled();
      expect(cancelButton).toBeDisabled();
      expect(screen.getByText(/Revoking.../i)).toBeInTheDocument();
    });

    it('should not render when closed', () => {
      const { rerender } = render(<GuestRevocationModal {...defaultProps} open={false} />);

      expect(screen.queryByText('Revoke Guest Access')).not.toBeInTheDocument();

      rerender(<GuestRevocationModal {...defaultProps} open={true} />);
      expect(screen.getByText('Revoke Guest Access')).toBeInTheDocument();
    });

    it('should reset form when closed and reopened', async () => {
      const { rerender } = render(<GuestRevocationModal {...defaultProps} />);

      const reasonInput = screen.getByPlaceholderText(/provide a reason/i);
      await userEvent.type(reasonInput, 'Some reason');

      rerender(<GuestRevocationModal {...defaultProps} open={false} />);
      rerender(<GuestRevocationModal {...defaultProps} open={true} />);

      const newReasonInput = screen.getByPlaceholderText(/provide a reason/i);
      expect(newReasonInput).toHaveValue('');
    });
  });
});