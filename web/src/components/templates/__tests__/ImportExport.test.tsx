import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ImportExport } from '../ImportExport';
import { templatesApi } from '@/services/templates';
import { validateTemplate } from '@/services/templateValidation';
import type { Template } from '@/types/templates';

// Mock the services
vi.mock('@/services/templates');
vi.mock('@/services/templateValidation');

const mockTemplates: Template[] = [
  {
    id: '1',
    name: 'Standard Template',
    description: 'Standard project template',
    status: 'active',
    currentVersion: '1.0.0',
    createdBy: 'Admin',
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-05'),
    usageCount: 10,
    tags: ['standard'],
  },
  {
    id: '2',
    name: 'Marketing Template',
    description: 'Marketing campaign template',
    status: 'draft',
    currentVersion: '2.0.0',
    createdBy: 'User1',
    createdAt: new Date('2025-01-10'),
    updatedAt: new Date('2025-01-15'),
    usageCount: 5,
    tags: ['marketing'],
  },
];

describe('ImportExport', () => {
  const user = userEvent.setup();

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock URL.createObjectURL and URL.revokeObjectURL
    global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
    global.URL.revokeObjectURL = vi.fn();
    
    // Mock document methods
    document.body.appendChild = vi.fn();
    document.body.removeChild = vi.fn();
    
    // Mock navigator.clipboard
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: vi.fn(),
      },
      writable: true,
    });
  });

  describe('Export Functionality', () => {
    it('should render export button', () => {
      render(<ImportExport templates={mockTemplates} />);
      expect(screen.getByText('Export Templates')).toBeInTheDocument();
    });

    it('should open export dialog when clicked', async () => {
      render(<ImportExport templates={mockTemplates} />);
      
      const exportButton = screen.getByText('Export Templates');
      await user.click(exportButton);
      
      expect(screen.getByText('Select Templates to Export')).toBeInTheDocument();
      expect(screen.getByText('Standard Template')).toBeInTheDocument();
      expect(screen.getByText('Marketing Template')).toBeInTheDocument();
    });

    it('should allow template selection', async () => {
      render(<ImportExport templates={mockTemplates} />);
      
      await user.click(screen.getByText('Export Templates'));
      
      // Click on first template row
      const firstRow = screen.getByText('Standard Template').closest('tr');
      await user.click(firstRow!);
      
      // Check if export button shows selection count
      expect(screen.getByText(/Export \(1 selected\)/)).toBeInTheDocument();
    });

    it('should support format selection', async () => {
      render(<ImportExport templates={mockTemplates} />);
      
      await user.click(screen.getByText('Export Templates'));
      
      expect(screen.getByLabelText('JSON')).toBeInTheDocument();
      expect(screen.getByLabelText('YAML')).toBeInTheDocument();
      
      // YAML should not be selected by default
      expect(screen.getByLabelText('JSON')).toBeChecked();
      expect(screen.getByLabelText('YAML')).not.toBeChecked();
    });

    it('should include version history option', async () => {
      render(<ImportExport templates={mockTemplates} />);
      
      await user.click(screen.getByText('Export Templates'));
      
      const versionCheckbox = screen.getByLabelText('Include all version history');
      expect(versionCheckbox).toBeInTheDocument();
      expect(versionCheckbox).toBeChecked();
    });

    it('should trigger download on export', async () => {
      const onExport = vi.fn();
      render(<ImportExport templates={mockTemplates} onExport={onExport} />);
      
      await user.click(screen.getByText('Export Templates'));
      
      // Select a template
      const firstRow = screen.getByText('Standard Template').closest('tr');
      await user.click(firstRow!);
      
      // Click export
      const exportButton = screen.getByText(/Export \(1 selected\)/);
      await user.click(exportButton);
      
      await waitFor(() => {
        expect(onExport).toHaveBeenCalledWith(['1']);
        expect(global.URL.createObjectURL).toHaveBeenCalled();
      });
    });
  });

  describe('Import Functionality', () => {
    it('should render import button', () => {
      render(<ImportExport templates={mockTemplates} />);
      expect(screen.getByText('Import Templates')).toBeInTheDocument();
    });

    it('should open import dialog when clicked', async () => {
      render(<ImportExport templates={mockTemplates} />);
      
      await user.click(screen.getByText('Import Templates'));
      
      expect(screen.getByText('Drop template file here or click to browse')).toBeInTheDocument();
      expect(screen.getByText('Supports JSON and YAML formats')).toBeInTheDocument();
    });

    it('should handle file drop', async () => {
      render(<ImportExport templates={mockTemplates} />);
      
      await user.click(screen.getByText('Import Templates'));
      
      const dropZone = screen.getByText('Drop template file here or click to browse').parentElement;
      
      const file = new File(
        [JSON.stringify({ exportVersion: '1.0.0', templates: [] })],
        'templates.json',
        { type: 'application/json' }
      );
      
      const dataTransfer = {
        files: [file],
        types: ['Files'],
      };
      
      fireEvent.drop(dropZone!, { dataTransfer });
      
      // File should be processed
      await waitFor(() => {
        expect(screen.getByLabelText('Import Content')).toBeInTheDocument();
      });
    });

    it('should validate import content', async () => {
      (validateTemplate as any).mockReturnValue({
        isValid: true,
        errors: [],
        warnings: [],
      });
      
      render(<ImportExport templates={mockTemplates} />);
      
      await user.click(screen.getByText('Import Templates'));
      
      const textarea = screen.getByRole('textbox');
      await user.type(textarea, JSON.stringify({
        exportVersion: '1.0.0',
        exportDate: '2025-01-20',
        templates: mockTemplates,
      }));
      
      await waitFor(() => {
        expect(screen.getByText('Validation Successful')).toBeInTheDocument();
      });
    });

    it('should show validation errors', async () => {
      (validateTemplate as any).mockReturnValue({
        isValid: false,
        errors: [{ message: 'Template name is required' }],
        warnings: [],
      });
      
      render(<ImportExport templates={mockTemplates} />);
      
      await user.click(screen.getByText('Import Templates'));
      
      const textarea = screen.getByRole('textbox');
      await user.type(textarea, JSON.stringify({
        exportVersion: '1.0.0',
        templates: [{ id: '1' }], // Invalid template
      }));
      
      await waitFor(() => {
        expect(screen.getByText('Validation Errors')).toBeInTheDocument();
      });
    });

    it('should handle import with progress', async () => {
      const onImport = vi.fn();
      (validateTemplate as any).mockReturnValue({
        isValid: true,
        errors: [],
        warnings: [],
      });
      
      render(<ImportExport templates={mockTemplates} onImport={onImport} />);
      
      await user.click(screen.getByText('Import Templates'));
      
      const textarea = screen.getByRole('textbox');
      await user.type(textarea, JSON.stringify({
        exportVersion: '1.0.0',
        templates: mockTemplates,
      }));
      
      await waitFor(() => {
        expect(screen.getByText('Validation Successful')).toBeInTheDocument();
      });
      
      const importButton = screen.getByRole('button', { name: /Import Templates$/ });
      await user.click(importButton);
      
      await waitFor(() => {
        expect(onImport).toHaveBeenCalledWith(mockTemplates);
      });
    });
  });

  describe('Backup Functionality', () => {
    it('should render backup button', () => {
      render(<ImportExport templates={mockTemplates} />);
      expect(screen.getByText('Create Backup')).toBeInTheDocument();
    });

    it('should open backup dialog', async () => {
      render(<ImportExport templates={mockTemplates} />);
      
      await user.click(screen.getByText('Create Backup'));
      
      expect(screen.getByText('Create Template Backup')).toBeInTheDocument();
      expect(screen.getByText(/This will create a complete backup of all 2 templates/)).toBeInTheDocument();
    });

    it('should create backup on confirmation', async () => {
      render(<ImportExport templates={mockTemplates} />);
      
      await user.click(screen.getByText('Create Backup'));
      
      const createButton = screen.getByRole('button', { name: 'Create Backup' });
      await user.click(createButton);
      
      await waitFor(() => {
        expect(global.URL.createObjectURL).toHaveBeenCalled();
      });
    });
  });

  describe('Share Functionality', () => {
    it('should render share button', () => {
      render(<ImportExport templates={mockTemplates} />);
      expect(screen.getByText('Share Templates')).toBeInTheDocument();
    });

    it('should open share dialog', async () => {
      render(<ImportExport templates={mockTemplates} />);
      
      await user.click(screen.getByText('Share Templates'));
      
      expect(screen.getByText('Share Templates')).toBeInTheDocument();
      expect(screen.getByText('Share Link Expiry')).toBeInTheDocument();
    });

    it('should generate share link', async () => {
      render(<ImportExport templates={mockTemplates} />);
      
      // First select a template from export dialog
      await user.click(screen.getByText('Export Templates'));
      const firstRow = screen.getByText('Standard Template').closest('tr');
      await user.click(firstRow!);
      await user.click(screen.getByText('Cancel')); // Close export dialog
      
      // Open share dialog
      await user.click(screen.getByText('Share Templates'));
      
      const generateButton = screen.getByText('Generate Share Link');
      await user.click(generateButton);
      
      await waitFor(() => {
        expect(screen.getByLabelText('Share Link')).toBeInTheDocument();
      });
    });

    it('should copy link to clipboard', async () => {
      render(<ImportExport templates={mockTemplates} />);
      
      // Setup selected template and generate link
      await user.click(screen.getByText('Export Templates'));
      const firstRow = screen.getByText('Standard Template').closest('tr');
      await user.click(firstRow!);
      await user.click(screen.getByText('Cancel'));
      
      await user.click(screen.getByText('Share Templates'));
      await user.click(screen.getByText('Generate Share Link'));
      
      await waitFor(() => {
        const copyButton = screen.getByTitle('Copy to clipboard');
        expect(copyButton).toBeInTheDocument();
      });
      
      const copyButton = screen.getByTitle('Copy to clipboard');
      await user.click(copyButton);
      
      expect(navigator.clipboard.writeText).toHaveBeenCalled();
    });
  });

  describe('Migration Tools', () => {
    it('should render migration tools button', () => {
      render(<ImportExport templates={mockTemplates} />);
      expect(screen.getByText('Migration Tools')).toBeInTheDocument();
    });

    it('should open migration dialog', async () => {
      render(<ImportExport templates={mockTemplates} />);
      
      await user.click(screen.getByText('Migration Tools'));
      
      expect(screen.getByText('Template Migration Tools')).toBeInTheDocument();
      expect(screen.getByText('Source Version')).toBeInTheDocument();
      expect(screen.getByText('Target Version')).toBeInTheDocument();
    });

    it('should show migration analysis', async () => {
      render(<ImportExport templates={mockTemplates} />);
      
      await user.click(screen.getByText('Migration Tools'));
      
      // Select source version
      const sourceDropdown = screen.getByPlaceholderText('Select source version');
      await user.click(sourceDropdown);
      await user.click(screen.getByText('v1.0.0 - Initial Release'));
      
      // Select target version
      const targetDropdown = screen.getByPlaceholderText('Select target version');
      await user.click(targetDropdown);
      await user.click(screen.getByText('v2.0.0 - Major Restructure'));
      
      await waitFor(() => {
        expect(screen.getByText('Migration Analysis')).toBeInTheDocument();
        expect(screen.getByText(/Major version change detected/)).toBeInTheDocument();
      });
    });

    it('should enable migration button when versions selected', async () => {
      render(<ImportExport templates={mockTemplates} />);
      
      await user.click(screen.getByText('Migration Tools'));
      
      const migrateButton = screen.getByText('Generate Migration Plan');
      expect(migrateButton).toBeDisabled();
      
      // Select versions
      const sourceDropdown = screen.getByPlaceholderText('Select source version');
      await user.click(sourceDropdown);
      await user.click(screen.getByText('v1.0.0 - Initial Release'));
      
      const targetDropdown = screen.getByPlaceholderText('Select target version');
      await user.click(targetDropdown);
      await user.click(screen.getByText('v2.0.0 - Major Restructure'));
      
      expect(migrateButton).not.toBeDisabled();
    });
  });

  describe('Bulk Operations', () => {
    it('should support selecting multiple templates', async () => {
      render(<ImportExport templates={mockTemplates} />);
      
      await user.click(screen.getByText('Export Templates'));
      
      // Select both templates
      const checkboxes = screen.getAllByRole('checkbox');
      await user.click(checkboxes[0]);
      await user.click(checkboxes[1]);
      
      expect(screen.getByText(/Export \(2 selected\)/)).toBeInTheDocument();
    });

    it('should export multiple templates', async () => {
      const onExport = vi.fn();
      render(<ImportExport templates={mockTemplates} onExport={onExport} />);
      
      await user.click(screen.getByText('Export Templates'));
      
      // Select both templates
      const checkboxes = screen.getAllByRole('checkbox');
      await user.click(checkboxes[0]);
      await user.click(checkboxes[1]);
      
      await user.click(screen.getByText(/Export \(2 selected\)/));
      
      await waitFor(() => {
        expect(onExport).toHaveBeenCalledWith(['1', '2']);
      });
    });
  });

  describe('File Format Support', () => {
    it('should handle JSON format', async () => {
      render(<ImportExport templates={mockTemplates} />);
      
      await user.click(screen.getByText('Export Templates'));
      
      // JSON should be selected by default
      expect(screen.getByLabelText('JSON')).toBeChecked();
      
      // Select a template and export
      const firstRow = screen.getByText('Standard Template').closest('tr');
      await user.click(firstRow!);
      await user.click(screen.getByText(/Export \(1 selected\)/));
      
      await waitFor(() => {
        expect(global.URL.createObjectURL).toHaveBeenCalledWith(
          expect.objectContaining({ type: 'application/json' })
        );
      });
    });

    it('should handle YAML format', async () => {
      render(<ImportExport templates={mockTemplates} />);
      
      await user.click(screen.getByText('Export Templates'));
      
      // Select YAML format
      await user.click(screen.getByLabelText('YAML'));
      
      // Select a template and export
      const firstRow = screen.getByText('Standard Template').closest('tr');
      await user.click(firstRow!);
      await user.click(screen.getByText(/Export \(1 selected\)/));
      
      await waitFor(() => {
        expect(global.URL.createObjectURL).toHaveBeenCalledWith(
          expect.objectContaining({ type: 'text/yaml' })
        );
      });
    });
  });
});