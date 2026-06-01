import { apiClient } from './client';
import { Notification } from '@/types';

export const notificationsApi = {
  getAll: async (): Promise<Notification[]> => {
    const res = await apiClient.get('/notifications');
    return res.data.data || [];
  },

  generate: async (): Promise<void> => {
    await apiClient.post('/notifications/generate');
  },

  markRead: async (id: number): Promise<void> => {
    await apiClient.put(`/notifications/${id}/read`);
  },

  markAllRead: async (): Promise<void> => {
    await apiClient.put('/notifications/read-all');
  },

  getUnreadCount: async (): Promise<number> => {
    const res = await apiClient.get('/notifications');
    const data: Notification[] = res.data.data || [];
    return data.filter(n => !n.is_read).length;
  },
};
