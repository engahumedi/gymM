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
