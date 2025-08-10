import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useTemplatesList,
  useTemplate,
  useTemplateVersions,
  useCreateTemplate,
  useUpdateTemplate,
  useDeleteTemplate,
  useRollbackTemplate,
  useValidateTemplate,
  useUpdateVersionTags,
  useUpdateVersionNotes,
  templateKeys,
} from '../useTemplates';
import { templateService } from '../../services/templates';
import type { Template, TemplateVersion } from '../../types/templates';

// Mock the template service
vi.mock('../../services/templates', () => ({
  templateService: {
    getTemplates: vi.fn(),
    getTemplate: vi.fn(),
    createTemplate: vi.fn(),
    updateTemplate: vi.fn(),
    deleteTemplate: vi.fn(),
    getVersions: vi.fn(),
    getTemplateVersion: vi.fn(),
    getVersionUsage: vi.fn(),
    performRollback: vi.fn(),
    validateTemplate: vi.fn(),
    updateVersionTags: vi.fn(),
    updateVersionNotes: vi.fn(),
  },
}));

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return ({ children }: { children: React.ReactNode }) => 
    React.createElement(QueryClientProvider, { client: queryClient }, children);
};

const mockTemplate: Template = {
  id: '1',
  name: 'Test Template',
  description: 'Test description',
  status: 'active',
  currentVersion: '1.0.0',
  createdBy: 'Admin',
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-05'),
  usageCount: 10,
  tags: ['test'],
};

const mockTemplateList = {
  templates: [mockTemplate],
  total: 1,
  page: 1,
  pageSize: 20,
};

const mockVersion: TemplateVersion = {
  id: 'v1',
  templateId: '1',
  version: '1.0.0',
  structure: {
    id: 'root',
    name: 'Root',
    path: '/',
    type: 'folder',
    children: [],
    properties: { required: true, locked: false },
    permissions: { inherit: true, breakInheritance: false, groups: [] },
    metadata: {},
  },
  changelog: 'Initial version',
  author: 'Admin',
  publishedAt: new Date('2025-01-01'),
  isPublished: true,
  usageCount: 5,
};

describe('useTemplates hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('useTemplatesList', () => {
    it('should fetch templates list', async () => {
      vi.mocked(templateService.getTemplates).mockResolvedValue(mockTemplateList);

      const { result } = renderHook(() => useTemplatesList(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual(mockTemplateList);
      expect(templateService.getTemplates).toHaveBeenCalledWith(1, 20, undefined, undefined);
    });

    it('should fetch templates with filters and pagination', async () => {
      vi.mocked(templateService.getTemplates).mockResolvedValue(mockTemplateList);

      const filters = { search: 'test', status: ['active'] };
      const sort = { field: 'name' as const, direction: 'asc' as const };

      const { result } = renderHook(
        () => useTemplatesList(2, 10, filters, sort),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(templateService.getTemplates).toHaveBeenCalledWith(2, 10, filters, sort);
    });
  });

  describe('useTemplate', () => {
    it('should fetch a single template', async () => {
      vi.mocked(templateService.getTemplate).mockResolvedValue(mockTemplate);

      const { result } = renderHook(() => useTemplate('1'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual(mockTemplate);
      expect(templateService.getTemplate).toHaveBeenCalledWith('1');
    });

    it('should not fetch if id is not provided', () => {
      const { result } = renderHook(() => useTemplate(''), {
        wrapper: createWrapper(),
      });

      // Query should be disabled when id is empty
      expect(result.current.isSuccess).toBe(false);
      expect(result.current.data).toBeUndefined();
      expect(templateService.getTemplate).not.toHaveBeenCalled();
    });
  });

  describe('useTemplateVersions', () => {
    it('should fetch template versions', async () => {
      vi.mocked(templateService.getVersions).mockResolvedValue([mockVersion]);

      const { result } = renderHook(() => useTemplateVersions('1'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual([mockVersion]);
      expect(templateService.getVersions).toHaveBeenCalledWith('1');
    });
  });

  describe('useCreateTemplate', () => {
    it('should create a template with optimistic update', async () => {
      const newTemplate = {
        name: 'New Template',
        description: 'New description',
      };

      const createdTemplate = {
        ...mockTemplate,
        id: '2',
        ...newTemplate,
      };

      vi.mocked(templateService.createTemplate).mockResolvedValue(createdTemplate);
      vi.mocked(templateService.getTemplates).mockResolvedValue(mockTemplateList);

      const queryClient = new QueryClient({
        defaultOptions: {
          queries: { retry: false },
          mutations: { retry: false },
        },
      });

      // Pre-populate the cache
      queryClient.setQueryData(templateKeys.lists(), mockTemplateList);

      const wrapper = ({ children }: { children: React.ReactNode }) => 
        React.createElement(QueryClientProvider, { client: queryClient }, children);

      const { result } = renderHook(() => useCreateTemplate(), { wrapper });

      await result.current.mutateAsync(newTemplate);

      expect(templateService.createTemplate).toHaveBeenCalledWith(newTemplate);
    });

    it('should rollback on error', async () => {
      const newTemplate = {
        name: 'New Template',
        description: 'New description',
      };

      vi.mocked(templateService.createTemplate).mockRejectedValue(new Error('Create failed'));
      vi.mocked(templateService.getTemplates).mockResolvedValue(mockTemplateList);

      const queryClient = new QueryClient({
        defaultOptions: {
          queries: { retry: false },
          mutations: { retry: false },
        },
      });

      queryClient.setQueryData(templateKeys.lists(), mockTemplateList);

      const wrapper = ({ children }: { children: React.ReactNode }) => 
        React.createElement(QueryClientProvider, { client: queryClient }, children);

      const { result } = renderHook(() => useCreateTemplate(), { wrapper });

      try {
        await result.current.mutateAsync(newTemplate);
      } catch (error) {
        // Expected to throw
      }

      await waitFor(() => {
        const cachedData = queryClient.getQueryData(templateKeys.lists());
        expect(cachedData).toEqual(mockTemplateList);
      });
    });
  });

  describe('useUpdateTemplate', () => {
    it('should update a template with optimistic update', async () => {
      const updates = {
        name: 'Updated Template',
        description: 'Updated description',
      };

      const updatedTemplate = {
        ...mockTemplate,
        ...updates,
      };

      vi.mocked(templateService.updateTemplate).mockResolvedValue(updatedTemplate);

      const queryClient = new QueryClient({
        defaultOptions: {
          queries: { retry: false },
          mutations: { retry: false },
        },
      });

      queryClient.setQueryData(templateKeys.detail('1'), mockTemplate);
      queryClient.setQueryData(templateKeys.lists(), mockTemplateList);

      const wrapper = ({ children }: { children: React.ReactNode }) => 
        React.createElement(QueryClientProvider, { client: queryClient }, children);

      const { result } = renderHook(() => useUpdateTemplate(), { wrapper });

      await result.current.mutateAsync({ id: '1', updates });

      expect(templateService.updateTemplate).toHaveBeenCalledWith('1', updates);
    });
  });

  describe('useDeleteTemplate', () => {
    it('should delete a template with optimistic update', async () => {
      vi.mocked(templateService.deleteTemplate).mockResolvedValue();

      const queryClient = new QueryClient({
        defaultOptions: {
          queries: { retry: false },
          mutations: { retry: false },
        },
      });

      queryClient.setQueryData(templateKeys.lists(), mockTemplateList);

      const wrapper = ({ children }: { children: React.ReactNode }) => 
        React.createElement(QueryClientProvider, { client: queryClient }, children);

      const { result } = renderHook(() => useDeleteTemplate(), { wrapper });

      await result.current.mutateAsync('1');

      expect(templateService.deleteTemplate).toHaveBeenCalledWith('1');

      // Check optimistic update
      const cachedData: any = queryClient.getQueryData(templateKeys.lists());
      expect(cachedData?.templates).toHaveLength(0);
    });
  });

  describe('useRollbackTemplate', () => {
    it('should rollback a template', async () => {
      const rollbackParams = {
        templateId: '1',
        targetVersion: '1.0.0',
        reason: 'Reverting to stable version',
      };

      vi.mocked(templateService.performRollback).mockResolvedValue(mockVersion);

      const { result } = renderHook(() => useRollbackTemplate(), {
        wrapper: createWrapper(),
      });

      await result.current.mutateAsync(rollbackParams);

      expect(templateService.performRollback).toHaveBeenCalledWith(
        rollbackParams.templateId,
        rollbackParams.targetVersion,
        rollbackParams.reason
      );
    });
  });

  describe('useValidateTemplate', () => {
    it('should validate a template', async () => {
      const templateToValidate = {
        name: 'Test Template',
        description: 'Test description',
      };

      const validationResult = { valid: true, errors: [] };

      vi.mocked(templateService.validateTemplate).mockResolvedValue(validationResult);

      const { result } = renderHook(() => useValidateTemplate(), {
        wrapper: createWrapper(),
      });

      const response = await result.current.mutateAsync(templateToValidate);

      expect(response).toEqual(validationResult);
      expect(templateService.validateTemplate).toHaveBeenCalledWith(templateToValidate);
    });
  });

  describe('useUpdateVersionTags', () => {
    it('should update version tags with optimistic update', async () => {
      const params = {
        templateId: '1',
        versionId: 'v1',
        tags: ['stable' as const, 'production' as const],
      };

      const updatedVersion = {
        ...mockVersion,
        tags: params.tags,
      };

      vi.mocked(templateService.updateVersionTags).mockResolvedValue(updatedVersion);

      const queryClient = new QueryClient({
        defaultOptions: {
          queries: { retry: false },
          mutations: { retry: false },
        },
      });

      queryClient.setQueryData(templateKeys.version('1', 'v1'), mockVersion);

      const wrapper = ({ children }: { children: React.ReactNode }) => 
        React.createElement(QueryClientProvider, { client: queryClient }, children);

      const { result } = renderHook(() => useUpdateVersionTags(), { wrapper });

      await result.current.mutateAsync(params);

      expect(templateService.updateVersionTags).toHaveBeenCalledWith(
        params.templateId,
        params.versionId,
        params.tags
      );
    });
  });

  describe('useUpdateVersionNotes', () => {
    it('should update version notes with optimistic update', async () => {
      const params = {
        templateId: '1',
        versionId: 'v1',
        notes: 'Updated changelog notes',
      };

      const updatedVersion = {
        ...mockVersion,
        changelog: params.notes,
      };

      vi.mocked(templateService.updateVersionNotes).mockResolvedValue(updatedVersion);

      const queryClient = new QueryClient({
        defaultOptions: {
          queries: { retry: false },
          mutations: { retry: false },
        },
      });

      queryClient.setQueryData(templateKeys.version('1', 'v1'), mockVersion);

      const wrapper = ({ children }: { children: React.ReactNode }) => 
        React.createElement(QueryClientProvider, { client: queryClient }, children);

      const { result } = renderHook(() => useUpdateVersionNotes(), { wrapper });

      await result.current.mutateAsync(params);

      expect(templateService.updateVersionNotes).toHaveBeenCalledWith(
        params.templateId,
        params.versionId,
        params.notes
      );

      // Check optimistic update
      const cachedData: any = queryClient.getQueryData(templateKeys.version('1', 'v1'));
      expect(cachedData?.changelog).toBe(params.notes);
    });
  });

  describe('templateKeys', () => {
    it('should generate correct query keys', () => {
      expect(templateKeys.all).toEqual(['templates']);
      expect(templateKeys.lists()).toEqual(['templates', 'list']);
      expect(templateKeys.detail('1')).toEqual(['templates', 'detail', '1']);
      expect(templateKeys.versions('1')).toEqual(['templates', 'detail', '1', 'versions']);
      expect(templateKeys.version('1', 'v1')).toEqual(['templates', 'detail', '1', 'versions', 'v1']);
      expect(templateKeys.versionUsage('1', 'v1')).toEqual([
        'templates',
        'detail',
        '1',
        'versions',
        'v1',
        'usage',
      ]);
    });
  });
});