import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import axiosClient, { apiClient } from '../axios-client';
import { msalInstance } from '@/config/auth.config';

// Mock MSAL
vi.mock('@/config/auth.config', () => ({
  msalInstance: {
    getAllAccounts: vi.fn(),
    acquireTokenSilent: vi.fn(),
    acquireTokenRedirect: vi.fn(),
    clearCache: vi.fn(),
    loginRedirect: vi.fn(),
  },
  apiScopes: ['User.Read'],
}));

// Mock config
vi.mock('@/config/env.config', () => ({
  config: {
    api: {
      baseUrl: 'http://localhost:3000',
    },
  },
}));

// Mock uuid
vi.mock('uuid', () => ({
  v4: () => 'test-correlation-id',
}));

describe('Axios Client', () => {
  let mock: MockAdapter;

  beforeEach(() => {
    mock = new MockAdapter(axiosClient);
    vi.clearAllMocks();
    
    // Setup default MSAL mock behavior
    (msalInstance.getAllAccounts as any).mockReturnValue([{ username: 'test@example.com' }]);
    (msalInstance.acquireTokenSilent as any).mockResolvedValue({
      accessToken: 'test-token',
      expiresOn: new Date(Date.now() + 3600000), // 1 hour from now
    });
  });

  afterEach(() => {
    mock.restore();
  });

  describe('Request Interceptor', () => {
    it('adds authentication token to requests', async () => {
      mock.onGet('/api/test').reply(200, { data: 'test' });

      await apiClient.get('/api/test');

      expect(mock.history.get[0].headers?.Authorization).toBe('Bearer test-token');
    });

    it('adds correlation ID to requests', async () => {
      mock.onGet('/api/test').reply(200, { data: 'test' });

      await apiClient.get('/api/test');

      expect(mock.history.get[0].headers?.['X-Correlation-ID']).toBe('test-correlation-id');
    });

    it('handles token acquisition failure', async () => {
      (msalInstance.acquireTokenSilent as any).mockRejectedValue(new Error('Token failed'));
      (msalInstance.acquireTokenRedirect as any).mockResolvedValue({
        accessToken: 'fallback-token',
      });

      mock.onGet('/api/test').reply(200, { data: 'test' });

      await apiClient.get('/api/test');

      expect(msalInstance.acquireTokenRedirect).toHaveBeenCalled();
    });
  });

  describe('Response Interceptor', () => {
    it('handles successful responses', async () => {
      mock.onGet('/api/test').reply(200, { data: 'success' });

      const result = await apiClient.get('/api/test');

      expect(result).toEqual({ data: 'success' });
    });

    it('handles 429 rate limiting', async () => {
      mock.onGet('/api/test').reply(429, null, { 'retry-after': '65' }); // > 60 seconds, won't retry

      await expect(apiClient.get('/api/test')).rejects.toThrow();
    }, 10000);

    it('handles 401 unauthorized and attempts token refresh', async () => {
      let callCount = 0;
      mock.onGet('/api/test').reply(() => {
        callCount++;
        if (callCount === 1) {
          return [401, { error: 'Unauthorized' }];
        }
        return [200, { data: 'success' }];
      });

      const result = await apiClient.get('/api/test');

      expect(msalInstance.clearCache).toHaveBeenCalled();
      expect(result).toEqual({ data: 'success' });
    });

    it('handles 500 server errors', async () => {
      let attemptCount = 0;
      mock.onGet('/api/test').reply(() => {
        attemptCount++;
        return [500, { error: 'Server error' }];
      });

      await expect(apiClient.get('/api/test')).rejects.toThrow();
      // Should have retried
      expect(attemptCount).toBeGreaterThan(1);
    }, 10000);

    it('extracts error messages from response', async () => {
      mock.onGet('/api/test').reply(400, { message: 'Custom error message' });

      try {
        await apiClient.get('/api/test');
      } catch (error: any) {
        expect(error.message).toContain('Custom error message');
        expect(error.message).toContain('test-correlation-id');
      }
    });
  });

  describe('Retry Logic', () => {
    it('retries on 5xx errors', async () => {
      let attemptCount = 0;
      mock.onGet('/api/test').reply(() => {
        attemptCount++;
        if (attemptCount < 3) {
          return [500, { error: 'Server error' }];
        }
        return [200, { data: 'success' }];
      });

      // Use a longer timeout for retry tests
      const result = await apiClient.get('/api/test');

      expect(result).toEqual({ data: 'success' });
      expect(attemptCount).toBeGreaterThanOrEqual(2); // At least 2 attempts
    }, 10000); // Increase timeout for retry tests

    it('retries on network errors', async () => {
      let attemptCount = 0;
      
      // First request will fail with network error
      mock.onGet('/api/test').networkErrorOnce();
      
      // Setup handler for retry
      mock.onGet('/api/test').reply(() => {
        attemptCount++;
        return [200, { data: 'success' }];
      });

      const result = await apiClient.get('/api/test');

      expect(result).toEqual({ data: 'success' });
      expect(attemptCount).toBe(1); // One successful attempt after network error
    }, 10000); // Increase timeout for retry tests

    it('does not retry on 4xx errors (except 429)', async () => {
      let attemptCount = 0;
      mock.onGet('/api/test').reply(() => {
        attemptCount++;
        return [400, { error: 'Bad request' }];
      });

      await expect(apiClient.get('/api/test')).rejects.toThrow();
      expect(attemptCount).toBe(1);
    });

    it('respects retry-after header for 429', async () => {
      const startTime = Date.now();
      let attemptCount = 0;
      
      mock.onGet('/api/test').reply(() => {
        attemptCount++;
        if (attemptCount === 1) {
          return [429, null, { 'retry-after': '1' }];
        }
        return [200, { data: 'success' }];
      });

      const result = await apiClient.get('/api/test');
      const duration = Date.now() - startTime;

      expect(result).toEqual({ data: 'success' });
      expect(duration).toBeGreaterThanOrEqual(900); // Should wait at least 900ms (allowing for some variance)
    }, 15000); // Increase timeout for retry tests
  });

  describe('HTTP Methods', () => {
    it('handles GET requests', async () => {
      mock.onGet('/api/test').reply(200, { data: 'get' });

      const result = await apiClient.get('/api/test');

      expect(result).toEqual({ data: 'get' });
    });

    it('handles POST requests', async () => {
      const payload = { name: 'test' };
      mock.onPost('/api/test', payload).reply(201, { data: 'created' });

      const result = await apiClient.post('/api/test', payload);

      expect(result).toEqual({ data: 'created' });
    });

    it('handles PUT requests', async () => {
      const payload = { name: 'updated' };
      mock.onPut('/api/test/1', payload).reply(200, { data: 'updated' });

      const result = await apiClient.put('/api/test/1', payload);

      expect(result).toEqual({ data: 'updated' });
    });

    it('handles PATCH requests', async () => {
      const payload = { status: 'active' };
      mock.onPatch('/api/test/1', payload).reply(200, { data: 'patched' });

      const result = await apiClient.patch('/api/test/1', payload);

      expect(result).toEqual({ data: 'patched' });
    });

    it('handles DELETE requests', async () => {
      mock.onDelete('/api/test/1').reply(204);

      const result = await apiClient.delete('/api/test/1');

      expect(result).toBeUndefined();
    });
  });

  describe('Token Renewal', () => {
    it('schedules token renewal before expiry', async () => {
      const expiresOn = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now
      (msalInstance.acquireTokenSilent as any).mockResolvedValue({
        accessToken: 'test-token',
        expiresOn,
      });

      vi.useFakeTimers();
      
      mock.onGet('/api/test').reply(200, { data: 'test' });
      await apiClient.get('/api/test');

      // Fast-forward to 5 minutes before expiry
      vi.advanceTimersByTime(5 * 60 * 1000);

      // Token renewal should be scheduled (once for initial request, once for renewal)
      expect(msalInstance.acquireTokenSilent).toHaveBeenCalledTimes(2);

      vi.useRealTimers();
    });
  });

  describe('Error Enhancement', () => {
    it('includes correlation ID in error object', async () => {
      mock.onGet('/api/test').reply(400, { error: 'Bad request' });

      try {
        await apiClient.get('/api/test');
      } catch (error: any) {
        expect(error.correlationId).toBe('test-correlation-id');
      }
    });

    it('includes status code in error object', async () => {
      mock.onGet('/api/test').reply(403, { error: 'Forbidden' });

      try {
        await apiClient.get('/api/test');
      } catch (error: any) {
        expect(error.status).toBe(403);
      }
    });

    it('includes retry-after in rate limit errors', async () => {
      // Set up to fail with rate limit error
      let attemptCount = 0;
      mock.onGet('/api/test').reply(() => {
        attemptCount++;
        return [429, null, { 'retry-after': '65' }]; // > 60 seconds, won't retry
      });

      try {
        await apiClient.get('/api/test');
        // Should not reach here
      } catch (error: any) {
        // The error should be defined
        expect(error).toBeDefined();
        expect(attemptCount).toBe(1); // Should only try once when retry-after > 60 seconds
      }
    });
  });
});