import { useApiGet, useApiPost, useApiPut, useApiDelete, useApiPaginated } from '@/hooks/useApi';
import { useQueryClient } from '@tanstack/react-query';

// Types for Contracts
export interface Contract {
  id: string;
  name: string;
  description?: string;
  partnerId: string;
  partnerName: string;
  year: number;
  partLetter: 'A' | 'B' | 'C';
  validFrom: string;
  validTo: string;
  status: 'draft' | 'active' | 'expired' | 'terminated';
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  lastModifiedBy: string;
}

export interface CreateContractDto {
  name: string;
  description?: string;
  partnerId: string;
  partnerName: string;
  year: number;
  partLetter: 'A' | 'B' | 'C';
  validFrom: string;
  validTo: string;
}

export interface UpdateContractDto {
  name?: string;
  description?: string;
  validFrom?: string;
  validTo?: string;
  status?: Contract['status'];
}

// Hook to get all contracts with pagination
export function useContracts(page = 1, pageSize = 20, filters?: { status?: string; year?: number }) {
  return useApiPaginated<Contract>(
    ['contracts', filters],
    '/api/contracts',
    page,
    pageSize,
    filters
  );
}

// Hook to get a single contract by ID
export function useContract(contractId: string | undefined) {
  return useApiGet<Contract>(
    ['contract', contractId],
    contractId ? `/api/contracts/${contractId}` : null,
    {
      enabled: !!contractId,
    }
  );
}

// Hook to get active contracts
export function useActiveContracts() {
  return useApiGet<Contract[]>(
    ['contracts', 'active'],
    '/api/contracts?status=active',
    {
      staleTime: 300000, // 5 minutes - contracts don't change often
    }
  );
}

// Hook to get contracts expiring soon
export function useExpiringContracts(days = 30) {
  return useApiGet<Contract[]>(
    ['contracts', 'expiring', days],
    `/api/contracts/expiring?days=${days}`,
    {
      staleTime: 300000, // 5 minutes
    }
  );
}

// Hook to create a new contract
export function useCreateContract() {
  const queryClient = useQueryClient();
  
  return useApiPost<Contract, CreateContractDto>('/api/contracts', {
    onSuccess: () => {
      // Invalidate contracts list after creation
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
    },
  });
}

// Hook to update a contract
export function useUpdateContract(contractId: string) {
  const queryClient = useQueryClient();
  
  return useApiPut<Contract, UpdateContractDto>(
    `/api/contracts/${contractId}`,
    {
      onSuccess: (data) => {
        // Update the specific contract in cache
        queryClient.setQueryData(['contract', contractId], data);
        // Invalidate contracts list
        queryClient.invalidateQueries({ queryKey: ['contracts'] });
      },
    }
  );
}

// Hook to delete a contract
export function useDeleteContract() {
  const queryClient = useQueryClient();
  
  return useApiDelete<void, { contractId: string }>(
    (variables) => `/api/contracts/${variables.contractId}`,
    {
      onSuccess: (_, variables) => {
        // Remove from cache
        queryClient.removeQueries({ queryKey: ['contract', variables.contractId] });
        // Invalidate contracts list
        queryClient.invalidateQueries({ queryKey: ['contracts'] });
      },
    }
  );
}

// Hook to activate a contract
export function useActivateContract() {
  const queryClient = useQueryClient();
  
  return useApiPost<Contract, { contractId: string }>(
    '/api/contracts/activate',
    {
      onSuccess: (data) => {
        // Update the contract in cache
        queryClient.setQueryData(['contract', data.id], data);
        // Invalidate contracts lists
        queryClient.invalidateQueries({ queryKey: ['contracts'] });
      },
    }
  );
}

// Hook to get contract metrics for dashboard
export function useContractMetrics() {
  return useApiGet<{
    active: number;
    expiring30d: number;
    total: number;
  }>(
    ['contracts', 'metrics'],
    '/api/contracts/metrics',
    {
      staleTime: 300000, // 5 minutes
    }
  );
}