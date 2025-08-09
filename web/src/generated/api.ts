import type {
  Contract,
  ContractCreate,
  ContractUpdate,
  Order,
  OrderCreate,
  OrderUpdate,
  FolderTemplate,
  TemplateCreate,
  TemplateUpdate,
  ManualLock,
  ManualLockCreate,
  ManualUnlock,
  TimeLock,
  TimeLockCreate,
  TimeLockUpdate,
  LockStatus,
  PaginationParams,
  PaginatedResponse
} from './models';

export interface ApiConfig {
  basePath: string;
  fetchApi: (url: string, init?: RequestInit) => Promise<Response>;
}

export class PoolDrvApi {
  private config: ApiConfig;

  constructor(config: ApiConfig) {
    this.config = config;
  }

  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const url = `${this.config.basePath}${path}`;
    const response = await this.config.fetchApi(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'API request failed');
    }

    return response.json();
  }

  // Contract endpoints
  async createContract(data: ContractCreate): Promise<Contract> {
    return this.request<Contract>('/api/v1/contracts', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async listContracts(params?: PaginationParams): Promise<PaginatedResponse<Contract>> {
    const queryParams = new URLSearchParams();
    if (params?.skip !== undefined) queryParams.append('skip', params.skip.toString());
    if (params?.limit !== undefined) queryParams.append('limit', params.limit.toString());
    
    const query = queryParams.toString();
    const path = query ? `/api/v1/contracts?${query}` : '/api/v1/contracts';
    
    return this.request<PaginatedResponse<Contract>>(path);
  }

  async getContract(contractId: string): Promise<Contract> {
    return this.request<Contract>(`/api/v1/contracts/${contractId}`);
  }

  async updateContract(contractId: string, data: ContractUpdate): Promise<Contract> {
    return this.request<Contract>(`/api/v1/contracts/${contractId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteContract(contractId: string): Promise<void> {
    await this.request<void>(`/api/v1/contracts/${contractId}`, {
      method: 'DELETE',
    });
  }

  // Order endpoints
  async createOrder(data: OrderCreate): Promise<Order> {
    return this.request<Order>('/api/v1/orders', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async listOrders(params?: PaginationParams): Promise<PaginatedResponse<Order>> {
    const queryParams = new URLSearchParams();
    if (params?.skip !== undefined) queryParams.append('skip', params.skip.toString());
    if (params?.limit !== undefined) queryParams.append('limit', params.limit.toString());
    
    const query = queryParams.toString();
    const path = query ? `/api/v1/orders?${query}` : '/api/v1/orders';
    
    return this.request<PaginatedResponse<Order>>(path);
  }

  async getOrder(orderId: string): Promise<Order> {
    return this.request<Order>(`/api/v1/orders/${orderId}`);
  }

  async updateOrder(orderId: string, data: OrderUpdate): Promise<Order> {
    return this.request<Order>(`/api/v1/orders/${orderId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteOrder(orderId: string): Promise<void> {
    await this.request<void>(`/api/v1/orders/${orderId}`, {
      method: 'DELETE',
    });
  }

  async provisionOrder(orderId: string): Promise<any> {
    return this.request<any>(`/api/v1/orders/${orderId}/provision`, {
      method: 'POST',
    });
  }

  // Template endpoints
  async createTemplate(data: TemplateCreate): Promise<FolderTemplate> {
    return this.request<FolderTemplate>('/api/v1/templates', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async listTemplates(params?: PaginationParams): Promise<PaginatedResponse<FolderTemplate>> {
    const queryParams = new URLSearchParams();
    if (params?.skip !== undefined) queryParams.append('skip', params.skip.toString());
    if (params?.limit !== undefined) queryParams.append('limit', params.limit.toString());
    
    const query = queryParams.toString();
    const path = query ? `/api/v1/templates?${query}` : '/api/v1/templates';
    
    return this.request<PaginatedResponse<FolderTemplate>>(path);
  }

  async getTemplate(templateId: string): Promise<FolderTemplate> {
    return this.request<FolderTemplate>(`/api/v1/templates/${templateId}`);
  }

  async updateTemplate(templateId: string, data: TemplateUpdate): Promise<FolderTemplate> {
    return this.request<FolderTemplate>(`/api/v1/templates/${templateId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteTemplate(templateId: string): Promise<void> {
    await this.request<void>(`/api/v1/templates/${templateId}`, {
      method: 'DELETE',
    });
  }

  // Manual Lock endpoints
  async createManualLock(data: ManualLockCreate): Promise<ManualLock> {
    return this.request<ManualLock>('/api/v1/locks/manual', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async listManualLocks(params?: PaginationParams): Promise<PaginatedResponse<ManualLock>> {
    const queryParams = new URLSearchParams();
    if (params?.skip !== undefined) queryParams.append('skip', params.skip.toString());
    if (params?.limit !== undefined) queryParams.append('limit', params.limit.toString());
    
    const query = queryParams.toString();
    const path = query ? `/api/v1/locks/manual?${query}` : '/api/v1/locks/manual';
    
    return this.request<PaginatedResponse<ManualLock>>(path);
  }

  async getManualLock(lockId: string): Promise<ManualLock> {
    return this.request<ManualLock>(`/api/v1/locks/manual/${lockId}`);
  }

  async unlockManual(lockId: string, data: ManualUnlock): Promise<ManualLock> {
    return this.request<ManualLock>(`/api/v1/locks/manual/${lockId}/unlock`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Time Lock endpoints
  async createTimeLock(data: TimeLockCreate): Promise<TimeLock> {
    return this.request<TimeLock>('/api/v1/locks/time', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async listTimeLocks(params?: PaginationParams): Promise<PaginatedResponse<TimeLock>> {
    const queryParams = new URLSearchParams();
    if (params?.skip !== undefined) queryParams.append('skip', params.skip.toString());
    if (params?.limit !== undefined) queryParams.append('limit', params.limit.toString());
    
    const query = queryParams.toString();
    const path = query ? `/api/v1/locks/time?${query}` : '/api/v1/locks/time';
    
    return this.request<PaginatedResponse<TimeLock>>(path);
  }

  async getTimeLock(lockId: string): Promise<TimeLock> {
    return this.request<TimeLock>(`/api/v1/locks/time/${lockId}`);
  }

  async updateTimeLock(lockId: string, data: TimeLockUpdate): Promise<TimeLock> {
    return this.request<TimeLock>(`/api/v1/locks/time/${lockId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteTimeLock(lockId: string): Promise<void> {
    await this.request<void>(`/api/v1/locks/time/${lockId}`, {
      method: 'DELETE',
    });
  }

  // Lock Status endpoint
  async getLockStatus(orderId: string, folderPath: string): Promise<LockStatus> {
    const queryParams = new URLSearchParams({
      order_id: orderId,
      folder_path: folderPath,
    });
    
    return this.request<LockStatus>(`/api/v1/locks/status?${queryParams.toString()}`);
  }

  // Health endpoint
  async getHealth(): Promise<any> {
    return this.request<any>('/health');
  }
}