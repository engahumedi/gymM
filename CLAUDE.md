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

## Current status (2026-07-12)
**All 8 phases done** and verified on the live Supabase project (`hfjyaduiynigylvunnto`);
deployed to GitHub Pages. UI is redesigned to an **editorial-athletic** system (dark charcoal
ground, one crimson accent, self-hosted Reem Kufi / Fraunces / IBM Plex Sans Arabic, thin
lucide icons, hairline-and-whitespace layout — no cards/glow/emoji). Design tokens live in
`src/index.css` + `tailwind.config.js`. The **white-label Settings screen** is now fully built
(Identity / Branches / Staff invites / Site content — see the Settings note in `PROGRESS.md`).
Develop on branch `claude/gym-system-context-setup-h0pqfe`. See the **Handoff** section at the
top of `PROGRESS.md` for what to request from the user (Supabase URL + anon key for `.env`; a
`sbp_` PAT to apply migrations over HTTPS) and the sandbox networking notes.

**Post-launch additions:** national ID on members, member-initiated **freeze requests** with
reception approval (`freeze_requests`, migration `0009`), rebrand to **أبطال الرياضة**, and a
home login link, and a full white-label **Settings** screen (gym identity, branch CRUD, staff
invites `0010`, site-content/trainers editors). **Latest batch:** runtime branding (saved
`primary_color` → `--accent` + logo shown app-wide), **CSV member import**, **member QR + reception
camera scan check-in** (`qrcode.react` / `html5-qrcode`), and **password reset by request→staff
approval** (`password_change_requests`, migration `0011` — no email/SMTP; approve writes a bcrypt
hash to `auth.users`). DB migrations run through `0011` (all applied live; `supabase/apply_all.sql`
is the one-paste bundle).

## Pointer
Full requirements live in **SPEC.md** — read the relevant section before starting any phase.
