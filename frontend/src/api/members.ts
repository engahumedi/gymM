import { apiClient } from './client';
import { Member, PaginatedResponse, ApiResponse } from '@/types';

export interface MemberFilters {
  page?: number;
  per_page?: number;
  search?: string;
  status?: string;
  gender?: string;
  branchId?: number;
}

export const membersApi = {
  getAll: async (filters: MemberFilters = {}): Promise<PaginatedResponse<Member>> => {
    const res = await apiClient.get('/members', { params: filters });
    return res.data;
  },

  getById: async (id: number): Promise<ApiResponse<Member>> => {
    const res = await apiClient.get(`/members/${id}`);
    return res.data;
  },

  getQR: async (id: number): Promise<{ qr: string; member_code: string }> => {
    const res = await apiClient.get(`/members/${id}/qr`);
    return res.data.data;
  },

  create: async (data: FormData): Promise<Member> => {
    const res = await apiClient.post('/members', data, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data.data;
  },

  update: async (id: number, data: FormData | Record<string, unknown>): Promise<Member> => {
    const isFormData = data instanceof FormData;
    const res = await apiClient.put(`/members/${id}`, data, {
      headers: isFormData ? { 'Content-Type': 'multipart/form-data' } : {},
    });
    return res.data.data;
  },

  delete: async (id: number): Promise<void> => {
    await apiClient.delete(`/members/${id}`);
  },
};
