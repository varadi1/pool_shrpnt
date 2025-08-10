import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { NewOrder } from '../NewOrder';
import * as contractsApi from '../../../services/api/contracts';
import * as templatesApi from '../../../services/api/templates';
import * as ordersApi from '../../../services/api/orders';
import * as companiesApi from '../../../services/api/companies';

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
    folders: [
      { path: '/Documents', permissions: ['read', 'write'], locked: false }
    ]
  }
];

const mockCompanies = [
  {
    id: 'company1',
    name: 'Partner Company A',
    type: 'partner',
    email: 'contact@partnera.com',
    status: 'active'
  },
  {
    id: 'company2',
    name: 'Partner Company B',
    type: 'partner',
    email: 'contact@partnerb.com',
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

describe('NewOrder Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();

    // Setup default mock responses
    vi.mocked(contractsApi.getUserContracts).mockResolvedValue(mockContracts);
    vi.mocked(templatesApi.getTemplates).mockResolvedValue(mockTemplates);
    vi.mocked(companiesApi.getPartnerCompanies).mockResolvedValue(mockCompanies);
    vi.mocked(ordersApi.getNextSequence).mockResolvedValue(42);
    vi.mocked(ordersApi.createOrder).mockResolvedValue({
      id: 'order123',
      code: 'EM-2025-NEU001-042',
      status: 'provisioning'
    });
    vi.mocked(ordersApi.triggerProvisioning).mockResolvedValue({
      taskId: 'task456',
      status: 'started'
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('API Integration', () => {
    it('fetches contracts on mount', async () => {
      render(<NewOrder />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(contractsApi.getUserContracts).toHaveBeenCalled();
      });
    });

    it('fetches templates after contract selection', async () => {
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
        expect(templatesApi.getTemplates).toHaveBeenCalled();
      });
    });

    it('fetches partner companies when reaching partner step', async () => {
      const user = userEvent.setup();
      render(<NewOrder />, { wrapper: createWrapper() });

      // Navigate through steps
      await navigateToPartnerStep(user);

      await waitFor(() => {
        expect(companiesApi.getPartnerCompanies).toHaveBeenCalled();
        expect(screen.getByText('Partner Company A')).toBeInTheDocument();
      });
    });

    it('handles API errors gracefully', async () => {
      vi.mocked(contractsApi.getUserContracts).mockRejectedValue(
        new Error('Network error')
      );

      render(<NewOrder />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText(/Failed to load contracts/)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Retry/i })).toBeInTheDocument();
      });
    });

    it('retries failed API calls', async () => {
      vi.mocked(contractsApi.getUserContracts)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(mockContracts);

      const user = userEvent.setup();
      render(<NewOrder />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText(/Failed to load contracts/)).toBeInTheDocument();
      });

      const retryButton = screen.getByRole('button', { name: /Retry/i });
      await user.click(retryButton);

      await waitFor(() => {
        expect(screen.getByText('Test Contract')).toBeInTheDocument();
      });
    });
  });

  describe('Form Submission', () => {
    it('submits order with all required data', async () => {
      const user = userEvent.setup();
      render(<NewOrder />, { wrapper: createWrapper() });

      // Complete all steps
      await completeOrderForm(user);

      // Submit order
      const submitButton = screen.getByRole('button', { name: /Submit Order/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(ordersApi.createOrder).toHaveBeenCalledWith(
          expect.objectContaining({
            contractId: 'contract1',
            name: expect.any(String),
            code: 'EM-2025-NEU001-042',
            templateId: 'template1',
            templateVersion: '2.0',
            parts: expect.arrayContaining([
              expect.objectContaining({
                type: 'A',
                deadline: expect.any(String)
              })
            ]),
            partners: expect.arrayContaining([
              expect.objectContaining({
                companyId: 'company1',
                accessLevel: expect.any(String)
              })
            ])
          })
        );
      });
    });

    it('triggers provisioning after order creation', async () => {
      const user = userEvent.setup();
      render(<NewOrder />, { wrapper: createWrapper() });

      await completeOrderForm(user);

      const submitButton = screen.getByRole('button', { name: /Submit Order/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(ordersApi.triggerProvisioning).toHaveBeenCalledWith('order123');
      });
    });

    it('shows provisioning status after submission', async () => {
      vi.mocked(ordersApi.getProvisioningStatus).mockResolvedValue({
        status: 'in_progress',
        steps: [
          { name: 'Creating folders', status: 'completed' },
          { name: 'Setting permissions', status: 'in_progress' },
          { name: 'Creating Teams', status: 'pending' }
        ],
        progress: 33,
        estimatedTimeRemaining: 480
      });

      const user = userEvent.setup();
      render(<NewOrder />, { wrapper: createWrapper() });

      await completeOrderForm(user);

      const submitButton = screen.getByRole('button', { name: /Submit Order/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/Provisioning in Progress/)).toBeInTheDocument();
        expect(screen.getByText(/Creating folders/)).toBeInTheDocument();
        expect(screen.getByText(/33%/)).toBeInTheDocument();
      });
    });

    it('handles submission errors', async () => {
      vi.mocked(ordersApi.createOrder).mockRejectedValue({
        response: {
          status: 400,
          data: {
            detail: 'Invalid order data',
            correlationId: 'error123'
          }
        }
      });

      const user = userEvent.setup();
      render(<NewOrder />, { wrapper: createWrapper() });

      await completeOrderForm(user);

      const submitButton = screen.getByRole('button', { name: /Submit Order/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/Failed to create order/)).toBeInTheDocument();
        expect(screen.getByText(/Invalid order data/)).toBeInTheDocument();
        expect(screen.getByText(/error123/)).toBeInTheDocument();
      });
    });

    it('retries failed provisioning', async () => {
      vi.mocked(ordersApi.triggerProvisioning)
        .mockRejectedValueOnce(new Error('Provisioning failed'))
        .mockResolvedValueOnce({ taskId: 'task789', status: 'started' });

      const user = userEvent.setup();
      render(<NewOrder />, { wrapper: createWrapper() });

      await completeOrderForm(user);

      const submitButton = screen.getByRole('button', { name: /Submit Order/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/Provisioning failed/)).toBeInTheDocument();
      });

      const retryButton = screen.getByRole('button', { name: /Retry Provisioning/i });
      await user.click(retryButton);

      await waitFor(() => {
        expect(ordersApi.triggerProvisioning).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('Draft Management', () => {
    it('saves draft to localStorage', async () => {
      const user = userEvent.setup();
      render(<NewOrder />, { wrapper: createWrapper() });

      // Fill some data
      await waitFor(() => {
        expect(screen.getByText('Test Contract')).toBeInTheDocument();
      });

      const contractCard = screen.getByTestId('contract-card-contract1');
      await user.click(contractCard);

      // Save draft
      const saveButton = screen.getByRole('button', { name: /Save Draft/i });
      await user.click(saveButton);

      await waitFor(() => {
        const draft = localStorage.getItem('order-draft-contract1');
        expect(draft).toBeTruthy();
        const parsedDraft = JSON.parse(draft!);
        expect(parsedDraft.data.contractId).toBe('contract1');
      });
    });

    it('loads draft on mount if available', async () => {
      const draftData = {
        data: {
          contractId: 'contract1',
          contractName: 'Test Contract',
          orderName: 'Draft Order',
          templateId: 'template1'
        },
        savedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      };

      localStorage.setItem('order-draft', JSON.stringify(draftData));

      render(<NewOrder />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText(/Draft loaded/)).toBeInTheDocument();
      });
    });

    it('clears expired drafts', async () => {
      const expiredDraft = {
        data: { contractId: 'contract1' },
        savedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
        expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      };

      localStorage.setItem('order-draft', JSON.stringify(expiredDraft));

      render(<NewOrder />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(localStorage.getItem('order-draft')).toBeNull();
      });
    });
  });

  describe('Error Handling', () => {
    it('displays validation errors for each step', async () => {
      const user = userEvent.setup();
      render(<NewOrder />, { wrapper: createWrapper() });

      // Try to proceed without selecting contract
      const nextButton = screen.getByRole('button', { name: /Next/i });
      expect(nextButton).toBeDisabled();

      // Select contract and proceed
      await waitFor(() => {
        expect(screen.getByText('Test Contract')).toBeInTheDocument();
      });

      const contractCard = screen.getByTestId('contract-card-contract1');
      await user.click(contractCard);
      await user.click(nextButton);

      // Try to proceed with invalid order name
      const orderNameInput = screen.getByLabelText('Order Name');
      await user.type(orderNameInput, 'ab'); // Too short
      await user.tab();

      expect(screen.getByText(/at least 3 characters/)).toBeInTheDocument();
    });

    it('handles network timeouts', async () => {
      vi.mocked(ordersApi.createOrder).mockImplementation(
        () => new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Request timeout')), 100);
        })
      );

      const user = userEvent.setup();
      render(<NewOrder />, { wrapper: createWrapper() });

      await completeOrderForm(user);

      const submitButton = screen.getByRole('button', { name: /Submit Order/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/Request timeout/)).toBeInTheDocument();
      }, { timeout: 5000 });
    });

    it('handles rate limiting errors', async () => {
      vi.mocked(ordersApi.createOrder).mockRejectedValue({
        response: {
          status: 429,
          headers: { 'retry-after': '60' },
          data: { detail: 'Rate limit exceeded' }
        }
      });

      const user = userEvent.setup();
      render(<NewOrder />, { wrapper: createWrapper() });

      await completeOrderForm(user);

      const submitButton = screen.getByRole('button', { name: /Submit Order/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/Rate limit exceeded/)).toBeInTheDocument();
        expect(screen.getByText(/Try again in 60 seconds/)).toBeInTheDocument();
      });
    });
  });
});

// Helper functions
async function navigateToPartnerStep(user: ReturnType<typeof userEvent.setup>) {
  // Select contract
  await waitFor(() => {
    expect(screen.getByText('Test Contract')).toBeInTheDocument();
  });
  
  const contractCard = screen.getByTestId('contract-card-contract1');
  await user.click(contractCard);
  
  let nextButton = screen.getByRole('button', { name: /Next/i });
  await user.click(nextButton);

  // Fill order details
  await waitFor(() => {
    expect(screen.getByLabelText('Order Name')).toBeInTheDocument();
  });
  
  const orderNameInput = screen.getByLabelText('Order Name');
  await user.type(orderNameInput, 'Test Order');
  
  nextButton = screen.getByRole('button', { name: /Next/i });
  await user.click(nextButton);

  // Select template
  await waitFor(() => {
    expect(screen.getByText('Standard Template')).toBeInTheDocument();
  });
  
  const templateCard = screen.getByTestId('template-card-template1');
  await user.click(templateCard);
  
  nextButton = screen.getByRole('button', { name: /Next/i });
  await user.click(nextButton);

  // Configure parts
  await waitFor(() => {
    expect(screen.getByText('Part A')).toBeInTheDocument();
  });
  
  const partACheckbox = screen.getByLabelText('Part A');
  await user.click(partACheckbox);
  
  nextButton = screen.getByRole('button', { name: /Next/i });
  await user.click(nextButton);
}

async function completeOrderForm(user: ReturnType<typeof userEvent.setup>) {
  // Navigate to partner step
  await navigateToPartnerStep(user);

  // Select partner
  await waitFor(() => {
    expect(screen.getByText('Partner Company A')).toBeInTheDocument();
  });
  
  const partnerCard = screen.getByTestId('partner-card-company1');
  await user.click(partnerCard);

  // Go to review
  const nextButton = screen.getByRole('button', { name: /Next/i });
  await user.click(nextButton);

  // Confirm on review page
  await waitFor(() => {
    expect(screen.getByText(/Review Your Order/)).toBeInTheDocument();
  });

  const confirmCheckbox = screen.getByLabelText(/I confirm/i);
  await user.click(confirmCheckbox);
}