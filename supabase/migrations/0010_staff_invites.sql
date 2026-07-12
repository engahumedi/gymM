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
