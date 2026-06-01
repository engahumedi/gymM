import { apiClient } from './client';
import { Subscription, PaginatedResponse, ApiResponse } from '@/types';

export interface SubscriptionFilters {
  page?: number;
  per_page?: number;
  status?: string;
  search?: string;
  branchId?: number;
}

export const subscriptionsApi = {
  getAll: async (filters: SubscriptionFilters = {}): Promise<PaginatedResponse<Subscription>> => {
    const res = await apiClient.get('/subscriptions', { params: filters });
    return res.data;
  },

  getById: async (id: number): Promise<ApiResponse<Subscription>> => {
    const res = await apiClient.get(`/subscriptions/${id}`);
    return res.data;
  },

  create: async (data: {
    member_id: number;
    plan_id: number;
    start_date: string;
    price_paid?: number;
    discount_amount?: number;
    discount_reason?: string;
    payment_method?: string;
    payment_reference?: string;
    notes?: string;
  }): Promise<Subscription> => {
    const res = await apiClient.post('/subscriptions', data);
    return res.data.data;
  },

  update: async (id: number, data: Partial<Subscription>): Promise<Subscription> => {
    const res = await apiClient.put(`/subscriptions/${id}`, data);
    return res.data.data;
  },

  freeze: async (id: number, days: number, reason: string): Promise<Subscription> => {
    const res = await apiClient.post(`/subscriptions/${id}/freeze`, { days, reason });
    return res.data.data;
  },

  unfreeze: async (id: number): Promise<Subscription> => {
    const res = await apiClient.post(`/subscriptions/${id}/unfreeze`);
    return res.data.data;
  },

  renew: async (id: number): Promise<Subscription> => {
    const res = await apiClient.post(`/subscriptions/${id}/renew`);
    return res.data.data;
  },

  cancel: async (id: number, reason: string): Promise<Subscription> => {
    const res = await apiClient.post(`/subscriptions/${id}/cancel`, { reason });
    return res.data.data;
  },
};
