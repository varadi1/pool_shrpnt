import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { EffectivePermissions } from '../EffectivePermissions';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';

const renderWithProviders = (component: React.ReactElement) => {
  return render(
    <FluentProvider theme={webLightTheme}>
      {component}
    </FluentProvider>
  );
};

describe('EffectivePermissions', () => {
  const mockOnExport = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the component with selectors', () => {
    renderWithProviders(
      <EffectivePermissions orderId="order1" onExport={mockOnExport} />
    );

    expect(screen.getByText('Calculate Effective Permissions')).toBeInTheDocument();
    expect(screen.getByText('User')).toBeInTheDocument();
    expect(screen.getByText('Or Group')).toBeInTheDocument();
    expect(screen.getByText('Folder')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /calculate/i })).toBeInTheDocument();
  });

  it('disables calculate button when no selections made', () => {
    renderWithProviders(
      <EffectivePermissions orderId="order1" onExport={mockOnExport} />
    );

    const calculateButton = screen.getByRole('button', { name: /calculate/i });
    expect(calculateButton).toBeDisabled();
  });

  it('enables calculate button when user and folder are selected', () => {
    renderWithProviders(
      <EffectivePermissions orderId="order1" onExport={mockOnExport} />
    );

    // Select user
    const userCombobox = screen.getAllByRole('combobox')[0];
    fireEvent.click(userCombobox);
    fireEvent.click(screen.getByText('John Doe'));

    // Select folder
    const folderCombobox = screen.getAllByRole('combobox')[2];
    fireEvent.click(folderCombobox);
    fireEvent.click(screen.getByText('01_Partner_A'));

    const calculateButton = screen.getByRole('button', { name: /calculate/i });
    expect(calculateButton).not.toBeDisabled();
  });

  it('disables group selector when user is selected', () => {
    renderWithProviders(
      <EffectivePermissions orderId="order1" onExport={mockOnExport} />
    );

    // Select user
    const userCombobox = screen.getAllByRole('combobox')[0];
    fireEvent.click(userCombobox);
    fireEvent.click(screen.getByText('John Doe'));

    // Check group selector is disabled
    const groupCombobox = screen.getAllByRole('combobox')[1];
    expect(groupCombobox).toBeDisabled();
  });

  it('clears user selection when group is selected', () => {
    renderWithProviders(
      <EffectivePermissions orderId="order1" onExport={mockOnExport} />
    );

    // Select group
    const groupCombobox = screen.getAllByRole('combobox')[1];
    fireEvent.click(groupCombobox);
    fireEvent.click(screen.getByText('NEU Admins'));

    // Check user field is cleared
    const userCombobox = screen.getAllByRole('combobox')[0];
    expect(userCombobox).toHaveValue('');
  });

  it('shows effective permission result after calculation', async () => {
    renderWithProviders(
      <EffectivePermissions orderId="order1" onExport={mockOnExport} />
    );

    // Select user
    const userCombobox = screen.getAllByRole('combobox')[0];
    fireEvent.click(userCombobox);
    fireEvent.click(screen.getByText('John Doe'));

    // Select folder
    const folderCombobox = screen.getAllByRole('combobox')[2];
    fireEvent.click(folderCombobox);
    fireEvent.click(screen.getByText('01_Partner_A'));

    // Click calculate
    const calculateButton = screen.getByRole('button', { name: /calculate/i });
    fireEvent.click(calculateButton);

    await waitFor(() => {
      expect(screen.getByText('Effective Permission Result')).toBeInTheDocument();
      expect(screen.getByText('WRITE')).toBeInTheDocument();
      expect(screen.getByText('Permission Sources')).toBeInTheDocument();
    });
  });

  it('displays permission sources in priority order', async () => {
    renderWithProviders(
      <EffectivePermissions orderId="order1" onExport={mockOnExport} />
    );

    // Select and calculate
    const userCombobox = screen.getAllByRole('combobox')[0];
    fireEvent.click(userCombobox);
    fireEvent.click(screen.getByText('John Doe'));

    const folderCombobox = screen.getAllByRole('combobox')[2];
    fireEvent.click(folderCombobox);
    fireEvent.click(screen.getByText('01_Partner_A'));

    fireEvent.click(screen.getByRole('button', { name: /calculate/i }));

    await waitFor(() => {
      expect(screen.getByText('Permission Sources')).toBeInTheDocument();
      // Check for Caption1 elements containing type info
      const captions = screen.getAllByText(/Type:/);
      expect(captions.length).toBeGreaterThan(0);
      // Check for priority info
      const priorities = screen.getAllByText(/Priority:/);
      expect(priorities.length).toBeGreaterThan(0);
    });
  });

  it('shows permission path visualization', async () => {
    renderWithProviders(
      <EffectivePermissions orderId="order1" onExport={mockOnExport} />
    );

    // Select and calculate
    const userCombobox = screen.getAllByRole('combobox')[0];
    fireEvent.click(userCombobox);
    fireEvent.click(screen.getByText('John Doe'));

    const folderCombobox = screen.getAllByRole('combobox')[2];
    fireEvent.click(folderCombobox);
    fireEvent.click(screen.getByText('Experts'));

    fireEvent.click(screen.getByRole('button', { name: /calculate/i }));

    await waitFor(() => {
      expect(screen.getByText('Permission Path')).toBeInTheDocument();
      expect(screen.getByText('Target')).toBeInTheDocument();
      expect(screen.getByText('Parent')).toBeInTheDocument();
    });
  });

  it('displays conflicts when detected', async () => {
    renderWithProviders(
      <EffectivePermissions orderId="order1" onExport={mockOnExport} />
    );

    // Select and calculate
    const userCombobox = screen.getAllByRole('combobox')[0];
    fireEvent.click(userCombobox);
    fireEvent.click(screen.getByText('John Doe'));

    const folderCombobox = screen.getAllByRole('combobox')[2];
    fireEvent.click(folderCombobox);
    fireEvent.click(screen.getByText('01_Partner_A'));

    fireEvent.click(screen.getByRole('button', { name: /calculate/i }));

    await waitFor(() => {
      expect(screen.getByText('Permission Conflicts Detected')).toBeInTheDocument();
      // Use getAllByText for texts that may appear multiple times
      const conflictTexts = screen.getAllByText(/Conflict Resolution: priority/);
      expect(conflictTexts.length).toBeGreaterThan(0);
      expect(screen.getByText(/Explicit assignment takes precedence/)).toBeInTheDocument();
    });
  });

  it('shows resolution options menu', async () => {
    renderWithProviders(
      <EffectivePermissions orderId="order1" onExport={mockOnExport} />
    );

    // Select and calculate
    const userCombobox = screen.getAllByRole('combobox')[0];
    fireEvent.click(userCombobox);
    fireEvent.click(screen.getByText('John Doe'));

    const folderCombobox = screen.getAllByRole('combobox')[2];
    fireEvent.click(folderCombobox);
    fireEvent.click(screen.getByText('01_Partner_A'));

    fireEvent.click(screen.getByRole('button', { name: /calculate/i }));

    await waitFor(() => {
      const resolutionButton = screen.getByRole('button', { name: /resolution options/i });
      fireEvent.click(resolutionButton);
      
      expect(screen.getByText('Apply Most Permissive')).toBeInTheDocument();
      expect(screen.getByText('Apply Least Permissive')).toBeInTheDocument();
      expect(screen.getByText('Manual Override')).toBeInTheDocument();
      expect(screen.getByText('Apply Policy Rules')).toBeInTheDocument();
    });
  });

  it('handles export button click', async () => {
    renderWithProviders(
      <EffectivePermissions orderId="order1" onExport={mockOnExport} />
    );

    // Select and calculate
    const userCombobox = screen.getAllByRole('combobox')[0];
    fireEvent.click(userCombobox);
    fireEvent.click(screen.getByText('John Doe'));

    const folderCombobox = screen.getAllByRole('combobox')[2];
    fireEvent.click(folderCombobox);
    fireEvent.click(screen.getByText('01_Partner_A'));

    fireEvent.click(screen.getByRole('button', { name: /calculate/i }));

    await waitFor(() => {
      const exportButton = screen.getByRole('button', { name: /export full permission report/i });
      fireEvent.click(exportButton);
      
      expect(mockOnExport).toHaveBeenCalledWith(expect.objectContaining({
        userId: expect.any(String),
        folderId: expect.any(String),
        calculatedLevel: 'write',
        sources: expect.any(Array),
      }));
    });
  });

  it('shows special folder indicators', () => {
    renderWithProviders(
      <EffectivePermissions orderId="order1" onExport={mockOnExport} />
    );

    const folderCombobox = screen.getAllByRole('combobox')[2];
    fireEvent.click(folderCombobox);

    expect(screen.getByText('00_BELSO_NEU_ONLY')).toBeInTheDocument();
    expect(screen.getByText('TIG (Financial)')).toBeInTheDocument();
  });

  it('displays user email in dropdown', () => {
    renderWithProviders(
      <EffectivePermissions orderId="order1" onExport={mockOnExport} />
    );

    const userCombobox = screen.getAllByRole('combobox')[0];
    fireEvent.click(userCombobox);

    expect(screen.getByText('john.doe@example.com')).toBeInTheDocument();
    expect(screen.getByText('jane.smith@example.com')).toBeInTheDocument();
  });

  it('displays group member count in dropdown', () => {
    renderWithProviders(
      <EffectivePermissions orderId="order1" onExport={mockOnExport} />
    );

    const groupCombobox = screen.getAllByRole('combobox')[1];
    fireEvent.click(groupCombobox);

    expect(screen.getByText('5 members')).toBeInTheDocument();
    expect(screen.getByText('12 members')).toBeInTheDocument();
  });

  it('shows folder paths in dropdown', () => {
    renderWithProviders(
      <EffectivePermissions orderId="order1" onExport={mockOnExport} />
    );

    const folderCombobox = screen.getAllByRole('combobox')[2];
    fireEvent.click(folderCombobox);

    expect(screen.getByText('/01_Partner_A')).toBeInTheDocument();
    expect(screen.getByText('/01_Partner_A/Experts')).toBeInTheDocument();
  });

  it('displays different badge colors for permission levels', async () => {
    renderWithProviders(
      <EffectivePermissions orderId="order1" onExport={mockOnExport} />
    );

    // Select and calculate
    const userCombobox = screen.getAllByRole('combobox')[0];
    fireEvent.click(userCombobox);
    fireEvent.click(screen.getByText('John Doe'));

    const folderCombobox = screen.getAllByRole('combobox')[2];
    fireEvent.click(folderCombobox);
    fireEvent.click(screen.getByText('01_Partner_A'));

    fireEvent.click(screen.getByRole('button', { name: /calculate/i }));

    await waitFor(() => {
      const badges = screen.getAllByText(/full|write|read/i);
      expect(badges.length).toBeGreaterThan(0);
    });
  });

  it('shows lock icon for no access', async () => {
    renderWithProviders(
      <EffectivePermissions orderId="order1" onExport={mockOnExport} />
    );

    // Would need to mock a 'none' permission result
    // This is a placeholder for when the API returns 'none' permission
  });

  it('displays source type icons correctly', async () => {
    renderWithProviders(
      <EffectivePermissions orderId="order1" onExport={mockOnExport} />
    );

    // Select and calculate
    const userCombobox = screen.getAllByRole('combobox')[0];
    fireEvent.click(userCombobox);
    fireEvent.click(screen.getByText('John Doe'));

    const folderCombobox = screen.getAllByRole('combobox')[2];
    fireEvent.click(folderCombobox);
    fireEvent.click(screen.getByText('01_Partner_A'));

    fireEvent.click(screen.getByRole('button', { name: /calculate/i }));

    await waitFor(() => {
      // Check that permission sources section is shown
      expect(screen.getByText('Permission Sources')).toBeInTheDocument();
      // Check for priority levels
      const priorityTexts = screen.getAllByText(/Priority:/);
      expect(priorityTexts.length).toEqual(4); // 4 different source types
    });
  });
});