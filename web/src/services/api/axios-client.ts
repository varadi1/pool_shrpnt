import axios from 'axios';
import type { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';
import axiosRetry from 'axios-retry';
import { msalInstance, apiScopes } from '@/config/auth.config';
import { config } from '@/config/env.config';
import { v4 as uuidv4 } from 'uuid';

// Types for error handling
interface ApiError extends Error {
  correlationId?: string;
  status?: number;
  retryAfter?: number;
}

// Create axios instance with base configuration
const axiosClient: AxiosInstance = axios.create({
  baseURL: config.api.baseUrl,
  timeout: 30000, // 30 seconds
  headers: {
    'Content-Type': 'application/json',
  },
});

// Token management
let tokenRenewalTimer: NodeJS.Timeout | undefined;

async function getAccessToken(): Promise<string> {
  const accounts = msalInstance.getAllAccounts();
  if (accounts.length === 0) {
    throw new Error('No authenticated user');
  }

  try {
    const response = await msalInstance.acquireTokenSilent({
      scopes: apiScopes,
      account: accounts[0],
    });

    // Schedule token renewal 5 minutes before expiry
    if (response.expiresOn) {
      scheduleTokenRenewal(response.expiresOn);
    }

    return response.accessToken;
  } catch (error) {
    console.warn('Silent token acquisition failed, attempting interactive', error);
    
    const response = await msalInstance.acquireTokenRedirect({
      scopes: apiScopes,
      account: accounts[0],
    });
    
    return response?.accessToken || '';
  }
}

function scheduleTokenRenewal(expiresOn: Date) {
  if (tokenRenewalTimer) {
    clearTimeout(tokenRenewalTimer);
  }

  const now = Date.now();
  const expiry = expiresOn.getTime();
  const renewalTime = expiry - (5 * 60 * 1000); // 5 minutes before expiry

  if (renewalTime > now) {
    const timeout = renewalTime - now;
    tokenRenewalTimer = setTimeout(async () => {
      try {
        await getAccessToken();
        console.log('Token renewed proactively');
      } catch (error) {
        console.error('Proactive token renewal failed:', error);
      }
    }, timeout);
  }
}

// Request interceptor - Add authentication and correlation ID
axiosClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    // Add correlation ID
    const correlationId = uuidv4();
    config.headers['X-Correlation-ID'] = correlationId;
    
    // Store correlation ID in config for error handling
    (config as any).correlationId = correlationId;

    // Add authentication token
    try {
      const token = await getAccessToken();
      config.headers.Authorization = `Bearer ${token}`;
    } catch (error) {
      console.error('Failed to get access token:', error);
      throw error;
    }

    // Log request for debugging (in development only)
    if (process.env.NODE_ENV === 'development') {
      console.log(`API Request: ${config.method?.toUpperCase()} ${config.url}`, {
        correlationId,
        params: config.params,
        data: config.data,
      });
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor - Handle errors and extract correlation ID
axiosClient.interceptors.response.use(
  (response) => {
    // Log successful response in development
    if (process.env.NODE_ENV === 'development') {
      const correlationId = response.config.headers['X-Correlation-ID'];
      console.log(`API Response: ${response.status} ${response.config.url}`, {
        correlationId,
        data: response.data,
      });
    }
    return response;
  },
  async (error: AxiosError) => {
    const correlationId = (error.config as any)?.correlationId || 
                         error.config?.headers?.['X-Correlation-ID'] || 
                         'unknown';

    // Check if axios-retry will handle this error
    const willRetry = !error.response || 
                     (error.response.status >= 500) || 
                     error.response.status === 429 || 
                     error.response.status === 408;
    
    if (willRetry) {
      // Let axios-retry handle it
      return Promise.reject(error);
    }

    // Handle 429 Rate Limiting (if not retryable)
    if (error.response?.status === 429) {
      const retryAfter = error.response.headers['retry-after'];
      const apiError: ApiError = new Error(
        `Rate limited. Retry after ${retryAfter} seconds`
      );
      apiError.correlationId = correlationId;
      apiError.status = 429;
      apiError.retryAfter = retryAfter ? parseInt(retryAfter) : undefined;
      
      // Show rate limit notification
      if (typeof window !== 'undefined' && window.showErrorToast) {
        (window as any).showErrorToast(
          `Rate limited. Please wait ${retryAfter} seconds before retrying.`,
          correlationId
        );
      }
      
      throw apiError;
    }

    // Handle 401 Unauthorized - Token might be expired
    if (error.response?.status === 401) {
      console.warn('Received 401, attempting to refresh token');
      try {
        // Clear the token and try to get a new one
        await msalInstance.clearCache();
        const token = await getAccessToken();
        
        // Retry the original request with new token
        if (error.config) {
          error.config.headers.Authorization = `Bearer ${token}`;
          return axiosClient.request(error.config);
        }
      } catch (refreshError) {
        console.error('Token refresh failed:', refreshError);
        // Redirect to login if refresh fails
        await msalInstance.loginRedirect({
          scopes: apiScopes,
        });
      }
    }

    // Extract error message
    let errorMessage = `API Error (Status: ${error.response?.status || 'unknown'})`;
    if (error.response?.data) {
      const data = error.response.data as any;
      errorMessage = data.message || data.error || data.detail || errorMessage;
    } else if (error.message) {
      errorMessage = error.message;
    }

    // Create enhanced error
    const apiError: ApiError = new Error(
      `${errorMessage} (Correlation ID: ${correlationId})`
    );
    apiError.correlationId = correlationId;
    apiError.status = error.response?.status;

    // Show error notification
    if (typeof window !== 'undefined' && window.showErrorToast) {
      (window as any).showErrorToast(errorMessage, correlationId);
    }

    // Log error in development
    if (process.env.NODE_ENV === 'development') {
      console.error('API Error:', {
        url: error.config?.url,
        method: error.config?.method,
        status: error.response?.status,
        correlationId,
        error: errorMessage,
        response: error.response?.data,
      });
    }

    throw apiError;
  }
);

// Configure retry logic with exponential backoff
axiosRetry(axiosClient, {
  retries: 3, // Number of retry attempts
  retryDelay: (retryCount, error) => {
    // Exponential backoff: 1s, 2s, 4s
    const delay = Math.pow(2, retryCount - 1) * 1000;
    
    // Add jitter to prevent thundering herd
    const jitter = Math.random() * 1000;
    
    // Check for Retry-After header
    if (error.response?.status === 429) {
      const retryAfter = error.response.headers['retry-after'];
      if (retryAfter) {
        return parseInt(retryAfter) * 1000;
      }
    }
    
    return delay + jitter;
  },
  retryCondition: (error) => {
    // Retry on network errors
    if (!error.response) {
      return true;
    }
    
    // Retry on 5xx errors (server errors)
    if (error.response.status >= 500) {
      return true;
    }
    
    // Retry on 429 (rate limiting) if retry-after is reasonable
    if (error.response.status === 429) {
      const retryAfter = error.response.headers['retry-after'];
      if (retryAfter) {
        const seconds = parseInt(retryAfter);
        return seconds <= 60; // Only retry if wait time is 60 seconds or less
      }
      return true;
    }
    
    // Retry on 408 (request timeout)
    if (error.response.status === 408) {
      return true;
    }
    
    // Don't retry on client errors (4xx except above)
    return false;
  },
  onRetry: (retryCount, error, requestConfig) => {
    const correlationId = (requestConfig as any).correlationId;
    console.log(
      `Retrying request (attempt ${retryCount}): ${requestConfig.method?.toUpperCase()} ${requestConfig.url}`,
      { correlationId, error: error.message }
    );
  },
});

// Export configured axios instance
export default axiosClient;

// Export typed methods for common operations
export const apiClient = {
  get: <T = any>(url: string, config?: any) => 
    axiosClient.get<T>(url, config).then(res => res.data),
  
  post: <T = any>(url: string, data?: any, config?: any) => 
    axiosClient.post<T>(url, data, config).then(res => res.data),
  
  put: <T = any>(url: string, data?: any, config?: any) => 
    axiosClient.put<T>(url, data, config).then(res => res.data),
  
  patch: <T = any>(url: string, data?: any, config?: any) => 
    axiosClient.patch<T>(url, data, config).then(res => res.data),
  
  delete: <T = any>(url: string, config?: any) => 
    axiosClient.delete<T>(url, config).then(res => res.data),
};

// Export types
export type { ApiError };