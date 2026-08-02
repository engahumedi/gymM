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

## Current status (2026-08-02)
**All 8 phases done** and verified on the live Supabase project (`hfjyaduiynigylvunnto`);
deployed to GitHub Pages. UI is **exaggerated minimalism** on an editorial-athletic base (pure black
ground, oversized display type, one accent — the gym's own `primary_color`, currently `#8f1d24` —
self-hosted Reem Kufi / Fraunces / IBM Plex Sans Arabic, thin lucide icons, hairline-and-whitespace
layout, no cards/glow/emoji). The text colour that sits on a filled accent surface (`--accent-on`)
is computed for WCAG contrast, so any rebrand colour stays readable. Design tokens live in
`src/index.css` + `tailwind.config.js`. Develop on branch
`claude/gym-system-context-setup-ezbbxk`. See the **Handoff**
section at the top of `PROGRESS.md` for what to request from the user (Supabase URL + anon key for
`.env`; a `sbp_` PAT to apply migrations over HTTPS) and the sandbox networking notes.

**Feature set:** members / plans / subscriptions with all lifecycle RPCs, check-in (manual + QR
scan with confirmation), manual payments + printable receipt, notifications engine (pg_cron +
`notify` Edge Function stub), analytics, public marketing site + Join Now, member portal, freeze
requests, CSV import, printable membership card, audit log, password reset by request→staff
approval (no SMTP), and a full white-label **Settings** screen (identity / branches / staff invites
/ site content) with runtime brand colours + logo.

**Security + performance pass (migrations 0014–0015, applied live).** A review of the live system
found and fixed: a **privilege-escalation hole** (any member could `PATCH` its own
`profiles.role` to `super_admin` — now blocked by a trigger and audited), maintenance/audit RPCs
callable by any signed-in user (Postgres grants EXECUTE to `PUBLIC` by default — revoked), private
member photos readable by any authenticated user, user enumeration in the password-reset RPC,
duplicate check-ins burning plan sessions, unlimited self-priced pending renewals, and staff invites
claimable by email alone. **PostgREST caps responses at 1000 rows**, which was silently truncating
analytics, so aggregation moved into `analytics_overview()` and member lists onto the
`members_overview` view with server-side search/filter/paging. App side: route-level code splitting
(entry 677→570 KB), an error boundary, an accessible Modal, CI that runs type-check + tests on every
branch, and **`npm run test:rls`** — a live RLS regression suite (8 checks) to run after any policy
change. **Load time (0016):** the public site fetched its content in six round trips to a database in
`ap-northeast-1` and showed a spinner instead of the page; it is now one `public_site_data()` call,
cached in `localStorage`, with the hero painting immediately (6 requests → 1, hero at ~185 ms).

**Owner requests (migrations 0017–0022, applied live).** **Mobile-first dashboard** — reception
works from a phone or tablet: bottom tab bar, full-height sheet dialogs, 44px touch targets, tables
that stack under `sm`. **Sign in with a phone number** (`login_email_for_phone`) — returns an
account's email only when the password already verifies, rate limited 10 attempts / 15 min per
number, no SMS provider and no WhatsApp. **Printable monthly report** (`monthly_report()`) — one
click for the month's revenue, the change against the previous month, the branch split and the
best-selling plans; SECURITY INVOKER, so reception sees its branch. **Hijri + Gregorian everywhere**
— `gyms.calendar` decides which one leads, and both are always shown. Critically, the calendar also
drives the **arithmetic**: subscription terms are computed in the gym's own calendar through a
1210-row Umm al-Qura table (`hijri_months`, generated from browser ICU) and a single `add_term()`
that all four subscription RPCs call. A Hijri year is 355 days, not 365 — **10 days per member per
year** that used to be given away. Date entry keeps the native input and adds a lazily-loaded
`react-day-picker` Hijri picker (absent from the entry chunk).

DB migrations run through `0022`; `supabase/apply_all.sql` is the one-paste bundle.
Run tests with `npm test` (49), RLS checks with `npm run test:rls` (8).

**Known follow-ups (not done):** captcha on the public forms (needs a provider key), 15% VAT on
receipts, real WhatsApp/SMS sending, cross-branch check-in for all-branch plans, SEO/prerender for
the marketing pages, and a deliberate react-router 7 upgrade (the open advisory is SSR-only and
unreachable in this client-side SPA).

## Pointer
Full requirements live in **SPEC.md** — read the relevant section before starting any phase.
