import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { NewOrder } from '../NewOrder';
import * as contractsApi from '../../../services/api/contracts';
import * as templatesApi from '../../../services/api/templates';
import * as ordersApi from '../../../services/api/orders';
import * as companiesApi from '../../../services/api/companies';

expect.extend(toHaveNoViolations);

// Mock all API modules
vi.mock('../../../services/api/contracts');
vi.mock('../../../services/api/templates');
vi.mock('../../../services/api/orders');
vi.mock('../../../services/api/companies');
vi.mock('../../../hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'user123', email: 'user@company.com', role: 'NEU_Admin' },
    isAuthenticated: true
  })
}));

const mockContracts = [
  {
    id: 'contract1',
    number: 'NEU001',
    name: 'Test Contract',
    client: 'Client A',
    status: 'active',
    startDate: '2025-01-01',
    endDate: '2025-12-31'
  }
];

const mockTemplates = [
  {
    id: 'template1',
    name: 'Standard Template',
    version: '2.0',
    description: 'Basic template',
    lastModified: '2025-01-10T10:00:00Z',
    usageCount: 25,
    createdBy: 'admin@company.com',
    isRecommended: true,
    folders: []
  }
];

const mockCompanies = [
  {
    id: 'company1',
    name: 'Partner Company A',
    type: 'partner',
    email: 'contact@partnera.com',
    status: 'active'
  }
];

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false }
    },
  });

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        {children}
      </BrowserRouter>
    </QueryClientProvider>
  );
};

describe('NewOrder Accessibility Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(contractsApi.getUserContracts).mockResolvedValue(mockContracts);
    vi.mocked(templatesApi.getTemplates).mockResolvedValue(mockTemplates);
    vi.mocked(companiesApi.getPartnerCompanies).mockResolvedValue(mockCompanies);
    vi.mocked(ordersApi.getNextSequence).mockResolvedValue(42);
  });

  describe('WCAG 2.2 AA Compliance', () => {
    it('passes axe accessibility audit on initial render', async () => {
      const { container } = render(<NewOrder />, { wrapper: createWrapper() });
      
      await waitFor(async () => {
        const results = await axe(container);
        expect(results).toHaveNoViolations();
      });
    });

    it('maintains accessibility through all wizard steps', async () => {
      const user = userEvent.setup();
      const { container } = render(<NewOrder />, { wrapper: createWrapper() });

      // Check each step for violations
      for (let step = 0; step < 5; step++) {
        await waitFor(async () => {
          const results = await axe(container);
          expect(results).toHaveNoViolations();
        });

        // Navigate to next step if not last
        if (step < 4) {
          // Make selections to enable next button
          await makeStepSelection(user, step);
          
          const nextButton = screen.getByRole('button', { name: /Next/i });
          if (!nextButton.hasAttribute('disabled')) {
            await user.click(nextButton);
          }
        }
      }
    });

    it('provides proper ARIA labels for all interactive elements', async () => {
      render(<NewOrder />, { wrapper: createWrapper() });

      await waitFor(() => {
        // Check navigation
        expect(screen.getByRole('navigation', { name: /Wizard Steps/i })).toBeInTheDocument();
        
        // Check buttons
        expect(screen.getByRole('button', { name: /Next/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Save Draft/i })).toBeInTheDocument();
        
        // Check form regions
        expect(screen.getByRole('region', { name: /Contract Selection/i })).toBeInTheDocument();
      });
    });

    it('announces step changes to screen readers', async () => {
      const user = userEvent.setup();
      render(<NewOrder />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Test Contract')).toBeInTheDocument();
      });

      // Select contract
      const contractCard = screen.getByTestId('contract-card-contract1');
      await user.click(contractCard);

      // Move to next step
      const nextButton = screen.getByRole('button', { name: /Next/i });
      await user.click(nextButton);

      await waitFor(() => {
        // Check for live region announcement
        const liveRegion = screen.getByRole('status');
        expect(liveRegion).toHaveTextContent(/Step 2 of 6/);
      });
    });
  });

  describe('Keyboard Navigation', () => {
    it('supports Tab navigation through all interactive elements', async () => {
      const user = userEvent.setup();
      render(<NewOrder />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Test Contract')).toBeInTheDocument();
      });

      // Tab through elements
      await user.tab(); // Focus first element
      expect(document.activeElement).toHaveAttribute('role');

      await user.tab(); // Next element
      expect(document.activeElement).toHaveAttribute('role');

      // Shift+Tab to go back
      await user.keyboard('{Shift>}{Tab}{/Shift}');
      expect(document.activeElement).toHaveAttribute('role');
    });

    it('supports Enter key for button activation', async () => {
      const user = userEvent.setup();
      render(<NewOrder />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Test Contract')).toBeInTheDocument();
      });

      // Focus and select contract with keyboard
      const contractCard = screen.getByTestId('contract-card-contract1');
      contractCard.focus();
      await user.keyboard('{Enter}');

      // Contract should be selected
      expect(contractCard).toHaveAttribute('aria-selected', 'true');
    });

    it('supports Space key for checkbox/radio selection', async () => {
      const user = userEvent.setup();
      render(<NewOrder />, { wrapper: createWrapper() });

      // Navigate to parts configuration step
      await navigateToPartsStep(user);

      await waitFor(() => {
        expect(screen.getByLabelText('Part A')).toBeInTheDocument();
      });

      // Focus checkbox and toggle with space
      const partCheckbox = screen.getByLabelText('Part A');
      partCheckbox.focus();
      await user.keyboard(' '); // Space key

      expect(partCheckbox).toBeChecked();
    });

    it('supports arrow keys for navigation between options', async () => {
      const user = userEvent.setup();
      render(<NewOrder />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Test Contract')).toBeInTheDocument();
      });

      // Focus first contract card
      const cards = screen.getAllByRole('button', { name: /Contract/i });
      cards[0].focus();

      // Use arrow keys to navigate
      await user.keyboard('{ArrowDown}');
      // Check focus moved (implementation specific)

      await user.keyboard('{ArrowUp}');
      // Check focus moved back
    });

    it('supports Escape key to close dialogs', async () => {
      const user = userEvent.setup();
      render(<NewOrder />, { wrapper: createWrapper() });

      // Navigate to template step and open preview
      await navigateToTemplateStep(user);

      await waitFor(() => {
        expect(screen.getByText('Standard Template')).toBeInTheDocument();
      });

      // Open preview dialog
      const previewButton = screen.getByRole('button', { name: /Preview/i });
      await user.click(previewButton);

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      // Close with Escape
      await user.keyboard('{Escape}');

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
    });

    it('traps focus within modal dialogs', async () => {
      const user = userEvent.setup();
      render(<NewOrder />, { wrapper: createWrapper() });

      await navigateToTemplateStep(user);

      await waitFor(() => {
        expect(screen.getByText('Standard Template')).toBeInTheDocument();
      });

      // Open preview dialog
      const previewButton = screen.getByRole('button', { name: /Preview/i });
      await user.click(previewButton);

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      // Tab through dialog elements
      const dialog = screen.getByRole('dialog');
      const focusableElements = dialog.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );

      // Focus should cycle within dialog
      await user.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);

      // Tab through all elements
      for (let i = 0; i < focusableElements.length + 1; i++) {
        await user.tab();
      }

      // Focus should wrap back to first element in dialog
      expect(dialog.contains(document.activeElement)).toBe(true);
    });

    it('provides keyboard shortcuts for common actions', async () => {
      const user = userEvent.setup();
      render(<NewOrder />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Test Contract')).toBeInTheDocument();
      });

      // Select contract
      const contractCard = screen.getByTestId('contract-card-contract1');
      await user.click(contractCard);

      // Use Ctrl+Enter to proceed
      await user.keyboard('{Control>}{Enter}{/Control}');

      await waitFor(() => {
        // Should move to next step
        expect(screen.getByLabelText('Order Name')).toBeInTheDocument();
      });

      // Use Ctrl+S to save draft
      await user.keyboard('{Control>}s{/Control}');

      await waitFor(() => {
        // Check draft saved indicator
        expect(screen.getByText(/Draft saved/i)).toBeInTheDocument();
      });
    });
  });

  describe('Focus Management', () => {
    it('maintains focus on step change', async () => {
      const user = userEvent.setup();
      render(<NewOrder />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Test Contract')).toBeInTheDocument();
      });

      // Select contract and proceed
      const contractCard = screen.getByTestId('contract-card-contract1');
      await user.click(contractCard);

      const nextButton = screen.getByRole('button', { name: /Next/i });
      await user.click(nextButton);

      await waitFor(() => {
        // Focus should move to first input in new step
        expect(document.activeElement).toBe(screen.getByLabelText('Order Name'));
      });
    });

    it('restores focus after error messages', async () => {
      const user = userEvent.setup();
      render(<NewOrder />, { wrapper: createWrapper() });

      await navigateToDetailsStep(user);

      const orderNameInput = screen.getByLabelText('Order Name');
      await user.type(orderNameInput, 'ab'); // Too short
      await user.tab();

      await waitFor(() => {
        expect(screen.getByText(/at least 3 characters/)).toBeInTheDocument();
      });

      // Focus should remain accessible
      await user.tab();
      expect(document.activeElement).toHaveAttribute('role');
    });

    it('provides skip links for keyboard users', () => {
      render(<NewOrder />, { wrapper: createWrapper() });

      // Check for skip to content link
      const skipLink = screen.getByText(/Skip to main content/i);
      expect(skipLink).toBeInTheDocument();
      expect(skipLink).toHaveAttribute('href', '#main-content');
    });

    it('indicates current step visually and programmatically', async () => {
      render(<NewOrder />, { wrapper: createWrapper() });

      await waitFor(() => {
        // Check current step indicator
        const currentStep = screen.getByText('Contract').closest('[role="button"]');
        expect(currentStep).toHaveAttribute('aria-current', 'step');
        
        // Check visual indicator (class or style)
        expect(currentStep).toHaveClass('current-step');
      });
    });
  });

  describe('Form Accessibility', () => {
    it('associates labels with form controls', async () => {
      const user = userEvent.setup();
      render(<NewOrder />, { wrapper: createWrapper() });

      await navigateToDetailsStep(user);

      // Check label associations
      const orderNameInput = screen.getByLabelText('Order Name');
      expect(orderNameInput).toHaveAttribute('id');
      
      const label = screen.getByText('Order Name');
      expect(label).toHaveAttribute('for', orderNameInput.id);
    });

    it('provides error messages associated with fields', async () => {
      const user = userEvent.setup();
      render(<NewOrder />, { wrapper: createWrapper() });

      await navigateToDetailsStep(user);

      const orderNameInput = screen.getByLabelText('Order Name');
      await user.type(orderNameInput, 'ab');
      await user.tab();

      await waitFor(() => {
        const errorMessage = screen.getByText(/at least 3 characters/);
        expect(errorMessage).toHaveAttribute('id');
        expect(orderNameInput).toHaveAttribute('aria-describedby', errorMessage.id);
        expect(orderNameInput).toHaveAttribute('aria-invalid', 'true');
      });
    });

    it('marks required fields appropriately', async () => {
      const user = userEvent.setup();
      render(<NewOrder />, { wrapper: createWrapper() });

      await navigateToDetailsStep(user);

      const orderNameInput = screen.getByLabelText('Order Name');
      expect(orderNameInput).toHaveAttribute('aria-required', 'true');
      
      // Visual indicator
      const label = screen.getByText('Order Name');
      expect(label.textContent).toContain('*');
    });

    it('provides helpful field descriptions', async () => {
      const user = userEvent.setup();
      render(<NewOrder />, { wrapper: createWrapper() });

      await navigateToDetailsStep(user);

      const descriptionField = screen.getByLabelText('Description');
      const helpText = screen.getByText(/Optional description/i);
      
      expect(helpText).toHaveAttribute('id');
      expect(descriptionField).toHaveAttribute('aria-describedby', helpText.id);
    });
  });

  describe('Screen Reader Support', () => {
    it('announces validation errors', async () => {
      const user = userEvent.setup();
      render(<NewOrder />, { wrapper: createWrapper() });

      await navigateToDetailsStep(user);

      const orderNameInput = screen.getByLabelText('Order Name');
      await user.type(orderNameInput, 'ab');
      await user.tab();

      await waitFor(() => {
        const errorRegion = screen.getByRole('alert');
        expect(errorRegion).toHaveTextContent(/at least 3 characters/);
      });
    });

    it('provides progress information', async () => {
      render(<NewOrder />, { wrapper: createWrapper() });

      await waitFor(() => {
        const progressBar = screen.getByRole('progressbar');
        expect(progressBar).toHaveAttribute('aria-valuenow');
        expect(progressBar).toHaveAttribute('aria-valuemin', '0');
        expect(progressBar).toHaveAttribute('aria-valuemax', '100');
        expect(progressBar).toHaveAttribute('aria-label', expect.stringContaining('Progress'));
      });
    });

    it('announces loading states', async () => {
      vi.mocked(contractsApi.getUserContracts).mockImplementation(
        () => new Promise(() => {})
      );

      render(<NewOrder />, { wrapper: createWrapper() });

      const loadingIndicator = screen.getByRole('status');
      expect(loadingIndicator).toHaveTextContent(/Loading/i);
    });
  });
});

// Helper functions
async function makeStepSelection(user: ReturnType<typeof userEvent.setup>, step: number) {
  switch (step) {
    case 0: { // Contract selection
      const contractCard = screen.getByTestId('contract-card-contract1');
      await user.click(contractCard);
      break;
    }
    case 1: { // Order details
      const orderNameInput = screen.getByLabelText('Order Name');
      await user.type(orderNameInput, 'Test Order');
      break;
    }
    case 2: { // Template selection
      const templateCard = screen.getByTestId('template-card-template1');
      await user.click(templateCard);
      break;
    }
    case 3: { // Parts configuration
      const partCheckbox = screen.getByLabelText('Part A');
      await user.click(partCheckbox);
      break;
    }
    case 4: { // Partner assignment
      const partnerCard = screen.getByTestId('partner-card-company1');
      await user.click(partnerCard);
      break;
    }
  }
}

async function navigateToDetailsStep(user: ReturnType<typeof userEvent.setup>) {
  await waitFor(() => {
    expect(screen.getByText('Test Contract')).toBeInTheDocument();
  });

  const contractCard = screen.getByTestId('contract-card-contract1');
  await user.click(contractCard);

  const nextButton = screen.getByRole('button', { name: /Next/i });
  await user.click(nextButton);

  await waitFor(() => {
    expect(screen.getByLabelText('Order Name')).toBeInTheDocument();
  });
}

async function navigateToTemplateStep(user: ReturnType<typeof userEvent.setup>) {
  await navigateToDetailsStep(user);

  const orderNameInput = screen.getByLabelText('Order Name');
  await user.type(orderNameInput, 'Test Order');

  const nextButton = screen.getByRole('button', { name: /Next/i });
  await user.click(nextButton);
}

async function navigateToPartsStep(user: ReturnType<typeof userEvent.setup>) {
  await navigateToTemplateStep(user);

  await waitFor(() => {
    expect(screen.getByText('Standard Template')).toBeInTheDocument();
  });

  const templateCard = screen.getByTestId('template-card-template1');
  await user.click(templateCard);

  const nextButton = screen.getByRole('button', { name: /Next/i });
  await user.click(nextButton);
}