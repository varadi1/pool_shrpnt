import { apiClient } from './client';
import type { 
  Contract, 
  ContractResponse, 
  ContractListResponse, 
  ContractList, 
  ContractFormData
} from '@/types/contracts';
import {
  transformContract,
  transformContractList 
} from '@/types/contracts';

export const contractsApi = {
  // Get all contracts accessible to the current user with pagination
  getAll: async (page = 1, pageSize = 25, filters?: Record<string, any>): Promise<ContractList> => {
    const params = new URLSearchParams({
      page: page.toString(),
      page_size: pageSize.toString(),
      ...filters,
    });
    const response = await apiClient.get<ContractListResponse>(`/api/contracts?${params}`);
    return transformContractList(response.data);
  },

  // Convenience API used by tests
  getUserContracts: async (): Promise<Contract[]> => {
    const list = await contractsApi.getAll(1, 25);
    return list.items;
  },

  // Get a single contract by ID
  getById: async (id: string | number): Promise<Contract> => {
    const response = await apiClient.get<ContractResponse>(`/api/contracts/${id}`);
    return transformContract(response.data);
  },

  // Create a new contract (Admin only)
  create: async (data: ContractFormData): Promise<Contract> => {
    const payload = {
      contract_number: data.contractNumber,
      name: data.name,
      description: data.description,
      start_date: data.startDate,
      end_date: data.endDate || undefined,
      total_value: data.totalValue || undefined,
      status: data.status,
    };
    const response = await apiClient.post<ContractResponse>('/api/contracts', payload);
    
    // Check if response data exists
    if (!response.data) {
      console.error('Contract create response has no data:', response);
      throw new Error('Invalid response from server - no data returned');
    }
    
    return transformContract(response.data);
  },

  // Update an existing contract (Admin only)
  update: async (id: string | number, data: Partial<ContractFormData>): Promise<Contract> => {
    const payload: any = {};
    // Only include fields that can be updated according to ContractUpdate schema
    if (data.name) payload.name = data.name;
    if (data.description !== undefined) payload.description = data.description;
    if (data.endDate !== undefined) payload.end_date = data.endDate;
    if (data.totalValue !== undefined) payload.total_value = data.totalValue;
    if (data.status) payload.status = data.status;
    
    const response = await apiClient.patch<ContractResponse>(`/api/contracts/${id}`, payload);
    return transformContract(response.data);
  },

  // Delete a contract (Admin only)
  delete: async (id: string | number): Promise<void> => {
    await apiClient.delete(`/api/contracts/${id}`);
  },

  // Get contracts for a specific PM with pagination
  getByPmId: async (pmId: string, page = 1, pageSize = 25): Promise<ContractList> => {
    const params = new URLSearchParams({
      pm_id: pmId,
      page: page.toString(),
      page_size: pageSize.toString(),
    });
    const response = await apiClient.get<ContractListResponse>(`/api/contracts?${params}`);
    return transformContractList(response.data);
  },

  // Get active contracts only with pagination
  getActive: async (page = 1, pageSize = 25): Promise<ContractList> => {
    const params = new URLSearchParams({
      status: 'active',
      page: page.toString(),
      page_size: pageSize.toString(),
    });
    const response = await apiClient.get<ContractListResponse>(`/api/contracts?${params}`);
    return transformContractList(response.data);
  },

  // Export contracts to CSV
  exportToCsv: async (contracts: Contract[]): Promise<void> => {
    const headers = ['Contract Number', 'Name', 'Client', 'Status', 'Start Date', 'End Date', 'PM'];
    const rows = contracts.map(c => [
      c.contractNumber,
      c.name,
      c.clientName || '',
      c.status,
      c.startDate,
      c.endDate || '',
      c.pmName || '',
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `contracts-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  },
};

// Backward-compatible top-level helpers used by tests
export async function getUserContracts(): Promise<Contract[]> {
  const list = await contractsApi.getAll(1, 25);
  return list.items;
}