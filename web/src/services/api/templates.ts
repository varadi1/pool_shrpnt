import { apiClient } from './client';

export interface TemplateFolder {
  path: string;
  permissions: string[];
  locked: boolean;
}

export interface Template {
  id: string;
  name: string;
  version: string;
  description?: string;
  folders: TemplateFolder[];
  metadata: {
    createdBy: string;
    createdAt: string;
    usageCount: number;
    lastUsed?: string;
  };
  isActive: boolean;
  tags?: string[];
}

export interface TemplatePreview {
  folders: TemplateFolder[];
  metadata: {
    createdBy: string;
    usageCount: number;
    lastUsed: Date;
  };
}

export const templatesApi = {
  // Get all available templates
  getAll: async (): Promise<Template[]> => {
    const response = await apiClient.get('/api/templates');
    return response;
  },

  // Get a single template by ID
  getById: async (id: string): Promise<Template> => {
    const response = await apiClient.get(`/api/templates/${id}`);
    return response;
  },

  // Get template preview with folder structure
  getPreview: async (id: string): Promise<TemplatePreview> => {
    const response = await apiClient.get(`/api/templates/${id}/preview`);
    return response;
  },

  // Create a new template (Admin only)
  create: async (data: Partial<Template>): Promise<Template> => {
    const response = await apiClient.post('/api/templates', data);
    return response;
  },

  // Update an existing template (Admin only)
  update: async (id: string, data: Partial<Template>): Promise<Template> => {
    const response = await apiClient.put(`/api/templates/${id}`, data);
    return response;
  },

  // Delete a template (Admin only)
  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/api/templates/${id}`);
  },

  // Get active templates only
  getActive: async (): Promise<Template[]> => {
    const response = await apiClient.get('/api/templates?active=true');
    return response;
  },

  // Convenience API used by tests
  getTemplates: async (): Promise<Template[]> => {
    return templatesApi.getActive();
  },

  // Get template changelog
  getChangelog: async (id: string): Promise<any[]> => {
    const response = await apiClient.get(`/api/templates/${id}/changelog`);
    return response;
  },
};

// Backward-compatible top-level helper used by tests
export const getTemplates = templatesApi.getActive;