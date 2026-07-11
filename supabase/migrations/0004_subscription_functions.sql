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
