import { useQuery, useMutation, UseQueryOptions, UseMutationOptions } from '@tanstack/react-query';
import { apiClient } from '@/services/api/axios-client';
import type { AxiosError } from 'axios';

// Generic API response types
export interface ApiResponse<T> {
  data: T;
  status: number;
  message?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

// Custom hook for GET requests with React Query
export function useApiGet<T = any>(
  key: string | string[],
  url: string | (() => string | null),
  options?: Omit<UseQueryOptions<T, AxiosError>, 'queryKey' | 'queryFn'>
) {
  const queryKey = Array.isArray(key) ? key : [key];
  
  return useQuery<T, AxiosError>({
    queryKey,
    queryFn: async () => {
      const finalUrl = typeof url === 'function' ? url() : url;
      if (!finalUrl) {
        throw new Error('URL is null or undefined');
      }
      return apiClient.get<T>(finalUrl);
    },
    enabled: typeof url === 'function' ? !!url() : !!url,
    staleTime: 30000, // 30 seconds default
    retry: (failureCount, error) => {
      // Don't retry on 4xx errors (except 429 which is handled by axios-retry)
      if (error.response && error.response.status >= 400 && error.response.status < 500) {
        return false;
      }
      return failureCount < 3;
    },
    ...options,
  });
}

// Custom hook for POST requests with React Query
export function useApiPost<TData = any, TVariables = any>(
  url: string,
  options?: UseMutationOptions<TData, AxiosError, TVariables>
) {
  return useMutation<TData, AxiosError, TVariables>({
    mutationFn: async (data: TVariables) => {
      return apiClient.post<TData>(url, data);
    },
    ...options,
  });
}

// Custom hook for PUT requests with React Query
export function useApiPut<TData = any, TVariables = any>(
  url: string | ((variables: TVariables) => string),
  options?: UseMutationOptions<TData, AxiosError, TVariables>
) {
  return useMutation<TData, AxiosError, TVariables>({
    mutationFn: async (data: TVariables) => {
      const finalUrl = typeof url === 'function' ? url(data) : url;
      return apiClient.put<TData>(finalUrl, data);
    },
    ...options,
  });
}

// Custom hook for PATCH requests with React Query
export function useApiPatch<TData = any, TVariables = any>(
  url: string | ((variables: TVariables) => string),
  options?: UseMutationOptions<TData, AxiosError, TVariables>
) {
  return useMutation<TData, AxiosError, TVariables>({
    mutationFn: async (data: TVariables) => {
      const finalUrl = typeof url === 'function' ? url(data) : url;
      return apiClient.patch<TData>(finalUrl, data);
    },
    ...options,
  });
}

// Custom hook for DELETE requests with React Query
export function useApiDelete<TData = any, TVariables = any>(
  url: string | ((variables: TVariables) => string),
  options?: UseMutationOptions<TData, AxiosError, TVariables>
) {
  return useMutation<TData, AxiosError, TVariables>({
    mutationFn: async (variables: TVariables) => {
      const finalUrl = typeof url === 'function' ? url(variables) : url;
      return apiClient.delete<TData>(finalUrl);
    },
    ...options,
  });
}

// Custom hook for paginated GET requests
export function useApiPaginated<T = any>(
  key: string | string[],
  baseUrl: string,
  page: number = 1,
  pageSize: number = 20,
  additionalParams?: Record<string, any>,
  options?: Omit<UseQueryOptions<PaginatedResponse<T>, AxiosError>, 'queryKey' | 'queryFn'>
) {
  const queryKey = Array.isArray(key) ? [...key, page, pageSize, additionalParams] : [key, page, pageSize, additionalParams];
  
  return useQuery<PaginatedResponse<T>, AxiosError>({
    queryKey,
    queryFn: async () => {
      const params = {
        page,
        pageSize,
        ...additionalParams,
      };
      
      const response = await apiClient.get<PaginatedResponse<T>>(baseUrl, { params });
      return response;
    },
    keepPreviousData: true, // Keep previous data while fetching new page
    staleTime: 30000,
    ...options,
  });
}

// Custom hook for search/filter operations
export function useApiSearch<T = any>(
  key: string | string[],
  baseUrl: string,
  searchTerm: string,
  filters?: Record<string, any>,
  options?: Omit<UseQueryOptions<T[], AxiosError>, 'queryKey' | 'queryFn'>
) {
  const queryKey = Array.isArray(key) ? [...key, searchTerm, filters] : [key, searchTerm, filters];
  
  return useQuery<T[], AxiosError>({
    queryKey,
    queryFn: async () => {
      if (!searchTerm && (!filters || Object.keys(filters).length === 0)) {
        return [];
      }
      
      const params = {
        q: searchTerm,
        ...filters,
      };
      
      return apiClient.get<T[]>(baseUrl, { params });
    },
    enabled: !!searchTerm || (!!filters && Object.keys(filters).length > 0),
    staleTime: 10000, // Shorter stale time for search results
    ...options,
  });
}

// Custom hook for file upload
export function useApiUpload<TResponse = any>(
  url: string,
  options?: UseMutationOptions<TResponse, AxiosError, FormData>
) {
  return useMutation<TResponse, AxiosError, FormData>({
    mutationFn: async (formData: FormData) => {
      return apiClient.post<TResponse>(url, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
    },
    ...options,
  });
}

// Custom hook for bulk operations
export function useApiBulkOperation<TData = any, TVariables = any>(
  url: string,
  options?: UseMutationOptions<TData, AxiosError, TVariables[]>
) {
  return useMutation<TData, AxiosError, TVariables[]>({
    mutationFn: async (items: TVariables[]) => {
      return apiClient.post<TData>(url, { items });
    },
    ...options,
  });
}

// Utility function to handle API errors
export function getErrorMessage(error: unknown): string {
  // Check if it's an axios error by checking for response property
  if (error && typeof error === 'object' && 'response' in error) {
    const axiosError = error as any;
    const apiError = axiosError.response?.data;
    return apiError?.message || apiError?.error || axiosError.message || 'An unexpected error occurred';
  }
  
  if (error instanceof Error) {
    return error.message;
  }
  
  return 'An unexpected error occurred';
}

// Utility function to extract correlation ID from error
export function getCorrelationId(error: unknown): string | undefined {
  // Check if it's an axios error by checking for config property
  if (error && typeof error === 'object') {
    const axiosError = error as any;
    return axiosError.correlationId || axiosError.config?.headers?.['X-Correlation-ID'];
  }
  
  return undefined;
}