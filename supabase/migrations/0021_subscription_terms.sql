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
