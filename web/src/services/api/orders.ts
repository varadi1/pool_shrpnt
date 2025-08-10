import { apiClient } from './client';
import type { OrderFormData, OrderSubmissionPayload, ProvisioningStep, AuditLogEntry } from '@/types/orders';

export interface OrderResponse {
  id: string;
  code: string;
  name: string;
  contractId: string;
  templateId: string;
  status: 'draft' | 'provisioning' | 'active' | 'completed' | 'failed';
  createdAt: string;
  updatedAt: string;
}

export interface ProvisioningStatusResponse {
  orderId: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  progress?: number;
  currentStep?: string;
  steps: ProvisioningStep[];
  estimatedCompletionTime?: string;
  correlationId: string;
  error?: string;
}

export interface AuditLogResponse {
  entries: AuditLogEntry[];
  totalCount: number;
}

export const ordersApi = {
  // Create a new order
  create: async (data: OrderSubmissionPayload): Promise<OrderResponse> => {
    const response = await apiClient.post('/api/orders', data);
    return response.data;
  },

  // Get order by ID
  getById: async (id: string): Promise<OrderResponse> => {
    const response = await apiClient.get(`/api/orders/${id}`);
    return response.data;
  },

  // List all orders
  getAll: async (): Promise<OrderResponse[]> => {
    const response = await apiClient.get('/api/orders');
    return response.data;
  },

  // Trigger provisioning for an order
  provision: async (orderId: string): Promise<{ taskId: string; correlationId: string }> => {
    const response = await apiClient.post(`/api/orders/${orderId}/provision`);
    return response.data;
  },

  // Get provisioning status
  getProvisioningStatus: async (orderId: string): Promise<ProvisioningStatusResponse> => {
    const response = await apiClient.get(`/api/orders/${orderId}/status`);
    return response.data;
  },

  // Save draft order to localStorage
  saveDraft: (contractId: string, data: Partial<OrderFormData>) => {
    const draft = {
      data,
      savedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
    };
    localStorage.setItem(`order-draft-${contractId}`, JSON.stringify(draft));
  },

  // Load draft order from localStorage
  loadDraft: (contractId: string): Partial<OrderFormData> | null => {
    const draftStr = localStorage.getItem(`order-draft-${contractId}`);
    if (!draftStr) return null;

    try {
      const draft = JSON.parse(draftStr);
      const expiresAt = new Date(draft.expiresAt);
      
      // Check if draft is expired
      if (expiresAt < new Date()) {
        localStorage.removeItem(`order-draft-${contractId}`);
        return null;
      }

      return draft.data;
    } catch {
      return null;
    }
  },

  // Delete draft order
  deleteDraft: (contractId: string) => {
    localStorage.removeItem(`order-draft-${contractId}`);
  },

  // Get next sequence number for order code generation
  getNextSequence: async (contractCode: string): Promise<number> => {
    const response = await apiClient.get(`/api/orders/sequence/${contractCode}`);
    return response.data.sequence;
  },

  // Get order audit log
  getAuditLog: async (orderId: string): Promise<AuditLogResponse> => {
    const response = await apiClient.get(`/api/orders/${orderId}/audit`);
    return response.data;
  },
};

// Export helper functions for the hook
export const getOrderStatus = ordersApi.getProvisioningStatus;
export const getOrderAuditLog = ordersApi.getAuditLog;

// Backward-compatible helper names used by tests
export const createOrder = ordersApi.create;
export const triggerProvisioning = (orderId: string) => ordersApi.provision(orderId).then(r => ({ taskId: r.taskId ?? 'unknown', status: 'started' as const }));
export const getNextSequence = ordersApi.getNextSequence;
export const getProvisioningStatus = ordersApi.getProvisioningStatus;