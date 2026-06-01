export type Role = 'admin' | 'receptionist';
export type SubscriptionStatus = 'active' | 'expired' | 'frozen' | 'cancelled';
export type Gender = 'male' | 'female';
export type PaymentMethod = 'cash' | 'transfer' | 'card' | 'online';
export type AttendanceMethod = 'qr' | 'manual' | 'id_entry';
export type NotificationType = 'expiring_soon' | 'expired_today' | 'no_checkin' | 'new_member' | 'system';

export interface User {
  id: number;
  name: string;
  email: string;
  role: Role;
  branch_id: number | null;
  branch_name?: string;
  is_active: number;
}

export interface Branch {
  id: number;
  name: string;
  address?: string;
  phone?: string;
  manager_name?: string;
  is_active: number;
  staff_count?: number;
  active_members?: number;
  revenue_this_month?: number;
  created_at?: string;
}

export interface Member {
  id: number;
  member_code: string;
  name_ar: string;
  name_en?: string;
  phone?: string;
  email?: string;
  photo_path?: string;
  gender?: Gender;
  dob?: string;
  national_id?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  health_notes?: string;
  join_date: string;
  status: 'active' | 'frozen' | 'cancelled';
  home_branch_id: number;
  home_branch_name?: string;
  is_active: number;
  created_at: string;
  // joined from subscriptions
  sub_id?: number;
  sub_status?: SubscriptionStatus;
  sub_end_date?: string;
  plan_name?: string;
  subscriptions?: Subscription[];
  attendance?: AttendanceRecord[];
}

export interface SubscriptionPlan {
  id: number;
  name: string;
  duration_days: number;
  price: number;
  description?: string;
  features_json: string;
  sessions_per_day?: number;
  is_active: number;
  created_at?: string;
}

export interface Subscription {
  id: number;
  member_id: number;
  member_name?: string;
  member_code?: string;
  member_phone?: string;
  photo_path?: string;
  plan_id: number;
  plan_name?: string;
  duration_days?: number;
  branch_id: number;
  branch_name?: string;
  start_date: string;
  end_date: string;
  price_paid: number;
  discount_amount: number;
  discount_reason?: string;
  payment_method: PaymentMethod;
  payment_reference?: string;
  processed_by?: number;
  processed_by_name?: string;
  notes?: string;
  status: SubscriptionStatus;
  freeze_count: number;
  freezes?: SubscriptionFreeze[];
  created_at: string;
  updated_at?: string;
}

export interface SubscriptionFreeze {
  id: number;
  subscription_id: number;
  freeze_start: string;
  freeze_end: string;
  days_frozen: number;
  reason?: string;
  created_at: string;
}

export interface AttendanceRecord {
  id: number;
  member_id: number;
  member_name?: string;
  member_code?: string;
  subscription_id?: number;
  branch_id: number;
  branch_name?: string;
  check_in_time: string;
  check_out_time?: string;
  method: AttendanceMethod;
  processed_by?: number;
  processed_by_name?: string;
  created_at?: string;
}

export interface Notification {
  id: number;
  type: NotificationType;
  title: string;
  message: string;
  member_id?: number;
  member_name?: string;
  member_code?: string;
  branch_id?: number;
  branch_name?: string;
  is_read: number;
  created_at: string;
}

export interface GymSettings {
  gym_name: string;
  gym_phone: string;
  gym_address: string;
  gym_cr: string;
  gym_logo?: string;
  currency: string;
  timezone: string;
  member_code_counter: string;
}

export interface DashboardKPIs {
  activeMembers: number;
  newThisMonth: number;
  lastMonthMembers: number;
  expiringSoon: number;
  revenueThisMonth: number;
  revenueLastMonth: number;
  checkinsToday: number;
  checkinsThisMonth: number;
  frozenCount: number;
  atRiskCount: number;
  revenueChange: number;
  membersChange: number;
  attendanceRate: number;
}

export interface DashboardData {
  kpis: DashboardKPIs;
  revenueChart: Array<{ month: string; revenue: number; subscription_count: number }>;
  statusDist: Array<{ status: string; count: number }>;
  dailyCheckins: Array<{ day: string; checkins: number }>;
  topPlans: Array<{ plan_name: string; subscriber_count: number; total_revenue: number }>;
  recentActivity: Array<{
    event_type: 'checkin' | 'subscription';
    member_name: string;
    member_code: string;
    branch_name: string;
    event_time: string;
  }>;
  heatmap: Array<{ day_of_week: number; hour: number; count: number }>;
  branchComparison?: Array<{
    id: number;
    branch_name: string;
    total_members: number;
    active_members: number;
    revenue_this_month: number;
    checkins_today: number;
    new_subs_this_month: number;
    staff_count: number;
  }>;
  revenueByBranch: Array<{ branch_name: string; month: string; revenue: number }>;
  dailyRevByBranch: Array<{ branch_name: string; day: string; revenue: number }>;
  alerts: Array<{ level: 'red' | 'orange' | 'yellow' | 'green' | 'blue'; message: string; type: string }>;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  meta: {
    total: number;
    page: number;
    per_page: number;
    total_pages?: number;
  };
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  meta?: {
    total?: number;
    page?: number;
    per_page?: number;
    unread_count?: number;
  };
}
