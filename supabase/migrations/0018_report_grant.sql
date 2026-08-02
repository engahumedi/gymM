-- =============================================================================
-- 0018_report_grant.sql — finish what 0014 started for the newest RPC
--
-- Postgres grants EXECUTE to PUBLIC by default, so `monthly_report` shipped
-- callable by anon. It is SECURITY INVOKER, so an anon caller reads nothing and
-- gets a report of zeros — no leak — but leaving it open is inconsistent with
-- the rest of the hardening and invites someone to lean on it later.
-- =============================================================================

revoke execute on function public.monthly_report(date, uuid) from public, anon;
grant  execute on function public.monthly_report(date, uuid) to authenticated;

notify pgrst, 'reload schema';
