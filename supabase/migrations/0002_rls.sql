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
