// Hand-written database types mirroring supabase/migrations. Kept minimal for
// Phase 2 (profiles/gyms/branches) and extended as later phases add queries.
// Can be regenerated later with `supabase gen types typescript`.

export type UserRole = 'super_admin' | 'reception' | 'member';
export type SubscriptionStatus =
  | 'pending'
  | 'active'
  | 'frozen'
  | 'expired'
  | 'cancelled';

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

// Minimal typing surface for supabase-js. Tables are typed loosely for now;
// tighten per-table Row/Insert/Update shapes as queries are added by phase.
export interface Database {
  public: {
    Tables: {
      profiles: { Row: Profile; Insert: Partial<Profile>; Update: Partial<Profile> };
      gyms: { Row: Gym; Insert: Partial<Gym>; Update: Partial<Gym> };
      branches: { Row: Branch; Insert: Partial<Branch>; Update: Partial<Branch> };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      user_role: UserRole;
      subscription_status: SubscriptionStatus;
    };
  };
}
