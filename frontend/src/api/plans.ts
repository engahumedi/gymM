import { apiClient } from './client';
import { SubscriptionPlan } from '@/types';

export const plansApi = {
  getAll: async (): Promise<SubscriptionPlan[]> => {
    const res = await apiClient.get('/plans');
    return res.data.data;
  },

  getById: async (id: number): Promise<SubscriptionPlan> => {
    const res = await apiClient.get(`/plans/${id}`);
    return res.data.data;
  },

  create: async (data: Partial<SubscriptionPlan>): Promise<SubscriptionPlan> => {
    const res = await apiClient.post('/plans', data);
    return res.data.data;
  },

  update: async (id: number, data: Partial<SubscriptionPlan>): Promise<SubscriptionPlan> => {
    const res = await apiClient.put(`/plans/${id}`, data);
    return res.data.data;
  },

  delete: async (id: number): Promise<void> => {
    await apiClient.delete(`/plans/${id}`);
  },
};
