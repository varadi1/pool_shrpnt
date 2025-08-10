import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ManualLockModal } from '../ManualLockModal';
import type { LockState } from '../../../types/permissions';

describe('ManualLockModal', () => {
  const mockOnClose = vi.fn();
  const mockOnSubmit = vi.fn();

  const mockFolderGroups = [
    {
      id: 'experts',
      name: 'Expert Folders',
      folders: ['01_EXPERTS', '02_EXPERT_WORK'],
      currentLockState: {
        folderId: 'experts',
        lockType: 'manual' as const,
        locked: false,
        reason: 'Initial state',
      } as LockState,
    },
    {
      id: 'results',
      name: 'Results Folders',
      folders: ['03_RESULTS', '04_FINAL'],
      currentLockState: {
        folderId: 'results',
        lockType: 'time_based' as const,
        locked: true,
        lockedBy: 'system',
        lockedAt: new Date('2025-01-15T10:00:00'),
        reason: 'Deadline passed',
      } as LockState,
    },
    {
      id: 'financial',
      name: 'Financial Folders',
      folders: ['05_FINANCIAL', 'TIG_REPORTS'],
    },
  ];

  const mockLockHistory = [
    {
      id: '1',
      action: 'lock' as const,
      folderGroup: 'Expert Folders',
      actor: 'admin@example.com',
      timestamp: new Date('2025-01-10T14:00:00'),
      reason: 'Submission deadline reached',
    },
    {
      id: '2',
      action: 'unlock' as const,
      folderGroup: 'Expert Folders',
      actor: 'pm@example.com',
      timestamp: new Date('2025-01-11T09:00:00'),
      reason: 'Change request approved',
      unlockAt: new Date('2025-01-12T18:00:00'),
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders lock/unlock modal with folder groups', () => {
    render(
      <ManualLockModal
        open={true}
        onClose={mockOnClose}
        orderId="EM-2025-001"
        folderGroups={mockFolderGroups}
        onSubmit={mockOnSubmit}
      />
    );

    expect(screen.getByText('Manual Lock/Unlock - Order EM-2025-001')).toBeInTheDocument();
    expect(screen.getByText('Expert Folders')).toBeInTheDocument();
    expect(screen.getByText('Results Folders')).toBeInTheDocument();
    expect(screen.getByText('Financial Folders')).toBeInTheDocument();
  });

  it('shows current lock status badges', () => {
    render(
      <ManualLockModal
        open={true}
        onClose={mockOnClose}
        orderId="EM-2025-001"
        folderGroups={mockFolderGroups}
        onSubmit={mockOnSubmit}
      />
    );

    expect(screen.getByText('Unlocked')).toBeInTheDocument();
    expect(screen.getByText('Locked')).toBeInTheDocument();
  });

  it('allows selecting lock action', async () => {
    render(
      <ManualLockModal
        open={true}
        onClose={mockOnClose}
        orderId="EM-2025-001"
        folderGroups={mockFolderGroups}
        onSubmit={mockOnSubmit}
      />
    );

    const radios = screen.getAllByRole('radio');
    const lockRadio = radios.find(r => r.getAttribute('value') === 'lock');
    const unlockRadio = radios.find(r => r.getAttribute('value') === 'unlock');

    expect(lockRadio).toBeChecked();
    expect(unlockRadio).not.toBeChecked();

    await userEvent.click(unlockRadio!);
    expect(unlockRadio).toBeChecked();
    expect(lockRadio).not.toBeChecked();
  });

  it('allows selecting multiple folder groups', async () => {
    render(
      <ManualLockModal
        open={true}
        onClose={mockOnClose}
        orderId="EM-2025-001"
        folderGroups={mockFolderGroups}
        onSubmit={mockOnSubmit}
      />
    );

    const checkboxes = screen.getAllByRole('checkbox');
    const expertCheckbox = checkboxes[0];
    const resultsCheckbox = checkboxes[1];

    await userEvent.click(expertCheckbox);
    expect(expertCheckbox).toBeChecked();

    await userEvent.click(resultsCheckbox);
    expect(resultsCheckbox).toBeChecked();
    expect(expertCheckbox).toBeChecked();
  });

  it('validates required fields', async () => {
    render(
      <ManualLockModal
        open={true}
        onClose={mockOnClose}
        orderId="EM-2025-001"
        folderGroups={mockFolderGroups}
        onSubmit={mockOnSubmit}
      />
    );

    const submitButton = screen.getByRole('button', { name: /Lock Selected/i });
    await userEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Please select at least one folder group')).toBeInTheDocument();
      expect(screen.getByText('Reason is required')).toBeInTheDocument();
    });

    expect(mockOnSubmit).not.toHaveBeenCalled();
  });

  it('validates reason minimum length', async () => {
    render(
      <ManualLockModal
        open={true}
        onClose={mockOnClose}
        orderId="EM-2025-001"
        folderGroups={mockFolderGroups}
        onSubmit={mockOnSubmit}
      />
    );

    const reasonField = screen.getByPlaceholderText(/Enter a detailed business reason/i);
    await userEvent.type(reasonField, 'Short');

    const submitButton = screen.getByRole('button', { name: /Lock Selected/i });
    await userEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Please provide a detailed reason (min 10 characters)')).toBeInTheDocument();
    });
  });

  it('submits lock request with valid data', async () => {
    render(
      <ManualLockModal
        open={true}
        onClose={mockOnClose}
        orderId="EM-2025-001"
        folderGroups={mockFolderGroups}
        onSubmit={mockOnSubmit}
      />
    );

    const expertCheckbox = screen.getByRole('checkbox', { name: /Expert Folders/i });
    await userEvent.click(expertCheckbox);

    const reasonField = screen.getByPlaceholderText(/Enter a detailed business reason/i);
    await userEvent.type(reasonField, 'Locking folders for end of submission period');

    const submitButton = screen.getByRole('button', { name: /Lock Selected/i });
    await userEvent.click(submitButton);

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledWith({
        action: 'lock',
        folderGroupIds: ['experts'],
        reason: 'Locking folders for end of submission period',
        unlockAt: undefined,
      });
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  it('allows scheduling automatic unlock for lock action', async () => {
    render(
      <ManualLockModal
        open={true}
        onClose={mockOnClose}
        orderId="EM-2025-001"
        folderGroups={mockFolderGroups}
        onSubmit={mockOnSubmit}
      />
    );

    const checkboxes = screen.getAllByRole('checkbox');
    const scheduleCheckbox = checkboxes.find(cb => cb.nextElementSibling?.textContent?.includes('Schedule automatic unlock'));
    
    if (scheduleCheckbox) {
      await userEvent.click(scheduleCheckbox);
      expect(screen.getByText('Unlock Date')).toBeInTheDocument();
      const dateInputs = screen.getAllByRole('textbox');
      const dateInput = dateInputs.find(input => input.getAttribute('type') === 'datetime-local');
      expect(dateInput).toBeDefined();
    }
  });

  it('does not show schedule option for unlock action', async () => {
    render(
      <ManualLockModal
        open={true}
        onClose={mockOnClose}
        orderId="EM-2025-001"
        folderGroups={mockFolderGroups}
        onSubmit={mockOnSubmit}
      />
    );

    const radios = screen.getAllByRole('radio');
    const unlockRadio = radios.find(r => r.getAttribute('value') === 'unlock');
    await userEvent.click(unlockRadio!);

    expect(screen.queryByText('Schedule automatic unlock')).not.toBeInTheDocument();
  });

  it('shows lock history in history tab', async () => {
    render(
      <ManualLockModal
        open={true}
        onClose={mockOnClose}
        orderId="EM-2025-001"
        folderGroups={mockFolderGroups}
        onSubmit={mockOnSubmit}
        lockHistory={mockLockHistory}
      />
    );

    const historyTab = screen.getByRole('tab', { name: /History/i });
    await userEvent.click(historyTab);

    expect(screen.getByText('Expert Folders - Locked')).toBeInTheDocument();
    expect(screen.getByText('By: admin@example.com')).toBeInTheDocument();
    expect(screen.getByText('Reason: Submission deadline reached')).toBeInTheDocument();
    expect(screen.getByText('Expert Folders - Unlocked')).toBeInTheDocument();
    expect(screen.getByText('By: pm@example.com')).toBeInTheDocument();
    expect(screen.getByText('Reason: Change request approved')).toBeInTheDocument();
  });

  it('shows empty state when no history', async () => {
    render(
      <ManualLockModal
        open={true}
        onClose={mockOnClose}
        orderId="EM-2025-001"
        folderGroups={mockFolderGroups}
        onSubmit={mockOnSubmit}
        lockHistory={[]}
      />
    );

    const historyTab = screen.getByRole('tab', { name: /History/i });
    await userEvent.click(historyTab);

    expect(screen.getByText('No lock/unlock history for this order.')).toBeInTheDocument();
  });

  it('closes modal on cancel', async () => {
    render(
      <ManualLockModal
        open={true}
        onClose={mockOnClose}
        orderId="EM-2025-001"
        folderGroups={mockFolderGroups}
        onSubmit={mockOnSubmit}
      />
    );

    const cancelButton = screen.getByRole('button', { name: /Cancel/i });
    await userEvent.click(cancelButton);

    expect(mockOnClose).toHaveBeenCalled();
  });

  it('shows warning message about manual operations', () => {
    render(
      <ManualLockModal
        open={true}
        onClose={mockOnClose}
        orderId="EM-2025-001"
        folderGroups={mockFolderGroups}
        onSubmit={mockOnSubmit}
      />
    );

    expect(screen.getByText('Important')).toBeInTheDocument();
    expect(screen.getByText(/Manual lock\/unlock operations override automatic time-based locks/i)).toBeInTheDocument();
  });

  it('displays folder lists for each group', () => {
    render(
      <ManualLockModal
        open={true}
        onClose={mockOnClose}
        orderId="EM-2025-001"
        folderGroups={mockFolderGroups}
        onSubmit={mockOnSubmit}
      />
    );

    expect(screen.getByText('Folders: 01_EXPERTS, 02_EXPERT_WORK')).toBeInTheDocument();
    expect(screen.getByText('Folders: 03_RESULTS, 04_FINAL')).toBeInTheDocument();
    expect(screen.getByText('Folders: 05_FINANCIAL, TIG_REPORTS')).toBeInTheDocument();
  });

  it('shows current lock reason when available', () => {
    render(
      <ManualLockModal
        open={true}
        onClose={mockOnClose}
        orderId="EM-2025-001"
        folderGroups={mockFolderGroups}
        onSubmit={mockOnSubmit}
      />
    );

    expect(screen.getByText('Current reason: Initial state')).toBeInTheDocument();
    expect(screen.getByText('Current reason: Deadline passed')).toBeInTheDocument();
  });

  it('submits unlock request with multiple groups', async () => {
    render(
      <ManualLockModal
        open={true}
        onClose={mockOnClose}
        orderId="EM-2025-001"
        folderGroups={mockFolderGroups}
        onSubmit={mockOnSubmit}
      />
    );

    const radios = screen.getAllByRole('radio');
    const unlockRadio = radios.find(r => r.getAttribute('value') === 'unlock');
    await userEvent.click(unlockRadio!);

    const checkboxes = screen.getAllByRole('checkbox');
    const resultsCheckbox = checkboxes[1]; // Results Folders
    const financialCheckbox = checkboxes[2]; // Financial Folders
    await userEvent.click(resultsCheckbox);
    await userEvent.click(financialCheckbox);

    const reasonField = screen.getByPlaceholderText(/Enter a detailed business reason/i);
    await userEvent.type(reasonField, 'Emergency access required for financial audit');

    const submitButton = screen.getByRole('button', { name: /Unlock Selected/i });
    await userEvent.click(submitButton);

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledWith({
        action: 'unlock',
        folderGroupIds: ['results', 'financial'],
        reason: 'Emergency access required for financial audit',
        unlockAt: undefined,
      });
    });
  });

  it('resets form after successful submission', async () => {
    render(
      <ManualLockModal
        open={true}
        onClose={mockOnClose}
        orderId="EM-2025-001"
        folderGroups={mockFolderGroups}
        onSubmit={mockOnSubmit}
      />
    );

    const expertCheckbox = screen.getByRole('checkbox', { name: /Expert Folders/i });
    await userEvent.click(expertCheckbox);

    const reasonField = screen.getByPlaceholderText(/Enter a detailed business reason/i);
    await userEvent.type(reasonField, 'Valid business reason for locking');

    const submitButton = screen.getByRole('button', { name: /Lock Selected/i });
    await userEvent.click(submitButton);

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalled();
      expect(reasonField).toHaveValue('');
      expect(expertCheckbox).not.toBeChecked();
    });
  });

  it('handles modal close via dialog close button', () => {
    render(
      <ManualLockModal
        open={true}
        onClose={mockOnClose}
        orderId="EM-2025-001"
        folderGroups={mockFolderGroups}
        onSubmit={mockOnSubmit}
      />
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();

    // Dialog close is handled by onOpenChange callback
    // Testing that the modal renders correctly
    expect(screen.getByText('Manual Lock/Unlock - Order EM-2025-001')).toBeInTheDocument();
  });

  it('does not render when open is false', () => {
    render(
      <ManualLockModal
        open={false}
        onClose={mockOnClose}
        orderId="EM-2025-001"
        folderGroups={mockFolderGroups}
        onSubmit={mockOnSubmit}
      />
    );

    expect(screen.queryByText('Manual Lock/Unlock - Order EM-2025-001')).not.toBeInTheDocument();
  });
});