import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { errorLoggingService } from '../errorLogging.service';

describe('ErrorLoggingService', () => {
  let consoleErrorSpy: any;
  let consoleGroupSpy: any;
  let consoleGroupEndSpy: any;

  beforeEach(() => {
    // Mock console methods
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleGroupSpy = vi.spyOn(console, 'group').mockImplementation(() => {});
    consoleGroupEndSpy = vi.spyOn(console, 'groupEnd').mockImplementation(() => {});
    
    // Clear session storage
    sessionStorage.clear();
    
    // Clear error history
    errorLoggingService.clearErrorHistory();
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    consoleGroupSpy.mockRestore();
    consoleGroupEndSpy.mockRestore();
    vi.clearAllMocks();
  });

  describe('generateCorrelationId', () => {
    it('generates unique correlation IDs', () => {
      const id1 = errorLoggingService.generateCorrelationId();
      const id2 = errorLoggingService.generateCorrelationId();

      expect(id1).toMatch(/^ERR-\d+-[a-z0-9]{9}$/);
      expect(id2).toMatch(/^ERR-\d+-[a-z0-9]{9}$/);
      expect(id1).not.toBe(id2);
    });
  });

  describe('logError', () => {
    it('logs error with correlation ID', () => {
      const error = new Error('Test error');
      const correlationId = errorLoggingService.logError({ error });

      expect(correlationId).toMatch(/^ERR-\d+-[a-z0-9]{9}$/);
    });

    it('uses provided correlation ID', () => {
      const error = new Error('Test error');
      const providedId = 'CUSTOM-ID-123';
      const correlationId = errorLoggingService.logError({ 
        error, 
        correlationId: providedId 
      });

      expect(correlationId).toBe(providedId);
    });

    it('logs to console in development mode', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const error = new Error('Test error');
      errorLoggingService.logError({ error });

      expect(consoleGroupSpy).toHaveBeenCalledWith(expect.stringContaining('🔴 Error'));
      expect(consoleErrorSpy).toHaveBeenCalledWith('Message:', 'Test error');
      expect(consoleGroupEndSpy).toHaveBeenCalled();

      process.env.NODE_ENV = originalEnv;
    });

    it('includes component stack when provided', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const error = new Error('Test error');
      const componentStack = 'at Component\nat Parent';
      errorLoggingService.logError({ error, componentStack });

      expect(consoleErrorSpy).toHaveBeenCalledWith('Component Stack:', componentStack);

      process.env.NODE_ENV = originalEnv;
    });

    it('includes metadata when provided', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const error = new Error('Test error');
      const metadata = { userId: '123', action: 'submit' };
      errorLoggingService.logError({ error, metadata });

      expect(consoleErrorSpy).toHaveBeenCalledWith('Metadata:', metadata);

      process.env.NODE_ENV = originalEnv;
    });

    it('adds error to history', () => {
      const error = new Error('Test error');
      errorLoggingService.logError({ error });

      const history = errorLoggingService.getErrorHistory();
      expect(history).toHaveLength(1);
      expect(history[0].message).toBe('Test error');
    });

    it('stores error history in session storage', () => {
      const error = new Error('Test error');
      errorLoggingService.logError({ error });

      const storedHistory = sessionStorage.getItem('errorHistory');
      expect(storedHistory).toBeTruthy();
      
      const parsed = JSON.parse(storedHistory!);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].message).toBe('Test error');
    });
  });

  describe('logNetworkError', () => {
    it('logs network error with details', () => {
      const correlationId = errorLoggingService.logNetworkError({
        url: 'https://api.example.com/data',
        method: 'GET',
        status: 500,
        message: 'Internal Server Error',
      });

      expect(correlationId).toMatch(/^ERR-\d+-[a-z0-9]{9}$/);

      const history = errorLoggingService.getErrorHistory();
      expect(history[0].message).toBe('Internal Server Error');
      expect(history[0].metadata?.type).toBe('network-error');
      expect(history[0].metadata?.url).toBe('https://api.example.com/data');
      expect(history[0].metadata?.method).toBe('GET');
      expect(history[0].metadata?.status).toBe(500);
    });
  });

  describe('logApiError', () => {
    it('logs API error with details', () => {
      const correlationId = errorLoggingService.logApiError({
        endpoint: '/api/users',
        method: 'POST',
        status: 400,
        message: 'Bad Request',
        response: { error: 'Invalid email' },
      });

      expect(correlationId).toMatch(/^ERR-\d+-[a-z0-9]{9}$/);

      const history = errorLoggingService.getErrorHistory();
      expect(history[0].message).toBe('Bad Request');
      expect(history[0].metadata?.type).toBe('api-error');
      expect(history[0].metadata?.endpoint).toBe('/api/users');
      expect(history[0].metadata?.response).toEqual({ error: 'Invalid email' });
    });
  });

  describe('logValidationError', () => {
    it('logs validation error with field details', () => {
      const correlationId = errorLoggingService.logValidationError({
        form: 'userRegistration',
        fields: {
          email: ['Invalid format', 'Already exists'],
          password: ['Too short'],
        },
        message: 'Validation failed',
      });

      expect(correlationId).toMatch(/^ERR-\d+-[a-z0-9]{9}$/);

      const history = errorLoggingService.getErrorHistory();
      expect(history[0].message).toBe('Validation failed');
      expect(history[0].metadata?.type).toBe('validation-error');
      expect(history[0].metadata?.form).toBe('userRegistration');
      expect(history[0].metadata?.fields).toEqual({
        email: ['Invalid format', 'Already exists'],
        password: ['Too short'],
      });
    });
  });

  describe('Error History Management', () => {
    it('maintains error history', () => {
      errorLoggingService.logError({ error: new Error('Error 1') });
      errorLoggingService.logError({ error: new Error('Error 2') });
      errorLoggingService.logError({ error: new Error('Error 3') });

      const history = errorLoggingService.getErrorHistory();
      expect(history).toHaveLength(3);
      expect(history[0].message).toBe('Error 3'); // Most recent first
      expect(history[1].message).toBe('Error 2');
      expect(history[2].message).toBe('Error 1');
    });

    it('limits history size to maxHistorySize', () => {
      // Add more than 50 errors (the default max)
      for (let i = 0; i < 55; i++) {
        errorLoggingService.logError({ error: new Error(`Error ${i}`) });
      }

      const history = errorLoggingService.getErrorHistory();
      expect(history).toHaveLength(50);
      expect(history[0].message).toBe('Error 54'); // Most recent
      expect(history[49].message).toBe('Error 5'); // Oldest kept
    });

    it('clears error history', () => {
      errorLoggingService.logError({ error: new Error('Error 1') });
      errorLoggingService.logError({ error: new Error('Error 2') });

      let history = errorLoggingService.getErrorHistory();
      expect(history).toHaveLength(2);

      errorLoggingService.clearErrorHistory();

      history = errorLoggingService.getErrorHistory();
      expect(history).toHaveLength(0);
      expect(sessionStorage.getItem('errorHistory')).toBeNull();
    });
  });

  describe('detectSessionTimeout', () => {
    it('detects 401 status as session timeout', () => {
      const error = {
        response: { status: 401 },
      };

      expect(errorLoggingService.detectSessionTimeout(error)).toBe(true);
    });

    it('detects session expired message', () => {
      const error = {
        message: 'Your session has expired',
      };

      expect(errorLoggingService.detectSessionTimeout(error)).toBe(true);
    });

    it('returns false for non-timeout errors', () => {
      const error = {
        response: { status: 500 },
        message: 'Internal server error',
      };

      expect(errorLoggingService.detectSessionTimeout(error)).toBe(false);
    });
  });

  describe('detectNetworkError', () => {
    it('detects ECONNABORTED as network error', () => {
      const error = {
        code: 'ECONNABORTED',
      };

      expect(errorLoggingService.detectNetworkError(error)).toBe(true);
    });

    it('detects NETWORK_ERROR code', () => {
      const error = {
        code: 'NETWORK_ERROR',
      };

      expect(errorLoggingService.detectNetworkError(error)).toBe(true);
    });

    it('detects request without response as network error', () => {
      const error = {
        request: {},
        response: undefined,
      };

      expect(errorLoggingService.detectNetworkError(error)).toBe(true);
    });

    it('detects network-related error messages', () => {
      const error = {
        message: 'Network request failed',
      };

      expect(errorLoggingService.detectNetworkError(error)).toBe(true);
    });

    it('returns false for non-network errors', () => {
      const error = {
        response: { status: 500 },
        message: 'Internal server error',
      };

      expect(errorLoggingService.detectNetworkError(error)).toBe(false);
    });
  });

  describe('Global Error Handlers', () => {
    it('handles unhandled promise rejections', () => {
      const logErrorSpy = vi.spyOn(errorLoggingService, 'logError');
      
      const event = new Event('unhandledrejection') as any;
      event.reason = new Error('Unhandled promise error');
      event.preventDefault = vi.fn();

      window.dispatchEvent(event);

      expect(logErrorSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.any(Error),
          metadata: expect.objectContaining({
            type: 'unhandledrejection',
          }),
        })
      );
      expect(event.preventDefault).toHaveBeenCalled();
    });

    it('handles global errors', () => {
      const logErrorSpy = vi.spyOn(errorLoggingService, 'logError');
      
      const event = new ErrorEvent('error', {
        error: new Error('Global error'),
        message: 'Global error message',
        filename: 'app.js',
        lineno: 10,
        colno: 5,
      });

      window.dispatchEvent(event);

      expect(logErrorSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.any(Error),
          metadata: expect.objectContaining({
            type: 'global-error',
            filename: 'app.js',
            lineno: 10,
            colno: 5,
          }),
        })
      );
    });
  });
});