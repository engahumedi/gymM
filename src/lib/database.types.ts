// Hand-written database types mirroring supabase/migrations. Can be regenerated
// later with `supabase gen types typescript`.

export type UserRole = 'super_admin' | 'reception' | 'member';
export type Gender = 'male' | 'female';
export type SubscriptionStatus =
  | 'pending'
  | 'active'
  | 'frozen'
  | 'expired'
  | 'cancelled';
export type PaymentMethod = 'cash' | 'mada' | 'online' | 'other';

export interface Profile {
  id: string;
  gym_id: string | null;
  role: UserRole;
  branch_id: string | null;
  member_id: string | null;
  full_name: string | null;
  created_at: string;
}

export interface Gym {
  id: string;
  name_ar: string;
  name_en: string;
  logo_url: string | null;
  primary_color: string;
  secondary_color: string;
  contact_email: string | null;
  contact_phone: string | null;
  social_links: Record<string, string>;
  created_at: string;
}

export interface Branch {
  id: string;
  gym_id: string;
  name_ar: string;
  name_en: string;
  address_ar: string | null;
  address_en: string | null;
  city: string | null;
  phone: string | null;
  map_url: string | null;
  working_hours: Record<string, { open: string; close: string }>;
  is_active: boolean;
  created_at: string;
}

export interface Member {
  id: string;
  gym_id: string;
  branch_id: string | null;
  member_code: string | null;
  full_name: string;
  phone: string;
  national_id: string | null;
  gender: Gender | null;
  dob: string | null;
  photo_url: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  notes: string | null;
  user_id: string | null;
  created_at: string;
}

export interface Plan {
  id: string;
  gym_id: string;
  name_ar: string;
  name_en: string;
  description_ar: string | null;
  description_en: string | null;
  duration_months: number;
  price: number;
  freeze_allowance_days: number;
  all_branches_access: boolean;
  sessions_count: number | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

export interface Subscription {
  id: string;
  member_id: string;
  plan_id: string;
  branch_id: string | null;
  status: SubscriptionStatus;
  start_date: string | null;
  end_date: string | null;
  frozen_days_used: number;
  sessions_remaining: number | null;
  price_paid: number;
  created_at: string;
}

export interface Payment {
  id: string;
  gym_id: string;
  subscription_id: string | null;
  member_id: string;
  branch_id: string | null;
  amount: number;
  method: PaymentMethod;
  provider: string | null;
  reference: string | null;
  receipt_number: string | null;
  recorded_by: string | null;
  created_at: string;
}

export interface CheckIn {
  id: string;
  member_id: string;
  branch_id: string | null;
  subscription_id: string | null;
  checked_in_at: string;
  recorded_by: string | null;
}

export interface Freeze {
  id: string;
  subscription_id: string;
  start_date: string;
  end_date: string | null;
  days: number;
  created_by: string | null;
  created_at: string;
}

export type FreezeRequestStatus = 'pending' | 'approved' | 'rejected';

export interface FreezeRequest {
  id: string;
  subscription_id: string;
  member_id: string;
  branch_id: string | null;
  days: number;
  note: string | null;
  status: FreezeRequestStatus;
  created_at: string;
  decided_at: string | null;
  decided_by: string | null;
}

export type NotificationChannel = 'in_app' | 'whatsapp' | 'sms';
export type NotificationStatus = 'simulated' | 'queued' | 'sent' | 'failed' | 'read';

export interface Notification {
  id: string;
  gym_id: string;
  member_id: string | null;
  subscription_id: string | null;
  channel: NotificationChannel;
  type: string;
  message_ar: string | null;
  message_en: string | null;
  status: NotificationStatus;
  created_at: string;
  read_at: string | null;
}

export interface Trainer {
  id: string;
  gym_id: string;
  branch_id: string | null;
  name_ar: string;
  name_en: string;
  specialty_ar: string | null;
  specialty_en: string | null;
  bio_ar: string | null;
  bio_en: string | null;
  photo_url: string | null;
  socials: Record<string, string>;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

export interface SiteContent {
  id: string;
  gym_id: string;
  key: string;
  content: Record<string, unknown>;
  updated_at: string;
}

export type StaffInviteStatus = 'pending' | 'accepted';

export interface StaffInvite {
  id: string;
  gym_id: string;
  email: string;
  full_name: string | null;
  branch_id: string | null;
  role: UserRole;
  status: StaffInviteStatus;
  created_by: string | null;
  created_at: string;
  accepted_at: string | null;
  accepted_user_id: string | null;
}

type Row<T> = { Row: T; Insert: Partial<T>; Update: Partial<T>; Relationships: [] };

export interface Database {
  public: {
    Tables: {
      profiles: Row<Profile>;
      gyms: Row<Gym>;
      branches: Row<Branch>;
      members: Row<Member>;
      plans: Row<Plan>;
      subscriptions: Row<Subscription>;
      payments: Row<Payment>;
      check_ins: Row<CheckIn>;
      freezes: Row<Freeze>;
      notifications: Row<Notification>;
      trainers: Row<Trainer>;
      site_content: Row<SiteContent>;
      freeze_requests: Row<FreezeRequest>;
      staff_invites: Row<StaffInvite>;
    };
    Views: Record<string, never>;
    Functions: {
      riyadh_today: { Args: Record<string, never>; Returns: string };
      create_subscription: {
        Args: {
          p_member_id: string;
          p_plan_id: string;
          p_branch_id: string;
          p_activate?: boolean;
          p_amount?: number | null;
          p_method?: PaymentMethod;
          p_receipt?: string | null;
        };
        Returns: Subscription;
      };
      activate_subscription: {
        Args: { p_subscription_id: string; p_amount?: number | null; p_method?: PaymentMethod; p_receipt?: string | null };
        Returns: Subscription;
      };
      renew_subscription: {
        Args: { p_subscription_id: string; p_amount?: number | null; p_method?: PaymentMethod; p_receipt?: string | null };
        Returns: Subscription;
      };
      freeze_subscription: { Args: { p_subscription_id: string; p_days: number }; Returns: Subscription };
      unfreeze_subscription: { Args: { p_subscription_id: string }; Returns: Subscription };
      upgrade_quote: { Args: { p_subscription_id: string; p_new_plan_id: string }; Returns: number };
      upgrade_subscription: {
        Args: { p_subscription_id: string; p_new_plan_id: string; p_amount?: number | null; p_method?: PaymentMethod; p_receipt?: string | null };
        Returns: Subscription;
      };
      expire_due_subscriptions: { Args: Record<string, never>; Returns: number };
    };
    Enums: {
      user_role: UserRole;
      subscription_status: SubscriptionStatus;
      payment_method: PaymentMethod;
      gender_type: Gender;
    };
    CompositeTypes: Record<string, never>;
  };
}
