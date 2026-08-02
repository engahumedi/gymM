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

export type Profile = {
  id: string;
  gym_id: string | null;
  role: UserRole;
  branch_id: string | null;
  member_id: string | null;
  full_name: string | null;
  created_at: string;
}

// Which calendar the gym leads with in the UI (migration 0019). Storage and
// every date calculation stay Gregorian regardless.
export type GymCalendar = 'hijri' | 'gregorian';

export type Gym = {
  id: string;
  name_ar: string;
  name_en: string;
  logo_url: string | null;
  primary_color: string;
  secondary_color: string;
  contact_email: string | null;
  contact_phone: string | null;
  social_links: Record<string, string>;
  calendar: GymCalendar;
  created_at: string;
}

export type Branch = {
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

export type Member = {
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

// The derived state shown in badges/filters, computed in SQL by the
// members_overview view with the same rules as src/lib/subscriptionStatus.ts.
export type MemberDisplayStatus =
  | 'active'
  | 'expiring'
  | 'expired'
  | 'frozen'
  | 'pending'
  | 'none';

// View: one row per member joined to their CURRENT subscription (migration
// 0015). security_invoker keeps RLS identical to `members`, so it can be
// searched / filtered / paginated on the server.
export type MemberOverview = {
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
  user_id: string | null;
  created_at: string;
  sub_id: string | null;
  plan_id: string | null;
  sub_status: SubscriptionStatus | null;
  start_date: string | null;
  end_date: string | null;
  sessions_remaining: number | null;
  frozen_days_used: number | null;
  display_status: MemberDisplayStatus;
}

export type Plan = {
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

export type Subscription = {
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

export type Payment = {
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

export type CheckIn = {
  id: string;
  member_id: string;
  branch_id: string | null;
  subscription_id: string | null;
  checked_in_at: string;
  recorded_by: string | null;
}

export type Freeze = {
  id: string;
  subscription_id: string;
  start_date: string;
  end_date: string | null;
  days: number;
  created_by: string | null;
  created_at: string;
}

export type FreezeRequestStatus = 'pending' | 'approved' | 'rejected';

export type FreezeRequest = {
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

export type Notification = {
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

export type Trainer = {
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

export type SiteContent = {
  id: string;
  gym_id: string;
  key: string;
  content: Record<string, unknown>;
  updated_at: string;
}

export type PasswordRequestStatus = 'pending' | 'approved' | 'rejected';

export type PasswordChangeRequest = {
  id: string;
  gym_id: string | null;
  user_id: string;
  member_id: string | null;
  branch_id: string | null;
  requested_email: string;
  requested_name: string | null;
  status: PasswordRequestStatus;
  created_at: string;
  decided_at: string | null;
  decided_by: string | null;
}

export type AuditEntry = {
  id: number;
  gym_id: string | null;
  actor: string | null;
  actor_name: string | null;
  action: string;
  entity: string | null;
  entity_id: string | null;
  meta: Record<string, unknown>;
  created_at: string;
}

export type StaffInviteStatus = 'pending' | 'accepted';

export type StaffInvite = {
  id: string;
  gym_id: string;
  email: string;
  full_name: string | null;
  branch_id: string | null;
  role: UserRole;
  status: StaffInviteStatus;
  // Secret handed to the invitee (migration 0014): the sign-up trigger promotes
  // the new user only on a token + email + not-expired match.
  token: string;
  expires_at: string;
  created_by: string | null;
  created_at: string;
  accepted_at: string | null;
  accepted_user_id: string | null;
}

// Exactly what analytics_overview() returns. Numerics arrive as JSON strings
// often enough that the api layer coerces them; hence `unknown` on the numbers.
export type AnalyticsOverviewRaw = {
  kpis?: Record<string, unknown>;
  revenue_by_month?: { month?: string; total?: unknown; branches?: Record<string, unknown> }[];
  member_growth?: { month?: string; count?: unknown }[];
  plan_popularity?: { plan_id?: string; count?: unknown }[];
  heatmap?: { dow?: unknown; hour?: unknown; count?: unknown }[];
};

// Exactly what monthly_report() returns (migration 0017). Same story as above:
// sums arrive as JSON numbers or strings depending on the driver, so every
// numeric is `unknown` here and coerced once in the api layer.
export type MonthlyReportRaw = {
  calendar?: string;
  period_from?: string;
  period_to?: string;
  month?: string;
  prev_month?: string;
  revenue?: unknown;
  revenue_prev?: unknown;
  payments_count?: unknown;
  by_branch?: { branch_id?: string | null; total?: unknown; count?: unknown }[];
  by_plan?: { plan_id?: string | null; total?: unknown; count?: unknown }[];
  by_method?: { method?: string | null; total?: unknown; count?: unknown }[];
  new_members?: unknown;
  active_members?: unknown;
  generated_at?: string;
};

type Row<T> = { Row: T; Insert: Partial<T>; Update: Partial<T>; Relationships: [] };

export type Database = {
  // postgrest-js keys its typing behaviour off this marker (as emitted by
  // `supabase gen types`); without it every Insert/Update collapses to `never`.
  __InternalSupabase: { PostgrestVersion: '14.5' };
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
      password_change_requests: Row<PasswordChangeRequest>;
      audit_log: Row<AuditEntry>;
    };
    Views: {
      members_overview: { Row: MemberOverview; Relationships: [] };
    };
    Functions: {
      riyadh_today: { Args: Record<string, never>; Returns: string };
      analytics_overview: {
        Args: { p_from: string; p_to: string; p_branch?: string | null };
        Returns: AnalyticsOverviewRaw;
      };
      // Sign in by phone (migration 0017). Callable by `anon` — it is the step
      // BEFORE a session exists. Returns the account's email only when the
      // supplied password already verifies against it, else null.
      login_email_for_phone: {
        Args: { p_phone: string; p_password: string };
        Returns: string | null;
      };
      // The month's money in one RLS-scoped call (migration 0017). p_month is
      // any date inside the month; the function truncates it.
      monthly_report: {
        Args: { p_month: string; p_branch?: string | null };
        Returns: MonthlyReportRaw;
      };
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
      record_check_in: { Args: { p_member_id: string; p_branch_id: string }; Returns: CheckIn };
      record_payment: {
        Args: {
          p_member_id: string;
          p_subscription_id: string | null;
          p_amount: number;
          p_method: PaymentMethod;
          p_receipt?: string | null;
        };
        Returns: Payment;
      };
      public_join: {
        Args: {
          p_full_name: string;
          p_phone: string;
          p_national_id: string;
          p_gender: Gender | null;
          p_plan_id: string;
          p_branch_id: string;
        };
        Returns: string;
      };
      request_freeze: {
        Args: { p_subscription_id: string; p_days: number; p_note?: string | null };
        Returns: FreezeRequest;
      };
      approve_freeze_request: { Args: { p_request_id: string }; Returns: FreezeRequest };
      reject_freeze_request: { Args: { p_request_id: string }; Returns: FreezeRequest };
      request_password_change: { Args: { p_email: string; p_new_password: string }; Returns: undefined };
      approve_password_change: { Args: { p_request_id: string }; Returns: PasswordChangeRequest };
      reject_password_change: { Args: { p_request_id: string }; Returns: PasswordChangeRequest };
      staff_set_member_password: {
        Args: { p_member_id: string; p_new_password: string };
        Returns: undefined;
      };
      // The whole marketing site in one call (migration 0016) — the public
      // pages used to make five separate round trips for this.
      public_site_data: {
        Args: Record<string, never>;
        Returns: {
          gym: Gym | null;
          plans: Plan[];
          branches: Branch[];
          trainers: Trainer[];
          content: Record<string, Record<string, unknown>>;
        };
      };
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
