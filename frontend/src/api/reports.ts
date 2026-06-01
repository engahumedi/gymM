import { apiClient } from './client';
import { DashboardData } from '@/types';

const today = () => new Date().toISOString().split('T')[0];
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString().split('T')[0];
const currentMonth = () => new Date().toISOString().slice(0, 7);

export const reportsApi = {
  getDashboard: async (branchId?: number): Promise<DashboardData> => {
    const res = await apiClient.get('/reports/dashboard', {
      params: branchId ? { branchId } : {},
    });
    return res.data.data;
  },

  revenueDaily: async (params?: { branch_id?: number }) => {
    const res = await apiClient.get('/reports/revenue/daily', {
      params: {
        date: today(),
        ...(params?.branch_id ? { branchId: params.branch_id } : {}),
      },
    });
    const d = res.data.data;
    return (d.transactions || []).map((t: any) => ({
      date: d.date,
      revenue: t.price_paid,
      plan_name: t.plan_name,
      member_name: t.member_name,
      branch_name: t.branch_name,
      count: 1,
    }));
  },

  revenueMonthly: async (params?: { branch_id?: number }) => {
    const months = Array.from({ length: 6 }, (_, i) => {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      return d.toISOString().slice(0, 7);
    }).reverse();

    const results = await Promise.all(
      months.map(async (month) => {
        const res = await apiClient.get('/reports/revenue/monthly', {
          params: { month, ...(params?.branch_id ? { branchId: params.branch_id } : {}) },
        });
        const s = res.data.data.summary;
        return {
          month,
          revenue: s?.total_revenue || 0,
          count: s?.total_subs || 0,
          new_members: 0,
        };
      })
    );
    return results;
  },

  revenueByPlan: async (params?: { branch_id?: number }) => {
    const res = await apiClient.get('/reports/revenue/by-plan', {
      params: params?.branch_id ? { branchId: params.branch_id } : {},
    });
    return res.data.data;
  },

  membersExpiring: async (params?: { days?: number; branch_id?: number }) => {
    const res = await apiClient.get('/reports/members/expiring', {
      params: {
        days: params?.days || 7,
        ...(params?.branch_id ? { branchId: params.branch_id } : {}),
      },
    });
    return (res.data.data || []).map((m: any) => ({
      ...m,
      member_name: m.name_ar,
      days_remaining: Math.ceil((new Date(m.end_date).getTime() - Date.now()) / 86400000),
    }));
  },

  membersInactive: async (params?: { days?: number; branch_id?: number }) => {
    const res = await apiClient.get('/reports/members/inactive', {
      params: {
        days: params?.days || 30,
        ...(params?.branch_id ? { branchId: params.branch_id } : {}),
      },
    });
    return (res.data.data || []).map((m: any) => ({ ...m, member_name: m.name_ar }));
  },

  attendanceSummary: async (params?: { branch_id?: number }) => {
    const res = await apiClient.get('/reports/attendance/summary', {
      params: {
        date_from: daysAgo(30),
        date_to: today(),
        ...(params?.branch_id ? { branchId: params.branch_id } : {}),
      },
    });
    const data = res.data.data;
    const maxCount = Math.max(...(data.peak_hours || []).map((h: any) => h.count), 1);
    return { ...data, max_hour_count: maxCount };
  },

  branchComparison: async () => {
    const res = await apiClient.get('/reports/branches/comparison', {
      params: { date_from: daysAgo(30), date_to: today() },
    });
    return res.data.data;
  },

  // Legacy named methods
  getDailyRevenue: async (date: string, branchId?: number) => {
    const res = await apiClient.get('/reports/revenue/daily', {
      params: { date, ...(branchId ? { branchId } : {}) },
    });
    return res.data.data;
  },

  getMonthlyRevenue: async (month: string, branchId?: number) => {
    const res = await apiClient.get('/reports/revenue/monthly', {
      params: { month, ...(branchId ? { branchId } : {}) },
    });
    return res.data.data;
  },

  getRevenueByPlan: async (branchId?: number) => {
    const res = await apiClient.get('/reports/revenue/by-plan', {
      params: branchId ? { branchId } : {},
    });
    return res.data.data;
  },

  getExpiringMembers: async (days: number, branchId?: number) => {
    const res = await apiClient.get('/reports/members/expiring', {
      params: { days, ...(branchId ? { branchId } : {}) },
    });
    return res.data.data;
  },

  getInactiveMembers: async (days: number, branchId?: number) => {
    const res = await apiClient.get('/reports/members/inactive', {
      params: { days, ...(branchId ? { branchId } : {}) },
    });
    return res.data.data;
  },

  getAttendanceSummary: async (dateFrom: string, dateTo: string, branchId?: number) => {
    const res = await apiClient.get('/reports/attendance/summary', {
      params: { date_from: dateFrom, date_to: dateTo, ...(branchId ? { branchId } : {}) },
    });
    return res.data.data;
  },

  getBranchComparison: async (dateFrom: string, dateTo: string) => {
    const res = await apiClient.get('/reports/branches/comparison', {
      params: { date_from: dateFrom, date_to: dateTo },
    });
    return res.data.data;
  },
};
