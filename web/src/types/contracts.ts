export interface ContractResponse {
  id: number;
  contract_number: string;
  name: string;
  description?: string;
  start_date: string;
  end_date?: string;
  total_value?: number;
  status: 'active' | 'inactive' | 'expired';
  created_at: string;
  updated_at: string;
  created_by?: string;
  updated_by?: string;
  pm_id?: string;
  pm_name?: string;
  client_name?: string;
}

export interface Contract {
  id: number;
  contractNumber: string;
  name: string;
  description?: string;
  startDate: string;
  endDate?: string;
  totalValue?: number;
  status: 'active' | 'inactive' | 'expired';
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  updatedBy?: string;
  pmId?: string;
  pmName?: string;
  clientName?: string;
}

export interface ContractListResponse {
  items: ContractResponse[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface ContractList {
  items: Contract[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ContractFilters {
  search?: string;
  status?: 'active' | 'inactive' | 'expired' | 'all';
  startDate?: string;
  endDate?: string;
  pmId?: string;
  clientName?: string;
}

export interface ContractFormData {
  contractNumber: string;
  name: string;
  description?: string;
  startDate: string;
  endDate?: string;
  totalValue?: number;
  status: 'active' | 'inactive' | 'expired';
  pmId?: string;
  clientName?: string;
}

export const transformContract = (response: ContractResponse): Contract => {
  if (!response) {
    throw new Error('Cannot transform contract: response is undefined or null');
  }
  
  if (!response.id) {
    throw new Error('Cannot transform contract: response has no ID');
  }
  
  return {
    id: response.id,
    contractNumber: response.contract_number,
    name: response.name,
    description: response.description,
    startDate: response.start_date,
    endDate: response.end_date,
    totalValue: response.total_value,
    status: response.status,
    createdAt: response.created_at,
    updatedAt: response.updated_at,
    createdBy: response.created_by,
    updatedBy: response.updated_by,
    pmId: response.pm_id,
    pmName: response.pm_name,
    clientName: response.client_name,
  };
};

export const transformContractList = (response: ContractListResponse): ContractList => ({
  items: response.items.map(transformContract),
  total: response.total,
  page: response.page,
  pageSize: response.page_size,
  totalPages: response.total_pages,
});