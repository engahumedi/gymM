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
