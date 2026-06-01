import { apiClient } from './client';
import { AttendanceRecord, PaginatedResponse } from '@/types';

export interface AttendanceFilters {
  page?: number;
  per_page?: number;
  date_from?: string;
  date_to?: string;
  search?: string;
  branchId?: number;
}

export interface CheckInResult {
  attendance_id: number;
  member: {
    id: number;
    name_ar: string;
    member_code: string;
    photo_path?: string;
  };
  subscription: {
    end_date: string;
    days_left: number;
  };
  branch_name: string;
  check_in_time: string;
}

export const attendanceApi = {
  checkIn: async (data: {
    member_code?: string;
    member_id?: number;
    method?: 'manual' | 'qr' | 'id_entry';
    branch_id?: number;
  }): Promise<CheckInResult> => {
    const res = await apiClient.post('/attendance', data);
    return res.data.data;
  },

  checkout: async (id: number): Promise<void> => {
    await apiClient.post(`/attendance/checkout/${id}`);
  },

  getAll: async (filters: AttendanceFilters = {}): Promise<PaginatedResponse<AttendanceRecord>> => {
    const res = await apiClient.get('/attendance', { params: filters });
    return res.data;
  },

  getMemberHistory: async (memberId: number): Promise<AttendanceRecord[]> => {
    const res = await apiClient.get(`/attendance/member/${memberId}`);
    return res.data.data;
  },
};
