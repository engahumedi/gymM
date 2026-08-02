-- apply_all.sql — full setup bundle (schema→RLS→storage/auth→functions→seed).
-- For the public Join flow, enable email autoconfirm in Auth settings.

-- >>>>>>  supabase/migrations/0001_schema.sql  <<<<<<
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


-- >>>>>>  supabase/migrations/0002_rls.sql  <<<<<<
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


-- >>>>>>  supabase/migrations/0003_storage_and_auth.sql  <<<<<<
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


-- >>>>>>  supabase/migrations/0004_subscription_functions.sql  <<<<<<
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


-- >>>>>>  supabase/migrations/0005_checkin_payment_functions.sql  <<<<<<
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


-- >>>>>>  supabase/migrations/0006_notifications.sql  <<<<<<
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


-- >>>>>>  supabase/migrations/0007_public_join.sql  <<<<<<
-- =============================================================================
-- 0007_public_join.sql — Phase 7: public "Join Now" flow
-- A newly signed-up visitor calls public_join() to create their member record
-- and a PENDING subscription in one step. SECURITY DEFINER so it can write the
-- member/subscription rows (a self-serve member cannot insert into `members`
-- under RLS); it is tightly scoped to the caller's own auth.uid().
-- =============================================================================

create or replace function public.public_join(
  p_full_name text,
  p_phone     text,
  p_gender    gender_type,
  p_plan_id   uuid,
  p_branch_id uuid
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid      uuid := auth.uid();
  v_gym      uuid;
  v_member   uuid;
  v_existing uuid;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  select gym_id into v_gym from public.branches where id = p_branch_id;
  if v_gym is null then raise exception 'branch_not_found'; end if;
  if not exists (select 1 from public.plans where id = p_plan_id and gym_id = v_gym) then
    raise exception 'plan_not_found';
  end if;

  -- One member per auth user.
  select member_id into v_existing from public.profiles where id = v_uid;
  if v_existing is not null then raise exception 'already_member'; end if;

  -- Phone format/uniqueness are enforced by the members table constraints;
  -- a duplicate raises members_phone_unique which the UI maps to a message.
  insert into public.members (gym_id, branch_id, full_name, phone, gender, user_id)
  values (v_gym, p_branch_id, p_full_name, p_phone, p_gender, v_uid)
  returning id into v_member;

  update public.profiles
     set member_id = v_member, gym_id = v_gym, full_name = p_full_name
   where id = v_uid;

  insert into public.subscriptions (member_id, plan_id, branch_id, status)
  values (v_member, p_plan_id, p_branch_id, 'pending');

  return v_member;
end $$;

grant execute on function
  public.public_join(text, text, gender_type, uuid, uuid)
to authenticated;


-- >>>>>>  supabase/migrations/0008_national_id_and_rebrand.sql  <<<<<<
-- =============================================================================
-- 0008_national_id_and_rebrand.sql
--  · Adds national ID to members (required in the app registration forms;
--    nullable at the DB level so existing rows are unaffected).
--  · public_join gains p_national_id.
--  · Rebrand the demo gym to "أبطال الرياضة".
-- =============================================================================

alter table public.members add column if not exists national_id text;

-- Recreate public_join with the national ID captured at sign-up.
drop function if exists public.public_join(text, text, gender_type, uuid, uuid);

create or replace function public.public_join(
  p_full_name   text,
  p_phone       text,
  p_national_id text,
  p_gender      gender_type,
  p_plan_id     uuid,
  p_branch_id   uuid
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid      uuid := auth.uid();
  v_gym      uuid;
  v_member   uuid;
  v_existing uuid;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select gym_id into v_gym from public.branches where id = p_branch_id;
  if v_gym is null then raise exception 'branch_not_found'; end if;
  if not exists (select 1 from public.plans where id = p_plan_id and gym_id = v_gym) then
    raise exception 'plan_not_found';
  end if;
  select member_id into v_existing from public.profiles where id = v_uid;
  if v_existing is not null then raise exception 'already_member'; end if;

  insert into public.members (gym_id, branch_id, full_name, phone, national_id, gender, user_id)
  values (v_gym, p_branch_id, p_full_name, p_phone, p_national_id, p_gender, v_uid)
  returning id into v_member;

  update public.profiles
     set member_id = v_member, gym_id = v_gym, full_name = p_full_name
   where id = v_uid;

  insert into public.subscriptions (member_id, plan_id, branch_id, status)
  values (v_member, p_plan_id, p_branch_id, 'pending');

  return v_member;
end $$;

grant execute on function
  public.public_join(text, text, text, gender_type, uuid, uuid)
to authenticated;

-- Rebrand
update public.gyms
   set name_ar = 'أبطال الرياضة', name_en = 'Sports Champions'
 where name_ar = 'نادي القوة' or name_en = 'Power Gym';


-- >>>>>>  supabase/migrations/0009_freeze_requests.sql  <<<<<<
-- =============================================================================
-- 0009_freeze_requests.sql — member-initiated freeze requests + staff approval
-- A member asks to pause their subscription for N days; reception approves and
-- the freeze is applied via freeze_subscription (which extends the expiry by N,
-- so the paused days are NOT lost from the member's remaining days).
-- =============================================================================

do $$ begin
  create type freeze_request_status as enum ('pending', 'approved', 'rejected');
exception when duplicate_object then null; end $$;

create table if not exists public.freeze_requests (
  id              uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.subscriptions(id) on delete cascade,
  member_id       uuid not null references public.members(id) on delete cascade,
  branch_id       uuid references public.branches(id) on delete set null,
  days            int not null check (days > 0),
  note            text,
  status          freeze_request_status not null default 'pending',
  created_at      timestamptz not null default now(),
  decided_at      timestamptz,
  decided_by      uuid references public.profiles(id) on delete set null
);
create index if not exists idx_freeze_req_sub on public.freeze_requests(subscription_id);
create index if not exists idx_freeze_req_branch on public.freeze_requests(branch_id);
create index if not exists idx_freeze_req_status on public.freeze_requests(status);

alter table public.freeze_requests enable row level security;

-- Reads: member sees own; reception sees its branch; super admin sees the gym.
drop policy if exists freeze_req_member_read on public.freeze_requests;
create policy freeze_req_member_read on public.freeze_requests
  for select using (member_id = public.current_member_id());

drop policy if exists freeze_req_staff_read on public.freeze_requests;
create policy freeze_req_staff_read on public.freeze_requests
  for select using (
    public.is_super_admin()
    or (public.is_reception() and branch_id = public.current_branch_id())
  );

-- Writes go through the SECURITY DEFINER RPCs below (no direct insert/update policy).

-- -----------------------------------------------------------------------------
-- request_freeze — member asks to pause their own active subscription.
-- -----------------------------------------------------------------------------
create or replace function public.request_freeze(
  p_subscription_id uuid,
  p_days int,
  p_note text default null
) returns public.freeze_requests
language plpgsql security definer set search_path = public as $$
declare
  v_member uuid := public.current_member_id();
  v_sub    public.subscriptions;
  v_plan   public.plans;
  v_req    public.freeze_requests;
begin
  if v_member is null then raise exception 'not_member'; end if;
  if p_days is null or p_days <= 0 then raise exception 'invalid_days'; end if;
  select * into v_sub from public.subscriptions where id = p_subscription_id;
  if not found or v_sub.member_id <> v_member then raise exception 'forbidden'; end if;
  if v_sub.status <> 'active' then raise exception 'not_active'; end if;
  select * into v_plan from public.plans where id = v_sub.plan_id;
  if v_sub.frozen_days_used + p_days > v_plan.freeze_allowance_days then
    raise exception 'freeze_cap_exceeded';
  end if;
  if exists (select 1 from public.freeze_requests where subscription_id = p_subscription_id and status = 'pending') then
    raise exception 'request_exists';
  end if;

  insert into public.freeze_requests (subscription_id, member_id, branch_id, days, note)
  values (p_subscription_id, v_member, v_sub.branch_id, p_days, p_note)
  returning * into v_req;
  return v_req;
end $$;

-- -----------------------------------------------------------------------------
-- approve_freeze_request — reception/admin approves; applies the freeze.
-- -----------------------------------------------------------------------------
create or replace function public.approve_freeze_request(p_request_id uuid)
returns public.freeze_requests
language plpgsql security definer set search_path = public as $$
declare v_req public.freeze_requests;
begin
  select * into v_req from public.freeze_requests where id = p_request_id;
  if not found then raise exception 'not_found'; end if;
  if v_req.status <> 'pending' then raise exception 'not_pending'; end if;
  if not (public.is_super_admin() or (public.is_reception() and v_req.branch_id = public.current_branch_id())) then
    raise exception 'forbidden';
  end if;

  -- Applies the freeze: extends expiry by the days and marks the sub frozen
  -- (raises not_active / freeze_cap_exceeded if no longer valid).
  perform public.freeze_subscription(v_req.subscription_id, v_req.days);

  update public.freeze_requests
     set status = 'approved', decided_at = now(), decided_by = auth.uid()
   where id = p_request_id
   returning * into v_req;
  return v_req;
end $$;

-- -----------------------------------------------------------------------------
-- reject_freeze_request — reception/admin declines.
-- -----------------------------------------------------------------------------
create or replace function public.reject_freeze_request(p_request_id uuid)
returns public.freeze_requests
language plpgsql security definer set search_path = public as $$
declare v_req public.freeze_requests;
begin
  select * into v_req from public.freeze_requests where id = p_request_id;
  if not found then raise exception 'not_found'; end if;
  if v_req.status <> 'pending' then raise exception 'not_pending'; end if;
  if not (public.is_super_admin() or (public.is_reception() and v_req.branch_id = public.current_branch_id())) then
    raise exception 'forbidden';
  end if;
  update public.freeze_requests
     set status = 'rejected', decided_at = now(), decided_by = auth.uid()
   where id = p_request_id
   returning * into v_req;
  return v_req;
end $$;

grant execute on function
  public.request_freeze(uuid, int, text),
  public.approve_freeze_request(uuid),
  public.reject_freeze_request(uuid)
to authenticated;


-- >>>>>>  supabase/seed.sql  <<<<<<
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
  'أبطال الرياضة', 'Sports Champions',
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
 '{"title_ar":"طوّر قوتك في أبطال الرياضة","title_en":"Build Your Strength at Sports Champions","subtitle_ar":"أحدث الأجهزة ومدربون محترفون في فرعين بالرياض","subtitle_en":"State-of-the-art equipment and pro coaches across two Riyadh branches"}'),
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
    insert into public.members (gym_id, branch_id, full_name, phone, national_id, gender, dob,
                                emergency_contact_name, emergency_contact_phone, notes)
    values (v_gym, v_branch, v_name,
            '05' || (10000000 + i)::text,
            '1' || (1000000000 + i)::text,
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




-- =============================================================================
-- 0010_staff_invites.sql
-- =============================================================================
-- =============================================================================
-- 0010_staff_invites.sql — Staff (reception) invitations
-- Super admin invites a reception user by email + branch. The invited person
-- creates their own account (normal Supabase sign-up), and the auth trigger
-- promotes them to the invited role/branch — so the service-role key never
-- touches the browser and no Edge Function deploy is required.
-- =============================================================================

create table if not exists public.staff_invites (
  id               uuid primary key default gen_random_uuid(),
  gym_id           uuid not null references public.gyms(id) on delete cascade,
  email            text not null,
  full_name        text,
  branch_id        uuid references public.branches(id) on delete set null,
  role             user_role not null default 'reception' check (role = 'reception'),
  status           text not null default 'pending' check (status in ('pending', 'accepted')),
  created_by       uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  accepted_at      timestamptz,
  accepted_user_id uuid references auth.users(id) on delete set null
);

create index if not exists staff_invites_email_idx on public.staff_invites (lower(email));

alter table public.staff_invites enable row level security;

-- Only a super admin manages invites within their own gym.
drop policy if exists staff_invites_admin_all on public.staff_invites;
create policy staff_invites_admin_all on public.staff_invites
  for all using (public.is_super_admin() and gym_id = public.current_gym_id())
  with check (public.is_super_admin() and gym_id = public.current_gym_id());

-- -----------------------------------------------------------------------------
-- Extend the sign-up bootstrap: if a pending staff invite matches the new
-- user's email, seed their profile as that staff role/branch and consume the
-- invite. Otherwise fall back to the original member default.
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  only_gym uuid;
  inv      public.staff_invites;
begin
  select id into only_gym from public.gyms limit 1;

  select * into inv
    from public.staff_invites
   where lower(email) = lower(new.email)
     and status = 'pending'
   order by created_at desc
   limit 1;

  if inv.id is not null then
    insert into public.profiles (id, gym_id, role, branch_id, full_name)
    values (
      new.id,
      inv.gym_id,
      inv.role,
      inv.branch_id,
      coalesce(inv.full_name, new.raw_user_meta_data->>'full_name', new.email)
    )
    on conflict (id) do update
      set role = excluded.role, branch_id = excluded.branch_id, gym_id = excluded.gym_id;

    update public.staff_invites
       set status = 'accepted', accepted_at = now(), accepted_user_id = new.id
     where id = inv.id;
  else
    insert into public.profiles (id, gym_id, role, full_name)
    values (
      new.id,
      only_gym,
      'member',
      coalesce(new.raw_user_meta_data->>'full_name', new.email)
    )
    on conflict (id) do nothing;
  end if;

  return new;
end $$;

-- =============================================================================
-- 0011_password_change_requests.sql
-- =============================================================================
-- =============================================================================
-- 0011_password_change_requests.sql — request → staff-approval password reset
-- Replaces email/SMTP password recovery. A user who forgot their password
-- submits a request with the new password they want; reception/admin verify
-- identity (in person at the gym) and approve, which writes the new bcrypt
-- password directly to auth.users. No SMTP, no service_role in the browser.
-- =============================================================================

do $$ begin
  create type password_request_status as enum ('pending', 'approved', 'rejected');
exception when duplicate_object then null; end $$;

create table if not exists public.password_change_requests (
  id                 uuid primary key default gen_random_uuid(),
  gym_id             uuid references public.gyms(id) on delete cascade,
  user_id            uuid not null references auth.users(id) on delete cascade,
  member_id          uuid references public.members(id) on delete set null,
  branch_id          uuid references public.branches(id) on delete set null,
  requested_email    text not null,
  requested_name     text,
  new_password_hash  text not null,         -- bcrypt; applied to auth.users on approval
  status             password_request_status not null default 'pending',
  created_at         timestamptz not null default now(),
  decided_at         timestamptz,
  decided_by         uuid references public.profiles(id) on delete set null
);
create index if not exists idx_pwreq_status on public.password_change_requests(status);
create index if not exists idx_pwreq_branch on public.password_change_requests(branch_id);

alter table public.password_change_requests enable row level security;

-- Only staff read the queue (never expose the hash to the public). The requester
-- is not signed in, so needs no read policy; the RPC confirms submission.
drop policy if exists pwreq_staff_read on public.password_change_requests;
create policy pwreq_staff_read on public.password_change_requests
  for select using (
    (public.is_super_admin() and gym_id = public.current_gym_id())
    or (public.is_reception() and branch_id = public.current_branch_id())
  );

-- Writes go only through the SECURITY DEFINER RPCs below.

-- -----------------------------------------------------------------------------
-- request_password_change — anyone (anon) submits a pending request for their
-- own account, choosing the new password now. Stored as a bcrypt hash.
-- -----------------------------------------------------------------------------
create or replace function public.request_password_change(
  p_email text,
  p_new_password text
) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_user   auth.users;
  v_prof   public.profiles;
  v_member public.members;
  v_name   text;
begin
  if p_new_password is null or length(p_new_password) < 6 then
    raise exception 'weak_password';
  end if;

  select * into v_user from auth.users where lower(email) = lower(trim(p_email)) limit 1;
  if not found then raise exception 'user_not_found'; end if;

  select * into v_prof from public.profiles where id = v_user.id;
  if v_prof.member_id is not null then
    select * into v_member from public.members where id = v_prof.member_id;
  end if;
  v_name := coalesce(v_prof.full_name, v_member.full_name, v_user.email);

  if exists (
    select 1 from public.password_change_requests
     where user_id = v_user.id and status = 'pending'
  ) then
    raise exception 'request_exists';
  end if;

  insert into public.password_change_requests
    (gym_id, user_id, member_id, branch_id, requested_email, requested_name, new_password_hash)
  values (
    v_prof.gym_id, v_user.id, v_prof.member_id, v_prof.branch_id,
    v_user.email, v_name,
    extensions.crypt(p_new_password, extensions.gen_salt('bf', 10))
  );
end $$;

-- -----------------------------------------------------------------------------
-- approve_password_change — reception (own branch) / super admin (gym) approves;
-- writes the new bcrypt password to auth.users so the user can sign in with it.
-- -----------------------------------------------------------------------------
create or replace function public.approve_password_change(p_request_id uuid)
returns public.password_change_requests
language plpgsql security definer set search_path = public as $$
declare v_req public.password_change_requests;
begin
  select * into v_req from public.password_change_requests where id = p_request_id;
  if not found then raise exception 'not_found'; end if;
  if v_req.status <> 'pending' then raise exception 'not_pending'; end if;
  if not (
    (public.is_super_admin() and v_req.gym_id = public.current_gym_id())
    or (public.is_reception() and v_req.branch_id = public.current_branch_id())
  ) then
    raise exception 'forbidden';
  end if;

  update auth.users
     set encrypted_password = v_req.new_password_hash, updated_at = now()
   where id = v_req.user_id;

  update public.password_change_requests
     set status = 'approved', decided_at = now(), decided_by = auth.uid()
   where id = p_request_id
   returning * into v_req;
  -- Never hand the hash back to the client.
  v_req.new_password_hash := '';
  return v_req;
end $$;

-- -----------------------------------------------------------------------------
-- reject_password_change — staff declines.
-- -----------------------------------------------------------------------------
create or replace function public.reject_password_change(p_request_id uuid)
returns public.password_change_requests
language plpgsql security definer set search_path = public as $$
declare v_req public.password_change_requests;
begin
  select * into v_req from public.password_change_requests where id = p_request_id;
  if not found then raise exception 'not_found'; end if;
  if v_req.status <> 'pending' then raise exception 'not_pending'; end if;
  if not (
    (public.is_super_admin() and v_req.gym_id = public.current_gym_id())
    or (public.is_reception() and v_req.branch_id = public.current_branch_id())
  ) then
    raise exception 'forbidden';
  end if;
  update public.password_change_requests
     set status = 'rejected', decided_at = now(), decided_by = auth.uid()
   where id = p_request_id
   returning * into v_req;
  v_req.new_password_hash := '';
  return v_req;
end $$;

-- Requesting is open to anon (the user forgot their password → not signed in).
grant execute on function public.request_password_change(text, text) to anon, authenticated;
grant execute on function public.approve_password_change(uuid) to authenticated;
grant execute on function public.reject_password_change(uuid) to authenticated;

-- =============================================================================
-- 0012_audit_and_hardening.sql
-- =============================================================================
-- =============================================================================
-- 0012_audit_and_hardening.sql
--   * audit_log + record_audit() + triggers (payments, subscription status)
--   * rate-limit on request_password_change; audit on approve/reject
--   * staff_set_member_password (reception/admin resets a member on the spot)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Audit log — who did what. Written only by SECURITY DEFINER helpers/triggers;
-- readable by the gym's super admin.
-- -----------------------------------------------------------------------------
create table if not exists public.audit_log (
  id         bigint generated always as identity primary key,
  gym_id     uuid,
  actor      uuid,                       -- auth.uid(); null for anon actions
  actor_name text,
  action     text not null,
  entity     text,
  entity_id  uuid,
  meta       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_audit_created on public.audit_log(created_at desc);

alter table public.audit_log enable row level security;

drop policy if exists audit_admin_read on public.audit_log;
create policy audit_admin_read on public.audit_log
  for select using (
    public.is_super_admin() and (gym_id = public.current_gym_id() or gym_id is null)
  );
-- No insert/update/delete policy: writes go only through the definer helper below.

create or replace function public.record_audit(
  p_action text,
  p_entity text,
  p_entity_id uuid,
  p_meta jsonb default '{}'::jsonb,
  p_gym_id uuid default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_name  text;
  v_gym   uuid;
begin
  select full_name, gym_id into v_name, v_gym from public.profiles where id = v_actor;
  insert into public.audit_log (gym_id, actor, actor_name, action, entity, entity_id, meta)
  values (coalesce(p_gym_id, v_gym), v_actor, v_name, p_action, p_entity, p_entity_id, coalesce(p_meta, '{}'::jsonb));
end $$;

-- Triggers capture the common money/lifecycle events without touching the RPCs.
create or replace function public.audit_payment() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.record_audit(
    'payment_recorded', 'payment', new.id,
    jsonb_build_object('amount', new.amount, 'method', new.method, 'member_id', new.member_id),
    new.gym_id
  );
  return new;
end $$;
drop trigger if exists trg_audit_payment on public.payments;
create trigger trg_audit_payment after insert on public.payments
  for each row execute function public.audit_payment();

create or replace function public.audit_sub_status() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status then
    perform public.record_audit(
      'subscription_' || new.status, 'subscription', new.id,
      jsonb_build_object('from', old.status, 'to', new.status, 'member_id', new.member_id)
    );
  end if;
  return new;
end $$;
drop trigger if exists trg_audit_sub_status on public.subscriptions;
create trigger trg_audit_sub_status after update on public.subscriptions
  for each row execute function public.audit_sub_status();

-- -----------------------------------------------------------------------------
-- Harden request_password_change: cap at 5 requests / user / 24h (anti-flood),
-- keep the one-pending dedup, and audit the submission.
-- -----------------------------------------------------------------------------
create or replace function public.request_password_change(
  p_email text,
  p_new_password text
) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_user   auth.users;
  v_prof   public.profiles;
  v_member public.members;
  v_name   text;
begin
  if p_new_password is null or length(p_new_password) < 6 then
    raise exception 'weak_password';
  end if;

  select * into v_user from auth.users where lower(email) = lower(trim(p_email)) limit 1;
  if not found then raise exception 'user_not_found'; end if;

  if (select count(*) from public.password_change_requests
        where user_id = v_user.id and created_at > now() - interval '24 hours') >= 5 then
    raise exception 'rate_limited';
  end if;

  select * into v_prof from public.profiles where id = v_user.id;
  if v_prof.member_id is not null then
    select * into v_member from public.members where id = v_prof.member_id;
  end if;
  v_name := coalesce(v_prof.full_name, v_member.full_name, v_user.email);

  if exists (
    select 1 from public.password_change_requests
     where user_id = v_user.id and status = 'pending'
  ) then
    raise exception 'request_exists';
  end if;

  insert into public.password_change_requests
    (gym_id, user_id, member_id, branch_id, requested_email, requested_name, new_password_hash)
  values (
    v_prof.gym_id, v_user.id, v_prof.member_id, v_prof.branch_id,
    v_user.email, v_name,
    extensions.crypt(p_new_password, extensions.gen_salt('bf', 10))
  );

  perform public.record_audit('password_change_requested', 'user', v_user.id,
    jsonb_build_object('email', v_user.email), v_prof.gym_id);
end $$;

-- approve/reject — recreate to add audit entries.
create or replace function public.approve_password_change(p_request_id uuid)
returns public.password_change_requests
language plpgsql security definer set search_path = public as $$
declare v_req public.password_change_requests;
begin
  select * into v_req from public.password_change_requests where id = p_request_id;
  if not found then raise exception 'not_found'; end if;
  if v_req.status <> 'pending' then raise exception 'not_pending'; end if;
  if not (
    (public.is_super_admin() and v_req.gym_id = public.current_gym_id())
    or (public.is_reception() and v_req.branch_id = public.current_branch_id())
  ) then
    raise exception 'forbidden';
  end if;

  update auth.users
     set encrypted_password = v_req.new_password_hash, updated_at = now()
   where id = v_req.user_id;

  update public.password_change_requests
     set status = 'approved', decided_at = now(), decided_by = auth.uid()
   where id = p_request_id
   returning * into v_req;

  perform public.record_audit('password_change_approved', 'user', v_req.user_id,
    jsonb_build_object('email', v_req.requested_email), v_req.gym_id);
  v_req.new_password_hash := '';
  return v_req;
end $$;

create or replace function public.reject_password_change(p_request_id uuid)
returns public.password_change_requests
language plpgsql security definer set search_path = public as $$
declare v_req public.password_change_requests;
begin
  select * into v_req from public.password_change_requests where id = p_request_id;
  if not found then raise exception 'not_found'; end if;
  if v_req.status <> 'pending' then raise exception 'not_pending'; end if;
  if not (
    (public.is_super_admin() and v_req.gym_id = public.current_gym_id())
    or (public.is_reception() and v_req.branch_id = public.current_branch_id())
  ) then
    raise exception 'forbidden';
  end if;
  update public.password_change_requests
     set status = 'rejected', decided_at = now(), decided_by = auth.uid()
   where id = p_request_id
   returning * into v_req;

  perform public.record_audit('password_change_rejected', 'user', v_req.user_id,
    jsonb_build_object('email', v_req.requested_email), v_req.gym_id);
  v_req.new_password_hash := '';
  return v_req;
end $$;

-- -----------------------------------------------------------------------------
-- staff_set_member_password — reception (own branch) / super admin (gym) sets a
-- member's password directly (member present at the desk). Audited.
-- -----------------------------------------------------------------------------
create or replace function public.staff_set_member_password(
  p_member_id uuid,
  p_new_password text
) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare v_member public.members;
begin
  if p_new_password is null or length(p_new_password) < 6 then
    raise exception 'weak_password';
  end if;
  select * into v_member from public.members where id = p_member_id;
  if not found then raise exception 'not_found'; end if;
  if not (
    (public.is_super_admin() and v_member.gym_id = public.current_gym_id())
    or (public.is_reception() and v_member.branch_id = public.current_branch_id())
  ) then
    raise exception 'forbidden';
  end if;
  if v_member.user_id is null then raise exception 'no_account'; end if;

  update auth.users
     set encrypted_password = extensions.crypt(p_new_password, extensions.gen_salt('bf', 10)),
         updated_at = now()
   where id = v_member.user_id;

  perform public.record_audit('password_set_by_staff', 'member', p_member_id,
    jsonb_build_object('member', v_member.full_name), v_member.gym_id);
end $$;

grant execute on function public.record_audit(text, text, uuid, jsonb, uuid) to authenticated;
grant execute on function public.staff_set_member_password(uuid, text) to authenticated;

-- =============================================================================
-- 0013_cron_expire.sql
-- =============================================================================
-- =============================================================================
-- 0013_cron_expire.sql — schedule expire_due_subscriptions() daily
-- Flips lapsed subscriptions to 'expired' in the DB (not just derived in the UI)
-- so reports/analytics read true statuses. Runs 00:05 UTC (03:05 Riyadh).
-- =============================================================================
create extension if not exists pg_cron;

do $$
begin
  perform cron.unschedule('expire-subscriptions-daily');
exception when others then null;  -- not scheduled yet
end $$;

select cron.schedule(
  'expire-subscriptions-daily',
  '5 0 * * *',
  $$ select public.expire_due_subscriptions(); $$
);

-- =============================================================================
-- 0014_security_hardening.sql
-- =============================================================================
-- =============================================================================
-- 0014_security_hardening.sql — closes the issues found in the security review
--
--  1. Privilege escalation: profiles_self_update let ANY user rewrite their own
--     role / branch_id / member_id / gym_id (verified live: a member could make
--     itself super_admin and read the whole gym). Guarded by a trigger so the
--     super-admin flows (staff branch reassignment) and the SECURITY DEFINER
--     RPCs (public_join) keep working.
--  2. Private member photos were readable/listable by ANY authenticated user.
--  3. Maintenance RPCs (expire / enqueue) and record_audit were callable by any
--     signed-in user — including PUBLIC, which Postgres grants by default.
--  4. request_password_change leaked whether an email is registered, and a
--     bogus pending request blocked the real owner from filing one.
--  5. record_check_in had no duplicate window: re-scanning burned plan sessions
--     and inflated analytics.
--  6. Members could queue unlimited pending subscriptions with any price_paid.
--  7. Staff invites were claimed by email alone (with autoconfirm on, e-mail
--     ownership is never proven) and never expired → token + expiry.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Profiles: block self-service privilege changes
-- -----------------------------------------------------------------------------
-- SECURITY INVOKER (default) on purpose: `current_user` then reflects the real
-- caller — 'authenticated' for browser traffic, the function owner (postgres)
-- when a SECURITY DEFINER RPC such as public_join performs the update.
create or replace function public.guard_profile_privileges() returns trigger
language plpgsql as $$
begin
  if (new.role, new.branch_id, new.member_id, new.gym_id)
     is distinct from (old.role, old.branch_id, old.member_id, old.gym_id)
     and current_user in ('authenticated', 'anon')
     and not public.is_super_admin() then
    raise exception 'forbidden_privilege_change';
  end if;
  return new;
end $$;

drop trigger if exists trg_guard_profile_privileges on public.profiles;
create trigger trg_guard_profile_privileges before update on public.profiles
  for each row execute function public.guard_profile_privileges();

-- Role/branch changes are security events — record them (DEFINER so the write
-- reaches audit_log, which has no INSERT policy).
create or replace function public.audit_profile_privileges() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (new.role, new.branch_id) is distinct from (old.role, old.branch_id) then
    perform public.record_audit(
      'profile_privileges_changed', 'profile', new.id,
      jsonb_build_object(
        'from_role', old.role, 'to_role', new.role,
        'from_branch', old.branch_id, 'to_branch', new.branch_id
      ),
      new.gym_id
    );
  end if;
  return new;
end $$;

drop trigger if exists trg_audit_profile_privileges on public.profiles;
create trigger trg_audit_profile_privileges after update on public.profiles
  for each row execute function public.audit_profile_privileges();

-- -----------------------------------------------------------------------------
-- 2. Storage: member photos are private data, not "any signed-in user" data
-- -----------------------------------------------------------------------------
drop policy if exists member_photos_read on storage.objects;
create policy member_photos_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'member-photos'
    and (
      public.is_super_admin()
      or public.is_reception()
      or (storage.foldername(name))[1] = public.current_member_id()::text
    )
  );

-- -----------------------------------------------------------------------------
-- 3. Maintenance / audit functions are not for end users.
--    Postgres grants EXECUTE to PUBLIC by default, so revoke there too.
-- -----------------------------------------------------------------------------
revoke execute on function public.expire_due_subscriptions()      from public, anon, authenticated;
revoke execute on function public.enqueue_expiry_notifications()  from public, anon, authenticated;
revoke execute on function public.record_audit(text, text, uuid, jsonb, uuid)
                                                                  from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 4. Password requests: no user enumeration, and a stale/hostile pending
--    request can no longer lock the real owner out of the flow.
--    Minimum length raised to 8 to match the project's auth policy.
-- -----------------------------------------------------------------------------
create or replace function public.request_password_change(
  p_email text,
  p_new_password text
) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_user   auth.users;
  v_prof   public.profiles;
  v_member public.members;
  v_name   text;
begin
  -- The only error we still surface: it is about the caller's own input and
  -- reveals nothing about which accounts exist.
  if p_new_password is null or length(p_new_password) < 8 then
    raise exception 'weak_password';
  end if;

  select * into v_user from auth.users where lower(email) = lower(trim(p_email)) limit 1;
  if not found then return; end if;                      -- silent: no enumeration

  if (select count(*) from public.password_change_requests
        where user_id = v_user.id and created_at > now() - interval '24 hours') >= 5 then
    return;                                              -- silent rate limit
  end if;

  select * into v_prof from public.profiles where id = v_user.id;
  if v_prof.member_id is not null then
    select * into v_member from public.members where id = v_prof.member_id;
  end if;
  v_name := coalesce(v_prof.full_name, v_member.full_name, v_user.email);

  -- Supersede any earlier pending request instead of rejecting the new one:
  -- otherwise anyone could park a request on someone else's account.
  update public.password_change_requests
     set status = 'rejected', decided_at = now()
   where user_id = v_user.id and status = 'pending';

  insert into public.password_change_requests
    (gym_id, user_id, member_id, branch_id, requested_email, requested_name, new_password_hash)
  values (
    v_prof.gym_id, v_user.id, v_prof.member_id, v_prof.branch_id,
    v_user.email, v_name,
    extensions.crypt(p_new_password, extensions.gen_salt('bf', 10))
  );

  perform public.record_audit('password_change_requested', 'user', v_user.id,
    jsonb_build_object('email', v_user.email), v_prof.gym_id);
end $$;

grant execute on function public.request_password_change(text, text) to anon, authenticated;

-- Staff-set passwords follow the same minimum.
create or replace function public.staff_set_member_password(
  p_member_id uuid,
  p_new_password text
) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare v_member public.members;
begin
  if p_new_password is null or length(p_new_password) < 8 then
    raise exception 'weak_password';
  end if;
  select * into v_member from public.members where id = p_member_id;
  if not found then raise exception 'not_found'; end if;
  if not (
    (public.is_super_admin() and v_member.gym_id = public.current_gym_id())
    or (public.is_reception() and v_member.branch_id = public.current_branch_id())
  ) then
    raise exception 'forbidden';
  end if;
  if v_member.user_id is null then raise exception 'no_account'; end if;

  update auth.users
     set encrypted_password = extensions.crypt(p_new_password, extensions.gen_salt('bf', 10)),
         updated_at = now()
   where id = v_member.user_id;

  perform public.record_audit('password_set_by_staff', 'member', p_member_id,
    jsonb_build_object('member', v_member.full_name), v_member.gym_id);
end $$;

grant execute on function public.staff_set_member_password(uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 5. Check-in: one visit per member per hour (guards session-based plans and
--    keeps peak-hour analytics honest when a QR is scanned twice).
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

  if exists (
    select 1 from public.check_ins ci
     where ci.member_id = p_member_id
       and ci.checked_in_at > now() - interval '1 hour'
  ) then
    raise exception 'checkin_duplicate';
  end if;

  insert into public.check_ins (member_id, branch_id, subscription_id, recorded_by)
  values (p_member_id, p_branch_id, v_sub.id, auth.uid())
  returning * into v_check;

  if v_sub.sessions_remaining is not null then
    update public.subscriptions
       set sessions_remaining = sessions_remaining - 1
     where id = v_sub.id;
  end if;

  return v_check;
end $$;

-- -----------------------------------------------------------------------------
-- 6. Members may request ONE pending renewal at a time, never priced by them.
--    The counter lives in a DEFINER helper: a subquery on `subscriptions`
--    inside a policy on `subscriptions` would recurse.
-- -----------------------------------------------------------------------------
create or replace function public.member_pending_subs(p_member uuid) returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from public.subscriptions
   where member_id = p_member and status = 'pending';
$$;
revoke execute on function public.member_pending_subs(uuid) from public, anon;
grant execute on function public.member_pending_subs(uuid) to authenticated;

drop policy if exists subs_member_request on public.subscriptions;
create policy subs_member_request on public.subscriptions
  for insert with check (
    member_id = public.current_member_id()
    and status = 'pending'
    and coalesce(price_paid, 0) = 0
    and public.member_pending_subs(public.current_member_id()) = 0
  );

-- -----------------------------------------------------------------------------
-- 7. Staff invites: a secret token + expiry, not "whoever signs up with this
--    address". The invitee passes the token as sign-up metadata; the bootstrap
--    trigger promotes only on a token + email + not-expired match.
-- -----------------------------------------------------------------------------
alter table public.staff_invites
  add column if not exists token text,
  add column if not exists expires_at timestamptz not null default (now() + interval '7 days');

update public.staff_invites
   set token = encode(extensions.gen_random_bytes(16), 'hex')
 where token is null;

alter table public.staff_invites
  alter column token set default encode(extensions.gen_random_bytes(16), 'hex');
alter table public.staff_invites alter column token set not null;

create unique index if not exists staff_invites_token_idx on public.staff_invites (token);

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  only_gym uuid;
  inv      public.staff_invites;
  v_token  text := new.raw_user_meta_data->>'invite_token';
begin
  select id into only_gym from public.gyms limit 1;

  if v_token is not null and length(v_token) > 0 then
    select * into inv
      from public.staff_invites
     where token = v_token
       and status = 'pending'
       and expires_at > now()
       and lower(email) = lower(new.email)
     limit 1;
  end if;

  if inv.id is not null then
    insert into public.profiles (id, gym_id, role, branch_id, full_name)
    values (
      new.id,
      inv.gym_id,
      inv.role,
      inv.branch_id,
      coalesce(inv.full_name, new.raw_user_meta_data->>'full_name', new.email)
    )
    on conflict (id) do update
      set role = excluded.role, branch_id = excluded.branch_id, gym_id = excluded.gym_id;

    update public.staff_invites
       set status = 'accepted', accepted_at = now(), accepted_user_id = new.id
     where id = inv.id;
  else
    insert into public.profiles (id, gym_id, role, full_name)
    values (
      new.id,
      only_gym,
      'member',
      coalesce(new.raw_user_meta_data->>'full_name', new.email)
    )
    on conflict (id) do nothing;
  end if;

  return new;
end $$;

notify pgrst, 'reload schema';


-- =============================================================================
-- 0015_analytics_and_indexes.sql
-- =============================================================================
-- =============================================================================
-- 0015_analytics_and_indexes.sql — performance work from the review
--
--  * members_overview: one row per member with the CURRENT subscription and the
--    derived display status computed in SQL, so lists can filter/search/paginate
--    on the server instead of shipping every member (with every subscription)
--    to the browser. `security_invoker` keeps RLS in force (PG15+).
--  * analytics_overview(): all dashboard aggregates in one call. The client used
--    to pull raw rows and aggregate in JS, which silently truncated at PostgREST's
--    max-rows = 1000 — check-in analytics would under-report with no warning.
--  * Indexes the RLS policies and the new server-side search actually use.
-- =============================================================================

create extension if not exists pg_trgm;

-- -----------------------------------------------------------------------------
-- members_overview — member + current subscription + display status
-- -----------------------------------------------------------------------------
drop view if exists public.members_overview;
create view public.members_overview with (security_invoker = true) as
select
  m.id,
  m.gym_id,
  m.branch_id,
  m.member_code,
  m.full_name,
  m.phone,
  m.national_id,
  m.gender,
  m.dob,
  m.photo_url,
  m.user_id,
  m.created_at,
  s.id                 as sub_id,
  s.plan_id            as plan_id,
  s.status             as sub_status,
  s.start_date         as start_date,
  s.end_date           as end_date,
  s.sessions_remaining as sessions_remaining,
  s.frozen_days_used   as frozen_days_used,
  case
    when s.id is null              then 'none'
    when s.status = 'pending'      then 'pending'
    when s.status = 'frozen'       then 'frozen'
    when s.status = 'cancelled'    then 'expired'
    when s.status = 'expired'      then 'expired'
    when s.end_date is null        then 'active'
    when s.end_date < public.riyadh_today()                 then 'expired'
    when s.end_date <= public.riyadh_today() + 7            then 'expiring'
    else 'active'
  end as display_status
from public.members m
left join lateral (
  select *
    from public.subscriptions sub
   where sub.member_id = m.id
   order by (case sub.status
               when 'active' then 0 when 'frozen' then 1 when 'pending' then 2
               when 'expired' then 3 else 4 end),
            sub.end_date desc nulls last,
            sub.created_at desc
   limit 1
) s on true;

grant select on public.members_overview to authenticated;

-- -----------------------------------------------------------------------------
-- analytics_overview — every dashboard aggregate in one round trip.
-- SECURITY INVOKER: RLS still scopes the rows (admin = gym, reception = branch).
-- Dates are bucketed in Asia/Riyadh, matching the rest of the system.
-- -----------------------------------------------------------------------------
create or replace function public.analytics_overview(
  p_from   date,
  p_to     date,
  p_branch uuid default null
) returns jsonb
language plpgsql stable security invoker set search_path = public as $$
declare
  v_today       date := public.riyadh_today();
  v_month_start date := date_trunc('month', v_today)::date;
  v_from_ts     timestamptz := (p_from::timestamp at time zone 'Asia/Riyadh');
  v_to_ts       timestamptz := ((p_to + 1)::timestamp at time zone 'Asia/Riyadh');
  v_months      jsonb;
  v_growth      jsonb;
  v_plans       jsonb;
  v_heat        jsonb;
  v_kpis        jsonb;
begin
  -- Revenue per month (total + per branch)
  with months as (
    select generate_series(
             date_trunc('month', p_from::timestamp),
             date_trunc('month', p_to::timestamp),
             interval '1 month')::date as m
  ),
  pay as (
    select date_trunc('month', p.created_at at time zone 'Asia/Riyadh')::date as m,
           p.branch_id,
           p.amount
      from public.payments p
     where p.created_at >= v_from_ts
       and p.created_at <  v_to_ts
       and (p_branch is null or p.branch_id = p_branch)
  )
  select coalesce(jsonb_agg(
           jsonb_build_object(
             'month', to_char(months.m, 'YYYY-MM'),
             'total', coalesce((select sum(pay.amount) from pay where pay.m = months.m), 0),
             'branches', coalesce((
               select jsonb_object_agg(q.branch_id, q.s)
                 from (select pay.branch_id, sum(pay.amount) as s
                         from pay
                        where pay.m = months.m and pay.branch_id is not null
                        group by pay.branch_id) q
             ), '{}'::jsonb)
           ) order by months.m), '[]'::jsonb)
    into v_months
    from months;

  -- Cumulative member growth per month
  with months as (
    select generate_series(
             date_trunc('month', p_from::timestamp),
             date_trunc('month', p_to::timestamp),
             interval '1 month')::date as m
  )
  select coalesce(jsonb_agg(
           jsonb_build_object(
             'month', to_char(months.m, 'YYYY-MM'),
             'count', (select count(*) from public.members mm
                        where (p_branch is null or mm.branch_id = p_branch)
                          and mm.created_at < ((months.m + interval '1 month')::timestamp
                                                at time zone 'Asia/Riyadh'))
           ) order by months.m), '[]'::jsonb)
    into v_growth
    from months;

  -- Plan popularity by CURRENT subscription
  select coalesce(jsonb_agg(jsonb_build_object('plan_id', q.plan_id, 'count', q.c)), '[]'::jsonb)
    into v_plans
    from (
      select mo.plan_id, count(*) as c
        from public.members_overview mo
       where mo.plan_id is not null
         and (p_branch is null or mo.branch_id = p_branch)
       group by mo.plan_id
    ) q;

  -- Check-in heatmap (day of week 0=Sun, hour 0-23, Riyadh time)
  select coalesce(jsonb_agg(jsonb_build_object('dow', q.d, 'hour', q.h, 'count', q.c)), '[]'::jsonb)
    into v_heat
    from (
      select extract(dow  from c.checked_in_at at time zone 'Asia/Riyadh')::int as d,
             extract(hour from c.checked_in_at at time zone 'Asia/Riyadh')::int as h,
             count(*) as c
        from public.check_ins c
       where c.checked_in_at >= v_from_ts
         and c.checked_in_at <  v_to_ts
         and (p_branch is null or c.branch_id = p_branch)
       group by 1, 2
    ) q;

  -- KPIs
  with scoped as (
    select mo.id, mo.display_status, mo.created_at,
           (select count(*) from public.subscriptions s
             where s.member_id = mo.id and s.status <> 'pending') as real_subs
      from public.members_overview mo
     where (p_branch is null or mo.branch_id = p_branch)
  ),
  rev as (
    select coalesce(sum(p.amount), 0) as total
      from public.payments p
     where (p_branch is null or p.branch_id = p_branch)
       and p.created_at >= (v_month_start::timestamp at time zone 'Asia/Riyadh')
  )
  select jsonb_build_object(
           'active',        count(*) filter (where display_status in ('active','expiring')),
           'expiring',      count(*) filter (where display_status = 'expiring'),
           'expired',       count(*) filter (where display_status = 'expired'),
           'total_members', count(*),
           'new_month',     count(*) filter (
                              where created_at >= (v_month_start::timestamp at time zone 'Asia/Riyadh')),
           'revenue_month', (select total from rev),
           'renewal_rate',  case when count(*) filter (where real_subs > 0) = 0 then 0
                              else round(100.0 * count(*) filter (where real_subs > 1)
                                             / count(*) filter (where real_subs > 0)) end,
           'churn_rate',    case when count(*) filter (where real_subs > 0) = 0 then 0
                              else round(100.0 * count(*) filter (where real_subs > 0
                                                                    and display_status = 'expired')
                                             / count(*) filter (where real_subs > 0)) end
         )
    into v_kpis
    from scoped;

  return jsonb_build_object(
    'kpis',            v_kpis,
    'revenue_by_month', v_months,
    'member_growth',    v_growth,
    'plan_popularity',  v_plans,
    'heatmap',          v_heat
  );
end $$;

grant execute on function public.analytics_overview(date, date, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Indexes: RLS filters + the new server-side member search
-- -----------------------------------------------------------------------------
create index if not exists idx_payments_gym        on public.payments(gym_id);
create index if not exists idx_payments_gym_created on public.payments(gym_id, created_at desc);
create index if not exists idx_notif_gym           on public.notifications(gym_id);
create index if not exists idx_checkins_branch_at  on public.check_ins(branch_id, checked_in_at desc);
create index if not exists idx_subs_member_status  on public.subscriptions(member_id, status);
create index if not exists idx_members_gym_created on public.members(gym_id, created_at desc);
create index if not exists idx_members_name_trgm   on public.members using gin (full_name gin_trgm_ops);
create index if not exists idx_members_phone_trgm  on public.members using gin (phone gin_trgm_ops);

notify pgrst, 'reload schema';

-- =============================================================================
-- 0016_public_site_payload.sql
-- =============================================================================
-- =============================================================================
-- 0016_public_site_payload.sql — one request for the whole marketing site
--
-- The public pages were fetching gym + plans + branches + trainers + site
-- content as five separate PostgREST calls (six in practice: the brand provider
-- fetched the gym again), and the page rendered nothing until all of them
-- resolved. This project lives in ap-northeast-1 (Tokyo) while its users are in
-- Saudi Arabia, so every one of those round trips is expensive — the visitor sat
-- on "loading" for the slowest of six intercontinental requests.
--
-- public_site_data() returns the entire payload in a single call. SECURITY
-- INVOKER: these tables are anon-readable by policy, so the function grants no
-- access that a direct select did not already have.
-- =============================================================================

create or replace function public.public_site_data()
returns jsonb
language sql
stable
security invoker
set search_path = public as $$
  select jsonb_build_object(
    'gym',      (select to_jsonb(g) from public.gyms g limit 1),
    'plans',    coalesce((select jsonb_agg(to_jsonb(p) order by p.sort_order)
                            from public.plans p where p.is_active), '[]'::jsonb),
    'branches', coalesce((select jsonb_agg(to_jsonb(b) order by b.name_ar)
                            from public.branches b), '[]'::jsonb),
    'trainers', coalesce((select jsonb_agg(to_jsonb(t) order by t.sort_order)
                            from public.trainers t where t.is_active), '[]'::jsonb),
    'content',  coalesce((select jsonb_object_agg(s.key, s.content)
                            from public.site_content s), '{}'::jsonb)
  );
$$;

grant execute on function public.public_site_data() to anon, authenticated;

notify pgrst, 'reload schema';

-- =============================================================================
-- 0017_phone_login_and_report.sql
-- =============================================================================
-- =============================================================================
-- 0017_phone_login_and_report.sql
--   * login_email_for_phone(): members sign in with the phone number they
--     actually remember, without an SMS/WhatsApp provider.
--   * monthly_report(): the month's money in one call, RLS-scoped.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Sign in by phone
--
-- Supabase Auth signs in by email; adding phone auth means paying an SMS
-- provider. Members, though, are identified by their phone everywhere else in
-- this system and will not remember which email reception typed for them.
--
-- The bridge is deliberately narrow: this function returns the account's email
-- ONLY when the supplied password already verifies against it. A wrong password
-- returns null, so it can never be used to map phone numbers to email addresses
-- — the obvious way to get this wrong. The client then performs a completely
-- normal email+password sign-in with what it got back; no session is minted
-- here and no privilege is granted that the password did not already carry.
-- -----------------------------------------------------------------------------

create table if not exists public.login_attempts (
  id           bigint generated always as identity primary key,
  identifier   text not null,
  attempted_at timestamptz not null default now()
);
create index if not exists idx_login_attempts on public.login_attempts (identifier, attempted_at desc);

alter table public.login_attempts enable row level security;
-- No policies: only the SECURITY DEFINER function below touches this table.

create or replace function public.login_email_for_phone(
  p_phone    text,
  p_password text
) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_phone  text;
  v_member public.members;
  v_user   auth.users;
begin
  -- Accept 05…, +9665…, 9665… and anything with spaces or dashes in it.
  v_phone := regexp_replace(coalesce(p_phone, ''), '[^0-9+]', '', 'g');
  if v_phone like '+9665%' then v_phone := '0' || substring(v_phone from 5); end if;
  if v_phone like '9665%'  then v_phone := '0' || substring(v_phone from 4); end if;
  if v_phone !~ '^05[0-9]{8}$' then return null; end if;

  -- Housekeeping: this table only exists for the rolling window below.
  delete from public.login_attempts where attempted_at < now() - interval '1 day';

  if (select count(*) from public.login_attempts
        where identifier = v_phone and attempted_at > now() - interval '15 minutes') >= 10 then
    raise exception 'rate_limited';
  end if;
  insert into public.login_attempts (identifier) values (v_phone);

  select * into v_member from public.members
   where phone = v_phone and user_id is not null
   limit 1;
  if not found then return null; end if;

  select * into v_user from auth.users where id = v_member.user_id;
  if not found or v_user.encrypted_password is null then return null; end if;

  -- The password gate. Everything above this line is worthless to an attacker.
  if extensions.crypt(p_password, v_user.encrypted_password) <> v_user.encrypted_password then
    return null;
  end if;

  return v_user.email;
end $$;

revoke execute on function public.login_email_for_phone(text, text) from public;
grant execute on function public.login_email_for_phone(text, text) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Monthly financial report
--
-- SECURITY INVOKER: RLS scopes it exactly like every other read, so a reception
-- user gets their own branch's month and a super admin gets the gym's.
-- Amounts are bucketed in Asia/Riyadh, like the rest of the system.
-- -----------------------------------------------------------------------------
create or replace function public.monthly_report(
  p_month  date,
  p_branch uuid default null
) returns jsonb
language plpgsql stable security invoker set search_path = public as $$
declare
  v_start     date := date_trunc('month', p_month)::date;
  v_end       date := (date_trunc('month', p_month) + interval '1 month')::date;
  v_prev      date := (date_trunc('month', p_month) - interval '1 month')::date;
  v_start_ts  timestamptz := (v_start::timestamp at time zone 'Asia/Riyadh');
  v_end_ts    timestamptz := (v_end::timestamp   at time zone 'Asia/Riyadh');
  v_prev_ts   timestamptz := (v_prev::timestamp  at time zone 'Asia/Riyadh');
  v_total     numeric;
  v_count     int;
  v_prev_tot  numeric;
  v_branches  jsonb;
  v_plans     jsonb;
  v_methods   jsonb;
  v_new       int;
  v_active    int;
begin
  select coalesce(sum(amount), 0), count(*)
    into v_total, v_count
    from public.payments p
   where p.created_at >= v_start_ts and p.created_at < v_end_ts
     and (p_branch is null or p.branch_id = p_branch);

  select coalesce(sum(amount), 0)
    into v_prev_tot
    from public.payments p
   where p.created_at >= v_prev_ts and p.created_at < v_start_ts
     and (p_branch is null or p.branch_id = p_branch);

  select coalesce(jsonb_agg(jsonb_build_object(
           'branch_id', q.branch_id, 'total', q.total, 'count', q.n) order by q.total desc), '[]'::jsonb)
    into v_branches
    from (select p.branch_id, sum(p.amount) as total, count(*) as n
            from public.payments p
           where p.created_at >= v_start_ts and p.created_at < v_end_ts
             and (p_branch is null or p.branch_id = p_branch)
           group by p.branch_id) q;

  -- Plan mix: payments carry the subscription, the subscription carries the plan.
  select coalesce(jsonb_agg(jsonb_build_object(
           'plan_id', q.plan_id, 'total', q.total, 'count', q.n) order by q.total desc), '[]'::jsonb)
    into v_plans
    from (select s.plan_id, sum(p.amount) as total, count(*) as n
            from public.payments p
            join public.subscriptions s on s.id = p.subscription_id
           where p.created_at >= v_start_ts and p.created_at < v_end_ts
             and (p_branch is null or p.branch_id = p_branch)
           group by s.plan_id) q;

  select coalesce(jsonb_agg(jsonb_build_object(
           'method', q.method, 'total', q.total, 'count', q.n) order by q.total desc), '[]'::jsonb)
    into v_methods
    from (select p.method::text as method, sum(p.amount) as total, count(*) as n
            from public.payments p
           where p.created_at >= v_start_ts and p.created_at < v_end_ts
             and (p_branch is null or p.branch_id = p_branch)
           group by p.method) q;

  select count(*) into v_new
    from public.members m
   where m.created_at >= v_start_ts and m.created_at < v_end_ts
     and (p_branch is null or m.branch_id = p_branch);

  select count(*) into v_active
    from public.members_overview mo
   where mo.display_status in ('active', 'expiring')
     and (p_branch is null or mo.branch_id = p_branch);

  return jsonb_build_object(
    'month',          to_char(v_start, 'YYYY-MM'),
    'prev_month',     to_char(v_prev, 'YYYY-MM'),
    'revenue',        v_total,
    'revenue_prev',   v_prev_tot,
    'payments_count', v_count,
    'by_branch',      v_branches,
    'by_plan',        v_plans,
    'by_method',      v_methods,
    'new_members',    v_new,
    'active_members', v_active,
    'generated_at',   to_char(now() at time zone 'Asia/Riyadh', 'YYYY-MM-DD HH24:MI')
  );
end $$;

grant execute on function public.monthly_report(date, uuid) to authenticated;

notify pgrst, 'reload schema';

-- =============================================================================
-- 0018_report_grant.sql
-- =============================================================================
-- =============================================================================
-- 0018_report_grant.sql — finish what 0014 started for the newest RPC
--
-- Postgres grants EXECUTE to PUBLIC by default, so `monthly_report` shipped
-- callable by anon. It is SECURITY INVOKER, so an anon caller reads nothing and
-- gets a report of zeros — no leak — but leaving it open is inconsistent with
-- the rest of the hardening and invites someone to lean on it later.
-- =============================================================================

revoke execute on function public.monthly_report(date, uuid) from public, anon;
grant  execute on function public.monthly_report(date, uuid) to authenticated;

notify pgrst, 'reload schema';
