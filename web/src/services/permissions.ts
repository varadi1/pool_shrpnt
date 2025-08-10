import { api } from './api';
import type {
  PermissionMatrix,
  EffectivePermission,
  RoleType,
  PermissionLevel,
  User,
  Group,
  UserGroupAssignment,
  BulkOperation,
} from '../types/permissions';

interface PermissionUpdateRequest {
  folderId: string;
  roleType: RoleType;
  level: PermissionLevel;
  reason?: string;
}

interface PermissionMatrixUpdate {
  orderId: string;
  updates: PermissionUpdateRequest[];
}

interface PermissionApplyRequest {
  orderId: string;
  dryRun?: boolean;
  force?: boolean;
}

interface PermissionApplyResponse {
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  jobId: string;
  startedAt: Date;
  completedAt?: Date;
  progress?: {
    current: number;
    total: number;
    percentage: number;
  };
  errors?: Array<{
    folder: string;
    error: string;
    retryable: boolean;
  }>;
}

interface PermissionConflictCheck {
  orderId: string;
  folderId?: string;
  userId?: string;
}

interface PermissionConflict {
  folderId: string;
  userId: string;
  conflicts: Array<{
    source1: string;
    source2: string;
    level1: PermissionLevel;
    level2: PermissionLevel;
    resolution: 'manual' | 'auto';
  }>;
}

interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
}

interface ThrottleState {
  retryAfter: number;
  resetTime: Date;
  requestsRemaining: number;
}

class PermissionsService {
  private throttleState: ThrottleState | null = null;
  private pendingUpdates: Map<string, PermissionUpdateRequest[]> = new Map();
  private applyStatusCallbacks: Map<string, (status: PermissionApplyResponse) => void> = new Map();
  
  private readonly defaultRetryConfig: RetryConfig = {
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 30000,
    backoffMultiplier: 2,
  };

  /**
   * Get effective permissions for a user/folder combination
   */
  async getEffectivePermissions(
    orderId: string,
    userId?: string,
    folderId?: string,
    groupId?: string
  ): Promise<EffectivePermission[]> {
    const params = new URLSearchParams({ orderId });
    if (userId) params.append('userId', userId);
    if (folderId) params.append('folderId', folderId);
    if (groupId) params.append('groupId', groupId);

    return this.executeWithRetry(async () => {
      const response = await api.get<EffectivePermission[]>(
        `/api/permissions/effective?${params.toString()}`
      );
      return response;
    });
  }

  /**
   * Get the full permission matrix for an order
   */
  async getPermissionMatrix(orderId: string): Promise<PermissionMatrix> {
    return this.executeWithRetry(async () => {
      const response = await api.get<PermissionMatrix>(
        `/api/permissions/matrix/${orderId}`
      );
      return response;
    });
  }

  /**
   * Update permission matrix with optimistic updates
   */
  async updatePermissionMatrix(
    update: PermissionMatrixUpdate,
    optimisticCallback?: (updates: PermissionUpdateRequest[]) => void
  ): Promise<PermissionMatrix> {
    const { orderId, updates } = update;
    
    // Store updates for potential rollback
    this.pendingUpdates.set(orderId, updates);
    
    // Apply optimistic update immediately
    if (optimisticCallback) {
      optimisticCallback(updates);
    }

    try {
      const response = await this.executeWithRetry(async () => {
        return await api.put<PermissionMatrix>(
          `/api/permissions/matrix/${orderId}`,
          { updates }
        );
      });
      
      // Clear pending updates on success
      this.pendingUpdates.delete(orderId);
      return response;
    } catch (error) {
      // Rollback optimistic updates on failure
      if (optimisticCallback) {
        const originalUpdates = this.pendingUpdates.get(orderId);
        if (originalUpdates) {
          // Inverse the updates to rollback
          const rollbackUpdates = originalUpdates.map(u => ({
            ...u,
            level: 'none' as PermissionLevel, // This should be the original value
          }));
          optimisticCallback(rollbackUpdates);
        }
      }
      this.pendingUpdates.delete(orderId);
      throw error;
    }
  }

  /**
   * Apply permissions to SharePoint with progress tracking
   */
  async applyPermissions(
    request: PermissionApplyRequest,
    onProgress?: (status: PermissionApplyResponse) => void
  ): Promise<PermissionApplyResponse> {
    const { orderId } = request;
    
    // Start the apply job
    const response = await this.executeWithRetry(async () => {
      return await api.post<PermissionApplyResponse>(
        '/api/permissions/apply',
        request
      );
    });

    // Store callback for progress updates
    if (onProgress) {
      this.applyStatusCallbacks.set(response.jobId, onProgress);
      this.pollApplyStatus(response.jobId);
    }

    return response;
  }

  /**
   * Check for permission conflicts
   */
  async checkConflicts(check: PermissionConflictCheck): Promise<PermissionConflict[]> {
    return this.executeWithRetry(async () => {
      const response = await api.post<PermissionConflict[]>(
        '/api/permissions/conflicts',
        check
      );
      return response;
    });
  }

  /**
   * Search users
   */
  async searchUsers(query: string, limit = 10): Promise<User[]> {
    return this.executeWithRetry(async () => {
      const params = new URLSearchParams({ q: query, limit: limit.toString() });
      const response = await api.get<User[]>(`/api/users?${params.toString()}`);
      return response;
    });
  }

  /**
   * Search groups
   */
  async searchGroups(query: string, limit = 10): Promise<Group[]> {
    return this.executeWithRetry(async () => {
      const params = new URLSearchParams({ q: query, limit: limit.toString() });
      const response = await api.get<Group[]>(`/api/groups?${params.toString()}`);
      return response;
    });
  }

  /**
   * Get user/group assignments for an order
   */
  async getAssignments(orderId: string): Promise<UserGroupAssignment[]> {
    return this.executeWithRetry(async () => {
      const response = await api.get<UserGroupAssignment[]>(
        `/api/permissions/assignments/${orderId}`
      );
      return response;
    });
  }

  /**
   * Add user/group assignment
   */
  async addAssignment(
    orderId: string,
    assignment: Omit<UserGroupAssignment, 'assignedAt' | 'assignedBy'>
  ): Promise<UserGroupAssignment> {
    return this.executeWithRetry(async () => {
      const response = await api.post<UserGroupAssignment>(
        `/api/permissions/assignments/${orderId}`,
        assignment
      );
      return response;
    });
  }

  /**
   * Remove user/group assignment
   */
  async removeAssignment(orderId: string, principalId: string): Promise<void> {
    return this.executeWithRetry(async () => {
      await api.delete(`/api/permissions/assignments/${orderId}/${principalId}`);
    });
  }

  /**
   * Bulk update permissions
   */
  async bulkUpdate(orderId: string, operation: BulkOperation): Promise<void> {
    return this.executeWithRetry(async () => {
      await api.post(`/api/permissions/bulk/${orderId}`, operation);
    });
  }

  /**
   * Copy permissions from one user to another
   */
  async copyPermissions(
    orderId: string,
    sourceUserId: string,
    targetUserIds: string[]
  ): Promise<void> {
    return this.executeWithRetry(async () => {
      await api.post(`/api/permissions/copy/${orderId}`, {
        sourceUserId,
        targetUserIds,
      });
    });
  }

  /**
   * Get apply job status
   */
  async getApplyStatus(jobId: string): Promise<PermissionApplyResponse> {
    return this.executeWithRetry(async () => {
      const response = await api.get<PermissionApplyResponse>(
        `/api/permissions/apply/${jobId}`
      );
      return response;
    });
  }

  /**
   * Poll for apply status updates
   */
  private async pollApplyStatus(jobId: string): Promise<void> {
    const callback = this.applyStatusCallbacks.get(jobId);
    if (!callback) return;

    try {
      const status = await this.getApplyStatus(jobId);
      callback(status);

      // Continue polling if not completed
      if (status.status === 'pending' || status.status === 'in_progress') {
        setTimeout(() => this.pollApplyStatus(jobId), 2000);
      } else {
        // Cleanup callback when done
        this.applyStatusCallbacks.delete(jobId);
      }
    } catch (error) {
      console.error('Error polling apply status:', error);
      this.applyStatusCallbacks.delete(jobId);
    }
  }

  /**
   * Execute a function with retry logic and exponential backoff
   */
  private async executeWithRetry<T>(
    fn: () => Promise<T>,
    config: RetryConfig = this.defaultRetryConfig
  ): Promise<T> {
    let lastError: any;
    let delay = config.baseDelay;

    for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
      try {
        // Check if we're currently throttled
        if (this.throttleState && this.throttleState.resetTime > new Date()) {
          const waitTime = this.throttleState.resetTime.getTime() - Date.now();
          await this.sleep(Math.min(waitTime, config.maxDelay));
        }

        const result = await fn();
        
        // Reset delay on success
        delay = config.baseDelay;
        
        return result;
      } catch (error: any) {
        lastError = error;

        // Handle 429 Too Many Requests
        if (error.response?.status === 429) {
          this.handleThrottling(error.response);
          
          // Use Retry-After header if available
          const retryAfter = error.response.headers['retry-after'];
          if (retryAfter) {
            delay = parseInt(retryAfter) * 1000;
          }
        }
        
        // Handle 503 Service Unavailable
        if (error.response?.status === 503) {
          delay = Math.min(delay * config.backoffMultiplier, config.maxDelay);
        }

        // Don't retry on client errors (except 429)
        if (error.response?.status >= 400 && error.response?.status < 500 && error.response?.status !== 429) {
          throw error;
        }

        // Last attempt, throw the error
        if (attempt === config.maxRetries) {
          throw error;
        }

        // Add jitter to prevent thundering herd
        const jitter = Math.random() * 1000;
        await this.sleep(delay + jitter);
        
        // Exponential backoff
        delay = Math.min(delay * config.backoffMultiplier, config.maxDelay);
      }
    }

    throw lastError;
  }

  /**
   * Handle throttling response from API
   */
  private handleThrottling(response: any): void {
    const retryAfter = response.headers['retry-after'];
    const remaining = response.headers['x-ratelimit-remaining'];
    const reset = response.headers['x-ratelimit-reset'];

    this.throttleState = {
      retryAfter: retryAfter ? parseInt(retryAfter) : 60,
      resetTime: reset ? new Date(parseInt(reset) * 1000) : new Date(Date.now() + 60000),
      requestsRemaining: remaining ? parseInt(remaining) : 0,
    };
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get current throttle state
   */
  getThrottleState(): ThrottleState | null {
    return this.throttleState;
  }

  /**
   * Check if currently throttled
   */
  isThrottled(): boolean {
    return this.throttleState !== null && this.throttleState.resetTime > new Date();
  }
}

// Export singleton instance
export const permissionsService = new PermissionsService();

// Export types for use in components
export type {
  PermissionUpdateRequest,
  PermissionMatrixUpdate,
  PermissionApplyRequest,
  PermissionApplyResponse,
  PermissionConflictCheck,
  PermissionConflict,
  RetryConfig,
  ThrottleState,
};