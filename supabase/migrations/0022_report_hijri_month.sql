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
