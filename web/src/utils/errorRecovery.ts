import { QueryClient } from '@tanstack/react-query';

interface RetryOptions {
  maxRetries?: number;
  retryDelay?: number;
  backoffMultiplier?: number;
  maxRetryDelay?: number;
}

export class ErrorRecoveryService {
  private static instance: ErrorRecoveryService;
  private retryCount: Map<string, number> = new Map();
  private queryClient: QueryClient | null = null;

  private constructor() {}

  static getInstance(): ErrorRecoveryService {
    if (!ErrorRecoveryService.instance) {
      ErrorRecoveryService.instance = new ErrorRecoveryService();
    }
    return ErrorRecoveryService.instance;
  }

  setQueryClient(queryClient: QueryClient) {
    this.queryClient = queryClient;
  }

  // Retry logic with exponential backoff
  async retryWithBackoff<T>(
    fn: () => Promise<T>,
    key: string,
    options: RetryOptions = {}
  ): Promise<T> {
    const {
      maxRetries = 3,
      retryDelay = 1000,
      backoffMultiplier = 2,
      maxRetryDelay = 10000,
    } = options;

    const currentRetries = this.retryCount.get(key) || 0;

    try {
      const result = await fn();
      // Reset retry count on success
      this.retryCount.delete(key);
      return result;
    } catch (error: any) {
      // Don't retry on 4xx errors (except 429)
      if (error.response?.status >= 400 && 
          error.response?.status < 500 && 
          error.response?.status !== 429) {
        throw error;
      }

      if (currentRetries >= maxRetries) {
        this.retryCount.delete(key);
        throw error;
      }

      // Calculate delay with exponential backoff
      const delay = Math.min(
        retryDelay * Math.pow(backoffMultiplier, currentRetries),
        maxRetryDelay
      );

      // Add jitter to prevent thundering herd
      const jitter = Math.random() * 0.3 * delay;
      const totalDelay = delay + jitter;

      console.warn(
        `Retrying ${key} (attempt ${currentRetries + 1}/${maxRetries}) after ${Math.round(totalDelay)}ms`,
        error
      );

      this.retryCount.set(key, currentRetries + 1);

      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, totalDelay));

      // Retry recursively
      return this.retryWithBackoff(fn, key, options);
    }
  }

  // Handle specific error types
  handleError(error: any): { message: string; correlationId?: string; canRetry: boolean } {
    let message = 'An unexpected error occurred';
    let correlationId: string | undefined;
    let canRetry = false;

    if (error.response) {
      // Server responded with error
      const status = error.response.status;
      correlationId = error.response.headers?.['x-correlation-id'];

      switch (status) {
        case 400:
          message = 'Invalid request. Please check your input.';
          break;
        case 401:
          message = 'Your session has expired. Please sign in again.';
          break;
        case 403:
          message = 'You do not have permission to perform this action.';
          break;
        case 404:
          message = 'The requested resource was not found.';
          break;
        case 409:
          message = 'This action conflicts with another operation. Please refresh and try again.';
          canRetry = true;
          break;
        case 429:
          message = 'Too many requests. Please wait a moment and try again.';
          canRetry = true;
          break;
        case 500:
        case 502:
        case 503:
        case 504:
          message = 'Server error. Please try again later.';
          canRetry = true;
          break;
        default:
          message = error.response.data?.detail || 'An error occurred while processing your request.';
      }
    } else if (error.request) {
      // No response received
      message = 'Unable to connect to the server. Please check your internet connection.';
      canRetry = true;
    } else if (error.message) {
      // Request setup error
      message = error.message;
    }

    return { message, correlationId, canRetry };
  }

  // Clear all retry counts
  clearRetryHistory() {
    this.retryCount.clear();
  }

  // Invalidate and retry failed queries
  async retryFailedQueries(queryKeys?: string[][]) {
    if (!this.queryClient) {
      console.warn('QueryClient not set for ErrorRecoveryService');
      return;
    }

    if (queryKeys) {
      // Retry specific queries
      for (const key of queryKeys) {
        await this.queryClient.invalidateQueries({ queryKey: key });
      }
    } else {
      // Retry all failed queries
      await this.queryClient.invalidateQueries();
    }
  }

  // Check if an error is retryable
  isRetryableError(error: any): boolean {
    if (!error.response) {
      // Network errors are retryable
      return true;
    }

    const status = error.response.status;
    // Retry on rate limit, server errors, and gateway errors
    return status === 429 || (status >= 500 && status <= 504);
  }

  // Get user-friendly error message with recovery suggestions
  getUserMessage(error: any): { 
    title: string; 
    message: string; 
    action?: string;
    correlationId?: string;
  } {
    const { message, correlationId, canRetry } = this.handleError(error);

    let title = 'Error';
    let action: string | undefined;

    if (error.response) {
      const status = error.response.status;
      if (status >= 400 && status < 500) {
        title = 'Request Error';
        if (status === 401) {
          action = 'Sign In';
        }
      } else if (status >= 500) {
        title = 'Server Error';
      }
    } else if (error.request) {
      title = 'Connection Error';
      action = 'Check Connection';
    }

    if (canRetry && !action) {
      action = 'Retry';
    }

    return { title, message, action, correlationId };
  }
}

// Export singleton instance
export const errorRecovery = ErrorRecoveryService.getInstance();