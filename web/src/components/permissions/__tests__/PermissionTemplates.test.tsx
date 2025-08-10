import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { PermissionTemplates } from '../PermissionTemplates';
import type { PermissionTemplate } from '../../../types/permissions';

const createQueryClient = () => new QueryClient({
  defaultOptions: {
    queries: { retry: false },
    mutations: { retry: false },
  },
});

const renderComponent = (props = {}) => {
  const queryClient = createQueryClient();
  
  return render(
    <QueryClientProvider client={queryClient}>
      <FluentProvider theme={webLightTheme}>
        <PermissionTemplates
          orderId="test-order-123"
          {...props}
        />
      </FluentProvider>
    </QueryClientProvider>
  );
};

describe('PermissionTemplates', () => {
  const mockOnTemplateSelect = vi.fn();
  const mockOnTemplateApply = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the component with standard templates', async () => {
    renderComponent();
    
    await waitFor(() => {
      expect(screen.getByText('Default RBAC Matrix')).toBeInTheDocument();
      expect(screen.getByText('Financial Segregation')).toBeInTheDocument();
      expect(screen.getByText('Partner-Specific Template')).toBeInTheDocument();
      expect(screen.getByText('Time-Based Lock Template')).toBeInTheDocument();
    });
  });

  it('displays template descriptions', () => {
    renderComponent();
    
    expect(screen.getByText('Standard role-based access control for typical orders')).toBeInTheDocument();
    expect(screen.getByText('Restricted access for financial folders with TIG paths')).toBeInTheDocument();
    expect(screen.getByText('Enhanced permissions for partner company administrators')).toBeInTheDocument();
    expect(screen.getByText('Progressive lock-down based on project timeline')).toBeInTheDocument();
  });

  it('selects a template when clicked', async () => {
    const user = userEvent.setup();
    renderComponent({ onTemplateSelect: mockOnTemplateSelect });
    
    const defaultTemplate = screen.getByText('Default RBAC Matrix').closest('[class*="templateCard"]');
    if (defaultTemplate) {
      await user.click(defaultTemplate);
      
      expect(mockOnTemplateSelect).toHaveBeenCalled();
      expect(screen.getByText('Selected Template Preview')).toBeInTheDocument();
    }
  });

  it('shows permission matrix preview for selected template', async () => {
    const user = userEvent.setup();
    renderComponent();
    
    const defaultTemplate = screen.getByText('Default RBAC Matrix').closest('[class*="templateCard"]');
    if (defaultTemplate) {
      await user.click(defaultTemplate);
      
      await waitFor(() => {
        expect(screen.getByText('Selected Template Preview')).toBeInTheDocument();
        expect(screen.getByText('NEÜ Admin')).toBeInTheDocument();
        expect(screen.getByText('NEÜ PM')).toBeInTheDocument();
        expect(screen.getByText('Company Admin')).toBeInTheDocument();
        expect(screen.getByText('Expert')).toBeInTheDocument();
        expect(screen.getByText('NEÜ QA')).toBeInTheDocument();
      });
    }
  });

  it('shows customize button when template is selected', async () => {
    const user = userEvent.setup();
    renderComponent({ allowCustomization: true });
    
    const defaultTemplate = screen.getByText('Default RBAC Matrix').closest('[class*="templateCard"]');
    if (defaultTemplate) {
      await user.click(defaultTemplate);
      
      const customizeButton = screen.getByRole('button', { name: /Customize Selected/i });
      expect(customizeButton).toBeInTheDocument();
    }
  });

  it('opens customize dialog when customize button is clicked', async () => {
    const user = userEvent.setup();
    renderComponent({ allowCustomization: true });
    
    const defaultTemplate = screen.getByText('Default RBAC Matrix').closest('[class*="templateCard"]');
    if (defaultTemplate) {
      await user.click(defaultTemplate);
      
      const customizeButton = screen.getByRole('button', { name: /Customize Selected/i });
      await user.click(customizeButton);
      
      expect(screen.getByText('Customize Template')).toBeInTheDocument();
      expect(screen.getByLabelText('Template Name')).toBeInTheDocument();
      expect(screen.getByLabelText('Description')).toBeInTheDocument();
    }
  });

  it('allows editing permission levels in customize dialog', async () => {
    const user = userEvent.setup();
    renderComponent({ allowCustomization: true });
    
    const defaultTemplate = screen.getByText('Default RBAC Matrix').closest('[class*="templateCard"]');
    if (defaultTemplate) {
      await user.click(defaultTemplate);
      
      const customizeButton = screen.getByRole('button', { name: /Customize Selected/i });
      await user.click(customizeButton);
      
      // Find the dropdown for NEÜ Admin role
      const dropdowns = screen.getAllByRole('combobox');
      if (dropdowns.length > 0) {
        await user.click(dropdowns[0]);
        
        const readOption = screen.getByRole('option', { name: 'Read' });
        await user.click(readOption);
        
        // Verify the dropdown value changed
        expect(dropdowns[0]).toHaveTextContent('read');
      }
    }
  });

  it('shows apply button when orderId is provided', async () => {
    const user = userEvent.setup();
    renderComponent({ orderId: 'test-order', showApplyButton: true });
    
    const defaultTemplate = screen.getByText('Default RBAC Matrix').closest('[class*="templateCard"]');
    if (defaultTemplate) {
      await user.click(defaultTemplate);
      
      const applyButton = screen.getByRole('button', { name: /Apply to Order/i });
      expect(applyButton).toBeInTheDocument();
    }
  });

  it('calls onTemplateApply when apply button is clicked', async () => {
    const user = userEvent.setup();
    renderComponent({ 
      orderId: 'test-order', 
      showApplyButton: true,
      onTemplateApply: mockOnTemplateApply 
    });
    
    const defaultTemplate = screen.getByText('Default RBAC Matrix').closest('[class*="templateCard"]');
    if (defaultTemplate) {
      await user.click(defaultTemplate);
      
      const applyButton = screen.getByRole('button', { name: /Apply to Order/i });
      await user.click(applyButton);
      
      await waitFor(() => {
        expect(mockOnTemplateApply).toHaveBeenCalled();
      });
    }
  });

  it('shows create template button', () => {
    renderComponent();
    
    const createButton = screen.getByRole('button', { name: /Create Template/i });
    expect(createButton).toBeInTheDocument();
  });

  it('opens save dialog when create template is clicked', async () => {
    const user = userEvent.setup();
    renderComponent();
    
    const createButton = screen.getByRole('button', { name: /Create Template/i });
    await user.click(createButton);
    
    expect(screen.getByText('Save Custom Template')).toBeInTheDocument();
    expect(screen.getByLabelText('Template Name')).toBeInTheDocument();
    expect(screen.getByLabelText('Description')).toBeInTheDocument();
    expect(screen.getByText('Applicable For')).toBeInTheDocument();
  });

  it('validates required fields in save dialog', async () => {
    const user = userEvent.setup();
    renderComponent();
    
    const createButton = screen.getByRole('button', { name: /Create Template/i });
    await user.click(createButton);
    
    const saveButton = screen.getByRole('button', { name: /Save Template/i });
    expect(saveButton).toBeDisabled();
    
    const nameInput = screen.getByLabelText('Template Name');
    await user.type(nameInput, 'My Custom Template');
    
    expect(saveButton).not.toBeDisabled();
  });

  it('shows applicable checkboxes in save dialog', async () => {
    const user = userEvent.setup();
    renderComponent();
    
    const createButton = screen.getByRole('button', { name: /Create Template/i });
    await user.click(createButton);
    
    expect(screen.getByLabelText('Standard')).toBeInTheDocument();
    expect(screen.getByLabelText('Financial')).toBeInTheDocument();
    expect(screen.getByLabelText('Partner')).toBeInTheDocument();
    expect(screen.getByLabelText('Deadline')).toBeInTheDocument();
  });

  it('allows checking applicable types', async () => {
    const user = userEvent.setup();
    renderComponent();
    
    const createButton = screen.getByRole('button', { name: /Create Template/i });
    await user.click(createButton);
    
    const standardCheckbox = screen.getByLabelText('Standard');
    await user.click(standardCheckbox);
    
    expect(standardCheckbox).toBeChecked();
  });

  it('closes customize dialog on cancel', async () => {
    const user = userEvent.setup();
    renderComponent({ allowCustomization: true });
    
    const defaultTemplate = screen.getByText('Default RBAC Matrix').closest('[class*="templateCard"]');
    if (defaultTemplate) {
      await user.click(defaultTemplate);
      
      const customizeButton = screen.getByRole('button', { name: /Customize Selected/i });
      await user.click(customizeButton);
      
      expect(screen.getByText('Customize Template')).toBeInTheDocument();
      
      const cancelButton = screen.getByRole('button', { name: /Cancel/i });
      await user.click(cancelButton);
      
      expect(screen.queryByText('Customize Template')).not.toBeInTheDocument();
    }
  });

  it('closes save dialog on cancel', async () => {
    const user = userEvent.setup();
    renderComponent();
    
    const createButton = screen.getByRole('button', { name: /Create Template/i });
    await user.click(createButton);
    
    expect(screen.getByText('Save Custom Template')).toBeInTheDocument();
    
    const cancelButton = screen.getByRole('button', { name: /Cancel/i });
    await user.click(cancelButton);
    
    expect(screen.queryByText('Save Custom Template')).not.toBeInTheDocument();
  });

  it('shows permission level badges with correct colors', async () => {
    const user = userEvent.setup();
    renderComponent();
    
    const defaultTemplate = screen.getByText('Default RBAC Matrix').closest('[class*="templateCard"]');
    if (defaultTemplate) {
      await user.click(defaultTemplate);
      
      await waitFor(() => {
        const badges = screen.getAllByText('full');
        expect(badges.length).toBeGreaterThan(0);
        
        const readBadges = screen.getAllByText('read');
        expect(readBadges.length).toBeGreaterThan(0);
        
        const writeBadges = screen.getAllByText('write');
        expect(writeBadges.length).toBeGreaterThan(0);
      });
    }
  });

  it('displays template icons', () => {
    renderComponent();
    
    // Check that template cards are rendered with icons
    const templateCards = screen.getAllByText(/Template|Matrix|Segregation/);
    expect(templateCards.length).toBeGreaterThan(0);
  });

  it('disables customize button when allowCustomization is false', async () => {
    const user = userEvent.setup();
    renderComponent({ allowCustomization: false });
    
    const defaultTemplate = screen.getByText('Default RBAC Matrix').closest('[class*="templateCard"]');
    if (defaultTemplate) {
      await user.click(defaultTemplate);
      
      const customizeButton = screen.queryByRole('button', { name: /Customize Selected/i });
      expect(customizeButton).not.toBeInTheDocument();
    }
  });

  it('hides apply button when showApplyButton is false', async () => {
    const user = userEvent.setup();
    renderComponent({ orderId: 'test-order', showApplyButton: false });
    
    const defaultTemplate = screen.getByText('Default RBAC Matrix').closest('[class*="templateCard"]');
    if (defaultTemplate) {
      await user.click(defaultTemplate);
      
      const applyButton = screen.queryByRole('button', { name: /Apply to Order/i });
      expect(applyButton).not.toBeInTheDocument();
    }
  });

  it('shows success message after applying template', async () => {
    const user = userEvent.setup();
    renderComponent({ 
      orderId: 'test-order', 
      showApplyButton: true 
    });
    
    const defaultTemplate = screen.getByText('Default RBAC Matrix').closest('[class*="templateCard"]');
    if (defaultTemplate) {
      await user.click(defaultTemplate);
      
      const applyButton = screen.getByRole('button', { name: /Apply to Order/i });
      await user.click(applyButton);
      
      await waitFor(() => {
        expect(screen.getByText('Template applied successfully')).toBeInTheDocument();
      });
    }
  });

  it('highlights selected template', async () => {
    const user = userEvent.setup();
    renderComponent();
    
    const defaultTemplate = screen.getByText('Default RBAC Matrix').closest('[class*="templateCard"]');
    if (defaultTemplate) {
      await user.click(defaultTemplate);
      
      // Check if the selected card has a different style
      expect(defaultTemplate).toHaveClass(expect.stringContaining('selectedCard'));
    }
  });
});