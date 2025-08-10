import { describe, it, expect, vi, beforeEach } from 'vitest';
import { templateValidation, TemplateValidationService } from '../templateValidation';
import { templateService } from '../templates';
import type { FolderNode, Template } from '../../types/templates';

// Mock the template service
vi.mock('../templates', () => ({
  templateService: {
    validateTemplate: vi.fn(),
  },
}));

describe('TemplateValidationService', () => {
  let validationService: TemplateValidationService;

  const createMockTemplate = (overrides?: Partial<Template>): Partial<Template> => ({
    name: 'Test Template',
    description: 'Test template description',
    status: 'draft',
    ...overrides,
  });

  const createMockFolderNode = (overrides?: Partial<FolderNode>): FolderNode => ({
    id: 'root',
    name: 'Root',
    path: '/',
    type: 'folder',
    children: [
      {
        id: 'doc',
        name: 'Documents',
        path: '/Documents',
        type: 'folder',
        children: [],
        properties: { required: true, locked: false },
        permissions: { inherit: true, breakInheritance: false, groups: [] },
        metadata: {},
      },
      {
        id: 'fin',
        name: 'Financial',
        path: '/Financial',
        type: 'folder',
        children: [],
        properties: { required: true, locked: false },
        permissions: { inherit: true, breakInheritance: false, groups: [] },
        metadata: {},
      },
      {
        id: 'con',
        name: 'Contracts',
        path: '/Contracts',
        type: 'folder',
        children: [],
        properties: { required: true, locked: false },
        permissions: { inherit: true, breakInheritance: false, groups: [] },
        metadata: {},
      },
    ],
    properties: { required: true, locked: false },
    permissions: { inherit: true, breakInheritance: false, groups: [] },
    metadata: {},
    ...overrides,
  });

  beforeEach(() => {
    validationService = new TemplateValidationService();
    vi.clearAllMocks();
  });

  describe('validateTemplate', () => {
    it('should validate a valid template', () => {
      const template = createMockTemplate();
      const rootNode = createMockFolderNode();

      const result = validationService.validateTemplate(template, rootNode);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail validation for template without name', () => {
      const template = createMockTemplate({ name: '' });
      const rootNode = createMockFolderNode();

      const result = validationService.validateTemplate(template, rootNode);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: 'name',
          message: 'Template name must be at least 3 characters',
        })
      );
    });

    it('should fail validation for template name exceeding 100 characters', () => {
      const template = createMockTemplate({ name: 'a'.repeat(101) });
      const rootNode = createMockFolderNode();

      const result = validationService.validateTemplate(template, rootNode);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: 'name',
          message: 'Template name must not exceed 100 characters',
        })
      );
    });

    it('should fail validation for description exceeding 500 characters', () => {
      const template = createMockTemplate({ description: 'a'.repeat(501) });
      const rootNode = createMockFolderNode();

      const result = validationService.validateTemplate(template, rootNode);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: 'description',
          message: 'Template description must not exceed 500 characters',
        })
      );
    });
  });

  describe('Required Folders Validation', () => {
    it('should fail validation when required folders are missing', () => {
      const template = createMockTemplate();
      const rootNode = createMockFolderNode({
        children: [
          {
            id: 'doc',
            name: 'Documents',
            path: '/Documents',
            type: 'folder',
            children: [],
            properties: { required: true, locked: false },
            permissions: { inherit: true, breakInheritance: false, groups: [] },
            metadata: {},
          },
        ],
      });

      const result = validationService.validateTemplate(template, rootNode);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: 'requiredFolders',
          message: 'Required folder "Financial" is missing',
        })
      );
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: 'requiredFolders',
          message: 'Required folder "Contracts" is missing',
        })
      );
    });

    it('should pass validation when all required folders are present', () => {
      const template = createMockTemplate();
      const rootNode = createMockFolderNode();

      const result = validationService.validateTemplate(template, rootNode);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('Folder Name Validation', () => {
    it('should fail validation for empty folder name', () => {
      const template = createMockTemplate();
      const rootNode = createMockFolderNode({
        children: [
          {
            id: 'empty',
            name: '',
            path: '/',
            type: 'folder',
            children: [],
            properties: { required: false, locked: false },
            permissions: { inherit: true, breakInheritance: false, groups: [] },
            metadata: {},
          },
        ],
      });

      const result = validationService.validateTemplate(template, rootNode);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: 'name',
          message: 'Folder name cannot be empty',
        })
      );
    });

    it('should fail validation for folder name with invalid characters', () => {
      const template = createMockTemplate();
      const rootNode = createMockFolderNode({
        children: [
          {
            id: 'invalid',
            name: 'Invalid@Name#',
            path: '/Invalid@Name#',
            type: 'folder',
            children: [],
            properties: { required: false, locked: false },
            permissions: { inherit: true, breakInheritance: false, groups: [] },
            metadata: {},
          },
          ...createMockFolderNode().children,
        ],
      });

      const result = validationService.validateTemplate(template, rootNode);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: 'name',
          message: 'Folder name contains invalid characters. Use only letters, numbers, underscore, hyphen, and spaces',
        })
      );
    });

    it('should pass validation for valid folder names', () => {
      const template = createMockTemplate();
      const rootNode = createMockFolderNode({
        children: [
          {
            id: 'valid',
            name: 'Valid_Name-123',
            path: '/Valid_Name-123',
            type: 'folder',
            children: [],
            properties: { required: false, locked: false },
            permissions: { inherit: true, breakInheritance: false, groups: [] },
            metadata: {},
          },
          ...createMockFolderNode().children,
        ],
      });

      const result = validationService.validateTemplate(template, rootNode);

      expect(result.valid).toBe(true);
    });
  });

  describe('Depth Limit Validation', () => {
    it('should fail validation when folder depth exceeds maximum', () => {
      const template = createMockTemplate();
      
      // Create a deeply nested structure (7 levels)
      const createDeepNode = (depth: number, maxDepth: number): FolderNode => {
        if (depth >= maxDepth) {
          return {
            id: `level-${depth}`,
            name: `Level${depth}`,
            path: `/Level${depth}`,
            type: 'folder',
            children: [],
            properties: { required: false, locked: false },
            permissions: { inherit: true, breakInheritance: false, groups: [] },
            metadata: {},
          };
        }
        return {
          id: `level-${depth}`,
          name: `Level${depth}`,
          path: `/Level${depth}`,
          type: 'folder',
          children: [createDeepNode(depth + 1, maxDepth)],
          properties: { required: false, locked: false },
          permissions: { inherit: true, breakInheritance: false, groups: [] },
          metadata: {},
        };
      };

      const rootNode = createMockFolderNode({
        children: [
          createDeepNode(1, 7),
          ...createMockFolderNode().children,
        ],
      });

      const result = validationService.validateTemplate(template, rootNode);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: 'depth',
          message: 'Folder depth exceeds maximum of 6 levels',
        })
      );
    });

    it('should pass validation when folder depth is within limit', () => {
      const template = createMockTemplate();
      
      // Create a structure with exactly 6 levels
      const createDeepNode = (depth: number, maxDepth: number): FolderNode => {
        if (depth >= maxDepth) {
          return {
            id: `level-${depth}`,
            name: `Level${depth}`,
            path: `/Level${depth}`,
            type: 'folder',
            children: [],
            properties: { required: false, locked: false },
            permissions: { inherit: true, breakInheritance: false, groups: [] },
            metadata: {},
          };
        }
        return {
          id: `level-${depth}`,
          name: `Level${depth}`,
          path: `/Level${depth}`,
          type: 'folder',
          children: [createDeepNode(depth + 1, maxDepth)],
          properties: { required: false, locked: false },
          permissions: { inherit: true, breakInheritance: false, groups: [] },
          metadata: {},
        };
      };

      const rootNode = createMockFolderNode({
        children: [
          createDeepNode(1, 6),
          ...createMockFolderNode().children,
        ],
      });

      const result = validationService.validateTemplate(template, rootNode);

      expect(result.valid).toBe(true);
    });
  });

  describe('Duplicate Detection', () => {
    it('should fail validation for duplicate folder names at same level', () => {
      const template = createMockTemplate();
      const rootNode = createMockFolderNode({
        children: [
          {
            id: 'dup1',
            name: 'Duplicate',
            path: '/Duplicate',
            type: 'folder',
            children: [],
            properties: { required: false, locked: false },
            permissions: { inherit: true, breakInheritance: false, groups: [] },
            metadata: {},
          },
          {
            id: 'dup2',
            name: 'Duplicate',
            path: '/Duplicate',
            type: 'folder',
            children: [],
            properties: { required: false, locked: false },
            permissions: { inherit: true, breakInheritance: false, groups: [] },
            metadata: {},
          },
          ...createMockFolderNode().children,
        ],
      });

      const result = validationService.validateTemplate(template, rootNode);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: 'name',
          message: 'Duplicate folder name at the same level',
        })
      );
    });
  });

  describe('Folder Properties Validation', () => {
    it('should fail validation for invalid naming pattern regex', () => {
      const template = createMockTemplate();
      const rootNode = createMockFolderNode({
        children: [
          {
            id: 'pattern',
            name: 'PatternFolder',
            path: '/PatternFolder',
            type: 'folder',
            children: [],
            properties: {
              required: false,
              locked: false,
              namingPattern: '[invalid(regex',
            },
            permissions: { inherit: true, breakInheritance: false, groups: [] },
            metadata: {},
          },
          ...createMockFolderNode().children,
        ],
      });

      const result = validationService.validateTemplate(template, rootNode);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: 'namingPattern',
          message: 'Invalid regex pattern for naming convention',
        })
      );
    });

    it('should fail validation for invalid max size', () => {
      const template = createMockTemplate();
      const rootNode = createMockFolderNode({
        children: [
          {
            id: 'size',
            name: 'SizeFolder',
            path: '/SizeFolder',
            type: 'folder',
            children: [],
            properties: {
              required: false,
              locked: false,
              maxSize: -10,
            },
            permissions: { inherit: true, breakInheritance: false, groups: [] },
            metadata: {},
          },
          ...createMockFolderNode().children,
        ],
      });

      const result = validationService.validateTemplate(template, rootNode);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: 'maxSize',
          message: 'Maximum size must be greater than 0',
        })
      );
    });

    it('should fail validation for locked folder without lock schedule', () => {
      const template = createMockTemplate();
      const rootNode = createMockFolderNode({
        children: [
          {
            id: 'locked',
            name: 'LockedFolder',
            path: '/LockedFolder',
            type: 'folder',
            children: [],
            properties: {
              required: false,
              locked: true,
              lockSchedule: {
                t3: false,
                t1: false,
                t0: false,
                t8: false,
              },
            },
            permissions: { inherit: true, breakInheritance: false, groups: [] },
            metadata: {},
          },
          ...createMockFolderNode().children,
        ],
      });

      const result = validationService.validateTemplate(template, rootNode);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: 'lockSchedule',
          message: 'Locked folder must have at least one lock schedule period',
        })
      );
    });
  });

  describe('validateDragDrop', () => {
    it('should prevent moving folder into its own descendant', () => {
      const rootNode = createMockFolderNode({
        children: [
          {
            id: 'parent',
            name: 'Parent',
            path: '/Parent',
            type: 'folder',
            children: [
              {
                id: 'child',
                name: 'Child',
                path: '/Parent/Child',
                type: 'folder',
                children: [],
                properties: { required: false, locked: false },
                permissions: { inherit: true, breakInheritance: false, groups: [] },
                metadata: {},
              },
            ],
            properties: { required: false, locked: false },
            permissions: { inherit: true, breakInheritance: false, groups: [] },
            metadata: {},
          },
        ],
      });

      const result = validationService.validateDragDrop('parent', 'child', rootNode);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: 'drag',
          message: 'Cannot move folder into its own descendant',
        })
      );
    });

    it('should prevent moving into locked folders', () => {
      const rootNode = createMockFolderNode({
        children: [
          {
            id: 'source',
            name: 'Source',
            path: '/Source',
            type: 'folder',
            children: [],
            properties: { required: false, locked: false },
            permissions: { inherit: true, breakInheritance: false, groups: [] },
            metadata: {},
          },
          {
            id: 'locked',
            name: 'Locked',
            path: '/Locked',
            type: 'folder',
            children: [],
            properties: { required: false, locked: true },
            permissions: { inherit: true, breakInheritance: false, groups: [] },
            metadata: {},
          },
        ],
      });

      const result = validationService.validateDragDrop('source', 'locked', rootNode);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: 'drag',
          message: 'Cannot move folders into a locked folder',
        })
      );
    });
  });

  describe('validateField', () => {
    it('should validate template name field', () => {
      const error = validationService.validateField('templateName', 'ab');
      expect(error).toEqual(
        expect.objectContaining({
          message: 'Template name must be at least 3 characters',
        })
      );

      const noError = validationService.validateField('templateName', 'Valid Name');
      expect(noError).toBeNull();
    });

    it('should validate folder name field', () => {
      const error = validationService.validateField('folderName', 'Invalid@Name');
      expect(error).toEqual(
        expect.objectContaining({
          message: 'Invalid characters. Use only letters, numbers, underscore, hyphen, and spaces',
        })
      );

      const noError = validationService.validateField('folderName', 'Valid_Name-123');
      expect(noError).toBeNull();
    });

    it('should validate naming pattern field', () => {
      const error = validationService.validateField('namingPattern', '[invalid(');
      expect(error).toEqual(
        expect.objectContaining({
          message: 'Invalid regex pattern',
        })
      );

      const noError = validationService.validateField('namingPattern', '^[A-Z]+$');
      expect(noError).toBeNull();
    });
  });

  describe('validateWithServer', () => {
    it('should combine client and server validation', async () => {
      const template = createMockTemplate();
      const rootNode = createMockFolderNode();

      vi.mocked(templateService.validateTemplate).mockResolvedValue({
        valid: false,
        errors: ['Server validation error'],
      });

      const result = await validationService.validateWithServer(template, rootNode);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          path: 'server',
          message: 'Server validation error',
        })
      );
    });

    it('should fall back to client-side validation on server error', async () => {
      const template = createMockTemplate();
      const rootNode = createMockFolderNode();

      vi.mocked(templateService.validateTemplate).mockRejectedValue(new Error('Network error'));

      const result = await validationService.validateWithServer(template, rootNode);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('canPublish', () => {
    it('should return true for valid publishable template', () => {
      const template = createMockTemplate({
        name: 'Valid Template',
        description: 'Valid description',
      });
      const rootNode = createMockFolderNode();

      const canPublish = validationService.canPublish(template, rootNode);

      expect(canPublish).toBe(true);
    });

    it('should return false for template without required metadata', () => {
      const template = createMockTemplate({ description: '' });
      const rootNode = createMockFolderNode();

      const canPublish = validationService.canPublish(template, rootNode);

      expect(canPublish).toBe(false);
    });

    it('should return false for template without children', () => {
      const template = createMockTemplate();
      const rootNode = createMockFolderNode({ children: [] });

      const canPublish = validationService.canPublish(template, rootNode);

      expect(canPublish).toBe(false);
    });

    it('should return false for template missing required folders', () => {
      const template = createMockTemplate();
      const rootNode = createMockFolderNode({
        children: [
          {
            id: 'other',
            name: 'Other',
            path: '/Other',
            type: 'folder',
            children: [],
            properties: { required: false, locked: false },
            permissions: { inherit: true, breakInheritance: false, groups: [] },
            metadata: {},
          },
        ],
      });

      const canPublish = validationService.canPublish(template, rootNode);

      expect(canPublish).toBe(false);
    });
  });

  describe('getValidationSummary', () => {
    it('should return success message for valid result', () => {
      const result = { valid: true, errors: [] };
      const summary = validationService.getValidationSummary(result);
      expect(summary).toBe('Template validation passed');
    });

    it('should return error count for invalid result', () => {
      const result = {
        valid: false,
        errors: [
          { path: 'test', field: 'field1', message: 'Error 1' },
          { path: 'test', field: 'field2', message: 'Error 2' },
        ],
      };
      const summary = validationService.getValidationSummary(result);
      expect(summary).toBe('Found 2 errors');
    });

    it('should include warning count when present', () => {
      const result = {
        valid: false,
        errors: [{ path: 'test', field: 'field1', message: 'Error 1' }],
        warnings: [
          { path: 'test', field: 'field2', message: 'Warning 1' },
          { path: 'test', field: 'field3', message: 'Warning 2' },
        ],
      };
      const summary = validationService.getValidationSummary(result);
      expect(summary).toBe('Found 1 error and 2 warnings');
    });
  });
});