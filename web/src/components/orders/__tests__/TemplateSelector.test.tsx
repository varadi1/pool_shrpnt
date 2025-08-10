import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TemplateSelector } from '../TemplateSelector';
import * as templatesApi from '../../../services/api/templates';

vi.mock('../../../services/api/templates');

const mockTemplates = [
  {
    id: '1',
    name: 'Standard Template',
    version: '2.0',
    description: 'Basic folder structure for standard projects',
    lastModified: '2025-01-10T10:00:00Z',
    usageCount: 25,
    createdBy: 'admin@company.com',
    isRecommended: true,
    folders: [
      { path: '/Documents', permissions: ['read', 'write'], locked: false },
      { path: '/Reports', permissions: ['read'], locked: true },
      { path: '/Archive', permissions: ['read'], locked: false }
    ]
  },
  {
    id: '2',
    name: 'Advanced Template',
    version: '1.5',
    description: 'Complex structure with multiple permission levels',
    lastModified: '2025-01-08T14:30:00Z',
    usageCount: 10,
    createdBy: 'pm@company.com',
    isRecommended: false,
    folders: [
      { path: '/Documents', permissions: ['read', 'write'], locked: false },
      { path: '/Confidential', permissions: ['read'], locked: true },
      { path: '/Public', permissions: ['read', 'write'], locked: false },
      { path: '/Archive', permissions: ['read'], locked: true }
    ]
  },
  {
    id: '3',
    name: 'Minimal Template',
    version: '3.0',
    description: 'Simple structure for quick setup',
    lastModified: '2025-01-05T09:15:00Z',
    usageCount: 50,
    createdBy: 'admin@company.com',
    isRecommended: false,
    folders: [
      { path: '/Shared', permissions: ['read', 'write'], locked: false }
    ]
  }
];

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
};

describe('TemplateSelector', () => {
  const mockOnChange = vi.fn();
  const mockOnValidate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state initially', () => {
    vi.mocked(templatesApi.getTemplates).mockImplementation(() => 
      new Promise(() => {})
    );

    render(
      <TemplateSelector
        value={null}
        onChange={mockOnChange}
        onValidate={mockOnValidate}
      />,
      { wrapper: createWrapper() }
    );

    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('renders templates after loading', async () => {
    vi.mocked(templatesApi.getTemplates).mockResolvedValue(mockTemplates);

    render(
      <TemplateSelector
        value={null}
        onChange={mockOnChange}
        onValidate={mockOnValidate}
      />,
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(screen.getByText('Standard Template')).toBeInTheDocument();
      expect(screen.getByText('Advanced Template')).toBeInTheDocument();
      expect(screen.getByText('Minimal Template')).toBeInTheDocument();
    });
  });

  it('shows recommended badge for recommended templates', async () => {
    vi.mocked(templatesApi.getTemplates).mockResolvedValue(mockTemplates);

    render(
      <TemplateSelector
        value={null}
        onChange={mockOnChange}
        onValidate={mockOnValidate}
      />,
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      const recommendedCard = screen.getByTestId('template-card-1');
      expect(recommendedCard).toHaveTextContent('Recommended');
    });
  });

  it('displays template metadata', async () => {
    vi.mocked(templatesApi.getTemplates).mockResolvedValue(mockTemplates);

    render(
      <TemplateSelector
        value={null}
        onChange={mockOnChange}
        onValidate={mockOnValidate}
      />,
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      const standardCard = screen.getByTestId('template-card-1');
      expect(standardCard).toHaveTextContent('Version: 2.0');
      expect(standardCard).toHaveTextContent('Used 25 times');
      expect(standardCard).toHaveTextContent('Basic folder structure for standard projects');
    });
  });

  it('selects a template when clicked', async () => {
    vi.mocked(templatesApi.getTemplates).mockResolvedValue(mockTemplates);
    const user = userEvent.setup();

    render(
      <TemplateSelector
        value={null}
        onChange={mockOnChange}
        onValidate={mockOnValidate}
      />,
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(screen.getByText('Standard Template')).toBeInTheDocument();
    });

    const templateCard = screen.getByTestId('template-card-1');
    await user.click(templateCard);

    expect(mockOnChange).toHaveBeenCalledWith({
      templateId: '1',
      templateVersion: '2.0'
    });
    expect(mockOnValidate).toHaveBeenCalledWith(true);
  });

  it('shows selected state for current template', async () => {
    vi.mocked(templatesApi.getTemplates).mockResolvedValue(mockTemplates);

    render(
      <TemplateSelector
        value={{
          templateId: '1',
          templateVersion: '2.0'
        }}
        onChange={mockOnChange}
        onValidate={mockOnValidate}
      />,
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      const selectedCard = screen.getByTestId('template-card-1');
      expect(selectedCard).toHaveAttribute('aria-selected', 'true');
    });
  });

  it('opens preview dialog when preview button clicked', async () => {
    vi.mocked(templatesApi.getTemplates).mockResolvedValue(mockTemplates);
    vi.mocked(templatesApi.getTemplatePreview).mockResolvedValue({
      folders: mockTemplates[0].folders,
      metadata: {
        createdBy: mockTemplates[0].createdBy,
        usageCount: mockTemplates[0].usageCount,
        lastUsed: new Date('2025-01-09T15:00:00Z')
      }
    });

    const user = userEvent.setup();

    render(
      <TemplateSelector
        value={null}
        onChange={mockOnChange}
        onValidate={mockOnValidate}
      />,
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(screen.getByText('Standard Template')).toBeInTheDocument();
    });

    const previewButton = screen.getAllByRole('button', { name: /Preview/i })[0];
    await user.click(previewButton);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('Template Preview')).toBeInTheDocument();
      expect(screen.getByText('/Documents')).toBeInTheDocument();
      expect(screen.getByText('/Reports')).toBeInTheDocument();
      expect(screen.getByText('/Archive')).toBeInTheDocument();
    });
  });

  it('shows lock indicators in preview', async () => {
    vi.mocked(templatesApi.getTemplates).mockResolvedValue(mockTemplates);
    vi.mocked(templatesApi.getTemplatePreview).mockResolvedValue({
      folders: mockTemplates[0].folders,
      metadata: {
        createdBy: mockTemplates[0].createdBy,
        usageCount: mockTemplates[0].usageCount,
        lastUsed: new Date()
      }
    });

    const user = userEvent.setup();

    render(
      <TemplateSelector
        value={null}
        onChange={mockOnChange}
        onValidate={mockOnValidate}
      />,
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(screen.getByText('Standard Template')).toBeInTheDocument();
    });

    const previewButton = screen.getAllByRole('button', { name: /Preview/i })[0];
    await user.click(previewButton);

    await waitFor(() => {
      const lockedFolder = screen.getByText('/Reports').closest('div');
      expect(lockedFolder).toHaveTextContent('🔒');
    });
  });

  it('closes preview dialog', async () => {
    vi.mocked(templatesApi.getTemplates).mockResolvedValue(mockTemplates);
    vi.mocked(templatesApi.getTemplatePreview).mockResolvedValue({
      folders: mockTemplates[0].folders,
      metadata: {
        createdBy: mockTemplates[0].createdBy,
        usageCount: mockTemplates[0].usageCount,
        lastUsed: new Date()
      }
    });

    const user = userEvent.setup();

    render(
      <TemplateSelector
        value={null}
        onChange={mockOnChange}
        onValidate={mockOnValidate}
      />,
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(screen.getByText('Standard Template')).toBeInTheDocument();
    });

    const previewButton = screen.getAllByRole('button', { name: /Preview/i })[0];
    await user.click(previewButton);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    const closeButton = screen.getByRole('button', { name: /Close/i });
    await user.click(closeButton);

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('filters templates by search term', async () => {
    vi.mocked(templatesApi.getTemplates).mockResolvedValue(mockTemplates);
    const user = userEvent.setup();

    render(
      <TemplateSelector
        value={null}
        onChange={mockOnChange}
        onValidate={mockOnValidate}
      />,
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(screen.getByText('Standard Template')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Search templates...');
    await user.type(searchInput, 'Standard');

    expect(screen.getByText('Standard Template')).toBeInTheDocument();
    expect(screen.queryByText('Advanced Template')).not.toBeInTheDocument();
    expect(screen.queryByText('Minimal Template')).not.toBeInTheDocument();
  });

  it('sorts templates by usage count', async () => {
    vi.mocked(templatesApi.getTemplates).mockResolvedValue(mockTemplates);
    const user = userEvent.setup();

    render(
      <TemplateSelector
        value={null}
        onChange={mockOnChange}
        onValidate={mockOnValidate}
      />,
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(screen.getByText('Standard Template')).toBeInTheDocument();
    });

    const sortButton = screen.getByRole('button', { name: /Sort by/i });
    await user.click(sortButton);

    const usageOption = screen.getByText('Most Used');
    await user.click(usageOption);

    const cards = screen.getAllByTestId(/template-card-/);
    expect(cards[0]).toHaveTextContent('Minimal Template'); // 50 uses
    expect(cards[1]).toHaveTextContent('Standard Template'); // 25 uses
    expect(cards[2]).toHaveTextContent('Advanced Template'); // 10 uses
  });

  it('handles API errors gracefully', async () => {
    vi.mocked(templatesApi.getTemplates).mockRejectedValue(
      new Error('Failed to fetch templates')
    );

    render(
      <TemplateSelector
        value={null}
        onChange={mockOnChange}
        onValidate={mockOnValidate}
      />,
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(screen.getByText(/Failed to load templates/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    });
  });

  it('retries fetching templates on error', async () => {
    vi.mocked(templatesApi.getTemplates)
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce(mockTemplates);
    
    const user = userEvent.setup();

    render(
      <TemplateSelector
        value={null}
        onChange={mockOnChange}
        onValidate={mockOnValidate}
      />,
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(screen.getByText(/Failed to load templates/)).toBeInTheDocument();
    });

    const retryButton = screen.getByRole('button', { name: 'Retry' });
    await user.click(retryButton);

    await waitFor(() => {
      expect(screen.getByText('Standard Template')).toBeInTheDocument();
    });
  });

  it('displays empty state when no templates available', async () => {
    vi.mocked(templatesApi.getTemplates).mockResolvedValue([]);

    render(
      <TemplateSelector
        value={null}
        onChange={mockOnChange}
        onValidate={mockOnValidate}
      />,
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(screen.getByText('No templates available')).toBeInTheDocument();
      expect(screen.getByText(/Please contact your administrator/)).toBeInTheDocument();
    });
  });

  it('validates selection on mount', () => {
    vi.mocked(templatesApi.getTemplates).mockResolvedValue(mockTemplates);

    render(
      <TemplateSelector
        value={null}
        onChange={mockOnChange}
        onValidate={mockOnValidate}
      />,
      { wrapper: createWrapper() }
    );

    expect(mockOnValidate).toHaveBeenCalledWith(false);
  });

  it('supports keyboard navigation', async () => {
    vi.mocked(templatesApi.getTemplates).mockResolvedValue(mockTemplates);
    const user = userEvent.setup();

    render(
      <TemplateSelector
        value={null}
        onChange={mockOnChange}
        onValidate={mockOnValidate}
      />,
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(screen.getByText('Standard Template')).toBeInTheDocument();
    });

    const firstCard = screen.getByTestId('template-card-1');
    firstCard.focus();

    await user.keyboard('{Enter}');

    expect(mockOnChange).toHaveBeenCalledWith({
      templateId: '1',
      templateVersion: '2.0'
    });
  });

  it('shows template changelog when available', async () => {
    const templatesWithChangelog = [
      {
        ...mockTemplates[0],
        changelog: [
          { version: '2.0', date: '2025-01-10', changes: 'Added Archive folder' },
          { version: '1.5', date: '2024-12-15', changes: 'Updated permissions' }
        ]
      }
    ];

    vi.mocked(templatesApi.getTemplates).mockResolvedValue(templatesWithChangelog);

    render(
      <TemplateSelector
        value={null}
        onChange={mockOnChange}
        onValidate={mockOnValidate}
      />,
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      const card = screen.getByTestId('template-card-1');
      expect(card).toHaveTextContent('View Changelog');
    });
  });

  it('displays permissions in preview correctly', async () => {
    vi.mocked(templatesApi.getTemplates).mockResolvedValue(mockTemplates);
    vi.mocked(templatesApi.getTemplatePreview).mockResolvedValue({
      folders: mockTemplates[1].folders,
      metadata: {
        createdBy: mockTemplates[1].createdBy,
        usageCount: mockTemplates[1].usageCount,
        lastUsed: new Date()
      }
    });

    const user = userEvent.setup();

    render(
      <TemplateSelector
        value={null}
        onChange={mockOnChange}
        onValidate={mockOnValidate}
      />,
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(screen.getByText('Advanced Template')).toBeInTheDocument();
    });

    const previewButton = screen.getAllByRole('button', { name: /Preview/i })[1];
    await user.click(previewButton);

    await waitFor(() => {
      const confidentialFolder = screen.getByText('/Confidential').closest('div');
      expect(confidentialFolder).toHaveTextContent('Read Only');
      expect(confidentialFolder).toHaveTextContent('🔒');

      const publicFolder = screen.getByText('/Public').closest('div');
      expect(publicFolder).toHaveTextContent('Read/Write');
    });
  });
});