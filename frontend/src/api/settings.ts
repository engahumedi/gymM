import { apiClient } from './client';
import { GymSettings, User } from '@/types';

export const settingsApi = {
  get: async (): Promise<GymSettings> => {
    const res = await apiClient.get('/settings');
    return res.data.data;
  },

  update: async (data: Partial<GymSettings>): Promise<void> => {
    await apiClient.put('/settings', data);
  },

  uploadLogo: async (file: File): Promise<{ logo_path: string }> => {
    const form = new FormData();
    form.append('photo', file);
    const res = await apiClient.put('/settings/logo', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data.data;
  },

  getUsers: async (): Promise<User[]> => {
    const res = await apiClient.get('/settings/users');
    return res.data.data;
  },

  createUser: async (data: {
    name: string;
    email: string;
    password: string;
    role: string;
    branch_id?: number;
  }): Promise<User> => {
    const res = await apiClient.post('/settings/users', data);
    return res.data.data;
  },

  updateUser: async (id: number, data: Partial<User & { password?: string }>): Promise<User> => {
    const res = await apiClient.put(`/settings/users/${id}`, data);
    return res.data.data;
  },

  backup: async (): Promise<void> => {
    const res = await apiClient.get('/settings/backup', { responseType: 'blob' });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gym-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  },

  reset: async (confirm: string, admin_password: string): Promise<void> => {
    await apiClient.post('/settings/reset', { confirm, admin_password });
  },
};
