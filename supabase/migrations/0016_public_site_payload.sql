-- =============================================================================
-- 0016_public_site_payload.sql — one request for the whole marketing site
--
-- The public pages were fetching gym + plans + branches + trainers + site
-- content as five separate PostgREST calls (six in practice: the brand provider
-- fetched the gym again), and the page rendered nothing until all of them
-- resolved. This project lives in ap-northeast-1 (Tokyo) while its users are in
-- Saudi Arabia, so every one of those round trips is expensive — the visitor sat
-- on "loading" for the slowest of six intercontinental requests.
--
-- public_site_data() returns the entire payload in a single call. SECURITY
-- INVOKER: these tables are anon-readable by policy, so the function grants no
-- access that a direct select did not already have.
-- =============================================================================

create or replace function public.public_site_data()
returns jsonb
language sql
stable
security invoker
set search_path = public as $$
  select jsonb_build_object(
    'gym',      (select to_jsonb(g) from public.gyms g limit 1),
    'plans',    coalesce((select jsonb_agg(to_jsonb(p) order by p.sort_order)
                            from public.plans p where p.is_active), '[]'::jsonb),
    'branches', coalesce((select jsonb_agg(to_jsonb(b) order by b.name_ar)
                            from public.branches b), '[]'::jsonb),
    'trainers', coalesce((select jsonb_agg(to_jsonb(t) order by t.sort_order)
                            from public.trainers t where t.is_active), '[]'::jsonb),
    'content',  coalesce((select jsonb_object_agg(s.key, s.content)
                            from public.site_content s), '{}'::jsonb)
  );
$$;

grant execute on function public.public_site_data() to anon, authenticated;

notify pgrst, 'reload schema';
