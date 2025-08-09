type ToastIntent = 'error' | 'success' | 'warning' | 'info';

// Store references to toast functions globally
let showToastFn: ((message: string, correlationId?: string, intent?: ToastIntent) => void) | null = null;

// Initialize the error handler (called from App.tsx)
export function initializeErrorHandler(
  showToast: (message: string, correlationId?: string, intent?: ToastIntent) => void
) {
  showToastFn = showToast;
  
  // Attach to window for global access
  if (typeof window !== 'undefined') {
    (window as any).showErrorToast = (message: string, correlationId?: string) => {
      showErrorToast(message, correlationId);
    };
    
    (window as any).showSuccessToast = (message: string) => {
      showSuccessToast(message);
    };
    
    (window as any).showWarningToast = (message: string) => {
      showWarningToast(message);
    };
  }
}

// Show error toast with correlation ID
export function showErrorToast(message: string, correlationId?: string) {
  if (showToastFn) {
    const fullMessage = correlationId 
      ? `${message}\nCorrelation ID: ${correlationId}`
      : message;
    showToastFn(fullMessage, correlationId, 'error');
  } else {
    console.error('Toast function not initialized:', message, correlationId);
  }
}

// Show success toast
export function showSuccessToast(message: string) {
  if (showToastFn) {
    showToastFn(message, undefined, 'success');
  } else {
    console.log('Toast function not initialized:', message);
  }
}

// Show warning toast
export function showWarningToast(message: string) {
  if (showToastFn) {
    showToastFn(message, undefined, 'warning');
  } else {
    console.warn('Toast function not initialized:', message);
  }
}

// Show info toast
export function showInfoToast(message: string) {
  if (showToastFn) {
    showToastFn(message, undefined, 'info');
  } else {
    console.info('Toast function not initialized:', message);
  }
}

// Format error for display
export function formatError(error: any): { message: string; correlationId?: string } {
  if (error.response) {
    // Axios error with response
    const data = error.response.data;
    const message = data?.message || data?.error || error.message || 'An error occurred';
    const correlationId = error.correlationId || error.config?.headers?.['X-Correlation-ID'];
    
    return { message, correlationId };
  } else if (error.request) {
    // Request made but no response
    return { 
      message: 'Network error - please check your connection', 
      correlationId: error.correlationId 
    };
  } else {
    // Something else happened
    return { 
      message: error.message || 'An unexpected error occurred',
      correlationId: error.correlationId 
    };
  }
}

// Handle API errors consistently
export function handleApiError(error: any, customMessage?: string) {
  const { message, correlationId } = formatError(error);
  const displayMessage = customMessage || message;
  
  // Show error toast
  showErrorToast(displayMessage, correlationId);
  
  // Log to console in development
  if (process.env.NODE_ENV === 'development') {
    console.error('API Error:', {
      message: displayMessage,
      correlationId,
      error,
    });
  }
  
  // Return formatted error for further handling if needed
  return { message: displayMessage, correlationId };
}

// Rate limit handler
export function handleRateLimit(retryAfter: number, correlationId?: string) {
  const message = `Rate limited. Please wait ${retryAfter} seconds before retrying.`;
  showWarningToast(message);
  
  // Set a timer to show when rate limit expires
  if (retryAfter > 0 && retryAfter <= 60) {
    setTimeout(() => {
      showInfoToast('Rate limit expired. You can retry your request now.');
    }, retryAfter * 1000);
  }
  
  return { message, correlationId, retryAfter };
}

// Session timeout handler
export function handleSessionTimeout() {
  showWarningToast('Your session has expired. Please log in again.');
  
  // Redirect to login after a short delay
  setTimeout(() => {
    window.location.href = '/login';
  }, 2000);
}

// Network error handler
export function handleNetworkError() {
  showErrorToast('Network error - please check your internet connection');
}

// Permission denied handler
export function handlePermissionDenied(resource?: string) {
  const message = resource 
    ? `You don't have permission to access ${resource}`
    : 'You don\'t have permission to perform this action';
  
  showErrorToast(message);
}

// Validation error handler
export function handleValidationError(errors: Record<string, string[]>) {
  const errorMessages = Object.entries(errors)
    .map(([field, messages]) => `${field}: ${messages.join(', ')}`)
    .join('\n');
  
  showErrorToast(`Validation failed:\n${errorMessages}`);
}

// Success handler for mutations
export function handleMutationSuccess(action: string, resource?: string) {
  const message = resource 
    ? `${resource} ${action} successfully`
    : `Operation ${action} completed successfully`;
  
  showSuccessToast(message);
}

// Export types
export interface ErrorDetails {
  message: string;
  correlationId?: string;
  status?: number;
  field?: string;
}