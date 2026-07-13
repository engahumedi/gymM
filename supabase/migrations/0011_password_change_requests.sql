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
