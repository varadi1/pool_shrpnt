// API service for making HTTP requests to the backend
import axios from 'axios';
import type { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

class ApiService {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Request interceptor to add auth token
    this.client.interceptors.request.use(
      (config) => {
        const token = sessionStorage.getItem('access_token');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      async (error) => {
        if (error.response?.status === 401) {
          // Handle token refresh or redirect to login
          sessionStorage.removeItem('access_token');
          window.location.href = '/login';
        }
        return Promise.reject(error);
      }
    );
  }

  // Generic request methods
  async get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response: AxiosResponse<T> = await this.client.get(url, config);
    return response.data;
  }

  async post<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const response: AxiosResponse<T> = await this.client.post(url, data, config);
    return response.data;
  }

  async put<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const response: AxiosResponse<T> = await this.client.put(url, data, config);
    return response.data;
  }

  async patch<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const response: AxiosResponse<T> = await this.client.patch(url, data, config);
    return response.data;
  }

  async delete<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response: AxiosResponse<T> = await this.client.delete(url, config);
    return response.data;
  }

  // Guest-specific methods
  async inviteGuest(data: {
    email: string;
    partner_company_id: string;
    role: string;
    display_name?: string;
  }) {
    return this.post('/api/guests', data);
  }

  async getGuests(params?: { page?: number; page_size?: number; search?: string }) {
    return this.get('/api/guests', { params });
  }

  async getGuestDetails(id: string) {
    return this.get(`/api/guests/${id}`);
  }

  async checkGuestStatus(email: string) {
    return this.get(`/api/guests/status/${email}`);
  }

  async updateGuestGroups(id: string, groupIds: string[]) {
    return this.patch(`/api/guests/${id}/groups`, { group_ids: groupIds });
  }

  async resendInvitation(id: string) {
    return this.post(`/api/guests/${id}/resend`);
  }
}

export const api = new ApiService();

// Compatibility wrapper for legacy callers expecting Axios-like response objects
// Provides get/post/put/patch/delete that resolve to { data } shapes
export const apiClient = {
  async get<T>(url: string, config?: AxiosRequestConfig): Promise<{ data: T }> {
    const data = await api.get<T>(url, config);
    return { data };
  },
  async post<T>(url: string, body?: any, config?: AxiosRequestConfig): Promise<{ data: T }> {
    const data = await api.post<T>(url, body, config);
    return { data };
  },
  async put<T>(url: string, body?: any, config?: AxiosRequestConfig): Promise<{ data: T }> {
    const data = await api.put<T>(url, body, config);
    return { data };
  },
  async patch<T>(url: string, body?: any, config?: AxiosRequestConfig): Promise<{ data: T }> {
    const data = await api.patch<T>(url, body, config);
    return { data };
  },
  async delete<T>(url: string, config?: AxiosRequestConfig): Promise<{ data: T }> {
    const data = await api.delete<T>(url, config);
    return { data };
  },
};