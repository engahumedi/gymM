-- =============================================================================
-- 0006_notifications.sql — Phase 5: notifications engine
-- A daily job finds subscriptions expiring in 7/3/1 days and enqueues messages
-- into `notifications`. In dev they are logged with status 'simulated' (nothing
-- is actually sent); a provider (Twilio / Meta WhatsApp) is wired later via the
-- `notify` Edge Function which flips 'queued' → 'sent'. See README.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- enqueue_expiry_notifications — insert one row per (subscription, milestone)
-- for active subs expiring in exactly 7/3/1 days. Deduped per day so re-running
-- the job is idempotent. Returns the number of notifications created.
-- -----------------------------------------------------------------------------
create or replace function public.enqueue_expiry_notifications()
returns int
language plpgsql security definer set search_path = public as $$
declare v_count int := 0;
begin
  with due as (
    select s.id as sub_id, s.member_id, m.gym_id,
           (s.end_date - public.riyadh_today()) as days_left
    from public.subscriptions s
    join public.members m on m.id = s.member_id
    where s.status = 'active'
      and s.end_date is not null
      and (s.end_date - public.riyadh_today()) in (7, 3, 1)
  ),
  ins as (
    insert into public.notifications
      (gym_id, member_id, subscription_id, channel, type, message_ar, message_en, status)
    select d.gym_id, d.member_id, d.sub_id, 'whatsapp',
           'expiring_' || d.days_left,
           'ينتهي اشتراكك خلال ' || d.days_left || ' '
             || (case when d.days_left = 1 then 'يوم' else 'أيام' end) || '. جدّد الآن.',
           'Your subscription expires in ' || d.days_left || ' day(s). Renew now.',
           'simulated'
    from due d
    where not exists (
      select 1 from public.notifications n
      where n.subscription_id = d.sub_id
        and n.type = 'expiring_' || d.days_left
        and n.created_at::date = public.riyadh_today()
    )
    returning 1
  )
  select count(*) into v_count from ins;
  return v_count;
end $$;

grant execute on function public.enqueue_expiry_notifications() to authenticated;

-- -----------------------------------------------------------------------------
-- Schedule it daily at 06:00 UTC (09:00 Asia/Riyadh) via pg_cron.
-- pg_cron must be enabled for the project (Dashboard → Database → Extensions,
-- or the CREATE EXTENSION below if permitted). Safe/idempotent to re-run.
-- -----------------------------------------------------------------------------
create extension if not exists pg_cron;

do $$
begin
  -- Remove any previous schedule with the same name, then (re)create it.
  perform cron.unschedule('expiry-notifications-daily')
  where exists (select 1 from cron.job where jobname = 'expiry-notifications-daily');

  perform cron.schedule(
    'expiry-notifications-daily',
    '0 6 * * *',
    $cron$ select public.enqueue_expiry_notifications(); $cron$
  );
exception when others then
  -- If pg_cron isn't available yet, don't fail the migration; enable it in the
  -- dashboard and re-run this block. The function above still works standalone.
  raise notice 'pg_cron scheduling skipped: %', sqlerrm;
end $$;
