import { useApiGet, useApiPost, useApiPut, useApiDelete, useApiPaginated } from '@/hooks/useApi';
import { useQueryClient } from '@tanstack/react-query';

// Types for Orders
export interface Order {
  id: string;
  emId: string;
  contractId: string;
  type: 'new' | 'change' | 'terminate';
  status: 'draft' | 'pending_provision' | 'active' | 'failed' | 'terminated';
  createdAt: string;
  updatedAt: string;
  provisionedAt?: string;
  errorMessage?: string;
  correlationId?: string;
}

export interface CreateOrderDto {
  emId: string;
  contractId: string;
  type: 'new' | 'change' | 'terminate';
  metadata?: Record<string, any>;
}

export interface UpdateOrderDto {
  status?: Order['status'];
  metadata?: Record<string, any>;
}

// Hook to get all orders with pagination
export function useOrders(page = 1, pageSize = 20, filters?: { status?: string; type?: string }) {
  return useApiPaginated<Order>(
    ['orders', filters],
    '/api/orders',
    page,
    pageSize,
    filters
  );
}

// Hook to get a single order by ID
export function useOrder(orderId: string | undefined) {
  return useApiGet<Order>(
    ['order', orderId],
    orderId ? `/api/orders/${orderId}` : null,
    {
      enabled: !!orderId,
    }
  );
}

// Hook to get orders by status
export function useOrdersByStatus(status: Order['status']) {
  return useApiGet<Order[]>(
    ['orders', 'status', status],
    `/api/orders?status=${status}`,
    {
      refetchInterval: status === 'pending_provision' ? 30000 : false, // Poll pending orders
    }
  );
}

// Hook to create a new order
export function useCreateOrder() {
  const queryClient = useQueryClient();
  
  return useApiPost<Order, CreateOrderDto>('/api/orders', {
    onSuccess: () => {
      // Invalidate orders list after creation
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });
}

// Hook to update an order
export function useUpdateOrder(orderId: string) {
  const queryClient = useQueryClient();
  
  return useApiPut<Order, UpdateOrderDto>(
    `/api/orders/${orderId}`,
    {
      onSuccess: (data) => {
        // Update the specific order in cache
        queryClient.setQueryData(['order', orderId], data);
        // Invalidate orders list
        queryClient.invalidateQueries({ queryKey: ['orders'] });
      },
    }
  );
}

// Hook to delete an order
export function useDeleteOrder() {
  const queryClient = useQueryClient();
  
  return useApiDelete<void, { orderId: string }>(
    (variables) => `/api/orders/${variables.orderId}`,
    {
      onSuccess: (_, variables) => {
        // Remove from cache
        queryClient.removeQueries({ queryKey: ['order', variables.orderId] });
        // Invalidate orders list
        queryClient.invalidateQueries({ queryKey: ['orders'] });
      },
    }
  );
}

// Hook to provision an order
export function useProvisionOrder() {
  const queryClient = useQueryClient();
  
  return useApiPost<Order, { orderId: string }>(
    '/api/orders/provision',
    {
      onSuccess: (data) => {
        // Update the order in cache
        queryClient.setQueryData(['order', data.id], data);
        // Invalidate orders list
        queryClient.invalidateQueries({ queryKey: ['orders'] });
      },
    }
  );
}

// Hook to get order metrics for dashboard
export function useOrderMetrics() {
  return useApiGet<{
    active: number;
    pending: number;
    failed24h: number;
    total: number;
  }>(
    ['orders', 'metrics'],
    '/api/orders/metrics',
    {
      staleTime: 60000, // 1 minute
      refetchInterval: 60000, // Refresh every minute
    }
  );
}