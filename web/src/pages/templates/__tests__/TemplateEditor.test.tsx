import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { TemplateEditor } from '../TemplateEditor';
import { templatesApi } from '@/services/templates';
import { templateValidation } from '@/services/templateValidation';

vi.mock('@/services/templates', () => ({
  templatesApi: {
    getTemplate: vi.fn(),
    createTemplate: vi.fn(),
    updateTemplate: vi.fn(),
  },
}));

vi.mock('@/services/templateValidation', () => ({
  templateValidation: {
    validateTemplate: vi.fn(),
    validateDragDrop: vi.fn(),
  },
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => ({ id: undefined }),
  };
});

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

describe('TemplateEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(templateValidation.validateTemplate).mockReturnValue({
      valid: true,
      errors: [],
    });
  });

  it('renders create template form', () => {
    render(<TemplateEditor />, { wrapper: createWrapper() });
    
    expect(screen.getByText('Create Template')).toBeInTheDocument();
    expect(screen.getByLabelText(/Template Name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Description/i)).toBeInTheDocument();
    expect(screen.getByText('Folder Structure')).toBeInTheDocument();
    expect(screen.getByText('Live Preview')).toBeInTheDocument();
  });

  it('handles template name input', async () => {
    render(<TemplateEditor />, { wrapper: createWrapper() });
    
    const nameInput = screen.getByLabelText(/Template Name/i);
    await userEvent.type(nameInput, 'New Template');
    
    expect(nameInput).toHaveValue('New Template');
  });

  it('handles template description input', async () => {
    render(<TemplateEditor />, { wrapper: createWrapper() });
    
    const descInput = screen.getByLabelText(/Description/i);
    await userEvent.type(descInput, 'Template description');
    
    expect(descInput).toHaveValue('Template description');
  });

  it('validates template before saving', async () => {
    vi.mocked(templateValidation.validateTemplate).mockReturnValue({
      valid: false,
      errors: [
        { path: 'template', field: 'name', message: 'Template name is required' },
      ],
    });

    render(<TemplateEditor />, { wrapper: createWrapper() });
    
    const saveButton = screen.getByRole('button', { name: /Save Template/i });
    fireEvent.click(saveButton);
    
    await waitFor(() => {
      expect(screen.getByText(/Validation Errors/i)).toBeInTheDocument();
      expect(screen.getByText(/Template name is required/i)).toBeInTheDocument();
    });
    
    expect(templatesApi.createTemplate).not.toHaveBeenCalled();
  });

  it('creates new template successfully', async () => {
    const mockTemplate = {
      id: '1',
      name: 'New Template',
      description: 'Test description',
      status: 'draft' as const,
      currentVersion: '1.0.0',
      createdBy: 'user@example.com',
      createdAt: new Date(),
      updatedAt: new Date(),
      usageCount: 0,
      tags: [],
    };

    vi.mocked(templatesApi.createTemplate).mockResolvedValue(mockTemplate);
    vi.mocked(templateValidation.validateTemplate).mockReturnValue({
      valid: true,
      errors: [],
    });

    render(<TemplateEditor />, { wrapper: createWrapper() });
    
    const nameInput = screen.getByLabelText(/Template Name/i);
    await userEvent.type(nameInput, 'New Template');
    
    const saveButton = screen.getByRole('button', { name: /Save Template/i });
    fireEvent.click(saveButton);
    
    await waitFor(() => {
      expect(templatesApi.createTemplate).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'New Template',
          status: 'draft',
        })
      );
      expect(mockNavigate).toHaveBeenCalledWith('/templates/1');
    });
  });

  it('handles cancel action', () => {
    render(<TemplateEditor />, { wrapper: createWrapper() });
    
    const cancelButton = screen.getByRole('button', { name: /Cancel/i });
    fireEvent.click(cancelButton);
    
    expect(mockNavigate).toHaveBeenCalledWith('/templates');
  });

  it('adds new folder to structure', async () => {
    render(<TemplateEditor />, { wrapper: createWrapper() });
    
    // Initially shows empty state
    expect(screen.getByText('No folders yet')).toBeInTheDocument();
    
    // Click add folder button
    const addButton = screen.getByRole('button', { name: /Add First Folder/i });
    fireEvent.click(addButton);
    
    await waitFor(() => {
      // Should now show the new folder
      expect(screen.getByText('New Folder')).toBeInTheDocument();
    });
  });

  it('shows folder properties panel when folder is selected', async () => {
    render(<TemplateEditor />, { wrapper: createWrapper() });
    
    // Add a folder first
    const addButton = screen.getByRole('button', { name: /Add root folder/i });
    fireEvent.click(addButton);
    
    await waitFor(() => {
      expect(screen.getByText('New Folder')).toBeInTheDocument();
    });
    
    // Click on the folder
    const folderElement = screen.getByText('New Folder');
    fireEvent.click(folderElement);
    
    // Properties panel should show the folder name
    expect(screen.getByText('Folder Properties')).toBeInTheDocument();
  });

  it('displays validation errors from backend', async () => {
    vi.mocked(templatesApi.createTemplate).mockRejectedValue(
      new Error('Template name already exists')
    );
    vi.mocked(templateValidation.validateTemplate).mockReturnValue({
      valid: true,
      errors: [],
    });

    render(<TemplateEditor />, { wrapper: createWrapper() });
    
    const nameInput = screen.getByLabelText(/Template Name/i);
    await userEvent.type(nameInput, 'Existing Template');
    
    const saveButton = screen.getByRole('button', { name: /Save Template/i });
    fireEvent.click(saveButton);
    
    await waitFor(() => {
      expect(screen.getByText(/Save Failed/i)).toBeInTheDocument();
      expect(screen.getByText(/Template name already exists/i)).toBeInTheDocument();
    });
  });

  it('shows saving state while request is pending', async () => {
    vi.mocked(templatesApi.createTemplate).mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 1000))
    );

    render(<TemplateEditor />, { wrapper: createWrapper() });
    
    const nameInput = screen.getByLabelText(/Template Name/i);
    await userEvent.type(nameInput, 'New Template');
    
    const saveButton = screen.getByRole('button', { name: /Save Template/i });
    fireEvent.click(saveButton);
    
    expect(screen.getByText('Saving...')).toBeInTheDocument();
    expect(saveButton).toBeDisabled();
  });
});