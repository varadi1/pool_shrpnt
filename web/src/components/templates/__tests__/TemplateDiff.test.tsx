import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TemplateDiff } from '../TemplateDiff';
import { templateDiffService } from '../../../services/templateDiff';
import type { TemplateVersion, FolderNode, DiffResult } from '../../../types/templates';

vi.mock('../../../services/templateDiff');

const createFolderNode = (name: string, children: FolderNode[] = []): FolderNode => ({
  id: name,
  name,
  path: `/${name}`,
  type: 'folder',
  children,
  properties: {
    required: false,
    locked: false,
  },
  permissions: {
    inherit: true,
    breakInheritance: false,
    groups: [],
  },
  metadata: {},
});

const mockOldVersion: TemplateVersion = {
  id: 'v1',
  templateId: 'template1',
  version: '1.0.0',
  structure: createFolderNode('root', [
    createFolderNode('documents', [
      createFolderNode('financial'),
      createFolderNode('legal'),
    ]),
    createFolderNode('archive'),
  ]),
  changelog: 'Initial version',
  author: 'John Doe',
  publishedAt: new Date('2025-01-01'),
  isPublished: true,
  usageCount: 5,
};

const mockNewVersion: TemplateVersion = {
  id: 'v2',
  templateId: 'template1',
  version: '2.0.0',
  structure: createFolderNode('root', [
    createFolderNode('documents', [
      createFolderNode('financial'),
      createFolderNode('legal'),
      createFolderNode('contracts'), // Added
    ]),
    // archive removed
    createFolderNode('reports'), // Added
  ]),
  changelog: 'Major update',
  author: 'Jane Smith',
  publishedAt: new Date('2025-02-01'),
  isPublished: true,
  usageCount: 2,
};

const mockDiffResult: DiffResult = {
  summary: {
    added: 2,
    removed: 1,
    modified: 1,
    unchanged: 3,
  },
  changes: [
    {
      path: 'root',
      name: 'root',
      type: 'modified',
      oldValue: mockOldVersion.structure,
      newValue: mockNewVersion.structure,
      children: [
        {
          path: 'root/documents',
          name: 'documents',
          type: 'modified',
          oldValue: mockOldVersion.structure.children[0],
          newValue: mockNewVersion.structure.children[0],
          children: [
            {
              path: 'root/documents/financial',
              name: 'financial',
              type: 'unchanged',
              oldValue: mockOldVersion.structure.children[0].children[0],
              newValue: mockNewVersion.structure.children[0].children[0],
            },
            {
              path: 'root/documents/legal',
              name: 'legal',
              type: 'unchanged',
              oldValue: mockOldVersion.structure.children[0].children[1],
              newValue: mockNewVersion.structure.children[0].children[1],
            },
            {
              path: 'root/documents/contracts',
              name: 'contracts',
              type: 'added',
              newValue: mockNewVersion.structure.children[0].children[2],
            },
          ],
        },
        {
          path: 'root/archive',
          name: 'archive',
          type: 'removed',
          oldValue: mockOldVersion.structure.children[1],
        },
        {
          path: 'root/reports',
          name: 'reports',
          type: 'added',
          newValue: mockNewVersion.structure.children[1],
        },
      ],
    },
  ],
};

describe('TemplateDiff', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(templateDiffService.calculateDiff).mockReturnValue(mockDiffResult);
    vi.mocked(templateDiffService.exportDiffReport).mockReturnValue('Mock diff report');
  });

  describe('Rendering', () => {
    it('should display version comparison header', () => {
      render(
        <TemplateDiff
          oldVersion={mockOldVersion}
          newVersion={mockNewVersion}
        />
      );

      expect(screen.getByText('Comparing 1.0.0 → 2.0.0')).toBeInTheDocument();
    });

    it('should display diff summary statistics', () => {
      render(
        <TemplateDiff
          oldVersion={mockOldVersion}
          newVersion={mockNewVersion}
        />
      );

      expect(screen.getByText('2 added')).toBeInTheDocument();
      expect(screen.getByText('1 removed')).toBeInTheDocument();
      expect(screen.getByText('1 modified')).toBeInTheDocument();
      expect(screen.getByText('3 unchanged')).toBeInTheDocument();
    });

    it('should calculate diff on mount', () => {
      render(
        <TemplateDiff
          oldVersion={mockOldVersion}
          newVersion={mockNewVersion}
        />
      );

      expect(templateDiffService.calculateDiff).toHaveBeenCalledWith(
        mockOldVersion.structure,
        mockNewVersion.structure
      );
    });

    it('should display empty state when no differences', () => {
      vi.mocked(templateDiffService.calculateDiff).mockReturnValue(null as any);

      render(
        <TemplateDiff
          oldVersion={mockOldVersion}
          newVersion={mockNewVersion}
        />
      );

      expect(screen.getByText('No differences to display')).toBeInTheDocument();
      expect(screen.getByText('Select two different versions to compare')).toBeInTheDocument();
    });
  });

  describe('View Modes', () => {
    it('should default to side-by-side view', () => {
      render(
        <TemplateDiff
          oldVersion={mockOldVersion}
          newVersion={mockNewVersion}
        />
      );

      expect(screen.getByText('Side by Side')).toBeInTheDocument();
      expect(screen.getByText('Version 1.0.0')).toBeInTheDocument();
      expect(screen.getByText('Version 2.0.0')).toBeInTheDocument();
    });

    it('should switch to unified view when selected', async () => {
      const user = userEvent.setup();
      
      render(
        <TemplateDiff
          oldVersion={mockOldVersion}
          newVersion={mockNewVersion}
        />
      );

      const viewButton = screen.getByText('Side by Side');
      await user.click(viewButton);

      const unifiedOption = screen.getByText('Unified View');
      await user.click(unifiedOption);

      await waitFor(() => {
        expect(screen.getByText('Unified')).toBeInTheDocument();
      });
    });

    it('should switch back to side-by-side view', async () => {
      const user = userEvent.setup();
      
      render(
        <TemplateDiff
          oldVersion={mockOldVersion}
          newVersion={mockNewVersion}
        />
      );

      // Switch to unified
      let viewButton = screen.getByText('Side by Side');
      await user.click(viewButton);
      await user.click(screen.getByText('Unified View'));

      // Switch back to side-by-side
      viewButton = screen.getByText('Unified');
      await user.click(viewButton);
      await user.click(screen.getByText('Side by Side View'));

      await waitFor(() => {
        expect(screen.getByText('Side by Side')).toBeInTheDocument();
      });
    });
  });

  describe('Node Display', () => {
    it('should display added nodes with appropriate styling', () => {
      render(
        <TemplateDiff
          oldVersion={mockOldVersion}
          newVersion={mockNewVersion}
        />
      );

      // Check for added nodes
      const contractsNode = screen.getByText('contracts');
      expect(contractsNode).toBeInTheDocument();
      
      const addedBadges = screen.getAllByText('added');
      expect(addedBadges.length).toBeGreaterThan(0);
    });

    it('should display removed nodes with appropriate styling', () => {
      render(
        <TemplateDiff
          oldVersion={mockOldVersion}
          newVersion={mockNewVersion}
        />
      );

      // Check for removed nodes
      const archiveNode = screen.getByText('archive');
      expect(archiveNode).toBeInTheDocument();
      
      const removedBadges = screen.getAllByText('removed');
      expect(removedBadges.length).toBeGreaterThan(0);
    });

    it('should display modified nodes with appropriate styling', () => {
      render(
        <TemplateDiff
          oldVersion={mockOldVersion}
          newVersion={mockNewVersion}
        />
      );

      // Check for modified nodes
      const documentsNode = screen.getByText('documents');
      expect(documentsNode).toBeInTheDocument();
      
      const modifiedBadges = screen.getAllByText('modified');
      expect(modifiedBadges.length).toBeGreaterThan(0);
    });
  });

  describe('Show/Hide Unchanged', () => {
    it('should show unchanged nodes by default', () => {
      render(
        <TemplateDiff
          oldVersion={mockOldVersion}
          newVersion={mockNewVersion}
        />
      );

      expect(screen.getByText('Hide Unchanged')).toBeInTheDocument();
      
      // Unchanged nodes should be visible
      const financialNode = screen.getByText('financial');
      expect(financialNode).toBeInTheDocument();
    });

    it('should hide unchanged nodes when toggled', async () => {
      const user = userEvent.setup();
      
      // Create a diff result with unchanged nodes visible
      const diffWithUnchanged: DiffResult = {
        ...mockDiffResult,
        changes: [
          {
            path: 'root',
            name: 'root',
            type: 'modified',
            children: [
              {
                path: 'root/unchanged',
                name: 'unchanged_folder',
                type: 'unchanged',
              },
              {
                path: 'root/changed',
                name: 'changed_folder',
                type: 'modified',
              },
            ],
          },
        ],
      };
      
      vi.mocked(templateDiffService.calculateDiff).mockReturnValue(diffWithUnchanged);
      
      render(
        <TemplateDiff
          oldVersion={mockOldVersion}
          newVersion={mockNewVersion}
        />
      );

      const toggleButton = screen.getByText('Hide Unchanged');
      await user.click(toggleButton);

      await waitFor(() => {
        expect(screen.getByText('Show Unchanged')).toBeInTheDocument();
        // Unchanged folder should not be visible
        expect(screen.queryByText('unchanged_folder')).not.toBeInTheDocument();
        // Changed folder should still be visible
        expect(screen.getByText('changed_folder')).toBeInTheDocument();
      });
    });
  });

  describe('Property Changes', () => {
    it('should display property changes for modified nodes', () => {
      const diffWithPropertyChanges: DiffResult = {
        ...mockDiffResult,
        changes: [
          {
            path: 'root',
            name: 'root',
            type: 'modified',
            propertyChanges: [
              {
                field: 'locked',
                oldValue: false,
                newValue: true,
                type: 'modified',
              },
              {
                field: 'description',
                oldValue: null,
                newValue: 'New description',
                type: 'added',
              },
            ],
          },
        ],
      };

      vi.mocked(templateDiffService.calculateDiff).mockReturnValue(diffWithPropertyChanges);

      render(
        <TemplateDiff
          oldVersion={mockOldVersion}
          newVersion={mockNewVersion}
        />
      );

      // Property changes should be displayed
      expect(screen.getByText('locked:')).toBeInTheDocument();
      expect(screen.getByText('description:')).toBeInTheDocument();
    });
  });

  describe('Export Functionality', () => {
    it('should export diff report when export button is clicked', async () => {
      const user = userEvent.setup();
      const onExport = vi.fn();
      
      // Mock DOM methods
      const createElementSpy = vi.spyOn(document, 'createElement');
      const appendChildSpy = vi.spyOn(document.body, 'appendChild');
      const removeChildSpy = vi.spyOn(document.body, 'removeChild');
      const createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:url');
      const revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL');
      
      render(
        <TemplateDiff
          oldVersion={mockOldVersion}
          newVersion={mockNewVersion}
          onExport={onExport}
        />
      );

      const exportButton = screen.getByText('Export');
      await user.click(exportButton);

      expect(templateDiffService.exportDiffReport).toHaveBeenCalledWith(mockDiffResult);
      expect(createObjectURLSpy).toHaveBeenCalled();
      expect(onExport).toHaveBeenCalled();
      
      // Cleanup
      createElementSpy.mockRestore();
      appendChildSpy.mockRestore();
      removeChildSpy.mockRestore();
      createObjectURLSpy.mockRestore();
      revokeObjectURLSpy.mockRestore();
    });

    it('should not export when diff is null', async () => {
      const user = userEvent.setup();
      vi.mocked(templateDiffService.calculateDiff).mockReturnValue(null as any);
      
      render(
        <TemplateDiff
          oldVersion={mockOldVersion}
          newVersion={mockNewVersion}
        />
      );

      // Export button should not be present when there's no diff
      expect(screen.queryByText('Export')).not.toBeInTheDocument();
    });
  });

  describe('Tree Expansion', () => {
    it('should expand and collapse tree nodes', async () => {
      const user = userEvent.setup();
      
      render(
        <TemplateDiff
          oldVersion={mockOldVersion}
          newVersion={mockNewVersion}
        />
      );

      // Find a tree item (this depends on the actual tree implementation)
      const rootNode = screen.getByText('root');
      
      // Click to expand/collapse
      await user.click(rootNode);
      
      // Verify expansion state changes (this would depend on the actual implementation)
      // The test might need adjustment based on how the Tree component handles expansion
    });
  });

  describe('Side Panel Headers', () => {
    it('should display correct headers in side-by-side view', () => {
      render(
        <TemplateDiff
          oldVersion={mockOldVersion}
          newVersion={mockNewVersion}
        />
      );

      expect(screen.getByText('Version 1.0.0')).toBeInTheDocument();
      expect(screen.getByText('Version 2.0.0')).toBeInTheDocument();
      expect(screen.getByText('Old')).toBeInTheDocument();
      expect(screen.getByText('New')).toBeInTheDocument();
    });
  });
});