-- =============================================================================
-- 0019_gym_calendar.sql — which calendar a gym leads with
--
-- Dates are always stored and computed in Gregorian; this only decides which
-- one a human sees first. Both are shown either way — a Saudi gym reads Hijri
-- but pays suppliers, files VAT and reconciles bank statements in Gregorian, so
-- dropping either calendar costs someone real work.
--
-- It lives on `gyms` because this is a white-label product: the first gym leads
-- with Hijri, the next one may not, and neither should need a code change.
-- =============================================================================

alter table public.gyms
  add column if not exists calendar text not null default 'hijri'
  check (calendar in ('hijri', 'gregorian'));

comment on column public.gyms.calendar is
  'Which calendar leads in the UI: hijri | gregorian. Storage stays Gregorian.';

notify pgrst, 'reload schema';
