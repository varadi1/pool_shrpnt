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
    const response = await apiClient.post<OrderResponse>('/api/orders', data);
    return response as unknown as OrderResponse;
  },

  // Get order by ID
  getById: async (id: string): Promise<OrderResponse> => {
    const response = await apiClient.get<OrderResponse>(`/api/orders/${id}`);
    return response as unknown as OrderResponse;
  },

  // List all orders
  getAll: async (): Promise<OrderResponse[]> => {
    const response = await apiClient.get<OrderResponse[]>('/api/orders');
    return response as unknown as OrderResponse[];
  },

  // Trigger provisioning for an order
  provision: async (orderId: string): Promise<{ taskId: string; correlationId: string }> => {
    const response = await apiClient.post<{ taskId: string; correlationId: string }>(`/api/orders/${orderId}/provision`);
    return response as { taskId: string; correlationId: string };
  },

  // Get provisioning status
  getProvisioningStatus: async (orderId: string): Promise<ProvisioningStatusResponse> => {
    const response = await apiClient.get<ProvisioningStatusResponse>(`/api/orders/${orderId}/status`);
    return response as ProvisioningStatusResponse;
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
    // Development fallback: if endpoint is not available, return a safe default
    try {
      const response = await apiClient.get<{ sequence: number }>(`/api/orders/sequence/${contractCode}`);
      return (response as { sequence: number }).sequence;
    } catch (_e) {
      // Avoid noisy console errors and unblock the flow in development
      if (import.meta.env.DEV) {
        return 1;
      }
      throw _e;
    }
  },

  // Get order audit log
  getAuditLog: async (orderId: string): Promise<AuditLogResponse> => {
    const response = await apiClient.get<AuditLogResponse>(`/api/orders/${orderId}/audit`);
    return response as AuditLogResponse;
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