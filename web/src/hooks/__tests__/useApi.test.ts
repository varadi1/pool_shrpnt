import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React, { ReactNode } from 'react';
import {
  useApiGet,
  useApiPost,
  useApiPut,
  useApiDelete,
  useApiPaginated,
  useApiSearch,
  getErrorMessage,
  getCorrelationId,
} from '../useApi';
import { apiClient } from '@/services/api/axios-client';

// Mock the API client
vi.mock('@/services/api/axios-client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

describe('useApi hooks', () => {
  let queryClient: QueryClient;

  const wrapper = ({ children }: { children: ReactNode }) => {
    return React.createElement(
      QueryClientProvider,
      { client: queryClient },
      children
    );
  };

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          gcTime: 0,
        },
      },
    });
    vi.clearAllMocks();
  });

  describe('useApiGet', () => {
    it('fetches data successfully', async () => {
      const mockData = { id: 1, name: 'Test' };
      (apiClient.get as any).mockResolvedValue(mockData);

      const { result } = renderHook(
        () => useApiGet('test', '/api/test'),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual(mockData);
      expect(apiClient.get).toHaveBeenCalledWith('/api/test');
    });

    it('handles dynamic URLs', async () => {
      const mockData = { id: 1 };
      (apiClient.get as any).mockResolvedValue(mockData);

      const { result, rerender } = renderHook(
        ({ id }) => useApiGet(['test', id], () => id ? `/api/test/${id}` : null),
        { 
          wrapper,
          initialProps: { id: null as string | null }
        }
      );

      // Should not fetch when URL is null
      expect(result.current.isSuccess).toBe(false);
      expect(result.current.data).toBeUndefined();
      expect(apiClient.get).not.toHaveBeenCalled();

      // Update with valid ID
      rerender({ id: '123' });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(apiClient.get).toHaveBeenCalledWith('/api/test/123');
    });

    it('handles errors', async () => {
      const error = new Error('API Error');
      (apiClient.get as any).mockRejectedValue(error);

      const { result } = renderHook(
        () => useApiGet('test', '/api/test', { retry: false }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      }, { timeout: 3000 });

      expect(result.current.error).toBe(error);
    });
  });

  describe('useApiPost', () => {
    it('posts data successfully', async () => {
      const mockResponse = { id: 1, name: 'Created' };
      const postData = { name: 'New Item' };
      (apiClient.post as any).mockResolvedValue(mockResponse);

      const { result } = renderHook(
        () => useApiPost('/api/items'),
        { wrapper }
      );

      result.current.mutate(postData);

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual(mockResponse);
      expect(apiClient.post).toHaveBeenCalledWith('/api/items', postData);
    });

    it('handles post errors', async () => {
      const error = new Error('Post failed');
      (apiClient.post as any).mockRejectedValue(error);

      const { result } = renderHook(
        () => useApiPost('/api/items'),
        { wrapper }
      );

      result.current.mutate({ name: 'Test' });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error).toBe(error);
    });
  });

  describe('useApiPut', () => {
    it('updates data successfully', async () => {
      const mockResponse = { id: 1, name: 'Updated' };
      const updateData = { name: 'Updated Item' };
      (apiClient.put as any).mockResolvedValue(mockResponse);

      const { result } = renderHook(
        () => useApiPut('/api/items/1'),
        { wrapper }
      );

      result.current.mutate(updateData);

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual(mockResponse);
      expect(apiClient.put).toHaveBeenCalledWith('/api/items/1', updateData);
    });

    it('handles dynamic URL in put', async () => {
      const mockResponse = { id: 1, name: 'Updated' };
      (apiClient.put as any).mockResolvedValue(mockResponse);

      const { result } = renderHook(
        () => useApiPut<any, { id: string; data: any }>(
          (variables) => `/api/items/${variables.id}`
        ),
        { wrapper }
      );

      const variables = { id: '123', data: { name: 'Test' } };
      result.current.mutate(variables);

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(apiClient.put).toHaveBeenCalledWith('/api/items/123', variables);
    });
  });

  describe('useApiDelete', () => {
    it('deletes successfully', async () => {
      (apiClient.delete as any).mockResolvedValue(undefined);

      const { result } = renderHook(
        () => useApiDelete<void, { id: string }>(
          (variables) => `/api/items/${variables.id}`
        ),
        { wrapper }
      );

      result.current.mutate({ id: '123' });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(apiClient.delete).toHaveBeenCalledWith('/api/items/123');
    });
  });

  describe('useApiPaginated', () => {
    it('fetches paginated data', async () => {
      const mockResponse = {
        items: [{ id: 1 }, { id: 2 }],
        total: 10,
        page: 1,
        pageSize: 2,
        hasMore: true,
      };
      (apiClient.get as any).mockResolvedValue(mockResponse);

      const { result } = renderHook(
        () => useApiPaginated('items', '/api/items', 1, 2),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual(mockResponse);
      expect(apiClient.get).toHaveBeenCalledWith('/api/items', {
        params: { page: 1, pageSize: 2 },
      });
    });

    it('includes additional parameters', async () => {
      const mockResponse = {
        items: [],
        total: 0,
        page: 1,
        pageSize: 10,
        hasMore: false,
      };
      (apiClient.get as any).mockResolvedValue(mockResponse);

      const { result } = renderHook(
        () => useApiPaginated(
          'items',
          '/api/items',
          1,
          10,
          { status: 'active', type: 'premium' }
        ),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(apiClient.get).toHaveBeenCalledWith('/api/items', {
        params: {
          page: 1,
          pageSize: 10,
          status: 'active',
          type: 'premium',
        },
      });
    });
  });

  describe('useApiSearch', () => {
    it('searches with search term', async () => {
      const mockResults = [{ id: 1, name: 'Result 1' }];
      (apiClient.get as any).mockResolvedValue(mockResults);

      const { result } = renderHook(
        () => useApiSearch('search', '/api/search', 'test query'),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual(mockResults);
      expect(apiClient.get).toHaveBeenCalledWith('/api/search', {
        params: { q: 'test query' },
      });
    });

    it('searches with filters', async () => {
      const mockResults = [{ id: 1 }];
      (apiClient.get as any).mockResolvedValue(mockResults);

      const { result } = renderHook(
        () => useApiSearch(
          'search',
          '/api/search',
          '',
          { category: 'electronics', minPrice: 100 }
        ),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(apiClient.get).toHaveBeenCalledWith('/api/search', {
        params: {
          q: '',
          category: 'electronics',
          minPrice: 100,
        },
      });
    });

    it('returns empty array when no search term or filters', async () => {
      (apiClient.get as any).mockResolvedValue([]);
      
      const { result } = renderHook(
        () => useApiSearch('search', '/api/search', ''),
        { wrapper }
      );

      // The query should be disabled and not fetch
      expect(result.current.data).toBeUndefined();
      expect(result.current.isSuccess).toBe(false);
      expect(apiClient.get).not.toHaveBeenCalled();
    });
  });

  describe('Error utilities', () => {
    it('extracts error message from AxiosError', () => {
      const axiosError: any = {
        response: {
          data: { message: 'Custom error message' },
        },
        message: 'Request failed',
        isAxiosError: true,
      };

      const message = getErrorMessage(axiosError);
      expect(message).toBe('Custom error message');
    });

    it('falls back to error.message', () => {
      const error = new Error('Standard error');
      const message = getErrorMessage(error);
      expect(message).toBe('Standard error');
    });

    it('returns default message for unknown errors', () => {
      const message = getErrorMessage(null);
      expect(message).toBe('An unexpected error occurred');
    });

    it('extracts correlation ID from error', () => {
      const error = {
        correlationId: 'test-123',
        config: {
          headers: {
            'X-Correlation-ID': 'fallback-456',
          },
        },
      } as any;

      const correlationId = getCorrelationId(error);
      expect(correlationId).toBe('test-123');
    });

    it('returns undefined when no correlation ID', () => {
      const error = new Error('Test');
      const correlationId = getCorrelationId(error);
      expect(correlationId).toBeUndefined();
    });
  });
});