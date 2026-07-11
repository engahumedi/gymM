# Progress

Build order from SPEC.md. Check a box only after the phase builds, passes end-to-end and
failure-case testing, and is committed.

- [x] **Phase 1** — Supabase schema + RLS + seed data → push initial commit
- [ ] **Phase 2** — Auth + single login with role-based routing (public / dashboard / member layouts)
- [ ] **Phase 3** — Members + plans + subscriptions core
- [ ] **Phase 4** — Check-in + manual payments
- [ ] **Phase 5** — Notifications engine
- [ ] **Phase 6** — Analytics dashboard
- [ ] **Phase 7** — Public website + Join Now flow
- [ ] **Phase 8** — Polish: RTL audit, empty states, loading skeletons, error handling → verify Pages deploy

**Current phase: 2** — app scaffold + auth/routing built & smoke-tested; live-auth
verification (real login → role redirect) pending Supabase project URL + anon key.

## Session notes
<!-- Append a short report after each phase: what was tested, what passed, what was fixed. -->

### Phase 1 — Supabase schema + RLS + seed (2026-07-11) ✅
**Delivered:** `supabase/migrations/0001_schema.sql` (12 tables, 6 enums, member-code
trigger), `0002_rls.sql` (SECURITY DEFINER role helpers + deny-by-default policies on
every table), `0003_storage_and_auth.sql` (two storage buckets + `on_auth_user_created`
profile trigger), `supabase/seed.sql` (1 gym, 2 branches, 4 plans, 4 trainers, site
content, 50 members).

**Tested** on a real local Postgres 16 cluster (Supabase-schema stubs for `auth`/`storage`):
- All 4 SQL files apply cleanly, no errors.
- Seed counts verified: 50 members, 58 subscriptions (incl. 8 renewal-history rows),
  56 payments (unique receipts), 302 check-ins, 4 freezes, 6 notifications; revenue 44,800.
- Status distribution correct: 30 active / 6 expiring-soon / 8 expired / 4 frozen / 2 pending;
  25 members per branch; Saudi phone CHECK holds; `member_code` auto-generates (`M00001`…).
- **RLS verified by impersonating roles** (session JWT claim + `set role`):
  anon reads public tables only (members/payments = 0); super_admin sees all;
  reception A/B see only their 25 branch members and 0 cross-branch; member sees only own
  row + own subs/payments/check-ins.
- **Failure cases:** reception A inserting a member into branch B → BLOCKED by RLS;
  member reading another member's payments → 0 rows. Both pass.

**Fixed during testing:** none in the SQL — the only issue was a test-harness quirk
(transaction-local `set_config` reset between psql autocommit statements); wrapping each
role's checks in a single transaction reproduced real request behavior and everything passed.

**Not done here (needs credentials):** applying to the live Supabase project and creating
real auth accounts. `npm run build` is N/A — no app code exists until Phase 2.

### Phase 2 — Auth + single login with role-based routing (2026-07-11) 🟡 scaffold done
**Delivered:** full Vite + React 18 + TS (strict) + Tailwind scaffold; i18n dictionary
system (AR default / EN toggle, `dir` + `lang` on `<html>`); single Supabase client reading
`.env`; `AuthProvider` (session + profile) + `useAuth`; `RequireRole` guard + `roleHome`
role→route map; single `LoginPage` (zod-validated, graceful ConfigError when unconfigured);
three layout shells (public dark / dashboard light-sidebar / member portal) with
role-filtered nav; hash router wiring public + guarded dashboard/portal + 404; GitHub Actions
Pages workflow.

**Tested:**
- `npm run build` (tsc strict + vite) passes clean — 102 modules.
- Runtime smoke test (headless Chromium against the production build on `/gymM/`):
  ✅ public home renders with `dir=rtl`/`lang=ar` and brand name;
  ✅ language toggle flips to `dir=ltr`/`lang=en` and English copy;
  ✅ `/dashboard` while logged out → redirected to `/login`;
  ✅ unknown route → 404 page;
  ✅ login with no env → ConfigError screen (no blank page); zero page errors.

**Fixed during testing:** (1) `vite.config` based `base` on `command`, so `vite preview`
served the prod build at `/` and all `/gymM/` assets 404'd → switched to `mode`-based base
(`production` → `/gymM/`) so build and preview agree. (2) added `@types/node` +
`types:["node"]` to the node tsconfig for the Vite config to type-check.

**Pending (needs credentials):** live sign-in with a real Supabase user and verifying the
role-based redirect end-to-end (super_admin/reception → dashboard, member → portal), plus
wiring the deployed Pages build with the env secrets.
