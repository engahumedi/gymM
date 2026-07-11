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
