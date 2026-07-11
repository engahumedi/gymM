# Gym Management System — Project Brief

**What this is:** A white-label gym management system + public marketing website. Built
for one gym brand with multiple branches, but rebrandable (name, logo, colors, plans) from
a settings table — no hardcoded branding. **Arabic (RTL) is the primary language**, with an
English (LTR) toggle.

**Stack:**
- Vite + React 18 + TypeScript (strict) + Tailwind CSS — client-side SPA
- Supabase (Postgres, Auth, RLS, Storage, Edge Functions, pg_cron) — **free tier only**;
  browser talks to Supabase directly, all security via RLS policies (never client code)
- react-router · Recharts · react-hook-form + zod
- Deployed to **GitHub Pages** via GitHub Actions on push to `main`

**Roles:** Super Admin (HQ, all branches) · Branch Reception (own branch only) · Member
(personal portal). Single login page → redirect by role. Scoping enforced by RLS.

## Core Rules (apply every session)
- **Always choose the simplest reliable approach.** Boring and proven over clever.
  Simplicity must never reduce quality or correctness.
- **Work autonomously.** Make reasonable decisions yourself; log every non-trivial one in
  `DECISIONS.md`. Only stop to ask when truly blocked (credentials / accounts I must create).
- **Mandatory testing after every phase** before starting the next — build must pass, flows
  tested end-to-end with seed data, failure cases tested (RLS blocks, bad inputs). See the
  "Mandatory Testing After Every Phase" section in SPEC.md.
- **Update `PROGRESS.md` after every phase** (check the box, bump current phase, add notes).
- **One clean commit per phase.** A phase is not done until it builds and works.
- **Never commit secrets.** Supabase URL + anon key are safe client-side; the service-role
  key is not. Provide `.env.example`.
- **All strings via the i18n dictionary — no hardcoded text.** Everything must mirror
  correctly in RTL (layout, tables, charts, icons).

## Current status (2026-07-11)
Phases **1–4 done** and verified on the live Supabase project (`hfjyaduiynigylvunnto`).
**Next: Phase 5** (notifications engine). Develop on branch
`claude/gym-system-bootstrap-mnn1vh` (in sync with `main`). See the **Handoff** section at the
top of `PROGRESS.md` for what to request from the user (Supabase URL + anon key for `.env`; a
`sbp_` PAT to apply migrations over HTTPS) and the sandbox networking notes.

## Pointer
Full requirements live in **SPEC.md** — read the relevant section before starting any phase.
