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

-- =============================================================================
-- 0019_gym_calendar.sql
-- =============================================================================
-- =============================================================================
-- 0019_gym_calendar.sql — which calendar a gym leads with
--
-- Dates are always stored and computed in Gregorian; this only decides which
-- one a human sees first. Both are shown either way — a Saudi gym reads Hijri
-- but pays suppliers, files VAT and reconciles bank statements in Gregorian, so
-- dropping either calendar costs someone real work.
--
-- It lives on `gyms` because this is a white-label product: the first gym leads
-- with Hijri, the next one may not, and neither should need a code change.
-- =============================================================================

alter table public.gyms
  add column if not exists calendar text not null default 'hijri'
  check (calendar in ('hijri', 'gregorian'));

comment on column public.gyms.calendar is
  'Which calendar leads in the UI: hijri | gregorian. Storage stays Gregorian.';

notify pgrst, 'reload schema';

-- =============================================================================
-- 0020_hijri_terms.sql
-- =============================================================================
-- =============================================================================
-- 0020_hijri_terms.sql — subscription terms in the gym's own calendar
--
-- A "one month" subscription at a Hijri gym means one HIJRI month (29–30 days),
-- not a Gregorian one (28–31). Adding Gregorian months gave every member one to
-- two free days a month — about eleven days a year each. Display and arithmetic
-- have to agree, so the term maths now follows gyms.calendar.
--
-- Postgres has no Islamic calendar, and there is no extension for it, so the
-- Umm al-Qura month starts are stored as data. The table was generated from the
-- browser's own ICU data — the same source `Intl` renders these dates from —
-- because a table taken from anywhere else could compute an expiry that the
-- member's screen disagrees with, which is the exact failure this is meant to
-- prevent.
--
-- It was cross-checked against @tabby_ai/hijri-converter (the converter
-- react-day-picker itself uses), month start by month start: 1420–1449 AH
-- (≈1998–2028) matched on all 360 months. Outside that window the two
-- implementations differ by a day on some months — historical reconstruction
-- and far-future extrapolation are not settled between implementations — which
-- is documented rather than hidden. Every subscription this system will write
-- falls inside the corroborated window.
--
-- Nothing here changes an existing subscription: only new calculations.
-- =============================================================================

create table if not exists public.hijri_months (
  hy         smallint not null,
  hm         smallint not null check (hm between 1 and 12),
  starts_on  date not null unique,
  primary key (hy, hm)
);

alter table public.hijri_months enable row level security;

-- Calendar data is not gym data: anyone may read it, nobody may write it
-- (no INSERT/UPDATE/DELETE policy exists).
drop policy if exists hijri_months_read on public.hijri_months;
create policy hijri_months_read on public.hijri_months for select using (true);

insert into public.hijri_months (hy, hm, starts_on) values
  (1400,3,'1980-01-19'),(1400,4,'1980-02-18'),(1400,5,'1980-03-18'),(1400,6,'1980-04-16'),(1400,7,'1980-05-16'),(1400,8,'1980-06-14'),(1400,9,'1980-07-14'),(1400,10,'1980-08-12'),(1400,11,'1980-09-11'),(1400,12,'1980-10-10'),(1401,1,'1980-11-09'),(1401,2,'1980-12-09'),(1401,3,'1981-01-08'),(1401,4,'1981-02-06'),(1401,5,'1981-03-08'),(1401,6,'1981-04-06'),(1401,7,'1981-05-05'),(1401,8,'1981-06-04'),(1401,9,'1981-07-03'),(1401,10,'1981-08-01'),
  (1401,11,'1981-08-31'),(1401,12,'1981-09-29'),(1402,1,'1981-10-29'),(1402,2,'1981-11-28'),(1402,3,'1981-12-28'),(1402,4,'1982-01-27'),(1402,5,'1982-02-25'),(1402,6,'1982-03-27'),(1402,7,'1982-04-25'),(1402,8,'1982-05-24'),(1402,9,'1982-06-23'),(1402,10,'1982-07-22'),(1402,11,'1982-08-20'),(1402,12,'1982-09-19'),(1403,1,'1982-10-18'),(1403,2,'1982-11-17'),(1403,3,'1982-12-17'),(1403,4,'1983-01-16'),(1403,5,'1983-02-14'),(1403,6,'1983-03-16'),
  (1403,7,'1983-04-15'),(1403,8,'1983-05-14'),(1403,9,'1983-06-12'),(1403,10,'1983-07-12'),(1403,11,'1983-08-10'),(1403,12,'1983-09-08'),(1404,1,'1983-10-08'),(1404,2,'1983-11-06'),(1404,3,'1983-12-06'),(1404,4,'1984-01-05'),(1404,5,'1984-02-03'),(1404,6,'1984-03-04'),(1404,7,'1984-04-03'),(1404,8,'1984-05-02'),(1404,9,'1984-06-01'),(1404,10,'1984-06-30'),(1404,11,'1984-07-30'),(1404,12,'1984-08-28'),(1405,1,'1984-09-26'),(1405,2,'1984-10-26'),
  (1405,3,'1984-11-24'),(1405,4,'1984-12-24'),(1405,5,'1985-01-22'),(1405,6,'1985-02-21'),(1405,7,'1985-03-23'),(1405,8,'1985-04-22'),(1405,9,'1985-05-21'),(1405,10,'1985-06-20'),(1405,11,'1985-07-19'),(1405,12,'1985-08-17'),(1406,1,'1985-09-16'),(1406,2,'1985-10-16'),(1406,3,'1985-11-14'),(1406,4,'1985-12-13'),(1406,5,'1986-01-12'),(1406,6,'1986-02-10'),(1406,7,'1986-03-12'),(1406,8,'1986-04-11'),(1406,9,'1986-05-10'),(1406,10,'1986-06-09'),
  (1406,11,'1986-07-08'),(1406,12,'1986-08-07'),(1407,1,'1986-09-06'),(1407,2,'1986-10-05'),(1407,3,'1986-11-04'),(1407,4,'1986-12-03'),(1407,5,'1987-01-01'),(1407,6,'1987-01-31'),(1407,7,'1987-03-01'),(1407,8,'1987-03-31'),(1407,9,'1987-04-29'),(1407,10,'1987-05-29'),(1407,11,'1987-06-27'),(1407,12,'1987-07-27'),(1408,1,'1987-08-26'),(1408,2,'1987-09-25'),(1408,3,'1987-10-24'),(1408,4,'1987-11-23'),(1408,5,'1987-12-22'),(1408,6,'1988-01-21'),
  (1408,7,'1988-02-19'),(1408,8,'1988-03-19'),(1408,9,'1988-04-18'),(1408,10,'1988-05-17'),(1408,11,'1988-06-15'),(1408,12,'1988-07-15'),(1409,1,'1988-08-14'),(1409,2,'1988-09-13'),(1409,3,'1988-10-13'),(1409,4,'1988-11-11'),(1409,5,'1988-12-11'),(1409,6,'1989-01-09'),(1409,7,'1989-02-08'),(1409,8,'1989-03-09'),(1409,9,'1989-04-07'),(1409,10,'1989-05-07'),(1409,11,'1989-06-05'),(1409,12,'1989-07-04'),(1410,1,'1989-08-03'),(1410,2,'1989-09-02'),
  (1410,3,'1989-10-02'),(1410,4,'1989-10-31'),(1410,5,'1989-11-30'),(1410,6,'1989-12-30'),(1410,7,'1990-01-28'),(1410,8,'1990-02-27'),(1410,9,'1990-03-28'),(1410,10,'1990-04-26'),(1410,11,'1990-05-26'),(1410,12,'1990-06-24'),(1411,1,'1990-07-23'),(1411,2,'1990-08-22'),(1411,3,'1990-09-21'),(1411,4,'1990-10-20'),(1411,5,'1990-11-19'),(1411,6,'1990-12-19'),(1411,7,'1991-01-17'),(1411,8,'1991-02-16'),(1411,9,'1991-03-18'),(1411,10,'1991-04-16'),
  (1411,11,'1991-05-15'),(1411,12,'1991-06-14'),(1412,1,'1991-07-13'),(1412,2,'1991-08-12'),(1412,3,'1991-09-10'),(1412,4,'1991-10-10'),(1412,5,'1991-11-08'),(1412,6,'1991-12-08'),(1412,7,'1992-01-06'),(1412,8,'1992-02-05'),(1412,9,'1992-03-06'),(1412,10,'1992-04-05'),(1412,11,'1992-05-04'),(1412,12,'1992-06-02'),(1413,1,'1992-07-02'),(1413,2,'1992-07-31'),(1413,3,'1992-08-30'),(1413,4,'1992-09-28'),(1413,5,'1992-10-27'),(1413,6,'1992-11-26'),
  (1413,7,'1992-12-25'),(1413,8,'1993-01-24'),(1413,9,'1993-02-23'),(1413,10,'1993-03-25'),(1413,11,'1993-04-23'),(1413,12,'1993-05-23'),(1414,1,'1993-06-21'),(1414,2,'1993-07-21'),(1414,3,'1993-08-19'),(1414,4,'1993-09-18'),(1414,5,'1993-10-17'),(1414,6,'1993-11-15'),(1414,7,'1993-12-15'),(1414,8,'1994-01-13'),(1414,9,'1994-02-12'),(1414,10,'1994-03-14'),(1414,11,'1994-04-12'),(1414,12,'1994-05-12'),(1415,1,'1994-06-11'),(1415,2,'1994-07-10'),
  (1415,3,'1994-08-09'),(1415,4,'1994-09-07'),(1415,5,'1994-10-07'),(1415,6,'1994-11-05'),(1415,7,'1994-12-04'),(1415,8,'1995-01-03'),(1415,9,'1995-02-01'),(1415,10,'1995-03-03'),(1415,11,'1995-04-01'),(1415,12,'1995-05-01'),(1416,1,'1995-05-31'),(1416,2,'1995-06-30'),(1416,3,'1995-07-29'),(1416,4,'1995-08-28'),(1416,5,'1995-09-26'),(1416,6,'1995-10-26'),(1416,7,'1995-11-24'),(1416,8,'1995-12-23'),(1416,9,'1996-01-22'),(1416,10,'1996-02-20'),
  (1416,11,'1996-03-21'),(1416,12,'1996-04-19'),(1417,1,'1996-05-19'),(1417,2,'1996-06-18'),(1417,3,'1996-07-17'),(1417,4,'1996-08-16'),(1417,5,'1996-09-15'),(1417,6,'1996-10-14'),(1417,7,'1996-11-12'),(1417,8,'1996-12-12'),(1417,9,'1997-01-10'),(1417,10,'1997-02-09'),(1417,11,'1997-03-10'),(1417,12,'1997-04-09'),(1418,1,'1997-05-08'),(1418,2,'1997-06-07'),(1418,3,'1997-07-06'),(1418,4,'1997-08-05'),(1418,5,'1997-09-04'),(1418,6,'1997-10-03'),
  (1418,7,'1997-11-02'),(1418,8,'1997-12-01'),(1418,9,'1997-12-31'),(1418,10,'1998-01-29'),(1418,11,'1998-02-28'),(1418,12,'1998-03-29'),(1419,1,'1998-04-28'),(1419,2,'1998-05-27'),(1419,3,'1998-06-26'),(1419,4,'1998-07-25'),(1419,5,'1998-08-24'),(1419,6,'1998-09-22'),(1419,7,'1998-10-22'),(1419,8,'1998-11-20'),(1419,9,'1998-12-20'),(1419,10,'1999-01-19'),(1419,11,'1999-02-18'),(1419,12,'1999-03-19'),(1420,1,'1999-04-17'),(1420,2,'1999-05-16'),
  (1420,3,'1999-06-15'),(1420,4,'1999-07-14'),(1420,5,'1999-08-12'),(1420,6,'1999-09-11'),(1420,7,'1999-10-10'),(1420,8,'1999-11-09'),(1420,9,'1999-12-09'),(1420,10,'2000-01-08'),(1420,11,'2000-02-07'),(1420,12,'2000-03-07'),(1421,1,'2000-04-06'),(1421,2,'2000-05-05'),(1421,3,'2000-06-03'),(1421,4,'2000-07-03'),(1421,5,'2000-08-01'),(1421,6,'2000-08-30'),(1421,7,'2000-09-28'),(1421,8,'2000-10-28'),(1421,9,'2000-11-27'),(1421,10,'2000-12-27'),
  (1421,11,'2001-01-26'),(1421,12,'2001-02-24'),(1422,1,'2001-03-26'),(1422,2,'2001-04-25'),(1422,3,'2001-05-24'),(1422,4,'2001-06-22'),(1422,5,'2001-07-22'),(1422,6,'2001-08-20'),(1422,7,'2001-09-18'),(1422,8,'2001-10-17'),(1422,9,'2001-11-16'),(1422,10,'2001-12-16'),(1422,11,'2002-01-15'),(1422,12,'2002-02-13'),(1423,1,'2002-03-15'),(1423,2,'2002-04-14'),(1423,3,'2002-05-13'),(1423,4,'2002-06-12'),(1423,5,'2002-07-11'),(1423,6,'2002-08-10'),
  (1423,7,'2002-09-08'),(1423,8,'2002-10-07'),(1423,9,'2002-11-06'),(1423,10,'2002-12-05'),(1423,11,'2003-01-04'),(1423,12,'2003-02-02'),(1424,1,'2003-03-04'),(1424,2,'2003-04-03'),(1424,3,'2003-05-02'),(1424,4,'2003-06-01'),(1424,5,'2003-07-01'),(1424,6,'2003-07-30'),(1424,7,'2003-08-29'),(1424,8,'2003-09-27'),(1424,9,'2003-10-26'),(1424,10,'2003-11-25'),(1424,11,'2003-12-24'),(1424,12,'2004-01-23'),(1425,1,'2004-02-21'),(1425,2,'2004-03-22'),
  (1425,3,'2004-04-20'),(1425,4,'2004-05-20'),(1425,5,'2004-06-19'),(1425,6,'2004-07-18'),(1425,7,'2004-08-17'),(1425,8,'2004-09-15'),(1425,9,'2004-10-15'),(1425,10,'2004-11-14'),(1425,11,'2004-12-13'),(1425,12,'2005-01-12'),(1426,1,'2005-02-10'),(1426,2,'2005-03-11'),(1426,3,'2005-04-10'),(1426,4,'2005-05-09'),(1426,5,'2005-06-08'),(1426,6,'2005-07-07'),(1426,7,'2005-08-06'),(1426,8,'2005-09-05'),(1426,9,'2005-10-04'),(1426,10,'2005-11-03'),
  (1426,11,'2005-12-03'),(1426,12,'2006-01-01'),(1427,1,'2006-01-31'),(1427,2,'2006-03-01'),(1427,3,'2006-03-30'),(1427,4,'2006-04-29'),(1427,5,'2006-05-28'),(1427,6,'2006-06-27'),(1427,7,'2006-07-26'),(1427,8,'2006-08-25'),(1427,9,'2006-09-24'),(1427,10,'2006-10-23'),(1427,11,'2006-11-22'),(1427,12,'2006-12-22'),(1428,1,'2007-01-20'),(1428,2,'2007-02-19'),(1428,3,'2007-03-20'),(1428,4,'2007-04-18'),(1428,5,'2007-05-18'),(1428,6,'2007-06-16'),
  (1428,7,'2007-07-15'),(1428,8,'2007-08-14'),(1428,9,'2007-09-13'),(1428,10,'2007-10-13'),(1428,11,'2007-11-11'),(1428,12,'2007-12-11'),(1429,1,'2008-01-10'),(1429,2,'2008-02-08'),(1429,3,'2008-03-09'),(1429,4,'2008-04-07'),(1429,5,'2008-05-06'),(1429,6,'2008-06-05'),(1429,7,'2008-07-04'),(1429,8,'2008-08-02'),(1429,9,'2008-09-01'),(1429,10,'2008-10-01'),(1429,11,'2008-10-30'),(1429,12,'2008-11-29'),(1430,1,'2008-12-29'),(1430,2,'2009-01-27'),
  (1430,3,'2009-02-26'),(1430,4,'2009-03-28'),(1430,5,'2009-04-26'),(1430,6,'2009-05-25'),(1430,7,'2009-06-24'),(1430,8,'2009-07-23'),(1430,9,'2009-08-22'),(1430,10,'2009-09-20'),(1430,11,'2009-10-20'),(1430,12,'2009-11-18'),(1431,1,'2009-12-18'),(1431,2,'2010-01-16'),(1431,3,'2010-02-15'),(1431,4,'2010-03-17'),(1431,5,'2010-04-15'),(1431,6,'2010-05-15'),(1431,7,'2010-06-13'),(1431,8,'2010-07-13'),(1431,9,'2010-08-11'),(1431,10,'2010-09-10'),
  (1431,11,'2010-10-09'),(1431,12,'2010-11-07'),(1432,1,'2010-12-07'),(1432,2,'2011-01-05'),(1432,3,'2011-02-04'),(1432,4,'2011-03-06'),(1432,5,'2011-04-05'),(1432,6,'2011-05-04'),(1432,7,'2011-06-03'),(1432,8,'2011-07-02'),(1432,9,'2011-08-01'),(1432,10,'2011-08-30'),(1432,11,'2011-09-29'),(1432,12,'2011-10-28'),(1433,1,'2011-11-26'),(1433,2,'2011-12-26'),(1433,3,'2012-01-24'),(1433,4,'2012-02-23'),(1433,5,'2012-03-24'),(1433,6,'2012-04-22'),
  (1433,7,'2012-05-22'),(1433,8,'2012-06-21'),(1433,9,'2012-07-20'),(1433,10,'2012-08-19'),(1433,11,'2012-09-17'),(1433,12,'2012-10-17'),(1434,1,'2012-11-15'),(1434,2,'2012-12-14'),(1434,3,'2013-01-13'),(1434,4,'2013-02-11'),(1434,5,'2013-03-13'),(1434,6,'2013-04-11'),(1434,7,'2013-05-11'),(1434,8,'2013-06-10'),(1434,9,'2013-07-09'),(1434,10,'2013-08-08'),(1434,11,'2013-09-07'),(1434,12,'2013-10-06'),(1435,1,'2013-11-04'),(1435,2,'2013-12-04'),
  (1435,3,'2014-01-02'),(1435,4,'2014-02-01'),(1435,5,'2014-03-02'),(1435,6,'2014-04-01'),(1435,7,'2014-04-30'),(1435,8,'2014-05-30'),(1435,9,'2014-06-28'),(1435,10,'2014-07-28'),(1435,11,'2014-08-27'),(1435,12,'2014-09-25'),(1436,1,'2014-10-25'),(1436,2,'2014-11-23'),(1436,3,'2014-12-23'),(1436,4,'2015-01-21'),(1436,5,'2015-02-20'),(1436,6,'2015-03-21'),(1436,7,'2015-04-20'),(1436,8,'2015-05-19'),(1436,9,'2015-06-18'),(1436,10,'2015-07-17'),
  (1436,11,'2015-08-16'),(1436,12,'2015-09-14'),(1437,1,'2015-10-14'),(1437,2,'2015-11-13'),(1437,3,'2015-12-12'),(1437,4,'2016-01-11'),(1437,5,'2016-02-10'),(1437,6,'2016-03-10'),(1437,7,'2016-04-08'),(1437,8,'2016-05-08'),(1437,9,'2016-06-06'),(1437,10,'2016-07-06'),(1437,11,'2016-08-04'),(1437,12,'2016-09-02'),(1438,1,'2016-10-02'),(1438,2,'2016-11-01'),(1438,3,'2016-11-30'),(1438,4,'2016-12-30'),(1438,5,'2017-01-29'),(1438,6,'2017-02-28'),
  (1438,7,'2017-03-29'),(1438,8,'2017-04-27'),(1438,9,'2017-05-27'),(1438,10,'2017-06-25'),(1438,11,'2017-07-24'),(1438,12,'2017-08-23'),(1439,1,'2017-09-21'),(1439,2,'2017-10-21'),(1439,3,'2017-11-19'),(1439,4,'2017-12-19'),(1439,5,'2018-01-18'),(1439,6,'2018-02-17'),(1439,7,'2018-03-18'),(1439,8,'2018-04-17'),(1439,9,'2018-05-16'),(1439,10,'2018-06-15'),(1439,11,'2018-07-14'),(1439,12,'2018-08-12'),(1440,1,'2018-09-11'),(1440,2,'2018-10-10'),
  (1440,3,'2018-11-09'),(1440,4,'2018-12-08'),(1440,5,'2019-01-07'),(1440,6,'2019-02-06'),(1440,7,'2019-03-08'),(1440,8,'2019-04-06'),(1440,9,'2019-05-06'),(1440,10,'2019-06-04'),(1440,11,'2019-07-04'),(1440,12,'2019-08-02'),(1441,1,'2019-08-31'),(1441,2,'2019-09-30'),(1441,3,'2019-10-29'),(1441,4,'2019-11-28'),(1441,5,'2019-12-27'),(1441,6,'2020-01-26'),(1441,7,'2020-02-25'),(1441,8,'2020-03-25'),(1441,9,'2020-04-24'),(1441,10,'2020-05-24'),
  (1441,11,'2020-06-22'),(1441,12,'2020-07-22'),(1442,1,'2020-08-20'),(1442,2,'2020-09-18'),(1442,3,'2020-10-18'),(1442,4,'2020-11-16'),(1442,5,'2020-12-16'),(1442,6,'2021-01-14'),(1442,7,'2021-02-13'),(1442,8,'2021-03-14'),(1442,9,'2021-04-13'),(1442,10,'2021-05-13'),(1442,11,'2021-06-11'),(1442,12,'2021-07-11'),(1443,1,'2021-08-09'),(1443,2,'2021-09-08'),(1443,3,'2021-10-07'),(1443,4,'2021-11-06'),(1443,5,'2021-12-05'),(1443,6,'2022-01-04'),
  (1443,7,'2022-02-02'),(1443,8,'2022-03-04'),(1443,9,'2022-04-02'),(1443,10,'2022-05-02'),(1443,11,'2022-05-31'),(1443,12,'2022-06-30'),(1444,1,'2022-07-30'),(1444,2,'2022-08-28'),(1444,3,'2022-09-27'),(1444,4,'2022-10-26'),(1444,5,'2022-11-25'),(1444,6,'2022-12-25'),(1444,7,'2023-01-23'),(1444,8,'2023-02-21'),(1444,9,'2023-03-23'),(1444,10,'2023-04-21'),(1444,11,'2023-05-21'),(1444,12,'2023-06-19'),(1445,1,'2023-07-19'),(1445,2,'2023-08-17'),
  (1445,3,'2023-09-16'),(1445,4,'2023-10-16'),(1445,5,'2023-11-15'),(1445,6,'2023-12-14'),(1445,7,'2024-01-13'),(1445,8,'2024-02-11'),(1445,9,'2024-03-11'),(1445,10,'2024-04-10'),(1445,11,'2024-05-09'),(1445,12,'2024-06-07'),(1446,1,'2024-07-07'),(1446,2,'2024-08-05'),(1446,3,'2024-09-04'),(1446,4,'2024-10-04'),(1446,5,'2024-11-03'),(1446,6,'2024-12-02'),(1446,7,'2025-01-01'),(1446,8,'2025-01-31'),(1446,9,'2025-03-01'),(1446,10,'2025-03-30'),
  (1446,11,'2025-04-29'),(1446,12,'2025-05-28'),(1447,1,'2025-06-26'),(1447,2,'2025-07-26'),(1447,3,'2025-08-24'),(1447,4,'2025-09-23'),(1447,5,'2025-10-23'),(1447,6,'2025-11-22'),(1447,7,'2025-12-21'),(1447,8,'2026-01-20'),(1447,9,'2026-02-18'),(1447,10,'2026-03-20'),(1447,11,'2026-04-18'),(1447,12,'2026-05-18'),(1448,1,'2026-06-16'),(1448,2,'2026-07-15'),(1448,3,'2026-08-14'),(1448,4,'2026-09-12'),(1448,5,'2026-10-12'),(1448,6,'2026-11-11'),
  (1448,7,'2026-12-10'),(1448,8,'2027-01-09'),(1448,9,'2027-02-08'),(1448,10,'2027-03-09'),(1448,11,'2027-04-08'),(1448,12,'2027-05-07'),(1449,1,'2027-06-06'),(1449,2,'2027-07-05'),(1449,3,'2027-08-03'),(1449,4,'2027-09-02'),(1449,5,'2027-10-01'),(1449,6,'2027-10-31'),(1449,7,'2027-11-29'),(1449,8,'2027-12-29'),(1449,9,'2028-01-28'),(1449,10,'2028-02-26'),(1449,11,'2028-03-27'),(1449,12,'2028-04-26'),(1450,1,'2028-05-25'),(1450,2,'2028-06-24'),
  (1450,3,'2028-07-23'),(1450,4,'2028-08-22'),(1450,5,'2028-09-20'),(1450,6,'2028-10-19'),(1450,7,'2028-11-18'),(1450,8,'2028-12-17'),(1450,9,'2029-01-16'),(1450,10,'2029-02-14'),(1450,11,'2029-03-16'),(1450,12,'2029-04-15'),(1451,1,'2029-05-14'),(1451,2,'2029-06-13'),(1451,3,'2029-07-13'),(1451,4,'2029-08-12'),(1451,5,'2029-09-10'),(1451,6,'2029-10-09'),(1451,7,'2029-11-08'),(1451,8,'2029-12-07'),(1451,9,'2030-01-05'),(1451,10,'2030-02-04'),
  (1451,11,'2030-03-06'),(1451,12,'2030-04-04'),(1452,1,'2030-05-04'),(1452,2,'2030-06-03'),(1452,3,'2030-07-02'),(1452,4,'2030-08-01'),(1452,5,'2030-08-31'),(1452,6,'2030-09-29'),(1452,7,'2030-10-28'),(1452,8,'2030-11-27'),(1452,9,'2030-12-26'),(1452,10,'2031-01-24'),(1452,11,'2031-02-23'),(1452,12,'2031-03-24'),(1453,1,'2031-04-23'),(1453,2,'2031-05-23'),(1453,3,'2031-06-21'),(1453,4,'2031-07-21'),(1453,5,'2031-08-20'),(1453,6,'2031-09-18'),
  (1453,7,'2031-10-18'),(1453,8,'2031-11-16'),(1453,9,'2031-12-16'),(1453,10,'2032-01-14'),(1453,11,'2032-02-12'),(1453,12,'2032-03-13'),(1454,1,'2032-04-11'),(1454,2,'2032-05-11'),(1454,3,'2032-06-09'),(1454,4,'2032-07-09'),(1454,5,'2032-08-08'),(1454,6,'2032-09-06'),(1454,7,'2032-10-06'),(1454,8,'2032-11-05'),(1454,9,'2032-12-04'),(1454,10,'2033-01-03'),(1454,11,'2033-02-01'),(1454,12,'2033-03-03'),(1455,1,'2033-04-01'),(1455,2,'2033-04-30'),
  (1455,3,'2033-05-30'),(1455,4,'2033-06-28'),(1455,5,'2033-07-28'),(1455,6,'2033-08-27'),(1455,7,'2033-09-25'),(1455,8,'2033-10-25'),(1455,9,'2033-11-23'),(1455,10,'2033-12-23'),(1455,11,'2034-01-22'),(1455,12,'2034-02-20'),(1456,1,'2034-03-22'),(1456,2,'2034-04-20'),(1456,3,'2034-05-19'),(1456,4,'2034-06-18'),(1456,5,'2034-07-17'),(1456,6,'2034-08-16'),(1456,7,'2034-09-14'),(1456,8,'2034-10-14'),(1456,9,'2034-11-12'),(1456,10,'2034-12-12'),
  (1456,11,'2035-01-11'),(1456,12,'2035-02-10'),(1457,1,'2035-03-11'),(1457,2,'2035-04-10'),(1457,3,'2035-05-09'),(1457,4,'2035-06-07'),(1457,5,'2035-07-07'),(1457,6,'2035-08-05'),(1457,7,'2035-09-03'),(1457,8,'2035-10-03'),(1457,9,'2035-11-01'),(1457,10,'2035-12-01'),(1457,11,'2035-12-31'),(1457,12,'2036-01-30'),(1458,1,'2036-02-29'),(1458,2,'2036-03-29'),(1458,3,'2036-04-28'),(1458,4,'2036-05-27'),(1458,5,'2036-06-25'),(1458,6,'2036-07-25'),
  (1458,7,'2036-08-23'),(1458,8,'2036-09-21'),(1458,9,'2036-10-21'),(1458,10,'2036-11-19'),(1458,11,'2036-12-19'),(1458,12,'2037-01-18'),(1459,1,'2037-02-17'),(1459,2,'2037-03-18'),(1459,3,'2037-04-17'),(1459,4,'2037-05-17'),(1459,5,'2037-06-15'),(1459,6,'2037-07-14'),(1459,7,'2037-08-13'),(1459,8,'2037-09-11'),(1459,9,'2037-10-10'),(1459,10,'2037-11-09'),(1459,11,'2037-12-08'),(1459,12,'2038-01-07'),(1460,1,'2038-02-06'),(1460,2,'2038-03-07'),
  (1460,3,'2038-04-06'),(1460,4,'2038-05-06'),(1460,5,'2038-06-04'),(1460,6,'2038-07-04'),(1460,7,'2038-08-02'),(1460,8,'2038-09-01'),(1460,9,'2038-09-30'),(1460,10,'2038-10-29'),(1460,11,'2038-11-28'),(1460,12,'2038-12-27'),(1461,1,'2039-01-26'),(1461,2,'2039-02-24'),(1461,3,'2039-03-26'),(1461,4,'2039-04-25'),(1461,5,'2039-05-24'),(1461,6,'2039-06-23'),(1461,7,'2039-07-22'),(1461,8,'2039-08-21'),(1461,9,'2039-09-19'),(1461,10,'2039-10-19'),
  (1461,11,'2039-11-18'),(1461,12,'2039-12-17'),(1462,1,'2040-01-15'),(1462,2,'2040-02-14'),(1462,3,'2040-03-14'),(1462,4,'2040-04-13'),(1462,5,'2040-05-12'),(1462,6,'2040-06-11'),(1462,7,'2040-07-11'),(1462,8,'2040-08-09'),(1462,9,'2040-09-08'),(1462,10,'2040-10-07'),(1462,11,'2040-11-06'),(1462,12,'2040-12-06'),(1463,1,'2041-01-04'),(1463,2,'2041-02-02'),(1463,3,'2041-03-04'),(1463,4,'2041-04-02'),(1463,5,'2041-05-02'),(1463,6,'2041-05-31'),
  (1463,7,'2041-06-30'),(1463,8,'2041-07-29'),(1463,9,'2041-08-28'),(1463,10,'2041-09-27'),(1463,11,'2041-10-27'),(1463,12,'2041-11-25'),(1464,1,'2041-12-25'),(1464,2,'2042-01-23'),(1464,3,'2042-02-22'),(1464,4,'2042-03-23'),(1464,5,'2042-04-21'),(1464,6,'2042-05-21'),(1464,7,'2042-06-19'),(1464,8,'2042-07-18'),(1464,9,'2042-08-17'),(1464,10,'2042-09-16'),(1464,11,'2042-10-16'),(1464,12,'2042-11-14'),(1465,1,'2042-12-14'),(1465,2,'2043-01-13'),
  (1465,3,'2043-02-11'),(1465,4,'2043-03-13'),(1465,5,'2043-04-11'),(1465,6,'2043-05-10'),(1465,7,'2043-06-09'),(1465,8,'2043-07-08'),(1465,9,'2043-08-06'),(1465,10,'2043-09-05'),(1465,11,'2043-10-05'),(1465,12,'2043-11-03'),(1466,1,'2043-12-03'),(1466,2,'2044-01-02'),(1466,3,'2044-02-01'),(1466,4,'2044-03-01'),(1466,5,'2044-03-31'),(1466,6,'2044-04-29'),(1466,7,'2044-05-28'),(1466,8,'2044-06-26'),(1466,9,'2044-07-26'),(1466,10,'2044-08-24'),
  (1466,11,'2044-09-23'),(1466,12,'2044-10-23'),(1467,1,'2044-11-21'),(1467,2,'2044-12-21'),(1467,3,'2045-01-20'),(1467,4,'2045-02-18'),(1467,5,'2045-03-20'),(1467,6,'2045-04-19'),(1467,7,'2045-05-18'),(1467,8,'2045-06-16'),(1467,9,'2045-07-16'),(1467,10,'2045-08-14'),(1467,11,'2045-09-13'),(1467,12,'2045-10-12'),(1468,1,'2045-11-11'),(1468,2,'2045-12-10'),(1468,3,'2046-01-09'),(1468,4,'2046-02-07'),(1468,5,'2046-03-09'),(1468,6,'2046-04-08'),
  (1468,7,'2046-05-07'),(1468,8,'2046-06-06'),(1468,9,'2046-07-05'),(1468,10,'2046-08-04'),(1468,11,'2046-09-02'),(1468,12,'2046-10-02'),(1469,1,'2046-10-31'),(1469,2,'2046-11-29'),(1469,3,'2046-12-29'),(1469,4,'2047-01-27'),(1469,5,'2047-02-26'),(1469,6,'2047-03-28'),(1469,7,'2047-04-26'),(1469,8,'2047-05-26'),(1469,9,'2047-06-25'),(1469,10,'2047-07-24'),(1469,11,'2047-08-23'),(1469,12,'2047-09-21'),(1470,1,'2047-10-21'),(1470,2,'2047-11-19'),
  (1470,3,'2047-12-18'),(1470,4,'2048-01-17'),(1470,5,'2048-02-15'),(1470,6,'2048-03-16'),(1470,7,'2048-04-15'),(1470,8,'2048-05-14'),(1470,9,'2048-06-13'),(1470,10,'2048-07-13'),(1470,11,'2048-08-11'),(1470,12,'2048-09-10'),(1471,1,'2048-10-09'),(1471,2,'2048-11-08'),(1471,3,'2048-12-07'),(1471,4,'2049-01-05'),(1471,5,'2049-02-04'),(1471,6,'2049-03-05'),(1471,7,'2049-04-04'),(1471,8,'2049-05-03'),(1471,9,'2049-06-02'),(1471,10,'2049-07-02'),
  (1471,11,'2049-07-31'),(1471,12,'2049-08-30'),(1472,1,'2049-09-29'),(1472,2,'2049-10-28'),(1472,3,'2049-11-27'),(1472,4,'2049-12-26'),(1472,5,'2050-01-24'),(1472,6,'2050-02-23'),(1472,7,'2050-03-24'),(1472,8,'2050-04-23'),(1472,9,'2050-05-22'),(1472,10,'2050-06-21'),(1472,11,'2050-07-21'),(1472,12,'2050-08-19'),(1473,1,'2050-09-18'),(1473,2,'2050-10-17'),(1473,3,'2050-11-16'),(1473,4,'2050-12-15'),(1473,5,'2051-01-14'),(1473,6,'2051-02-13'),
  (1473,7,'2051-03-14'),(1473,8,'2051-04-12'),(1473,9,'2051-05-12'),(1473,10,'2051-06-10'),(1473,11,'2051-07-10'),(1473,12,'2051-08-08'),(1474,1,'2051-09-07'),(1474,2,'2051-10-06'),(1474,3,'2051-11-05'),(1474,4,'2051-12-05'),(1474,5,'2052-01-03'),(1474,6,'2052-02-02'),(1474,7,'2052-03-03'),(1474,8,'2052-04-01'),(1474,9,'2052-04-30'),(1474,10,'2052-05-30'),(1474,11,'2052-06-28'),(1474,12,'2052-07-28'),(1475,1,'2052-08-26'),(1475,2,'2052-09-24'),
  (1475,3,'2052-10-24'),(1475,4,'2052-11-23'),(1475,5,'2052-12-22'),(1475,6,'2053-01-21'),(1475,7,'2053-02-20'),(1475,8,'2053-03-22'),(1475,9,'2053-04-20'),(1475,10,'2053-05-19'),(1475,11,'2053-06-18'),(1475,12,'2053-07-17'),(1476,1,'2053-08-15'),(1476,2,'2053-09-14'),(1476,3,'2053-10-13'),(1476,4,'2053-11-12'),(1476,5,'2053-12-11'),(1476,6,'2054-01-10'),(1476,7,'2054-02-09'),(1476,8,'2054-03-11'),(1476,9,'2054-04-09'),(1476,10,'2054-05-09'),
  (1476,11,'2054-06-07'),(1476,12,'2054-07-07'),(1477,1,'2054-08-05'),(1477,2,'2054-09-03'),(1477,3,'2054-10-03'),(1477,4,'2054-11-01'),(1477,5,'2054-11-30'),(1477,6,'2054-12-30'),(1477,7,'2055-01-29'),(1477,8,'2055-02-28'),(1477,9,'2055-03-30'),(1477,10,'2055-04-28'),(1477,11,'2055-05-28'),(1477,12,'2055-06-26'),(1478,1,'2055-07-26'),(1478,2,'2055-08-24'),(1478,3,'2055-09-22'),(1478,4,'2055-10-22'),(1478,5,'2055-11-20'),(1478,6,'2055-12-20'),
  (1478,7,'2056-01-18'),(1478,8,'2056-02-17'),(1478,9,'2056-03-18'),(1478,10,'2056-04-16'),(1478,11,'2056-05-16'),(1478,12,'2056-06-15'),(1479,1,'2056-07-14'),(1479,2,'2056-08-13'),(1479,3,'2056-09-11'),(1479,4,'2056-10-10'),(1479,5,'2056-11-09'),(1479,6,'2056-12-08'),(1479,7,'2057-01-07'),(1479,8,'2057-02-05'),(1479,9,'2057-03-07'),(1479,10,'2057-04-05'),(1479,11,'2057-05-05'),(1479,12,'2057-06-04'),(1480,1,'2057-07-03'),(1480,2,'2057-08-02'),
  (1480,3,'2057-08-31'),(1480,4,'2057-09-30'),(1480,5,'2057-10-29'),(1480,6,'2057-11-28'),(1480,7,'2057-12-27'),(1480,8,'2058-01-26'),(1480,9,'2058-02-24'),(1480,10,'2058-03-26'),(1480,11,'2058-04-24'),(1480,12,'2058-05-24'),(1481,1,'2058-06-22'),(1481,2,'2058-07-22'),(1481,3,'2058-08-20'),(1481,4,'2058-09-19'),(1481,5,'2058-10-19'),(1481,6,'2058-11-17'),(1481,7,'2058-12-17'),(1481,8,'2059-01-15'),(1481,9,'2059-02-14'),(1481,10,'2059-03-15'),
  (1481,11,'2059-04-14'),(1481,12,'2059-05-13'),(1482,1,'2059-06-11'),(1482,2,'2059-07-11'),(1482,3,'2059-08-09'),(1482,4,'2059-09-08'),(1482,5,'2059-10-08'),(1482,6,'2059-11-07'),(1482,7,'2059-12-07'),(1482,8,'2060-01-05'),(1482,9,'2060-02-04'),(1482,10,'2060-03-04'),(1482,11,'2060-04-02'),(1482,12,'2060-05-02'),(1483,1,'2060-05-31'),(1483,2,'2060-06-29'),(1483,3,'2060-07-29'),(1483,4,'2060-08-27'),(1483,5,'2060-09-26'),(1483,6,'2060-10-26'),
  (1483,7,'2060-11-25'),(1483,8,'2060-12-24'),(1483,9,'2061-01-23'),(1483,10,'2061-02-22'),(1483,11,'2061-03-23'),(1483,12,'2061-04-21'),(1484,1,'2061-05-21'),(1484,2,'2061-06-19'),(1484,3,'2061-07-18'),(1484,4,'2061-08-17'),(1484,5,'2061-09-15'),(1484,6,'2061-10-15'),(1484,7,'2061-11-14'),(1484,8,'2061-12-14'),(1484,9,'2062-01-12'),(1484,10,'2062-02-11'),(1484,11,'2062-03-12'),(1484,12,'2062-04-11'),(1485,1,'2062-05-10'),(1485,2,'2062-06-09'),
  (1485,3,'2062-07-08'),(1485,4,'2062-08-06'),(1485,5,'2062-09-05'),(1485,6,'2062-10-04'),(1485,7,'2062-11-03'),(1485,8,'2062-12-03'),(1485,9,'2063-01-01'),(1485,10,'2063-01-31'),(1485,11,'2063-03-02'),(1485,12,'2063-03-31'),(1486,1,'2063-04-30'),(1486,2,'2063-05-29'),(1486,3,'2063-06-28'),(1486,4,'2063-07-27'),(1486,5,'2063-08-25'),(1486,6,'2063-09-24'),(1486,7,'2063-10-23'),(1486,8,'2063-11-22'),(1486,9,'2063-12-21'),(1486,10,'2064-01-20'),
  (1486,11,'2064-02-19'),(1486,12,'2064-03-19'),(1487,1,'2064-04-18'),(1487,2,'2064-05-18'),(1487,3,'2064-06-16'),(1487,4,'2064-07-16'),(1487,5,'2064-08-14'),(1487,6,'2064-09-13'),(1487,7,'2064-10-12'),(1487,8,'2064-11-10'),(1487,9,'2064-12-10'),(1487,10,'2065-01-08'),(1487,11,'2065-02-07'),(1487,12,'2065-03-08'),(1488,1,'2065-04-07'),(1488,2,'2065-05-07'),(1488,3,'2065-06-05'),(1488,4,'2065-07-05'),(1488,5,'2065-08-04'),(1488,6,'2065-09-02'),
  (1488,7,'2065-10-02'),(1488,8,'2065-10-31'),(1488,9,'2065-11-29'),(1488,10,'2065-12-29'),(1488,11,'2066-01-27'),(1488,12,'2066-02-26'),(1489,1,'2066-03-27'),(1489,2,'2066-04-26'),(1489,3,'2066-05-25'),(1489,4,'2066-06-24'),(1489,5,'2066-07-24'),(1489,6,'2066-08-23'),(1489,7,'2066-09-21'),(1489,8,'2066-10-21'),(1489,9,'2066-11-19'),(1489,10,'2066-12-18'),(1489,11,'2067-01-17'),(1489,12,'2067-02-15'),(1490,1,'2067-03-17'),(1490,2,'2067-04-15'),
  (1490,3,'2067-05-15'),(1490,4,'2067-06-13'),(1490,5,'2067-07-13'),(1490,6,'2067-08-12'),(1490,7,'2067-09-10'),(1490,8,'2067-10-10'),(1490,9,'2067-11-09'),(1490,10,'2067-12-08'),(1490,11,'2068-01-06'),(1490,12,'2068-02-05'),(1491,1,'2068-03-05'),(1491,2,'2068-04-04'),(1491,3,'2068-05-03'),(1491,4,'2068-06-01'),(1491,5,'2068-07-01'),(1491,6,'2068-07-31'),(1491,7,'2068-08-29'),(1491,8,'2068-09-28'),(1491,9,'2068-10-28'),(1491,10,'2068-11-26'),
  (1491,11,'2068-12-26'),(1491,12,'2069-01-24'),(1492,1,'2069-02-23'),(1492,2,'2069-03-24'),(1492,3,'2069-04-23'),(1492,4,'2069-05-22'),(1492,5,'2069-06-20'),(1492,6,'2069-07-20'),(1492,7,'2069-08-19'),(1492,8,'2069-09-17'),(1492,9,'2069-10-17'),(1492,10,'2069-11-15'),(1492,11,'2069-12-15'),(1492,12,'2070-01-14'),(1493,1,'2070-02-12'),(1493,2,'2070-03-14'),(1493,3,'2070-04-12'),(1493,4,'2070-05-12'),(1493,5,'2070-06-10'),(1493,6,'2070-07-10'),
  (1493,7,'2070-08-08'),(1493,8,'2070-09-06'),(1493,9,'2070-10-06'),(1493,10,'2070-11-04'),(1493,11,'2070-12-04'),(1493,12,'2071-01-03'),(1494,1,'2071-02-02'),(1494,2,'2071-03-03'),(1494,3,'2071-04-02'),(1494,4,'2071-05-01'),(1494,5,'2071-05-31'),(1494,6,'2071-06-29'),(1494,7,'2071-07-29'),(1494,8,'2071-08-27'),(1494,9,'2071-09-25'),(1494,10,'2071-10-24'),(1494,11,'2071-11-23'),(1494,12,'2071-12-23'),(1495,1,'2072-01-22'),(1495,2,'2072-02-20'),
  (1495,3,'2072-03-21'),(1495,4,'2072-04-20'),(1495,5,'2072-05-19'),(1495,6,'2072-06-18'),(1495,7,'2072-07-17'),(1495,8,'2072-08-15'),(1495,9,'2072-09-14'),(1495,10,'2072-10-13'),(1495,11,'2072-11-11'),(1495,12,'2072-12-11'),(1496,1,'2073-01-10'),(1496,2,'2073-02-08'),(1496,3,'2073-03-10'),(1496,4,'2073-04-09'),(1496,5,'2073-05-09'),(1496,6,'2073-06-07'),(1496,7,'2073-07-07'),(1496,8,'2073-08-05'),(1496,9,'2073-09-03'),(1496,10,'2073-10-03'),
  (1496,11,'2073-11-01'),(1496,12,'2073-11-30'),(1497,1,'2073-12-30'),(1497,2,'2074-01-29'),(1497,3,'2074-02-27'),(1497,4,'2074-03-29'),(1497,5,'2074-04-28'),(1497,6,'2074-05-27'),(1497,7,'2074-06-26'),(1497,8,'2074-07-25'),(1497,9,'2074-08-24'),(1497,10,'2074-09-22'),(1497,11,'2074-10-22'),(1497,12,'2074-11-20'),(1498,1,'2074-12-20'),(1498,2,'2075-01-18'),(1498,3,'2075-02-17'),(1498,4,'2075-03-18'),(1498,5,'2075-04-17'),(1498,6,'2075-05-16'),
  (1498,7,'2075-06-15'),(1498,8,'2075-07-15'),(1498,9,'2075-08-13'),(1498,10,'2075-09-12'),(1498,11,'2075-10-11'),(1498,12,'2075-11-10'),(1499,1,'2075-12-09'),(1499,2,'2076-01-08'),(1499,3,'2076-02-06'),(1499,4,'2076-03-07'),(1499,5,'2076-04-05'),(1499,6,'2076-05-04'),(1499,7,'2076-06-03'),(1499,8,'2076-07-03'),(1499,9,'2076-08-01'),(1499,10,'2076-08-31'),(1499,11,'2076-09-29'),(1499,12,'2076-10-29'),(1500,1,'2076-11-28'),(1500,2,'2076-12-27'),
  (1500,3,'2077-01-26'),(1500,4,'2077-02-24'),(1500,5,'2077-03-26'),(1500,6,'2077-04-24'),(1500,7,'2077-05-23'),(1500,8,'2077-06-22'),(1500,9,'2077-07-21'),(1500,10,'2077-08-20'),(1500,11,'2077-09-18'),(1500,12,'2077-10-18')
on conflict (hy, hm) do nothing;

-- -----------------------------------------------------------------------------
-- Add N Hijri months to a Gregorian date, keeping the day within the month and
-- clamping when the target month is shorter (31 Jan + 1 month has the same
-- problem in any calendar). Falls back to Gregorian arithmetic outside the
-- table's range so a date far in the future can never raise instead of return.
-- -----------------------------------------------------------------------------
create or replace function public.hijri_add_months(p_date date, p_months int)
returns date
language plpgsql stable set search_path = public as $$
declare
  v_start   date;
  v_hy      smallint;
  v_hm      smallint;
  v_offset  int;
  v_index   int;
  v_target  record;
  v_len     int;
begin
  select hy, hm, starts_on into v_hy, v_hm, v_start
    from public.hijri_months
   where starts_on <= p_date
   order by starts_on desc
   limit 1;

  if not found then
    return (p_date + make_interval(months => p_months))::date;
  end if;

  v_offset := p_date - v_start;                 -- 0-based day within the month
  v_index  := (v_hy::int * 12 + (v_hm::int - 1)) + p_months;

  select h.hy, h.hm, h.starts_on,
         coalesce((select n.starts_on from public.hijri_months n
                    where (n.hy::int * 12 + n.hm::int - 1) = v_index + 1) - h.starts_on, 30) as len
    into v_target
    from public.hijri_months h
   where (h.hy::int * 12 + h.hm::int - 1) = v_index;

  if not found then
    return (p_date + make_interval(months => p_months))::date;
  end if;

  v_len := v_target.len;
  -- Clamp: day 30 of a 30-day month rolling into a 29-day month.
  return v_target.starts_on + least(v_offset, v_len - 1);
end $$;

-- The Hijri month containing a date, as a half-open Gregorian range. Used by
-- the monthly report so a Hijri gym closes its books on its own month.
create or replace function public.hijri_month_range(p_date date)
returns table (hy smallint, hm smallint, starts_on date, ends_before date)
language sql stable set search_path = public as $$
  select h.hy, h.hm, h.starts_on,
         coalesce((select n.starts_on from public.hijri_months n
                    where n.starts_on > h.starts_on
                    order by n.starts_on limit 1),
                  h.starts_on + 30)
    from public.hijri_months h
   where h.starts_on <= p_date
   order by h.starts_on desc
   limit 1;
$$;

-- -----------------------------------------------------------------------------
-- One place decides how long a term is. Every subscription RPC calls this
-- instead of `make_interval(months => …)`, so the gym's calendar setting cannot
-- be honoured in one code path and forgotten in another.
-- -----------------------------------------------------------------------------
create or replace function public.add_term(p_from date, p_months int)
returns date
language plpgsql stable set search_path = public as $$
declare v_cal text;
begin
  select calendar into v_cal from public.gyms limit 1;
  if v_cal = 'hijri' then
    return public.hijri_add_months(p_from, p_months);
  end if;
  return (p_from + make_interval(months => p_months))::date;
end $$;

grant execute on function public.hijri_add_months(date, int) to authenticated;
grant execute on function public.hijri_month_range(date)      to authenticated, anon;
grant execute on function public.add_term(date, int)          to authenticated;

notify pgrst, 'reload schema';

-- =============================================================================
-- 0021_subscription_terms.sql
-- =============================================================================
-- =============================================================================
-- 0021_subscription_terms.sql — subscription RPCs use the gym's calendar
--
-- Same four functions as 0004, with one change each: the term end date now goes
-- through add_term() instead of make_interval(months => …), so a Hijri gym gets
-- Hijri months. Measured on the live data: a 12-month term from 2026-08-02 ends
-- 2027-07-23 in Hijri versus 2027-08-02 in Gregorian — ten days per member per
-- year that the gym was giving away.
--
-- Existing subscriptions are untouched: this only affects dates computed from
-- now on. Members who paid under the old arithmetic keep the expiry they were
-- sold.
-- =============================================================================

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
    case when p_activate then public.add_term(v_today, v_plan.duration_months) end,
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
         end_date = public.add_term(v_today, v_plan.duration_months),
         sessions_remaining = v_plan.sessions_count,
         price_paid = coalesce(p_amount, v_plan.price)
   where id = p_subscription_id
   returning * into v_sub;

  insert into public.payments (gym_id, subscription_id, member_id, branch_id, amount, method, receipt_number, recorded_by)
  values (v_gym, v_sub.id, v_sub.member_id, v_sub.branch_id, coalesce(p_amount, v_plan.price), p_method, p_receipt, auth.uid());

  return v_sub;
end $$;

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
     set end_date = public.add_term(v_base, v_plan.duration_months),
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
         end_date = public.add_term(v_today, v_new.duration_months),
         status = 'active',
         sessions_remaining = v_new.sessions_count,
         price_paid = v_sub.price_paid + coalesce(p_amount, v_due)
   where id = p_subscription_id
   returning * into v_sub;

  insert into public.payments (gym_id, subscription_id, member_id, branch_id, amount, method, receipt_number, recorded_by)
  values (v_gym, v_sub.id, v_sub.member_id, v_sub.branch_id, coalesce(p_amount, v_due), p_method, p_receipt, auth.uid());

  return v_sub;
end $$;

notify pgrst, 'reload schema';

-- =============================================================================
-- 0022_report_hijri_month.sql
-- =============================================================================
-- =============================================================================
-- 0022_report_hijri_month.sql — the monthly report closes on the gym's month
--
-- A Hijri gym sells Hijri terms (0021) but was still having its books closed on
-- Gregorian month boundaries, so a month's revenue included days from two
-- different Hijri months. The report now derives its period from the gym's
-- calendar: p_month picks a day, and the period is the whole calendar month
-- containing it — Hijri or Gregorian, whichever the gym reads.
--
-- The client keeps sending a date; nothing in the call signature changes.
-- =============================================================================

create or replace function public.monthly_report(
  p_month  date,
  p_branch uuid default null
) returns jsonb
language plpgsql stable security invoker set search_path = public as $$
declare
  v_cal       text;
  v_start     date;
  v_end       date;
  v_prev      date;
  v_label     text;
  v_prev_label text;
  v_start_ts  timestamptz;
  v_end_ts    timestamptz;
  v_prev_ts   timestamptz;
  v_total     numeric;
  v_count     int;
  v_prev_tot  numeric;
  v_branches  jsonb;
  v_plans     jsonb;
  v_methods   jsonb;
  v_new       int;
  v_active    int;
  r           record;
begin
  select calendar into v_cal from public.gyms limit 1;

  if v_cal = 'hijri' then
    select hy, hm, starts_on, ends_before into r from public.hijri_month_range(p_month);
    if r.starts_on is null then           -- outside the table: fall back cleanly
      v_cal := 'gregorian';
    else
      v_start := r.starts_on;
      v_end   := r.ends_before;
      v_label := r.hy || '-' || lpad(r.hm::text, 2, '0');
      select h2.starts_on, h2.hy || '-' || lpad(h2.hm::text, 2, '0')
        into v_prev, v_prev_label
        from public.hijri_month_range(r.starts_on - 1) h2;
    end if;
  end if;

  if v_cal <> 'hijri' then
    v_start      := date_trunc('month', p_month)::date;
    v_end        := (date_trunc('month', p_month) + interval '1 month')::date;
    v_prev       := (date_trunc('month', p_month) - interval '1 month')::date;
    v_label      := to_char(v_start, 'YYYY-MM');
    v_prev_label := to_char(v_prev, 'YYYY-MM');
  end if;

  v_start_ts := (v_start::timestamp at time zone 'Asia/Riyadh');
  v_end_ts   := (v_end::timestamp   at time zone 'Asia/Riyadh');
  v_prev_ts  := (v_prev::timestamp  at time zone 'Asia/Riyadh');

  select coalesce(sum(amount), 0), count(*) into v_total, v_count
    from public.payments p
   where p.created_at >= v_start_ts and p.created_at < v_end_ts
     and (p_branch is null or p.branch_id = p_branch);

  select coalesce(sum(amount), 0) into v_prev_tot
    from public.payments p
   where p.created_at >= v_prev_ts and p.created_at < v_start_ts
     and (p_branch is null or p.branch_id = p_branch);

  select coalesce(jsonb_agg(jsonb_build_object('branch_id', q.branch_id, 'total', q.total, 'count', q.n)
                            order by q.total desc), '[]'::jsonb)
    into v_branches
    from (select p.branch_id, sum(p.amount) as total, count(*) as n
            from public.payments p
           where p.created_at >= v_start_ts and p.created_at < v_end_ts
             and (p_branch is null or p.branch_id = p_branch)
           group by p.branch_id) q;

  select coalesce(jsonb_agg(jsonb_build_object('plan_id', q.plan_id, 'total', q.total, 'count', q.n)
                            order by q.total desc), '[]'::jsonb)
    into v_plans
    from (select s.plan_id, sum(p.amount) as total, count(*) as n
            from public.payments p
            join public.subscriptions s on s.id = p.subscription_id
           where p.created_at >= v_start_ts and p.created_at < v_end_ts
             and (p_branch is null or p.branch_id = p_branch)
           group by s.plan_id) q;

  select coalesce(jsonb_agg(jsonb_build_object('method', q.method, 'total', q.total, 'count', q.n)
                            order by q.total desc), '[]'::jsonb)
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
    'month',          v_label,
    'prev_month',     v_prev_label,
    'calendar',       v_cal,
    'period_from',    v_start,
    'period_to',      v_end - 1,
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

revoke execute on function public.monthly_report(date, uuid) from public, anon;
grant  execute on function public.monthly_report(date, uuid) to authenticated;

notify pgrst, 'reload schema';
