-- =============================================================================
-- 0013_cron_expire.sql — schedule expire_due_subscriptions() daily
-- Flips lapsed subscriptions to 'expired' in the DB (not just derived in the UI)
-- so reports/analytics read true statuses. Runs 00:05 UTC (03:05 Riyadh).
-- =============================================================================
create extension if not exists pg_cron;

do $$
begin
  perform cron.unschedule('expire-subscriptions-daily');
exception when others then null;  -- not scheduled yet
end $$;

select cron.schedule(
  'expire-subscriptions-daily',
  '5 0 * * *',
  $$ select public.expire_due_subscriptions(); $$
);
