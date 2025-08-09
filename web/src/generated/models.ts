export interface Contract {
  id: string;
  code: string;
  year: number;
  partner_id: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface ContractCreate {
  code: string;
  year: number;
  partner_id: string;
}

export interface ContractUpdate {
  code?: string;
  year?: number;
  partner_id?: string;
  status?: string;
}

export interface Order {
  id: string;
  order_em: string;
  contract_id: string;
  folder_template_id: string;
  year: number;
  order_date: string;
  content_type: string;
  has_special: boolean;
  created_at: string;
  updated_at: string;
}

export interface OrderCreate {
  order_em: string;
  contract_id: string;
  folder_template_id: string;
  year: number;
  order_date: string;
  content_type: string;
  has_special: boolean;
}

export interface OrderUpdate {
  order_em?: string;
  folder_template_id?: string;
  content_type?: string;
  has_special?: boolean;
}

export interface FolderTemplate {
  id: string;
  name: string;
  structure: any;
  created_at: string;
  updated_at: string;
}

export interface TemplateCreate {
  name: string;
  structure: any;
}

export interface TemplateUpdate {
  name?: string;
  structure?: any;
}

export interface ManualLock {
  id: string;
  order_id: string;
  folder_path: string;
  locked_by: string;
  locked_at: string;
  unlocked_by?: string;
  unlocked_at?: string;
  reason: string;
  is_active: boolean;
}

export interface ManualLockCreate {
  order_id: string;
  folder_path: string;
  reason: string;
}

export interface ManualUnlock {
  reason: string;
}

export interface TimeLock {
  id: string;
  order_id: string;
  folder_path: string;
  lock_from: string;
  lock_until: string;
  created_by: string;
  created_at: string;
  reason: string;
  is_active: boolean;
}

export interface TimeLockCreate {
  order_id: string;
  folder_path: string;
  lock_from: string;
  lock_until: string;
  reason: string;
}

export interface TimeLockUpdate {
  lock_from?: string;
  lock_until?: string;
  reason?: string;
  is_active?: boolean;
}

export interface LockStatus {
  is_locked: boolean;
  lock_type?: 'manual' | 'time' | 'rule';
  locked_by?: string;
  locked_at?: string;
  lock_reason?: string;
  unlock_at?: string;
}

export interface ErrorResponse {
  detail: string;
  correlation_id?: string;
}

export interface ValidationErrorResponse {
  detail: Array<{
    loc: string[];
    msg: string;
    type: string;
  }>;
}

export interface RateLimitErrorResponse {
  detail: string;
  retry_after: number;
}

export interface PaginationParams {
  skip?: number;
  limit?: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  skip: number;
  limit: number;
}