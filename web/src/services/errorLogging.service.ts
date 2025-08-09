/**
 * Error Logging Service
 * Centralized service for logging errors to console and monitoring services
 */

interface ErrorLogEntry {
  timestamp: string;
  correlationId: string;
  message: string;
  stack?: string;
  componentStack?: string;
  url?: string;
  userAgent?: string;
  userId?: string;
  sessionId?: string;
  metadata?: Record<string, any>;
}

class ErrorLoggingService {
  private errorHistory: ErrorLogEntry[] = [];
  private maxHistorySize = 50;
  private sessionId: string;

  constructor() {
    this.sessionId = this.generateSessionId();
    this.setupGlobalErrorHandlers();
  }

  /**
   * Generate a unique session ID for error tracking
   */
  private generateSessionId(): string {
    return `SES-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate a correlation ID for error tracking
   */
  generateCorrelationId(): string {
    return `ERR-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Setup global error handlers for unhandled errors
   */
  private setupGlobalErrorHandlers(): void {
    // Handle unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      const correlationId = this.generateCorrelationId();
      this.logError({
        error: new Error(event.reason?.message || 'Unhandled promise rejection'),
        correlationId,
        metadata: {
          type: 'unhandledrejection',
          reason: event.reason,
        },
      });
      
      // Prevent default browser error handling
      event.preventDefault();
    });

    // Handle global errors
    window.addEventListener('error', (event) => {
      const correlationId = this.generateCorrelationId();
      this.logError({
        error: event.error || new Error(event.message),
        correlationId,
        metadata: {
          type: 'global-error',
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
        },
      });
    });
  }

  /**
   * Log an error with full context
   */
  logError({
    error,
    correlationId,
    componentStack,
    metadata,
  }: {
    error: Error;
    correlationId?: string;
    componentStack?: string;
    metadata?: Record<string, any>;
  }): string {
    const errorCorrelationId = correlationId || this.generateCorrelationId();
    
    const entry: ErrorLogEntry = {
      timestamp: new Date().toISOString(),
      correlationId: errorCorrelationId,
      message: error.message,
      stack: error.stack,
      componentStack,
      url: window.location.href,
      userAgent: navigator.userAgent,
      sessionId: this.sessionId,
      metadata,
    };

    // Add user ID if available
    const user = this.getCurrentUser();
    if (user?.id) {
      entry.userId = user.id;
    }

    // Store in history
    this.addToHistory(entry);

    // Log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.group(`🔴 Error [${errorCorrelationId}]`);
      console.error('Message:', error.message);
      console.error('Stack:', error.stack);
      if (componentStack) {
        console.error('Component Stack:', componentStack);
      }
      if (metadata) {
        console.error('Metadata:', metadata);
      }
      console.groupEnd();
    }

    // Send to monitoring service
    this.sendToMonitoring(entry);

    return errorCorrelationId;
  }

  /**
   * Log a network error
   */
  logNetworkError({
    url,
    method,
    status,
    message,
    correlationId,
  }: {
    url: string;
    method?: string;
    status?: number;
    message: string;
    correlationId?: string;
  }): string {
    const errorCorrelationId = correlationId || this.generateCorrelationId();
    
    return this.logError({
      error: new Error(message),
      correlationId: errorCorrelationId,
      metadata: {
        type: 'network-error',
        url,
        method,
        status,
      },
    });
  }

  /**
   * Log an API error
   */
  logApiError({
    endpoint,
    method,
    status,
    message,
    response,
    correlationId,
  }: {
    endpoint: string;
    method: string;
    status: number;
    message: string;
    response?: any;
    correlationId?: string;
  }): string {
    const errorCorrelationId = correlationId || this.generateCorrelationId();
    
    return this.logError({
      error: new Error(message),
      correlationId: errorCorrelationId,
      metadata: {
        type: 'api-error',
        endpoint,
        method,
        status,
        response,
      },
    });
  }

  /**
   * Log a validation error
   */
  logValidationError({
    form,
    fields,
    message,
  }: {
    form: string;
    fields: Record<string, string[]>;
    message: string;
  }): string {
    return this.logError({
      error: new Error(message),
      metadata: {
        type: 'validation-error',
        form,
        fields,
      },
    });
  }

  /**
   * Add error to history
   */
  private addToHistory(entry: ErrorLogEntry): void {
    this.errorHistory.unshift(entry);
    
    // Trim history if too large
    if (this.errorHistory.length > this.maxHistorySize) {
      this.errorHistory = this.errorHistory.slice(0, this.maxHistorySize);
    }

    // Store in session storage for debugging
    try {
      sessionStorage.setItem('errorHistory', JSON.stringify(this.errorHistory));
    } catch (e) {
      // Ignore storage errors
    }
  }

  /**
   * Get error history for debugging
   */
  getErrorHistory(): ErrorLogEntry[] {
    return [...this.errorHistory];
  }

  /**
   * Clear error history
   */
  clearErrorHistory(): void {
    this.errorHistory = [];
    sessionStorage.removeItem('errorHistory');
  }

  /**
   * Get current user for error context
   */
  private getCurrentUser(): { id?: string; name?: string; email?: string } | null {
    try {
      // Try to get user from MSAL
      const accounts = JSON.parse(
        sessionStorage.getItem('msal.account.keys') || '[]'
      );
      if (accounts.length > 0) {
        const account = JSON.parse(
          sessionStorage.getItem(accounts[0]) || '{}'
        );
        return {
          id: account.localAccountId,
          name: account.name,
          email: account.username,
        };
      }
    } catch (e) {
      // Ignore errors getting user
    }
    return null;
  }

  /**
   * Send error to monitoring service (Application Insights, Sentry, etc.)
   */
  private sendToMonitoring(entry: ErrorLogEntry): void {
    // Application Insights
    if ((window as any).applicationInsights) {
      (window as any).applicationInsights.trackException({
        exception: new Error(entry.message),
        properties: {
          correlationId: entry.correlationId,
          sessionId: entry.sessionId,
          userId: entry.userId,
          url: entry.url,
          ...entry.metadata,
        },
      });
    }

    // You can add other monitoring services here
    // Example: Sentry, LogRocket, etc.
  }

  /**
   * Check if we're in maintenance mode
   */
  async checkMaintenanceMode(): Promise<boolean> {
    try {
      const response = await fetch('/api/health/maintenance');
      const data = await response.json();
      return data.maintenanceMode === true;
    } catch (e) {
      // If we can't check, assume not in maintenance
      return false;
    }
  }

  /**
   * Detect session timeout
   */
  detectSessionTimeout(error: any): boolean {
    // Check for 401 status
    if (error.response?.status === 401) {
      return true;
    }
    
    // Check for specific error messages
    const message = error.message?.toLowerCase() || '';
    return message.includes('session') && message.includes('expired');
  }

  /**
   * Detect network errors
   */
  detectNetworkError(error: any): boolean {
    // Check for network error indicators
    if (error.code === 'ECONNABORTED' || error.code === 'NETWORK_ERROR') {
      return true;
    }
    
    // Check if error has no response (network failure)
    if (error.request && !error.response) {
      return true;
    }
    
    // Check for specific error messages
    const message = error.message?.toLowerCase() || '';
    return message.includes('network') || message.includes('fetch');
  }
}

// Create singleton instance
export const errorLoggingService = new ErrorLoggingService();

// Export for convenience
export const { 
  logError, 
  logNetworkError, 
  logApiError, 
  logValidationError,
  getErrorHistory,
  clearErrorHistory,
  generateCorrelationId,
  checkMaintenanceMode,
  detectSessionTimeout,
  detectNetworkError,
} = errorLoggingService;