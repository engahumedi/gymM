-- =============================================================================
-- 0001_schema.sql — Gym Management System core schema
-- Extensions, enums, tables, indexes, triggers. RLS is defined in 0002_rls.sql.
-- =============================================================================

create extension if not exists "pgcrypto";      -- gen_random_uuid()

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
do $$ begin
  create type user_role as enum ('super_admin', 'reception', 'member');
exception when duplicate_object then null; end $$;

do $$ begin
  create type gender_type as enum ('male', 'female');
exception when duplicate_object then null; end $$;

do $$ begin
  create type subscription_status as enum ('pending', 'active', 'frozen', 'expired', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type payment_method as enum ('cash', 'mada', 'online', 'other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type notification_channel as enum ('in_app', 'whatsapp', 'sms');
exception when duplicate_object then null; end $$;

do $$ begin
  create type notification_status as enum ('simulated', 'queued', 'sent', 'failed', 'read');
exception when duplicate_object then null; end $$;

-- -----------------------------------------------------------------------------
-- gyms — white-label branding / settings (one row per gym brand)
-- -----------------------------------------------------------------------------
create table if not exists public.gyms (
  id              uuid primary key default gen_random_uuid(),
  name_ar         text not null,
  name_en         text not null,
  logo_url        text,
  primary_color   text not null default '#e11d2a',
  secondary_color text not null default '#0f172a',
  contact_email   text,
  contact_phone   text,
  social_links    jsonb not null default '{}'::jsonb,   -- {instagram, twitter, tiktok, whatsapp}
  created_at      timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- branches
-- -----------------------------------------------------------------------------
create table if not exists public.branches (
  id            uuid primary key default gen_random_uuid(),
  gym_id        uuid not null references public.gyms(id) on delete cascade,
  name_ar       text not null,
  name_en       text not null,
  address_ar    text,
  address_en    text,
  city          text,
  phone         text,
  map_url       text,
  working_hours jsonb not null default '{}'::jsonb,      -- {sun:{open,close}, ...}
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);
create index if not exists idx_branches_gym on public.branches(gym_id);

-- -----------------------------------------------------------------------------
-- members — physical people; phone is the primary human identifier
-- -----------------------------------------------------------------------------
create table if not exists public.members (
  id                      uuid primary key default gen_random_uuid(),
  gym_id                  uuid not null references public.gyms(id) on delete cascade,
  branch_id               uuid references public.branches(id) on delete set null,
  member_code             text,                          -- 'M00001', filled by trigger
  full_name               text not null,
  phone                   text not null,
  gender                  gender_type,
  dob                     date,
  photo_url               text,
  emergency_contact_name  text,
  emergency_contact_phone text,
  notes                   text,
  user_id                 uuid references auth.users(id) on delete set null, -- member portal login
  created_at              timestamptz not null default now(),
  constraint members_phone_unique unique (gym_id, phone),
  constraint members_phone_saudi check (phone ~ '^(?:\+9665|05)[0-9]{8}$')
);
create index if not exists idx_members_gym on public.members(gym_id);
create index if not exists idx_members_branch on public.members(branch_id);
create index if not exists idx_members_user on public.members(user_id);
create index if not exists idx_members_code on public.members(member_code);

-- Per-gym human-readable member code via a sequence + trigger.
create sequence if not exists public.member_code_seq;
create or replace function public.set_member_code() returns trigger
language plpgsql as $$
begin
  if new.member_code is null then
    new.member_code := 'M' || lpad(nextval('public.member_code_seq')::text, 5, '0');
  end if;
  return new;
end $$;
drop trigger if exists trg_set_member_code on public.members;
create trigger trg_set_member_code before insert on public.members
  for each row execute function public.set_member_code();

-- -----------------------------------------------------------------------------
-- profiles — auth/role bridge (profiles.id = auth.users.id)
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  gym_id     uuid references public.gyms(id) on delete cascade,
  role       user_role not null default 'member',
  branch_id  uuid references public.branches(id) on delete set null,   -- reception scope
  member_id  uuid references public.members(id) on delete set null,    -- member link
  full_name  text,
  created_at timestamptz not null default now()
);
create index if not exists idx_profiles_role on public.profiles(role);
create index if not exists idx_profiles_branch on public.profiles(branch_id);

-- -----------------------------------------------------------------------------
-- plans
-- -----------------------------------------------------------------------------
create table if not exists public.plans (
  id                   uuid primary key default gen_random_uuid(),
  gym_id               uuid not null references public.gyms(id) on delete cascade,
  name_ar              text not null,
  name_en              text not null,
  description_ar       text,
  description_en       text,
  duration_months      int not null check (duration_months in (1, 3, 6, 12)),
  price                numeric(10,2) not null check (price >= 0),
  freeze_allowance_days int not null default 0 check (freeze_allowance_days >= 0),
  all_branches_access  boolean not null default false,   -- false = single-branch plan
  sessions_count       int check (sessions_count is null or sessions_count > 0), -- null = unlimited
  is_active            boolean not null default true,
  sort_order           int not null default 0,
  created_at           timestamptz not null default now()
);
create index if not exists idx_plans_gym on public.plans(gym_id);

-- -----------------------------------------------------------------------------
-- subscriptions
-- -----------------------------------------------------------------------------
create table if not exists public.subscriptions (
  id                uuid primary key default gen_random_uuid(),
  member_id         uuid not null references public.members(id) on delete cascade,
  plan_id           uuid not null references public.plans(id) on delete restrict,
  branch_id         uuid references public.branches(id) on delete set null,
  status            subscription_status not null default 'pending',
  start_date        date,
  end_date          date,
  frozen_days_used  int not null default 0 check (frozen_days_used >= 0),
  sessions_remaining int,                               -- null = unlimited
  price_paid        numeric(10,2) not null default 0,
  created_at        timestamptz not null default now()
);
create index if not exists idx_subs_member on public.subscriptions(member_id);
create index if not exists idx_subs_branch on public.subscriptions(branch_id);
create index if not exists idx_subs_status on public.subscriptions(status);
create index if not exists idx_subs_end on public.subscriptions(end_date);

-- -----------------------------------------------------------------------------
-- payments — gateway-agnostic (manual now, online-ready later)
-- -----------------------------------------------------------------------------
create table if not exists public.payments (
  id              uuid primary key default gen_random_uuid(),
  gym_id          uuid not null references public.gyms(id) on delete cascade,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  member_id       uuid not null references public.members(id) on delete cascade,
  branch_id       uuid references public.branches(id) on delete set null,
  amount          numeric(10,2) not null check (amount >= 0),
  method          payment_method not null default 'cash',
  provider        text,                                 -- e.g. 'moyasar' (future)
  reference       text,                                 -- gateway ref (future)
  receipt_number  text,
  recorded_by     uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  constraint payments_receipt_unique unique (gym_id, receipt_number)
);
create index if not exists idx_payments_member on public.payments(member_id);
create index if not exists idx_payments_branch on public.payments(branch_id);
create index if not exists idx_payments_sub on public.payments(subscription_id);
create index if not exists idx_payments_created on public.payments(created_at);

-- -----------------------------------------------------------------------------
-- check_ins
-- -----------------------------------------------------------------------------
create table if not exists public.check_ins (
  id              uuid primary key default gen_random_uuid(),
  member_id       uuid not null references public.members(id) on delete cascade,
  branch_id       uuid references public.branches(id) on delete set null,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  checked_in_at   timestamptz not null default now(),
  recorded_by     uuid references public.profiles(id) on delete set null
);
create index if not exists idx_checkins_member on public.check_ins(member_id);
create index if not exists idx_checkins_branch on public.check_ins(branch_id);
create index if not exists idx_checkins_at on public.check_ins(checked_in_at);

-- -----------------------------------------------------------------------------
-- freezes
-- -----------------------------------------------------------------------------
create table if not exists public.freezes (
  id              uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.subscriptions(id) on delete cascade,
  start_date      date not null,
  end_date        date,
  days            int not null check (days > 0),
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now()
);
create index if not exists idx_freezes_sub on public.freezes(subscription_id);

-- -----------------------------------------------------------------------------
-- notifications — also the dev outbox (status = 'simulated')
-- -----------------------------------------------------------------------------
create table if not exists public.notifications (
  id              uuid primary key default gen_random_uuid(),
  gym_id          uuid not null references public.gyms(id) on delete cascade,
  member_id       uuid references public.members(id) on delete cascade,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  channel         notification_channel not null default 'in_app',
  type            text not null,                        -- expiring_7 | expiring_3 | expiring_1 | expired | pending_activation
  message_ar      text,
  message_en      text,
  status          notification_status not null default 'simulated',
  created_at      timestamptz not null default now(),
  read_at         timestamptz
);
create index if not exists idx_notif_member on public.notifications(member_id);
create index if not exists idx_notif_status on public.notifications(status);
create index if not exists idx_notif_created on public.notifications(created_at);

-- -----------------------------------------------------------------------------
-- trainers — public marketing content
-- -----------------------------------------------------------------------------
create table if not exists public.trainers (
  id           uuid primary key default gen_random_uuid(),
  gym_id       uuid not null references public.gyms(id) on delete cascade,
  branch_id    uuid references public.branches(id) on delete set null,
  name_ar      text not null,
  name_en      text not null,
  specialty_ar text,
  specialty_en text,
  bio_ar       text,
  bio_en       text,
  photo_url    text,
  socials      jsonb not null default '{}'::jsonb,
  sort_order   int not null default 0,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now()
);
create index if not exists idx_trainers_gym on public.trainers(gym_id);

-- -----------------------------------------------------------------------------
-- site_content — generic key → JSONB store for hero, testimonials, FAQ, gallery
-- -----------------------------------------------------------------------------
create table if not exists public.site_content (
  id         uuid primary key default gen_random_uuid(),
  gym_id     uuid not null references public.gyms(id) on delete cascade,
  key        text not null,                             -- 'hero' | 'testimonials' | 'faq' | 'gallery' | 'facilities'
  content    jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint site_content_key_unique unique (gym_id, key)
);
create index if not exists idx_site_content_gym on public.site_content(gym_id);
