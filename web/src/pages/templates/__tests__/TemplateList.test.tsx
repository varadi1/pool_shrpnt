import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { TemplateList } from '../TemplateList';
import { templatesApi } from '@/services/templates';
import type { TemplateListResponse } from '@/types/templates';

vi.mock('@/services/templates', () => ({
  templatesApi: {
    getTemplates: vi.fn(),
    deleteTemplate: vi.fn(),
  },
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const mockTemplates: TemplateListResponse = {
  templates: [
    {
      id: '1',
      name: 'Standard Project Template',
      description: 'Default template for standard projects',
      status: 'active',
      currentVersion: '1.0.0',
      createdBy: 'admin@example.com',
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-15'),
      usageCount: 42,
      tags: ['standard', 'default'],
    },
    {
      id: '2',
      name: 'Archive Template',
      description: 'Template for archived projects',
      status: 'deprecated',
      currentVersion: '0.9.0',
      createdBy: 'user@example.com',
      createdAt: new Date('2023-12-01'),
      updatedAt: new Date('2023-12-20'),
      usageCount: 5,
      tags: ['archive'],
    },
  ],
  total: 2,
  page: 1,
  pageSize: 20,
};

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
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

describe('TemplateList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state initially', () => {
    vi.mocked(templatesApi.getTemplates).mockImplementation(() => new Promise(() => {}));
    
    render(<TemplateList />, { wrapper: createWrapper() });
    
    expect(screen.getByText('Loading templates...')).toBeInTheDocument();
  });

  it('renders templates when loaded', async () => {
    vi.mocked(templatesApi.getTemplates).mockResolvedValue(mockTemplates);
    
    render(<TemplateList />, { wrapper: createWrapper() });
    
    await waitFor(() => {
      expect(screen.getByText('Standard Project Template')).toBeInTheDocument();
      expect(screen.getByText('Archive Template')).toBeInTheDocument();
    });
    
    expect(screen.getByText('Default template for standard projects')).toBeInTheDocument();
    expect(screen.getByText('42 orders')).toBeInTheDocument();
  });

  it('renders error state when API fails', async () => {
    vi.mocked(templatesApi.getTemplates).mockRejectedValue(new Error('API Error'));
    
    render(<TemplateList />, { wrapper: createWrapper() });
    
    await waitFor(() => {
      expect(screen.getByText('Failed to load templates')).toBeInTheDocument();
      expect(screen.getByText('API Error')).toBeInTheDocument();
    });
  });

  it('renders empty state when no templates exist', async () => {
    vi.mocked(templatesApi.getTemplates).mockResolvedValue({
      templates: [],
      total: 0,
      page: 1,
      pageSize: 20,
    });
    
    render(<TemplateList />, { wrapper: createWrapper() });
    
    await waitFor(() => {
      expect(screen.getByText('No templates found')).toBeInTheDocument();
      expect(screen.getByText('Create your first template to get started')).toBeInTheDocument();
    });
  });

  it('handles search functionality', async () => {
    vi.mocked(templatesApi.getTemplates).mockResolvedValue(mockTemplates);
    
    render(<TemplateList />, { wrapper: createWrapper() });
    
    await waitFor(() => {
      expect(screen.getByText('Standard Project Template')).toBeInTheDocument();
    });
    
    const searchBox = screen.getByPlaceholderText('Search templates...');
    await userEvent.type(searchBox, 'archive');
    
    await waitFor(() => {
      expect(templatesApi.getTemplates).toHaveBeenCalledWith(
        1,
        20,
        expect.objectContaining({ search: 'archive' }),
        expect.any(Object)
      );
    });
  });

  it('handles status filter', async () => {
    vi.mocked(templatesApi.getTemplates).mockResolvedValue(mockTemplates);
    
    render(<TemplateList />, { wrapper: createWrapper() });
    
    await waitFor(() => {
      expect(screen.getByText('Standard Project Template')).toBeInTheDocument();
    });
    
    const filterDropdown = screen.getByPlaceholderText('Filter by status');
    fireEvent.click(filterDropdown);
    
    const activeOption = await screen.findByText('Active');
    fireEvent.click(activeOption);
    
    await waitFor(() => {
      expect(templatesApi.getTemplates).toHaveBeenCalledWith(
        1,
        20,
        expect.objectContaining({ status: ['active'] }),
        expect.any(Object)
      );
    });
  });

  it('navigates to create template page', async () => {
    vi.mocked(templatesApi.getTemplates).mockResolvedValue(mockTemplates);
    
    render(<TemplateList />, { wrapper: createWrapper() });
    
    await waitFor(() => {
      expect(screen.getByText('Standard Project Template')).toBeInTheDocument();
    });
    
    const createButton = screen.getByRole('button', { name: /Create Template/i });
    fireEvent.click(createButton);
    
    expect(mockNavigate).toHaveBeenCalledWith('/templates/new');
  });

  it('navigates to edit template page', async () => {
    vi.mocked(templatesApi.getTemplates).mockResolvedValue(mockTemplates);
    
    render(<TemplateList />, { wrapper: createWrapper() });
    
    await waitFor(() => {
      expect(screen.getByText('Standard Project Template')).toBeInTheDocument();
    });
    
    const moreButtons = screen.getAllByRole('button', { name: '' });
    const firstMoreButton = moreButtons[0];
    fireEvent.click(firstMoreButton);
    
    const editMenuItem = await screen.findByText('Edit Template');
    fireEvent.click(editMenuItem);
    
    expect(mockNavigate).toHaveBeenCalledWith('/templates/1/edit');
  });

  it('handles template deletion', async () => {
    vi.mocked(templatesApi.getTemplates).mockResolvedValue(mockTemplates);
    vi.mocked(templatesApi.deleteTemplate).mockResolvedValue(undefined);
    window.confirm = vi.fn(() => true);
    
    render(<TemplateList />, { wrapper: createWrapper() });
    
    await waitFor(() => {
      expect(screen.getByText('Archive Template')).toBeInTheDocument();
    });
    
    const moreButtons = screen.getAllByRole('button', { name: '' });
    const secondMoreButton = moreButtons[1];
    fireEvent.click(secondMoreButton);
    
    const deleteMenuItem = await screen.findByText('Delete Template');
    fireEvent.click(deleteMenuItem);
    
    expect(window.confirm).toHaveBeenCalledWith('Are you sure you want to delete template "Archive Template"?');
    expect(templatesApi.deleteTemplate).toHaveBeenCalledWith('2');
  });

  it('handles pagination', async () => {
    const paginatedResponse: TemplateListResponse = {
      ...mockTemplates,
      total: 50,
      page: 1,
      pageSize: 20,
    };
    
    vi.mocked(templatesApi.getTemplates).mockResolvedValue(paginatedResponse);
    
    render(<TemplateList />, { wrapper: createWrapper() });
    
    await waitFor(() => {
      expect(screen.getByText('Showing 1-20 of 50 templates')).toBeInTheDocument();
    });
    
    const nextButton = screen.getByRole('button', { name: 'Next' });
    fireEvent.click(nextButton);
    
    await waitFor(() => {
      expect(templatesApi.getTemplates).toHaveBeenCalledWith(
        2,
        20,
        expect.any(Object),
        expect.any(Object)
      );
    });
  });

  it('handles sorting', async () => {
    vi.mocked(templatesApi.getTemplates).mockResolvedValue(mockTemplates);
    
    render(<TemplateList />, { wrapper: createWrapper() });
    
    await waitFor(() => {
      expect(screen.getByText('Standard Project Template')).toBeInTheDocument();
    });
    
    const sortButton = screen.getByRole('button', { name: /Descending/i });
    fireEvent.click(sortButton);
    
    await waitFor(() => {
      expect(templatesApi.getTemplates).toHaveBeenCalledWith(
        1,
        20,
        expect.any(Object),
        expect.objectContaining({ direction: 'asc' })
      );
    });
  });

  it('displays correct status badges', async () => {
    vi.mocked(templatesApi.getTemplates).mockResolvedValue(mockTemplates);
    
    render(<TemplateList />, { wrapper: createWrapper() });
    
    await waitFor(() => {
      expect(screen.getByText('Active')).toBeInTheDocument();
      expect(screen.getByText('Deprecated')).toBeInTheDocument();
    });
  });
});