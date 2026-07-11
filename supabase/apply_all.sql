-- =============================================================================
-- apply_all.sql — paste into the Supabase SQL Editor to set up everything:
-- schema + RLS + storage/auth + subscription/checkin/payment/notification
-- functions (incl. pg_cron daily job) + demo seed data.
-- Generated from migrations/*.sql + seed.sql. Safe to re-run (seed truncates).
-- =============================================================================

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>  supabase/migrations/0001_schema.sql  <<<<<<<<<<<<<<<<<<<<<<<<<<<<
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


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>  supabase/migrations/0002_rls.sql  <<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- =============================================================================
-- 0002_rls.sql — Row Level Security: helper functions + policies
-- Deny-by-default: RLS is enabled on every table; absence of a policy = no access.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Helper functions (SECURITY DEFINER so they can read profiles without
-- triggering the profiles RLS policies recursively).
-- -----------------------------------------------------------------------------
create or replace function public.current_role_name() returns user_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.current_gym_id() returns uuid
language sql stable security definer set search_path = public as $$
  select gym_id from public.profiles where id = auth.uid();
$$;

create or replace function public.current_branch_id() returns uuid
language sql stable security definer set search_path = public as $$
  select branch_id from public.profiles where id = auth.uid();
$$;

create or replace function public.current_member_id() returns uuid
language sql stable security definer set search_path = public as $$
  select member_id from public.profiles where id = auth.uid();
$$;

create or replace function public.is_super_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'super_admin' from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.is_reception() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'reception' from public.profiles where id = auth.uid()), false);
$$;

-- -----------------------------------------------------------------------------
-- Enable RLS on every table
-- -----------------------------------------------------------------------------
alter table public.gyms          enable row level security;
alter table public.branches      enable row level security;
alter table public.profiles      enable row level security;
alter table public.members       enable row level security;
alter table public.plans         enable row level security;
alter table public.subscriptions enable row level security;
alter table public.payments      enable row level security;
alter table public.check_ins     enable row level security;
alter table public.freezes       enable row level security;
alter table public.notifications enable row level security;
alter table public.trainers      enable row level security;
alter table public.site_content  enable row level security;

-- =============================================================================
-- PUBLIC MARKETING TABLES — readable by anon (public website), writable by admin
-- =============================================================================

-- gyms
drop policy if exists gyms_public_read on public.gyms;
create policy gyms_public_read on public.gyms
  for select using (true);
drop policy if exists gyms_admin_write on public.gyms;
create policy gyms_admin_write on public.gyms
  for all using (is_super_admin() and id = current_gym_id())
  with check (is_super_admin() and id = current_gym_id());

-- branches
drop policy if exists branches_public_read on public.branches;
create policy branches_public_read on public.branches
  for select using (true);
drop policy if exists branches_admin_write on public.branches;
create policy branches_admin_write on public.branches
  for all using (is_super_admin() and gym_id = current_gym_id())
  with check (is_super_admin() and gym_id = current_gym_id());

-- plans
drop policy if exists plans_public_read on public.plans;
create policy plans_public_read on public.plans
  for select using (true);
drop policy if exists plans_admin_write on public.plans;
create policy plans_admin_write on public.plans
  for all using (is_super_admin() and gym_id = current_gym_id())
  with check (is_super_admin() and gym_id = current_gym_id());

-- trainers
drop policy if exists trainers_public_read on public.trainers;
create policy trainers_public_read on public.trainers
  for select using (true);
drop policy if exists trainers_admin_write on public.trainers;
create policy trainers_admin_write on public.trainers
  for all using (is_super_admin() and gym_id = current_gym_id())
  with check (is_super_admin() and gym_id = current_gym_id());

-- site_content
drop policy if exists site_content_public_read on public.site_content;
create policy site_content_public_read on public.site_content
  for select using (true);
drop policy if exists site_content_admin_write on public.site_content;
create policy site_content_admin_write on public.site_content
  for all using (is_super_admin() and gym_id = current_gym_id())
  with check (is_super_admin() and gym_id = current_gym_id());

-- =============================================================================
-- PROFILES
-- =============================================================================
-- Everyone can read their own profile; super admin reads all in their gym.
drop policy if exists profiles_self_read on public.profiles;
create policy profiles_self_read on public.profiles
  for select using (id = auth.uid() or (is_super_admin() and gym_id = current_gym_id()));

-- Users may update their own non-privileged fields (full_name). Role/branch
-- changes are performed by super admin only.
drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_update on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists profiles_admin_all on public.profiles;
create policy profiles_admin_all on public.profiles
  for all using (is_super_admin() and gym_id = current_gym_id())
  with check (is_super_admin() and gym_id = current_gym_id());

-- =============================================================================
-- MEMBERS
-- =============================================================================
-- Super admin: full access in gym. Reception: their branch. Member: own row.
drop policy if exists members_read on public.members;
create policy members_read on public.members
  for select using (
    (is_super_admin() and gym_id = current_gym_id())
    or (is_reception() and branch_id = current_branch_id())
    or (id = current_member_id())
  );

drop policy if exists members_admin_write on public.members;
create policy members_admin_write on public.members
  for all using (is_super_admin() and gym_id = current_gym_id())
  with check (is_super_admin() and gym_id = current_gym_id());

-- Reception can create/update members in their own branch.
drop policy if exists members_reception_insert on public.members;
create policy members_reception_insert on public.members
  for insert with check (is_reception() and branch_id = current_branch_id() and gym_id = current_gym_id());

drop policy if exists members_reception_update on public.members;
create policy members_reception_update on public.members
  for update using (is_reception() and branch_id = current_branch_id())
  with check (is_reception() and branch_id = current_branch_id());

-- =============================================================================
-- SUBSCRIPTIONS
-- =============================================================================
drop policy if exists subs_read on public.subscriptions;
create policy subs_read on public.subscriptions
  for select using (
    (is_super_admin() and exists (select 1 from public.members m where m.id = member_id and m.gym_id = current_gym_id()))
    or (is_reception() and branch_id = current_branch_id())
    or (member_id = current_member_id())
  );

drop policy if exists subs_admin_write on public.subscriptions;
create policy subs_admin_write on public.subscriptions
  for all using (is_super_admin() and exists (select 1 from public.members m where m.id = member_id and m.gym_id = current_gym_id()))
  with check (is_super_admin() and exists (select 1 from public.members m where m.id = member_id and m.gym_id = current_gym_id()));

drop policy if exists subs_reception_insert on public.subscriptions;
create policy subs_reception_insert on public.subscriptions
  for insert with check (is_reception() and branch_id = current_branch_id());

drop policy if exists subs_reception_update on public.subscriptions;
create policy subs_reception_update on public.subscriptions
  for update using (is_reception() and branch_id = current_branch_id())
  with check (is_reception() and branch_id = current_branch_id());

-- Member may create a PENDING renewal request for their own membership only.
drop policy if exists subs_member_request on public.subscriptions;
create policy subs_member_request on public.subscriptions
  for insert with check (member_id = current_member_id() and status = 'pending');

-- =============================================================================
-- PAYMENTS
-- =============================================================================
drop policy if exists payments_read on public.payments;
create policy payments_read on public.payments
  for select using (
    (is_super_admin() and gym_id = current_gym_id())
    or (is_reception() and branch_id = current_branch_id())
    or (member_id = current_member_id())
  );

drop policy if exists payments_admin_write on public.payments;
create policy payments_admin_write on public.payments
  for all using (is_super_admin() and gym_id = current_gym_id())
  with check (is_super_admin() and gym_id = current_gym_id());

drop policy if exists payments_reception_insert on public.payments;
create policy payments_reception_insert on public.payments
  for insert with check (is_reception() and branch_id = current_branch_id() and gym_id = current_gym_id());

-- =============================================================================
-- CHECK-INS
-- =============================================================================
drop policy if exists checkins_read on public.check_ins;
create policy checkins_read on public.check_ins
  for select using (
    (is_super_admin() and exists (select 1 from public.members m where m.id = member_id and m.gym_id = current_gym_id()))
    or (is_reception() and branch_id = current_branch_id())
    or (member_id = current_member_id())
  );

drop policy if exists checkins_staff_insert on public.check_ins;
create policy checkins_staff_insert on public.check_ins
  for insert with check (
    is_super_admin()
    or (is_reception() and branch_id = current_branch_id())
  );

-- =============================================================================
-- FREEZES
-- =============================================================================
drop policy if exists freezes_read on public.freezes;
create policy freezes_read on public.freezes
  for select using (
    exists (
      select 1 from public.subscriptions s
      where s.id = subscription_id
        and (
          (is_super_admin())
          or (is_reception() and s.branch_id = current_branch_id())
          or (s.member_id = current_member_id())
        )
    )
  );

drop policy if exists freezes_staff_write on public.freezes;
create policy freezes_staff_write on public.freezes
  for all using (
    is_super_admin()
    or exists (select 1 from public.subscriptions s where s.id = subscription_id and is_reception() and s.branch_id = current_branch_id())
  )
  with check (
    is_super_admin()
    or exists (select 1 from public.subscriptions s where s.id = subscription_id and is_reception() and s.branch_id = current_branch_id())
  );

-- =============================================================================
-- NOTIFICATIONS
-- =============================================================================
drop policy if exists notif_read on public.notifications;
create policy notif_read on public.notifications
  for select using (
    (is_super_admin() and gym_id = current_gym_id())
    or (is_reception() and exists (select 1 from public.members m where m.id = member_id and m.branch_id = current_branch_id()))
    or (member_id = current_member_id())
  );

-- Members may mark their own notifications read (update).
drop policy if exists notif_member_update on public.notifications;
create policy notif_member_update on public.notifications
  for update using (member_id = current_member_id())
  with check (member_id = current_member_id());

drop policy if exists notif_admin_write on public.notifications;
create policy notif_admin_write on public.notifications
  for all using (is_super_admin() and gym_id = current_gym_id())
  with check (is_super_admin() and gym_id = current_gym_id());


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>  supabase/migrations/0003_storage_and_auth.sql  <<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- =============================================================================
-- 0003_storage_and_auth.sql — Storage buckets + auth->profiles bootstrap
-- Business-logic RPCs (renew / freeze / upgrade / expire / notifications) are
-- added in later phases (3 and 5); this file wires the plumbing they need.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Storage buckets
--   member-photos : private, staff-managed member photos
--   public-assets : public, gym logos / trainer photos / gallery
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('member-photos', 'member-photos', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('public-assets', 'public-assets', true)
on conflict (id) do nothing;

-- Anyone can read public assets.
drop policy if exists public_assets_read on storage.objects;
create policy public_assets_read on storage.objects
  for select using (bucket_id = 'public-assets');

-- Only super admins may write public assets.
drop policy if exists public_assets_admin_write on storage.objects;
create policy public_assets_admin_write on storage.objects
  for all to authenticated
  using (bucket_id = 'public-assets' and public.is_super_admin())
  with check (bucket_id = 'public-assets' and public.is_super_admin());

-- Member photos: readable by any authenticated staff/member; written by staff.
drop policy if exists member_photos_read on storage.objects;
create policy member_photos_read on storage.objects
  for select to authenticated
  using (bucket_id = 'member-photos');

drop policy if exists member_photos_staff_write on storage.objects;
create policy member_photos_staff_write on storage.objects
  for all to authenticated
  using (bucket_id = 'member-photos' and (public.is_super_admin() or public.is_reception()))
  with check (bucket_id = 'member-photos' and (public.is_super_admin() or public.is_reception()));

-- -----------------------------------------------------------------------------
-- Auto-create a profile row when a new auth user signs up.
-- New public sign-ups default to role 'member'. Staff roles are assigned by a
-- super admin afterwards (or by the seed script). gym_id defaults to the single
-- gym when exactly one exists, so member self-sign-up "just works".
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  only_gym uuid;
begin
  select id into only_gym from public.gyms limit 1;
  insert into public.profiles (id, gym_id, role, full_name)
  values (
    new.id,
    only_gym,
    'member',
    coalesce(new.raw_user_meta_data->>'full_name', new.email)
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>  supabase/migrations/0004_subscription_functions.sql  <<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- =============================================================================
-- 0004_subscription_functions.sql — subscription lifecycle business logic
-- Centralised in Postgres RPCs (SECURITY INVOKER, so RLS still applies) to
-- guarantee correct, timezone-safe (Asia/Riyadh) math regardless of the client.
-- =============================================================================

-- "Today" in the gym's timezone — the source of truth for expiry math.
create or replace function public.riyadh_today() returns date
language sql stable as $$
  select (now() at time zone 'Asia/Riyadh')::date;
$$;

-- -----------------------------------------------------------------------------
-- create_subscription — new subscription for a member. Either left 'pending'
-- (public Join Now / to be activated by reception) or activated immediately
-- with a payment recorded.
-- -----------------------------------------------------------------------------
create or replace function public.create_subscription(
  p_member_id uuid,
  p_plan_id   uuid,
  p_branch_id uuid,
  p_activate  boolean default false,
  p_amount    numeric default null,
  p_method    payment_method default 'cash',
  p_receipt   text default null
) returns public.subscriptions
language plpgsql security invoker as $$
declare
  v_plan  public.plans;
  v_sub   public.subscriptions;
  v_today date := public.riyadh_today();
  v_gym   uuid;
begin
  select * into v_plan from public.plans where id = p_plan_id;
  if not found then raise exception 'plan_not_found'; end if;
  select gym_id into v_gym from public.members where id = p_member_id;
  if v_gym is null then raise exception 'member_not_found'; end if;

  insert into public.subscriptions (member_id, plan_id, branch_id, status, start_date, end_date, sessions_remaining, price_paid)
  values (
    p_member_id, p_plan_id, p_branch_id,
    case when p_activate then 'active'::subscription_status else 'pending'::subscription_status end,
    case when p_activate then v_today end,
    case when p_activate then (v_today + make_interval(months => v_plan.duration_months))::date end,
    v_plan.sessions_count,
    case when p_activate then coalesce(p_amount, v_plan.price) else 0 end
  )
  returning * into v_sub;

  if p_activate then
    insert into public.payments (gym_id, subscription_id, member_id, branch_id, amount, method, receipt_number, recorded_by)
    values (v_gym, v_sub.id, p_member_id, p_branch_id, coalesce(p_amount, v_plan.price), p_method, p_receipt, auth.uid());
  end if;

  return v_sub;
end $$;

-- -----------------------------------------------------------------------------
-- activate_subscription — pending → active (reception confirms after payment).
-- -----------------------------------------------------------------------------
create or replace function public.activate_subscription(
  p_subscription_id uuid,
  p_amount  numeric default null,
  p_method  payment_method default 'cash',
  p_receipt text default null
) returns public.subscriptions
language plpgsql security invoker as $$
declare
  v_plan  public.plans;
  v_sub   public.subscriptions;
  v_today date := public.riyadh_today();
  v_gym   uuid;
begin
  select * into v_sub from public.subscriptions where id = p_subscription_id;
  if not found then raise exception 'subscription_not_found'; end if;
  if v_sub.status <> 'pending' then raise exception 'not_pending'; end if;
  select * into v_plan from public.plans where id = v_sub.plan_id;
  select gym_id into v_gym from public.members where id = v_sub.member_id;

  update public.subscriptions
     set status = 'active',
         start_date = v_today,
         end_date = (v_today + make_interval(months => v_plan.duration_months))::date,
         sessions_remaining = v_plan.sessions_count,
         price_paid = coalesce(p_amount, v_plan.price)
   where id = p_subscription_id
   returning * into v_sub;

  insert into public.payments (gym_id, subscription_id, member_id, branch_id, amount, method, receipt_number, recorded_by)
  values (v_gym, v_sub.id, v_sub.member_id, v_sub.branch_id, coalesce(p_amount, v_plan.price), p_method, p_receipt, auth.uid());

  return v_sub;
end $$;

-- -----------------------------------------------------------------------------
-- renew_subscription — extend from expiry if still valid, else from today.
-- -----------------------------------------------------------------------------
create or replace function public.renew_subscription(
  p_subscription_id uuid,
  p_amount  numeric default null,
  p_method  payment_method default 'cash',
  p_receipt text default null
) returns public.subscriptions
language plpgsql security invoker as $$
declare
  v_plan  public.plans;
  v_sub   public.subscriptions;
  v_today date := public.riyadh_today();
  v_base  date;
  v_gym   uuid;
begin
  select * into v_sub from public.subscriptions where id = p_subscription_id;
  if not found then raise exception 'subscription_not_found'; end if;
  if v_sub.status = 'cancelled' then raise exception 'cannot_renew_cancelled'; end if;
  select * into v_plan from public.plans where id = v_sub.plan_id;
  select gym_id into v_gym from public.members where id = v_sub.member_id;

  -- Extend from the later of (current expiry) and (today): keeps unused days.
  v_base := case
    when v_sub.end_date is not null and v_sub.end_date >= v_today then v_sub.end_date
    else v_today
  end;

  update public.subscriptions
     set end_date = (v_base + make_interval(months => v_plan.duration_months))::date,
         status = 'active',
         start_date = coalesce(v_sub.start_date, v_today),
         price_paid = v_sub.price_paid + coalesce(p_amount, v_plan.price),
         sessions_remaining = case
           when v_plan.sessions_count is null then null
           else coalesce(v_sub.sessions_remaining, 0) + v_plan.sessions_count
         end
   where id = p_subscription_id
   returning * into v_sub;

  insert into public.payments (gym_id, subscription_id, member_id, branch_id, amount, method, receipt_number, recorded_by)
  values (v_gym, v_sub.id, v_sub.member_id, v_sub.branch_id, coalesce(p_amount, v_plan.price), p_method, p_receipt, auth.uid());

  return v_sub;
end $$;

-- -----------------------------------------------------------------------------
-- freeze_subscription — pause an active subscription for p_days, extending the
-- expiry by the same days, capped by the plan's freeze allowance.
-- -----------------------------------------------------------------------------
create or replace function public.freeze_subscription(
  p_subscription_id uuid,
  p_days int
) returns public.subscriptions
language plpgsql security invoker as $$
declare
  v_plan public.plans;
  v_sub  public.subscriptions;
  v_today date := public.riyadh_today();
begin
  if p_days is null or p_days <= 0 then raise exception 'invalid_days'; end if;
  select * into v_sub from public.subscriptions where id = p_subscription_id;
  if not found then raise exception 'subscription_not_found'; end if;
  if v_sub.status <> 'active' then raise exception 'not_active'; end if;
  select * into v_plan from public.plans where id = v_sub.plan_id;
  if v_sub.frozen_days_used + p_days > v_plan.freeze_allowance_days then
    raise exception 'freeze_cap_exceeded';
  end if;

  update public.subscriptions
     set status = 'frozen',
         end_date = v_sub.end_date + p_days,
         frozen_days_used = v_sub.frozen_days_used + p_days
   where id = p_subscription_id
   returning * into v_sub;

  insert into public.freezes (subscription_id, start_date, end_date, days, created_by)
  values (p_subscription_id, v_today, v_today + p_days, p_days, auth.uid());

  return v_sub;
end $$;

-- -----------------------------------------------------------------------------
-- unfreeze_subscription — frozen → active (expiry was already extended).
-- -----------------------------------------------------------------------------
create or replace function public.unfreeze_subscription(p_subscription_id uuid)
returns public.subscriptions
language plpgsql security invoker as $$
declare v_sub public.subscriptions;
begin
  select * into v_sub from public.subscriptions where id = p_subscription_id;
  if not found then raise exception 'subscription_not_found'; end if;
  if v_sub.status <> 'frozen' then raise exception 'not_frozen'; end if;
  update public.subscriptions set status = 'active'
   where id = p_subscription_id returning * into v_sub;
  return v_sub;
end $$;

-- -----------------------------------------------------------------------------
-- upgrade_quote — prorated amount due to switch to a new plan (no side effects).
-- Credit = remaining days on the current plan × current plan daily rate.
-- -----------------------------------------------------------------------------
create or replace function public.upgrade_quote(
  p_subscription_id uuid,
  p_new_plan_id uuid
) returns numeric
language plpgsql stable security invoker as $$
declare
  v_sub public.subscriptions;
  v_old public.plans;
  v_new public.plans;
  v_today date := public.riyadh_today();
  v_remaining int;
  v_credit numeric;
begin
  select * into v_sub from public.subscriptions where id = p_subscription_id;
  if not found then raise exception 'subscription_not_found'; end if;
  select * into v_old from public.plans where id = v_sub.plan_id;
  select * into v_new from public.plans where id = p_new_plan_id;
  if not found then raise exception 'plan_not_found'; end if;

  v_remaining := case
    when v_sub.status in ('active','frozen') and v_sub.end_date is not null
      then greatest(v_sub.end_date - v_today, 0)
    else 0 end;
  v_credit := round(v_remaining * (v_old.price / (v_old.duration_months * 30.0)), 2);
  return greatest(v_new.price - v_credit, 0);
end $$;

-- -----------------------------------------------------------------------------
-- upgrade_subscription — switch to a new plan; expiry resets to today+new dur.
-- -----------------------------------------------------------------------------
create or replace function public.upgrade_subscription(
  p_subscription_id uuid,
  p_new_plan_id uuid,
  p_amount  numeric default null,
  p_method  payment_method default 'cash',
  p_receipt text default null
) returns public.subscriptions
language plpgsql security invoker as $$
declare
  v_sub public.subscriptions;
  v_new public.plans;
  v_today date := public.riyadh_today();
  v_due numeric;
  v_gym uuid;
begin
  select * into v_sub from public.subscriptions where id = p_subscription_id;
  if not found then raise exception 'subscription_not_found'; end if;
  select * into v_new from public.plans where id = p_new_plan_id;
  if not found then raise exception 'plan_not_found'; end if;
  select gym_id into v_gym from public.members where id = v_sub.member_id;
  v_due := public.upgrade_quote(p_subscription_id, p_new_plan_id);

  update public.subscriptions
     set plan_id = p_new_plan_id,
         start_date = v_today,
         end_date = (v_today + make_interval(months => v_new.duration_months))::date,
         status = 'active',
         sessions_remaining = v_new.sessions_count,
         price_paid = v_sub.price_paid + coalesce(p_amount, v_due)
   where id = p_subscription_id
   returning * into v_sub;

  insert into public.payments (gym_id, subscription_id, member_id, branch_id, amount, method, receipt_number, recorded_by)
  values (v_gym, v_sub.id, v_sub.member_id, v_sub.branch_id, coalesce(p_amount, v_due), p_method, p_receipt, auth.uid());

  return v_sub;
end $$;

-- -----------------------------------------------------------------------------
-- expire_due_subscriptions — housekeeping: active/frozen past expiry → expired.
-- Called opportunistically now; scheduled via pg_cron in Phase 5.
-- -----------------------------------------------------------------------------
create or replace function public.expire_due_subscriptions()
returns int
language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  update public.subscriptions
     set status = 'expired'
   where status in ('active','frozen')
     and end_date is not null
     and end_date < public.riyadh_today();
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- Allow the app (authenticated users) to call the RPCs; RLS still governs rows.
grant execute on function
  public.riyadh_today(),
  public.create_subscription(uuid, uuid, uuid, boolean, numeric, payment_method, text),
  public.activate_subscription(uuid, numeric, payment_method, text),
  public.renew_subscription(uuid, numeric, payment_method, text),
  public.freeze_subscription(uuid, int),
  public.unfreeze_subscription(uuid),
  public.upgrade_quote(uuid, uuid),
  public.upgrade_subscription(uuid, uuid, numeric, payment_method, text),
  public.expire_due_subscriptions()
to authenticated;


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>  supabase/migrations/0005_checkin_payment_functions.sql  <<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- =============================================================================
-- 0005_checkin_payment_functions.sql — Phase 4: check-in + manual payments
-- RPCs are SECURITY INVOKER so RLS still scopes every write to the caller's
-- branch. Business rules (block expired/frozen, decrement sessions) live here.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- record_check_in — validate the member's current subscription and log a visit.
-- Raises a coded exception when check-in must be blocked so the UI can show a
-- clear reason and a "Renew" shortcut:
--   checkin_no_subscription | checkin_pending | checkin_frozen
--   checkin_expired | checkin_no_sessions
-- -----------------------------------------------------------------------------
create or replace function public.record_check_in(
  p_member_id uuid,
  p_branch_id uuid
) returns public.check_ins
language plpgsql security invoker as $$
declare
  v_sub    public.subscriptions;
  v_today  date := public.riyadh_today();
  v_check  public.check_ins;
begin
  -- Best candidate subscription: prefer active, then frozen/pending, else latest.
  select * into v_sub
    from public.subscriptions
   where member_id = p_member_id
   order by (case status
              when 'active' then 0 when 'frozen' then 1 when 'pending' then 2
              when 'expired' then 3 else 4 end),
            end_date desc nulls last
   limit 1;

  if not found then raise exception 'checkin_no_subscription'; end if;
  if v_sub.status = 'pending' then raise exception 'checkin_pending'; end if;
  if v_sub.status = 'frozen'  then raise exception 'checkin_frozen'; end if;
  if v_sub.status in ('expired','cancelled')
     or (v_sub.end_date is not null and v_sub.end_date < v_today) then
    raise exception 'checkin_expired';
  end if;
  if v_sub.sessions_remaining is not null and v_sub.sessions_remaining <= 0 then
    raise exception 'checkin_no_sessions';
  end if;

  insert into public.check_ins (member_id, branch_id, subscription_id, recorded_by)
  values (p_member_id, p_branch_id, v_sub.id, auth.uid())
  returning * into v_check;

  -- Consume a session for sessions-based plans.
  if v_sub.sessions_remaining is not null then
    update public.subscriptions
       set sessions_remaining = sessions_remaining - 1
     where id = v_sub.id;
  end if;

  return v_check;
end $$;

-- -----------------------------------------------------------------------------
-- record_payment — standalone manual payment (cash/mada/…) linked to a member
-- and optionally a subscription. gym_id/branch_id are derived from the member.
-- -----------------------------------------------------------------------------
create or replace function public.record_payment(
  p_member_id uuid,
  p_subscription_id uuid,
  p_amount numeric,
  p_method payment_method,
  p_receipt text default null
) returns public.payments
language plpgsql security invoker as $$
declare
  v_member public.members;
  v_pay    public.payments;
begin
  if p_amount is null or p_amount < 0 then raise exception 'invalid_amount'; end if;
  select * into v_member from public.members where id = p_member_id;
  if not found then raise exception 'member_not_found'; end if;

  insert into public.payments (gym_id, subscription_id, member_id, branch_id, amount, method, receipt_number, recorded_by)
  values (v_member.gym_id, p_subscription_id, p_member_id, v_member.branch_id, p_amount, p_method, p_receipt, auth.uid())
  returning * into v_pay;

  return v_pay;
end $$;

grant execute on function
  public.record_check_in(uuid, uuid),
  public.record_payment(uuid, uuid, numeric, payment_method, text)
to authenticated;


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>  supabase/migrations/0006_notifications.sql  <<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- =============================================================================
-- 0006_notifications.sql — Phase 5: notifications engine
-- A daily job finds subscriptions expiring in 7/3/1 days and enqueues messages
-- into `notifications`. In dev they are logged with status 'simulated' (nothing
-- is actually sent); a provider (Twilio / Meta WhatsApp) is wired later via the
-- `notify` Edge Function which flips 'queued' → 'sent'. See README.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- enqueue_expiry_notifications — insert one row per (subscription, milestone)
-- for active subs expiring in exactly 7/3/1 days. Deduped per day so re-running
-- the job is idempotent. Returns the number of notifications created.
-- -----------------------------------------------------------------------------
create or replace function public.enqueue_expiry_notifications()
returns int
language plpgsql security definer set search_path = public as $$
declare v_count int := 0;
begin
  with due as (
    select s.id as sub_id, s.member_id, m.gym_id,
           (s.end_date - public.riyadh_today()) as days_left
    from public.subscriptions s
    join public.members m on m.id = s.member_id
    where s.status = 'active'
      and s.end_date is not null
      and (s.end_date - public.riyadh_today()) in (7, 3, 1)
  ),
  ins as (
    insert into public.notifications
      (gym_id, member_id, subscription_id, channel, type, message_ar, message_en, status)
    select d.gym_id, d.member_id, d.sub_id, 'whatsapp',
           'expiring_' || d.days_left,
           'ينتهي اشتراكك خلال ' || d.days_left || ' '
             || (case when d.days_left = 1 then 'يوم' else 'أيام' end) || '. جدّد الآن.',
           'Your subscription expires in ' || d.days_left || ' day(s). Renew now.',
           'simulated'
    from due d
    where not exists (
      select 1 from public.notifications n
      where n.subscription_id = d.sub_id
        and n.type = 'expiring_' || d.days_left
        and n.created_at::date = public.riyadh_today()
    )
    returning 1
  )
  select count(*) into v_count from ins;
  return v_count;
end $$;

grant execute on function public.enqueue_expiry_notifications() to authenticated;

-- -----------------------------------------------------------------------------
-- Schedule it daily at 06:00 UTC (09:00 Asia/Riyadh) via pg_cron.
-- pg_cron must be enabled for the project (Dashboard → Database → Extensions,
-- or the CREATE EXTENSION below if permitted). Safe/idempotent to re-run.
-- -----------------------------------------------------------------------------
create extension if not exists pg_cron;

do $$
begin
  -- Remove any previous schedule with the same name, then (re)create it.
  perform cron.unschedule('expiry-notifications-daily')
  where exists (select 1 from cron.job where jobname = 'expiry-notifications-daily');

  perform cron.schedule(
    'expiry-notifications-daily',
    '0 6 * * *',
    $cron$ select public.enqueue_expiry_notifications(); $cron$
  );
exception when others then
  -- If pg_cron isn't available yet, don't fail the migration; enable it in the
  -- dashboard and re-run this block. The function above still works standalone.
  raise notice 'pg_cron scheduling skipped: %', sqlerrm;
end $$;


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>  supabase/seed.sql  <<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- =============================================================================
-- seed.sql — realistic demo data so the dashboard & analytics look alive.
-- 1 gym, 2 branches, 4 plans, trainers, site content, ~50 members with mixed
-- statuses, payments, freezes and check-in history.
--
-- Deterministic UUIDs are used for the gym / branches / plans so references are
-- easy to reason about. Members and their history are generated in a loop.
--
-- NOTE: staff/member AUTH accounts are NOT created here (they require Supabase
-- Auth). Create them from the dashboard and set profiles.role/branch_id — see
-- README. The domain data below stands alone so analytics render immediately.
-- =============================================================================

-- Clean slate (safe to re-run). Order respects FKs.
truncate table public.notifications, public.check_ins, public.freezes,
               public.payments, public.subscriptions, public.members,
               public.trainers, public.site_content, public.plans,
               public.branches, public.gyms restart identity cascade;

-- -----------------------------------------------------------------------------
-- Gym (white-label branding)
-- -----------------------------------------------------------------------------
insert into public.gyms (id, name_ar, name_en, primary_color, secondary_color, contact_email, contact_phone, social_links)
values (
  '11111111-1111-1111-1111-111111111111',
  'نادي القوة', 'Power Gym',
  '#e11d2a', '#0f172a',
  'info@powergym.sa', '+966112223344',
  '{"instagram":"https://instagram.com/powergym","twitter":"https://x.com/powergym","tiktok":"https://tiktok.com/@powergym","whatsapp":"+966500000000"}'
);

-- -----------------------------------------------------------------------------
-- Branches
-- -----------------------------------------------------------------------------
insert into public.branches (id, gym_id, name_ar, name_en, address_ar, address_en, city, phone, map_url, working_hours)
values
('22222222-2222-2222-2222-222222220001', '11111111-1111-1111-1111-111111111111',
 'فرع العليا', 'Olaya Branch', 'طريق العليا العام', 'Olaya Main Rd', 'الرياض', '+966112223301',
 'https://maps.google.com/?q=Olaya+Riyadh',
 '{"sun":{"open":"06:00","close":"23:59"},"mon":{"open":"06:00","close":"23:59"},"tue":{"open":"06:00","close":"23:59"},"wed":{"open":"06:00","close":"23:59"},"thu":{"open":"06:00","close":"23:59"},"fri":{"open":"14:00","close":"23:59"},"sat":{"open":"08:00","close":"23:59"}}'),
('22222222-2222-2222-2222-222222220002', '11111111-1111-1111-1111-111111111111',
 'فرع الملقا', 'Malqa Branch', 'حي الملقا', 'Al Malqa District', 'الرياض', '+966112223302',
 'https://maps.google.com/?q=Al+Malqa+Riyadh',
 '{"sun":{"open":"06:00","close":"23:59"},"mon":{"open":"06:00","close":"23:59"},"tue":{"open":"06:00","close":"23:59"},"wed":{"open":"06:00","close":"23:59"},"thu":{"open":"06:00","close":"23:59"},"fri":{"open":"14:00","close":"23:59"},"sat":{"open":"08:00","close":"23:59"}}');

-- -----------------------------------------------------------------------------
-- Plans
-- -----------------------------------------------------------------------------
insert into public.plans (id, gym_id, name_ar, name_en, description_ar, description_en, duration_months, price, freeze_allowance_days, all_branches_access, sessions_count, sort_order)
values
('33333333-3333-3333-3333-333333330001','11111111-1111-1111-1111-111111111111','اشتراك شهري','Monthly','وصول كامل لفرع واحد','Full access, single branch',1,200,7,false,null,1),
('33333333-3333-3333-3333-333333330002','11111111-1111-1111-1111-111111111111','اشتراك ربع سنوي','Quarterly','ثلاثة أشهر لفرع واحد','3 months, single branch',3,500,14,false,null,2),
('33333333-3333-3333-3333-333333330003','11111111-1111-1111-1111-111111111111','اشتراك نصف سنوي','Semi-Annual','ستة أشهر وصول لكل الفروع','6 months, all branches',6,900,30,true,null,3),
('33333333-3333-3333-3333-333333330004','11111111-1111-1111-1111-111111111111','اشتراك سنوي','Annual','سنة كاملة وصول لكل الفروع','12 months, all branches',12,1600,60,true,null,4);

-- -----------------------------------------------------------------------------
-- Trainers
-- -----------------------------------------------------------------------------
insert into public.trainers (gym_id, branch_id, name_ar, name_en, specialty_ar, specialty_en, sort_order)
values
('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222220001','خالد العتيبي','Khalid Al-Otaibi','كمال الأجسام','Bodybuilding',1),
('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222220001','سارة الشمري','Sara Al-Shammari','لياقة وتخسيس','Fitness & Weight Loss',2),
('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222220002','فهد القحطاني','Fahad Al-Qahtani','رفع أثقال','Powerlifting',3),
('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222220002','نورة الدوسري','Noura Al-Dosari','يوغا وكارديو','Yoga & Cardio',4);

-- -----------------------------------------------------------------------------
-- Site content (public website, data-driven)
-- -----------------------------------------------------------------------------
insert into public.site_content (gym_id, key, content) values
('11111111-1111-1111-1111-111111111111','hero',
 '{"title_ar":"طوّر قوتك في نادي القوة","title_en":"Build Your Strength at Power Gym","subtitle_ar":"أحدث الأجهزة ومدربون محترفون في فرعين بالرياض","subtitle_en":"State-of-the-art equipment and pro coaches across two Riyadh branches"}'),
('11111111-1111-1111-1111-111111111111','faq',
 '{"items":[{"q_ar":"هل يمكنني تجميد اشتراكي؟","a_ar":"نعم، حسب باقة أيام التجميد في خطتك.","q_en":"Can I freeze my subscription?","a_en":"Yes, up to your plan freeze allowance."},{"q_ar":"هل يوجد وصول لكل الفروع؟","a_ar":"الخطط النصف سنوية والسنوية تتيح الوصول لكل الفروع.","q_en":"Is there all-branch access?","a_en":"Semi-annual and annual plans include all-branch access."}]}'),
('11111111-1111-1111-1111-111111111111','testimonials',
 '{"items":[{"name_ar":"عبدالله","name_en":"Abdullah","text_ar":"أفضل نادي التزمت فيه.","text_en":"Best gym I have stuck with."},{"name_ar":"ريم","name_en":"Reem","text_ar":"مدربات محترفات وأجواء رائعة.","text_en":"Professional coaches and great vibe."}]}'),
('11111111-1111-1111-1111-111111111111','facilities',
 '{"items":[{"ar":"منطقة أوزان حرة","en":"Free weights area"},{"ar":"صالة كارديو","en":"Cardio hall"},{"ar":"استوديو مجموعات","en":"Group studio"},{"ar":"ساونا","en":"Sauna"}]}');

-- -----------------------------------------------------------------------------
-- Members + subscriptions + payments + freezes + check-ins (generated)
-- -----------------------------------------------------------------------------
do $$
declare
  v_gym   uuid := '11111111-1111-1111-1111-111111111111';
  v_branch_a uuid := '22222222-2222-2222-2222-222222220001';
  v_branch_b uuid := '22222222-2222-2222-2222-222222220002';
  v_plans uuid[] := array[
    '33333333-3333-3333-3333-333333330001',
    '33333333-3333-3333-3333-333333330002',
    '33333333-3333-3333-3333-333333330003',
    '33333333-3333-3333-3333-333333330004'];
  v_dur   int[]  := array[1,3,6,12];
  v_price numeric[] := array[200,500,900,1600];
  v_freeze int[] := array[7,14,30,60];
  v_first_m text[] := array['محمد','أحمد','عبدالله','خالد','سعود','فيصل','نايف','بندر','تركي','ماجد','عمر','ياسر','سلطان','راكان','مشعل'];
  v_first_f text[] := array['نورة','سارة','ريم','مها','هند','لمى','دانة','جواهر','العنود','شهد','رنا','بشاير','وجدان','أمل','غادة'];
  v_last  text[] := array['العتيبي','القحطاني','الشمري','الدوسري','الحربي','الغامدي','الزهراني','المطيري','السبيعي','البقمي'];

  i int;
  v_member uuid;
  v_sub uuid;
  v_branch uuid;
  v_plan_idx int;
  v_plan uuid;
  v_gender gender_type;
  v_name text;
  v_status subscription_status;
  v_start date;
  v_end date;
  v_frozen int;
  v_checkins int;
  j int;
  v_hour int;
  v_receipt int := 1000;
  v_hist_start date;
  v_hist_end date;
begin
  for i in 1..50 loop
    v_branch := case when i % 2 = 0 then v_branch_a else v_branch_b end;
    v_plan_idx := 1 + (i % 4);              -- 1..4
    v_plan := v_plans[v_plan_idx];
    v_gender := case when i % 3 = 0 then 'female'::gender_type else 'male'::gender_type end;
    if v_gender = 'female' then
      v_name := v_first_f[1 + (i % array_length(v_first_f,1))] || ' ' || v_last[1 + (i % array_length(v_last,1))];
    else
      v_name := v_first_m[1 + (i % array_length(v_first_m,1))] || ' ' || v_last[1 + (i % array_length(v_last,1))];
    end if;

    -- Status distribution: 1-30 active, 31-36 expiring, 37-44 expired, 45-48 frozen, 49-50 pending
    if i <= 30 then
      v_status := 'active'; v_end := current_date + (15 + (i % 40)); v_frozen := 0;
    elsif i <= 36 then
      v_status := 'active'; v_end := current_date + (1 + (i % 6)); v_frozen := 0;     -- expiring soon
    elsif i <= 44 then
      v_status := 'expired'; v_end := current_date - (1 + (i % 30)); v_frozen := 0;
    elsif i <= 48 then
      v_status := 'frozen'; v_end := current_date + (20 + (i % 10)); v_frozen := 5;
    else
      v_status := 'pending'; v_end := null; v_frozen := 0;
    end if;

    if v_end is not null then
      v_start := v_end - (v_dur[v_plan_idx] || ' months')::interval;
    else
      v_start := null;
    end if;

    -- Member
    insert into public.members (gym_id, branch_id, full_name, phone, gender, dob,
                                emergency_contact_name, emergency_contact_phone, notes)
    values (v_gym, v_branch, v_name,
            '05' || (10000000 + i)::text,
            v_gender,
            date '1990-01-01' + ((i * 137) % 4000),
            'ولي الأمر', '05' || (19000000 + i)::text,
            null)
    returning id into v_member;

    -- Current subscription
    insert into public.subscriptions (member_id, plan_id, branch_id, status, start_date, end_date,
                                       frozen_days_used, price_paid)
    values (v_member, v_plan, v_branch, v_status, v_start, v_end, v_frozen,
            case when v_status = 'pending' then 0 else v_price[v_plan_idx] end)
    returning id into v_sub;

    -- Payment for everything except pending
    if v_status <> 'pending' then
      v_receipt := v_receipt + 1;
      insert into public.payments (gym_id, subscription_id, member_id, branch_id, amount, method, receipt_number, created_at)
      values (v_gym, v_sub, v_member, v_branch, v_price[v_plan_idx],
              case when i % 2 = 0 then 'mada'::payment_method else 'cash'::payment_method end,
              'R' || v_receipt::text,
              v_start::timestamptz + interval '10 hours');
    end if;

    -- Freeze record for frozen members
    if v_status = 'frozen' then
      insert into public.freezes (subscription_id, start_date, end_date, days)
      values (v_sub, current_date - 5, current_date, 5);
    end if;

    -- A prior (historical, renewed) subscription for the first 8 active members
    if i <= 8 then
      v_hist_end := v_start;
      v_hist_start := v_hist_end - (v_dur[v_plan_idx] || ' months')::interval;
      insert into public.subscriptions (member_id, plan_id, branch_id, status, start_date, end_date, price_paid)
      values (v_member, v_plan, v_branch, 'expired', v_hist_start, v_hist_end, v_price[v_plan_idx])
      returning id into v_sub;
      v_receipt := v_receipt + 1;
      insert into public.payments (gym_id, subscription_id, member_id, branch_id, amount, method, receipt_number, created_at)
      values (v_gym, v_sub, v_member, v_branch, v_price[v_plan_idx], 'cash', 'R' || v_receipt::text,
              v_hist_start::timestamptz + interval '10 hours');
    end if;

    -- Check-in history for active/frozen members (feeds analytics/heatmap)
    if v_status in ('active','frozen') then
      v_checkins := 3 + (i % 10);
      for j in 1..v_checkins loop
        v_hour := (array[7,8,9,10,17,18,19,20,21])[1 + (floor(random()*9))::int];
        insert into public.check_ins (member_id, branch_id, checked_in_at)
        values (v_member, v_branch,
                (current_date - (floor(random()*28))::int)::timestamptz + (v_hour || ' hours')::interval);
      end loop;
    end if;
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- A couple of in-app notifications so the bell isn't empty on first load.
-- -----------------------------------------------------------------------------
insert into public.notifications (gym_id, member_id, channel, type, message_ar, message_en, status)
select '11111111-1111-1111-1111-111111111111', m.id, 'in_app', 'expiring_7',
       'اشتراكك ينتهي خلال أسبوع. جدّد الآن.', 'Your subscription expires within a week. Renew now.', 'simulated'
from public.members m
join public.subscriptions s on s.member_id = m.id
where s.status = 'active' and s.end_date <= current_date + 7
limit 6;


