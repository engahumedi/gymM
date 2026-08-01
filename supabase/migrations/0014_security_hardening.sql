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
