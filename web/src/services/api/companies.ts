import { apiClient } from './axios-client';

export interface PartnerCompany {
  id: string;
  name: string;
  type: 'partner' | 'client' | 'vendor';
  email: string;
  status: 'active' | 'inactive';
  contactPerson?: string;
  phone?: string;
  address?: string;
  createdAt: string;
  updatedAt: string;
}

export async function getPartnerCompanies(): Promise<PartnerCompany[]> {
  const response = await apiClient.get<PartnerCompany[]>('/companies', {
    params: { type: 'partner' }
  });
  return response.data;
}

export async function getCompany(id: string): Promise<PartnerCompany> {
  const response = await apiClient.get<PartnerCompany>(`/companies/${id}`);
  return response.data;
}

export async function searchCompanies(query: string): Promise<PartnerCompany[]> {
  const response = await apiClient.get<PartnerCompany[]>('/companies/search', {
    params: { q: query }
  });
  return response.data;
}