import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RollbackModal } from '../RollbackModal';
import { templateService } from '../../../services/templates';
import type { Template, TemplateVersion } from '../../../types/templates';

// Mock the template service
vi.mock('../../../services/templates', () => ({
  templateService: {
    analyzeRollbackImpact: vi.fn(),
    performRollback: vi.fn(),
  },
}));

const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

const mockTemplate: Template = {
  id: '1',
  name: 'Test Template',
  description: 'Test template description',
  status: 'active',
  currentVersion: '2.0.0',
  createdBy: 'Admin',
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-05'),
  usageCount: 10,
  tags: ['test'],
};

const mockCurrentVersion: TemplateVersion = {
  id: 'v2',
  templateId: '1',
  version: '2.0.0',
  structure: {
    id: 'root',
    name: 'Root',
    path: '/',
    type: 'folder',
    children: [],
    properties: {
      required: true,
      locked: false,
    },
    permissions: {
      inherit: true,
      breakInheritance: false,
      groups: [],
    },
    metadata: {},
  },
  changelog: 'Updated structure',
  author: 'Current Author',
  publishedAt: new Date('2025-01-05'),
  isPublished: true,
  usageCount: 5,
};

const mockTargetVersion: TemplateVersion = {
  id: 'v1',
  templateId: '1',
  version: '1.0.0',
  structure: {
    id: 'root',
    name: 'Root',
    path: '/',
    type: 'folder',
    children: [],
    properties: {
      required: true,
      locked: false,
    },
    permissions: {
      inherit: true,
      breakInheritance: false,
      groups: [],
    },
    metadata: {},
  },
  changelog: 'Initial version',
  author: 'Original Author',
  publishedAt: new Date('2025-01-01'),
  isPublished: true,
  usageCount: 3,
};

const mockImpactAnalysis = {
  affectedOrders: [
    {
      id: 'order1',
      name: 'Test Order 1',
      status: 'active',
      createdAt: '2025-01-02',
    },
    {
      id: 'order2',
      name: 'Test Order 2',
      status: 'draft',
      createdAt: '2025-01-03',
    },
  ],
  breakingChanges: [],
  warnings: ['Some folders may have different permissions after rollback'],
  constraints: [
    {
      message: 'Template structure validation passed',
      severity: 'info' as const,
    },
  ],
};

describe('RollbackModal', () => {
  const mockOnRollback = vi.fn();
  const mockOnCancel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderComponent = (props = {}) => {
    const queryClient = createQueryClient();
    return render(
      <QueryClientProvider client={queryClient}>
        <RollbackModal
          template={mockTemplate}
          targetVersion={mockTargetVersion}
          currentVersion={mockCurrentVersion}
          onRollback={mockOnRollback}
          onCancel={mockOnCancel}
          open={true}
          {...props}
        />
      </QueryClientProvider>
    );
  };

  it('should render rollback modal with version information', () => {
    renderComponent();

    expect(screen.getByText('Rollback Template Version')).toBeInTheDocument();
    expect(screen.getByText('Version 2.0.0')).toBeInTheDocument();
    expect(screen.getByText('Version 1.0.0')).toBeInTheDocument();
    expect(screen.getByText('Current Author')).toBeInTheDocument();
    expect(screen.getByText('Original Author')).toBeInTheDocument();
  });

  it('should fetch and display impact analysis', async () => {
    vi.mocked(templateService.analyzeRollbackImpact).mockResolvedValue(mockImpactAnalysis);

    renderComponent();

    await waitFor(() => {
      expect(templateService.analyzeRollbackImpact).toHaveBeenCalledWith('1', '1.0.0');
    });

    await waitFor(() => {
      expect(screen.getByText('2 Future Orders Will Be Affected')).toBeInTheDocument();
      expect(screen.getByText('Test Order 1')).toBeInTheDocument();
      expect(screen.getByText('Test Order 2')).toBeInTheDocument();
      expect(screen.getByText('Some folders may have different permissions after rollback')).toBeInTheDocument();
    });
  });

  it('should require rollback reason', async () => {
    vi.mocked(templateService.analyzeRollbackImpact).mockResolvedValue(mockImpactAnalysis);

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Template structure validation passed')).toBeInTheDocument();
    });

    const confirmButton = screen.getByRole('button', { name: /Confirm Rollback/i });
    expect(confirmButton).toBeDisabled();

    const reasonTextarea = screen.getByPlaceholderText(/Provide a detailed reason/i);
    await userEvent.type(reasonTextarea, 'Reverting due to issues in production');

    await waitFor(() => {
      expect(confirmButton).toBeEnabled();
    });
  });

  it('should call onRollback with correct parameters', async () => {
    vi.mocked(templateService.analyzeRollbackImpact).mockResolvedValue(mockImpactAnalysis);
    mockOnRollback.mockResolvedValue(undefined);

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Template structure validation passed')).toBeInTheDocument();
    });

    const reasonTextarea = screen.getByPlaceholderText(/Provide a detailed reason/i);
    await userEvent.type(reasonTextarea, 'Reverting due to issues in production');

    const confirmButton = screen.getByRole('button', { name: /Confirm Rollback/i });
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(mockOnRollback).toHaveBeenCalledWith(
        mockTargetVersion,
        'Reverting due to issues in production'
      );
    });
  });

  it('should display breaking changes when present', async () => {
    const impactWithBreakingChanges = {
      ...mockImpactAnalysis,
      breakingChanges: [
        'Required folder "Financial" will be removed',
        'Permission inheritance will be modified',
      ],
    };

    vi.mocked(templateService.analyzeRollbackImpact).mockResolvedValue(impactWithBreakingChanges);

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Breaking Changes Detected')).toBeInTheDocument();
      expect(screen.getByText('Required folder "Financial" will be removed')).toBeInTheDocument();
      expect(screen.getByText('Permission inheritance will be modified')).toBeInTheDocument();
    });
  });

  it('should display error constraints', async () => {
    const impactWithErrors = {
      ...mockImpactAnalysis,
      constraints: [
        {
          message: 'Critical validation failed: Maximum depth exceeded',
          severity: 'error' as const,
        },
        {
          message: 'Warning: Some permissions may be reset',
          severity: 'warning' as const,
        },
      ],
    };

    vi.mocked(templateService.analyzeRollbackImpact).mockResolvedValue(impactWithErrors);

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Validation Constraints')).toBeInTheDocument();
      expect(screen.getByText('Critical validation failed: Maximum depth exceeded')).toBeInTheDocument();
      expect(screen.getByText('Warning: Some permissions may be reset')).toBeInTheDocument();
    });

    // Should disable confirm button when there are error constraints
    const reasonTextarea = screen.getByPlaceholderText(/Provide a detailed reason/i);
    await userEvent.type(reasonTextarea, 'Test reason');

    const confirmButton = screen.getByRole('button', { name: /Confirm Rollback/i });
    expect(confirmButton).toBeDisabled();
  });

  it('should handle rollback errors', async () => {
    vi.mocked(templateService.analyzeRollbackImpact).mockResolvedValue(mockImpactAnalysis);
    mockOnRollback.mockRejectedValue(new Error('Rollback failed'));

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Template structure validation passed')).toBeInTheDocument();
    });

    const reasonTextarea = screen.getByPlaceholderText(/Provide a detailed reason/i);
    await userEvent.type(reasonTextarea, 'Test reason');

    const confirmButton = screen.getByRole('button', { name: /Confirm Rollback/i });
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(screen.getByText('Rollback failed')).toBeInTheDocument();
    });
  });

  it('should show loading state while analyzing impact', () => {
    vi.mocked(templateService.analyzeRollbackImpact).mockImplementation(
      () => new Promise(() => {}) // Never resolves
    );

    renderComponent();

    expect(screen.getByText('Analyzing rollback impact...')).toBeInTheDocument();
  });

  it('should handle cancel action', () => {
    renderComponent();

    const cancelButton = screen.getByRole('button', { name: /Cancel/i });
    fireEvent.click(cancelButton);

    expect(mockOnCancel).toHaveBeenCalledTimes(1);
  });

  it('should close modal when open prop is false', () => {
    const { rerender } = renderComponent({ open: true });
    expect(screen.getByText('Rollback Template Version')).toBeInTheDocument();

    rerender(
      <QueryClientProvider client={createQueryClient()}>
        <RollbackModal
          template={mockTemplate}
          targetVersion={mockTargetVersion}
          currentVersion={mockCurrentVersion}
          onRollback={mockOnRollback}
          onCancel={mockOnCancel}
          open={false}
        />
      </QueryClientProvider>
    );

    expect(screen.queryByText('Rollback Template Version')).not.toBeInTheDocument();
  });

  it('should display usage count for each version', () => {
    renderComponent();

    expect(screen.getByText('5 orders using')).toBeInTheDocument(); // Current version
    expect(screen.getByText('3 orders using')).toBeInTheDocument(); // Target version
  });

  it('should show view all link when more than 5 orders affected', async () => {
    const manyOrdersImpact = {
      ...mockImpactAnalysis,
      affectedOrders: Array.from({ length: 10 }, (_, i) => ({
        id: `order${i}`,
        name: `Test Order ${i}`,
        status: 'active',
        createdAt: '2025-01-02',
      })),
    };

    vi.mocked(templateService.analyzeRollbackImpact).mockResolvedValue(manyOrdersImpact);

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('View all 10 affected orders')).toBeInTheDocument();
    });

    // Should only show first 5 orders
    expect(screen.getByText('Test Order 0')).toBeInTheDocument();
    expect(screen.getByText('Test Order 4')).toBeInTheDocument();
    expect(screen.queryByText('Test Order 5')).not.toBeInTheDocument();
  });

  it('should display important information message', () => {
    renderComponent();

    expect(screen.getByText('Important Information')).toBeInTheDocument();
    expect(screen.getByText(/This rollback will create a new version/)).toBeInTheDocument();
    expect(screen.getByText(/Existing orders will not be affected/)).toBeInTheDocument();
    expect(screen.getByText(/The rollback operation cannot be undone/)).toBeInTheDocument();
    expect(screen.getByText(/All rollback operations are tracked/)).toBeInTheDocument();
  });

  it('should enforce maximum reason length', async () => {
    vi.mocked(templateService.analyzeRollbackImpact).mockResolvedValue(mockImpactAnalysis);

    renderComponent();

    const reasonTextarea = screen.getByPlaceholderText(/Provide a detailed reason/i);
    const longText = 'a'.repeat(600); // Try to exceed 500 char limit

    await userEvent.clear(reasonTextarea);
    await userEvent.type(reasonTextarea, longText);

    await waitFor(() => {
      const textareaElement = reasonTextarea as HTMLTextAreaElement;
      expect(textareaElement.value.length).toBeLessThanOrEqual(500);
    });
  });
});