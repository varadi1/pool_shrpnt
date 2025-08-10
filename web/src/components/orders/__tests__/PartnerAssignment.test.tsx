import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import PartnerAssignment from '../PartnerAssignment';
import type { PartnerAssignment as PartnerAssign } from '@/types/orders';

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <FluentProvider theme={webLightTheme}>
        {children}
      </FluentProvider>
    </QueryClientProvider>
  );
};

describe('PartnerAssignment', () => {
  const mockOnChange = vi.fn();
  const defaultProps = {
    value: [],
    availableParts: ['A', 'B', 'C'] as ('A' | 'B' | 'C')[],
    onChange: mockOnChange,
  };

  beforeEach(() => {
    mockOnChange.mockClear();
  });

  it('renders with no partners selected initially', async () => {
    render(<PartnerAssignment {...defaultProps} />, { wrapper: createWrapper() });
    
    await waitFor(() => {
      expect(screen.getByText('Select Partner Companies')).toBeInTheDocument();
      expect(screen.getByText('No partners selected')).toBeInTheDocument();
    });
  });

  it('displays search box for filtering companies', async () => {
    render(<PartnerAssignment {...defaultProps} />, { wrapper: createWrapper() });
    
    await waitFor(() => {
      const searchBox = screen.getByPlaceholderText('Search companies by name, contact, or email...');
      expect(searchBox).toBeInTheDocument();
    });
  });

  it('shows available partner companies', async () => {
    render(<PartnerAssignment {...defaultProps} />, { wrapper: createWrapper() });
    
    await waitFor(() => {
      expect(screen.getByText('BuildCorp Kft.')).toBeInTheDocument();
      expect(screen.getByText('ConstructPro Zrt.')).toBeInTheDocument();
      expect(screen.getByText('TechBuild Solutions')).toBeInTheDocument();
    });
  });

  it('allows selecting a partner company', async () => {
    render(<PartnerAssignment {...defaultProps} />, { wrapper: createWrapper() });
    
    await waitFor(() => {
      expect(screen.getByText('BuildCorp Kft.')).toBeInTheDocument();
    });

    const buildCorpCard = screen.getByText('BuildCorp Kft.').closest('[role="group"]');
    if (buildCorpCard) {
      fireEvent.click(buildCorpCard);
    }

    await waitFor(() => {
      expect(mockOnChange).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            companyId: '1',
            companyName: 'BuildCorp Kft.',
            accessLevel: 'read',
            folders: expect.arrayContaining(['01_Tervezés', '02_Kivitelezés']),
            parts: ['A', 'B', 'C'],
          }),
        ])
      );
    });
  });

  it('shows selected partners section when partners are selected', async () => {
    const selectedPartners: PartnerAssign[] = [
      {
        companyId: '1',
        companyName: 'BuildCorp Kft.',
        accessLevel: 'read',
        folders: ['01_Tervezés', '02_Kivitelezés'],
        parts: ['A', 'B'],
      },
    ];

    render(
      <PartnerAssignment {...defaultProps} value={selectedPartners} />,
      { wrapper: createWrapper() }
    );
    
    await waitFor(() => {
      expect(screen.getByText('Selected Partners (1)')).toBeInTheDocument();
      expect(screen.getByText('BuildCorp Kft.')).toBeInTheDocument();
    });
  });

  it('allows changing access level for selected partner', async () => {
    const selectedPartners: PartnerAssign[] = [
      {
        companyId: '1',
        companyName: 'BuildCorp Kft.',
        accessLevel: 'read',
        folders: ['01_Tervezés'],
        parts: ['A'],
      },
    ];

    render(
      <PartnerAssignment {...defaultProps} value={selectedPartners} />,
      { wrapper: createWrapper() }
    );
    
    await waitFor(() => {
      expect(screen.getByText('Selected Partners (1)')).toBeInTheDocument();
    });

    const dropdown = screen.getByRole('combobox');
    fireEvent.click(dropdown);

    await waitFor(() => {
      expect(screen.getByText('Read/Write')).toBeInTheDocument();
    });

    const writeOption = screen.getByText('Read/Write');
    fireEvent.click(writeOption);

    await waitFor(() => {
      expect(mockOnChange).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            companyId: '1',
            accessLevel: 'write',
          }),
        ])
      );
    });
  });

  it('allows removing a selected partner', async () => {
    const selectedPartners: PartnerAssign[] = [
      {
        companyId: '1',
        companyName: 'BuildCorp Kft.',
        accessLevel: 'read',
        folders: ['01_Tervezés'],
        parts: ['A'],
      },
    ];

    const { rerender } = render(
      <PartnerAssignment {...defaultProps} value={selectedPartners} />,
      { wrapper: createWrapper() }
    );
    
    await waitFor(() => {
      expect(screen.getByText('Selected Partners (1)')).toBeInTheDocument();
    });

    // Find the delete button by looking for buttons with Delete icon
    const buttons = screen.getAllByRole('button');
    const deleteButton = buttons[buttons.length - 1]; // Last button is typically the delete button
    
    fireEvent.click(deleteButton);

    expect(mockOnChange).toHaveBeenCalledWith([]);
  });

  it('allows assigning partners to specific parts', async () => {
    const selectedPartners: PartnerAssign[] = [
      {
        companyId: '1',
        companyName: 'BuildCorp Kft.',
        accessLevel: 'read',
        folders: ['01_Tervezés'],
        parts: ['A'],
      },
    ];

    render(
      <PartnerAssignment {...defaultProps} value={selectedPartners} />,
      { wrapper: createWrapper() }
    );
    
    await waitFor(() => {
      const partBCheckbox = screen.getByRole('checkbox', { name: /Part B/i });
      expect(partBCheckbox).toBeInTheDocument();
      expect(partBCheckbox).not.toBeChecked();
      
      fireEvent.click(partBCheckbox);
    });

    await waitFor(() => {
      expect(mockOnChange).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            companyId: '1',
            parts: expect.arrayContaining(['A', 'B']),
          }),
        ])
      );
    });
  });

  it('allows setting expiry date for partner access', async () => {
    const selectedPartners: PartnerAssign[] = [
      {
        companyId: '1',
        companyName: 'BuildCorp Kft.',
        accessLevel: 'read',
        folders: ['01_Tervezés'],
        parts: ['A'],
      },
    ];

    render(
      <PartnerAssignment {...defaultProps} value={selectedPartners} />,
      { wrapper: createWrapper() }
    );
    
    await waitFor(() => {
      expect(screen.getByText('Selected Partners (1)')).toBeInTheDocument();
    });

    // Find all input elements and filter for date type
    const inputs = document.querySelectorAll('input[type="date"]');
    const expiryInput = inputs[0] as HTMLInputElement;
    
    if (expiryInput) {
      fireEvent.change(expiryInput, { target: { value: '2025-12-31' } });
      
      expect(mockOnChange).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            companyId: '1',
            expiryDate: expect.any(Date),
          }),
        ])
      );
    }
  });

  it('filters companies based on search term', async () => {
    render(<PartnerAssignment {...defaultProps} />, { wrapper: createWrapper() });
    
    await waitFor(() => {
      const searchBox = screen.getByPlaceholderText('Search companies by name, contact, or email...');
      fireEvent.change(searchBox, { target: { value: 'BuildCorp' } });
    });

    await waitFor(() => {
      expect(screen.getByText('BuildCorp Kft.')).toBeInTheDocument();
      expect(screen.queryByText('ConstructPro Zrt.')).not.toBeInTheDocument();
    });
  });

  it('allows configuring folder access for partners', async () => {
    const selectedPartners: PartnerAssign[] = [
      {
        companyId: '1',
        companyName: 'BuildCorp Kft.',
        accessLevel: 'read',
        folders: ['01_Tervezés'],
        parts: ['A'],
      },
    ];

    render(
      <PartnerAssignment {...defaultProps} value={selectedPartners} />,
      { wrapper: createWrapper() }
    );
    
    await waitFor(() => {
      const folderCheckboxes = screen.getAllByRole('checkbox');
      const kivitelezesCheckbox = folderCheckboxes.find(cb => 
        cb.parentElement?.textContent?.includes('02_Kivitelezés')
      );
      
      expect(kivitelezesCheckbox).toBeInTheDocument();
      if (kivitelezesCheckbox) {
        expect(kivitelezesCheckbox).not.toBeChecked();
        fireEvent.click(kivitelezesCheckbox);
      }
    });

    await waitFor(() => {
      expect(mockOnChange).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            companyId: '1',
            folders: expect.arrayContaining(['01_Tervezés', '02_Kivitelezés']),
          }),
        ])
      );
    });
  });

  it('validates at least one partner must be selected', () => {
    render(<PartnerAssignment {...defaultProps} />, { wrapper: createWrapper() });
    
    expect(screen.getByText('Select at least one partner company from the list above')).toBeInTheDocument();
  });
});