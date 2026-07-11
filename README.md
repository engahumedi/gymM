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

## Rebrand for another gym

All branding lives in the `gyms` row and `site_content` / `plans` / `branches` / `trainers`
tables — edit data, not code.
