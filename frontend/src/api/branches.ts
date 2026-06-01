import { apiClient } from './client';
import { Branch } from '@/types';

export const branchesApi = {
  getAll: async (): Promise<Branch[]> => {
    const res = await apiClient.get('/branches');
    return res.data.data;
  },

  getById: async (id: number): Promise<Branch> => {
    const res = await apiClient.get(`/branches/${id}`);
    return res.data.data;
  },

  create: async (data: Partial<Branch>): Promise<Branch> => {
    const res = await apiClient.post('/branches', data);
    return res.data.data;
  },

  update: async (id: number, data: Partial<Branch>): Promise<Branch> => {
    const res = await apiClient.put(`/branches/${id}`, data);
    return res.data.data;
  },
};
