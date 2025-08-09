import { msalInstance, apiScopes } from '@/config/auth.config';
import { config } from '@/config/env.config';
import { v4 as uuidv4 } from 'uuid';
import { PoolDrvApi } from '@/generated/api';

class ApiService {
  private tokenRenewalTimer?: NodeJS.Timeout;
  
  async getAccessToken(): Promise<string> {
    const accounts = msalInstance.getAllAccounts();
    if (accounts.length === 0) throw new Error('No authenticated user');

    try {
      const response = await msalInstance.acquireTokenSilent({
        scopes: apiScopes,
        account: accounts[0],
      });
      
      // Schedule token renewal if needed
      this.scheduleTokenRenewal(response.expiresOn);
      
      return response.accessToken;
    } catch (error) {
      console.warn('Silent token acquisition failed, attempting interactive', error);
      
      // Fall back to redirect for token acquisition
      const response = await msalInstance.acquireTokenRedirect({
        scopes: apiScopes,
        account: accounts[0],
      });
      
      return response?.accessToken || '';
    }
  }
  
  private scheduleTokenRenewal(expiresOn: Date | null) {
    if (!expiresOn) return;
    
    // Clear existing timer
    if (this.tokenRenewalTimer) {
      clearTimeout(this.tokenRenewalTimer);
    }
    
    // Schedule renewal 5 minutes before expiry
    const now = Date.now();
    const expiry = expiresOn.getTime();
    const renewalTime = expiry - (5 * 60 * 1000);
    
    if (renewalTime > now) {
      const timeout = renewalTime - now;
      this.tokenRenewalTimer = setTimeout(async () => {
        try {
          await this.getAccessToken();
          console.log('Token renewed proactively');
        } catch (error) {
          console.error('Proactive token renewal failed:', error);
        }
      }, timeout);
    }
  }

  async request(url: string, options: RequestInit = {}): Promise<Response> {
    const token = await this.getAccessToken();
    const correlationId = uuidv4();

    const response = await fetch(`${config.api.baseUrl}${url}`, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${token}`,
        'X-Correlation-ID': correlationId,
        'Content-Type': 'application/json',
      },
    });

    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After');
      // Store correlation ID for error tracking
      const error = new Error(`Rate limited. Retry after ${retryAfter} seconds`);
      (error as any).correlationId = correlationId;
      throw error;
    }

    if (!response.ok) {
      let errorMessage = `API Error (Status: ${response.status})`;
      try {
        const errorData = await response.json();
        errorMessage = errorData.message || errorData.error || errorMessage;
      } catch {
        // If response body is not JSON, use status text
        errorMessage = response.statusText || errorMessage;
      }
      const error = new Error(`${errorMessage} (Correlation ID: ${correlationId})`);
      (error as any).correlationId = correlationId;
      (error as any).status = response.status;
      throw error;
    }

    return response;
  }

  async get<T = any>(url: string): Promise<{ data: T }> {
    const response = await this.request(url, { method: 'GET' });
    const data = await response.json();
    return { data };
  }

  async post<T = any>(url: string, body?: any): Promise<{ data: T }> {
    const response = await this.request(url, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.json();
    return { data };
  }

  async put<T = any>(url: string, body?: any): Promise<{ data: T }> {
    const response = await this.request(url, {
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.json();
    return { data };
  }

  async delete<T = any>(url: string): Promise<{ data: T }> {
    const response = await this.request(url, { method: 'DELETE' });
    const data = await response.json();
    return { data };
  }
}

export const apiService = new ApiService();

// Create configured API client instance
export const apiClient = new PoolDrvApi({
  basePath: config.api.baseUrl,
  fetchApi: async (url: string, init?: RequestInit) => {
    const token = await apiService.getAccessToken();
    const correlationId = uuidv4();

    return fetch(url, {
      ...init,
      headers: {
        ...init?.headers,
        Authorization: `Bearer ${token}`,
        'X-Correlation-ID': correlationId,
      },
    });
  },
});
