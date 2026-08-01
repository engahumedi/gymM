-- =============================================================================
-- 0015_analytics_and_indexes.sql — performance work from the review
--
--  * members_overview: one row per member with the CURRENT subscription and the
--    derived display status computed in SQL, so lists can filter/search/paginate
--    on the server instead of shipping every member (with every subscription)
--    to the browser. `security_invoker` keeps RLS in force (PG15+).
--  * analytics_overview(): all dashboard aggregates in one call. The client used
--    to pull raw rows and aggregate in JS, which silently truncated at PostgREST's
--    max-rows = 1000 — check-in analytics would under-report with no warning.
--  * Indexes the RLS policies and the new server-side search actually use.
-- =============================================================================

create extension if not exists pg_trgm;

-- -----------------------------------------------------------------------------
-- members_overview — member + current subscription + display status
-- -----------------------------------------------------------------------------
drop view if exists public.members_overview;
create view public.members_overview with (security_invoker = true) as
select
  m.id,
  m.gym_id,
  m.branch_id,
  m.member_code,
  m.full_name,
  m.phone,
  m.national_id,
  m.gender,
  m.dob,
  m.photo_url,
  m.user_id,
  m.created_at,
  s.id                 as sub_id,
  s.plan_id            as plan_id,
  s.status             as sub_status,
  s.start_date         as start_date,
  s.end_date           as end_date,
  s.sessions_remaining as sessions_remaining,
  s.frozen_days_used   as frozen_days_used,
  case
    when s.id is null              then 'none'
    when s.status = 'pending'      then 'pending'
    when s.status = 'frozen'       then 'frozen'
    when s.status = 'cancelled'    then 'expired'
    when s.status = 'expired'      then 'expired'
    when s.end_date is null        then 'active'
    when s.end_date < public.riyadh_today()                 then 'expired'
    when s.end_date <= public.riyadh_today() + 7            then 'expiring'
    else 'active'
  end as display_status
from public.members m
left join lateral (
  select *
    from public.subscriptions sub
   where sub.member_id = m.id
   order by (case sub.status
               when 'active' then 0 when 'frozen' then 1 when 'pending' then 2
               when 'expired' then 3 else 4 end),
            sub.end_date desc nulls last,
            sub.created_at desc
   limit 1
) s on true;

grant select on public.members_overview to authenticated;

-- -----------------------------------------------------------------------------
-- analytics_overview — every dashboard aggregate in one round trip.
-- SECURITY INVOKER: RLS still scopes the rows (admin = gym, reception = branch).
-- Dates are bucketed in Asia/Riyadh, matching the rest of the system.
-- -----------------------------------------------------------------------------
create or replace function public.analytics_overview(
  p_from   date,
  p_to     date,
  p_branch uuid default null
) returns jsonb
language plpgsql stable security invoker set search_path = public as $$
declare
  v_today       date := public.riyadh_today();
  v_month_start date := date_trunc('month', v_today)::date;
  v_from_ts     timestamptz := (p_from::timestamp at time zone 'Asia/Riyadh');
  v_to_ts       timestamptz := ((p_to + 1)::timestamp at time zone 'Asia/Riyadh');
  v_months      jsonb;
  v_growth      jsonb;
  v_plans       jsonb;
  v_heat        jsonb;
  v_kpis        jsonb;
begin
  -- Revenue per month (total + per branch)
  with months as (
    select generate_series(
             date_trunc('month', p_from::timestamp),
             date_trunc('month', p_to::timestamp),
             interval '1 month')::date as m
  ),
  pay as (
    select date_trunc('month', p.created_at at time zone 'Asia/Riyadh')::date as m,
           p.branch_id,
           p.amount
      from public.payments p
     where p.created_at >= v_from_ts
       and p.created_at <  v_to_ts
       and (p_branch is null or p.branch_id = p_branch)
  )
  select coalesce(jsonb_agg(
           jsonb_build_object(
             'month', to_char(months.m, 'YYYY-MM'),
             'total', coalesce((select sum(pay.amount) from pay where pay.m = months.m), 0),
             'branches', coalesce((
               select jsonb_object_agg(q.branch_id, q.s)
                 from (select pay.branch_id, sum(pay.amount) as s
                         from pay
                        where pay.m = months.m and pay.branch_id is not null
                        group by pay.branch_id) q
             ), '{}'::jsonb)
           ) order by months.m), '[]'::jsonb)
    into v_months
    from months;

  -- Cumulative member growth per month
  with months as (
    select generate_series(
             date_trunc('month', p_from::timestamp),
             date_trunc('month', p_to::timestamp),
             interval '1 month')::date as m
  )
  select coalesce(jsonb_agg(
           jsonb_build_object(
             'month', to_char(months.m, 'YYYY-MM'),
             'count', (select count(*) from public.members mm
                        where (p_branch is null or mm.branch_id = p_branch)
                          and mm.created_at < ((months.m + interval '1 month')::timestamp
                                                at time zone 'Asia/Riyadh'))
           ) order by months.m), '[]'::jsonb)
    into v_growth
    from months;

  -- Plan popularity by CURRENT subscription
  select coalesce(jsonb_agg(jsonb_build_object('plan_id', q.plan_id, 'count', q.c)), '[]'::jsonb)
    into v_plans
    from (
      select mo.plan_id, count(*) as c
        from public.members_overview mo
       where mo.plan_id is not null
         and (p_branch is null or mo.branch_id = p_branch)
       group by mo.plan_id
    ) q;

  -- Check-in heatmap (day of week 0=Sun, hour 0-23, Riyadh time)
  select coalesce(jsonb_agg(jsonb_build_object('dow', q.d, 'hour', q.h, 'count', q.c)), '[]'::jsonb)
    into v_heat
    from (
      select extract(dow  from c.checked_in_at at time zone 'Asia/Riyadh')::int as d,
             extract(hour from c.checked_in_at at time zone 'Asia/Riyadh')::int as h,
             count(*) as c
        from public.check_ins c
       where c.checked_in_at >= v_from_ts
         and c.checked_in_at <  v_to_ts
         and (p_branch is null or c.branch_id = p_branch)
       group by 1, 2
    ) q;

  -- KPIs
  with scoped as (
    select mo.id, mo.display_status, mo.created_at,
           (select count(*) from public.subscriptions s
             where s.member_id = mo.id and s.status <> 'pending') as real_subs
      from public.members_overview mo
     where (p_branch is null or mo.branch_id = p_branch)
  ),
  rev as (
    select coalesce(sum(p.amount), 0) as total
      from public.payments p
     where (p_branch is null or p.branch_id = p_branch)
       and p.created_at >= (v_month_start::timestamp at time zone 'Asia/Riyadh')
  )
  select jsonb_build_object(
           'active',        count(*) filter (where display_status in ('active','expiring')),
           'expiring',      count(*) filter (where display_status = 'expiring'),
           'expired',       count(*) filter (where display_status = 'expired'),
           'total_members', count(*),
           'new_month',     count(*) filter (
                              where created_at >= (v_month_start::timestamp at time zone 'Asia/Riyadh')),
           'revenue_month', (select total from rev),
           'renewal_rate',  case when count(*) filter (where real_subs > 0) = 0 then 0
                              else round(100.0 * count(*) filter (where real_subs > 1)
                                             / count(*) filter (where real_subs > 0)) end,
           'churn_rate',    case when count(*) filter (where real_subs > 0) = 0 then 0
                              else round(100.0 * count(*) filter (where real_subs > 0
                                                                    and display_status = 'expired')
                                             / count(*) filter (where real_subs > 0)) end
         )
    into v_kpis
    from scoped;

  return jsonb_build_object(
    'kpis',            v_kpis,
    'revenue_by_month', v_months,
    'member_growth',    v_growth,
    'plan_popularity',  v_plans,
    'heatmap',          v_heat
  );
end $$;

grant execute on function public.analytics_overview(date, date, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Indexes: RLS filters + the new server-side member search
-- -----------------------------------------------------------------------------
create index if not exists idx_payments_gym        on public.payments(gym_id);
create index if not exists idx_payments_gym_created on public.payments(gym_id, created_at desc);
create index if not exists idx_notif_gym           on public.notifications(gym_id);
create index if not exists idx_checkins_branch_at  on public.check_ins(branch_id, checked_in_at desc);
create index if not exists idx_subs_member_status  on public.subscriptions(member_id, status);
create index if not exists idx_members_gym_created on public.members(gym_id, created_at desc);
create index if not exists idx_members_name_trgm   on public.members using gin (full_name gin_trgm_ops);
create index if not exists idx_members_phone_trgm  on public.members using gin (phone gin_trgm_ops);

notify pgrst, 'reload schema';
