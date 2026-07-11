# Power Gym — Gym Management System

White-label gym management system + public marketing website. Arabic (RTL) primary,
English (LTR) toggle. See [`SPEC.md`](./SPEC.md) for the full requirements and
[`PROGRESS.md`](./PROGRESS.md) for build status.

**Stack:** Vite + React 18 + TypeScript + Tailwind · Supabase (Postgres/Auth/RLS/Storage) ·
deployed to GitHub Pages via GitHub Actions.

## Database (Phase 1 — done)

SQL lives in [`supabase/`](./supabase):

- `migrations/0001_schema.sql` — extensions, enums, tables, triggers
- `migrations/0002_rls.sql` — RLS helper functions + policies (deny-by-default)
- `migrations/0003_storage_and_auth.sql` — storage buckets + new-user → profile trigger
- `seed.sql` — demo data: 1 gym, 2 branches, 4 plans, trainers, site content, ~50 members
  with mixed statuses, payments, freezes, check-in history

### Apply to a Supabase project

Using the Supabase CLI:

```bash
supabase link --project-ref <your-project-ref>
supabase db push          # applies migrations/
psql "$SUPABASE_DB_URL" -f supabase/seed.sql   # loads demo data
```

Or paste each file into the Supabase SQL editor in order (0001 → 0002 → 0003 → seed).

### Demo accounts

The seed loads domain data only; **auth accounts are created via Supabase Auth**. After
seeding, create users in the dashboard and set their role/branch in `profiles`:

```sql
-- super admin
update profiles set role='super_admin', gym_id='11111111-1111-1111-1111-111111111111'
where id='<auth-user-uuid>';
-- branch reception
update profiles set role='reception', branch_id='22222222-2222-2222-2222-222222220001'
where id='<auth-user-uuid>';
```

Members can self-register (public Join Now flow) — the `on_auth_user_created` trigger
creates their `profiles` row as `member` automatically.

## Environment

Copy `.env.example` → `.env` and fill in your Supabase URL + anon key (both are safe to
expose client-side; RLS protects the data). **Never** commit the service-role key.

## Frontend (Phase 2 — auth + role routing)

```bash
npm install
cp .env.example .env      # fill in VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
npm run dev               # http://localhost:5173
npm run build             # type-check + production build to dist/
```

- **Single login** at `/#/login` → redirect by role: super admin / reception → `/#/dashboard`,
  member → `/#/portal`. Routes are guarded by `RequireRole` (client convenience only — the
  real security is RLS in the database).
- **i18n:** Arabic (RTL) is the default; the header toggle switches to English (LTR). All
  copy comes from `src/i18n/dictionary.ts` — no hardcoded strings.
- **Hash routing** (`/#/...`) is used so GitHub Pages needs no SPA-fallback config and never
  404s on refresh.

If the Supabase env vars are missing, the app renders a clear "configuration missing" screen
instead of a blank page.

## Deployment (GitHub Pages)

Automated via `.github/workflows/deploy.yml` on every push to `main`.

1. In the repo: **Settings → Secrets and variables → Actions**, add
   `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (both client-safe).
2. **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Push to `main`. The workflow builds with `base: /gymM/` and deploys.
4. Live URL: `https://<your-username>.github.io/gymM/`
   (if you fork/rename the repo, set the `VITE_BASE` env or edit `vite.config.ts`).

## Rebrand for another gym

All branding lives in the `gyms` row and `site_content` / `plans` / `branches` / `trainers`
tables — edit data, not code.
