# Claude Code Prompt — Gym Membership Management System + Public Website

Build a complete, production-quality **Gym Management System** designed as a **white-label template**: built for one gym brand with multiple branches, but easily rebrandable for any gym (name, logo, colors, plans configurable from a settings table — no hardcoded branding).

## Guiding Principles
- **Always choose the simplest reliable approach** — prefer boring, proven solutions over clever ones. Simplicity must never reduce quality or correctness.
- **Work autonomously**: make reasonable decisions yourself and document them in a `DECISIONS.md` file instead of asking me. Only stop to ask when truly blocked (e.g., you need credentials or an account I must create).
- One codebase, one deployed site: **a single login page** at the same URL — after login, the user is redirected by role (HQ admin / branch reception / member). No separate apps.

## Tech Stack
- **Vite + React 18 + TypeScript + Tailwind CSS** — a fully client-side SPA (no server needed), so it deploys free on **GitHub Pages**.
- **Supabase** (Postgres, Auth, Row Level Security, Storage, Edge Functions, pg_cron) — free tier only. The browser talks to Supabase directly via `@supabase/supabase-js`; all security is enforced by RLS policies, never by client code.
- Routing: react-router. Charts: **Recharts**. Forms: react-hook-form + zod.
- No paid services required to run.

## Language & Design
- **Arabic (RTL) is the primary language**, with an English (LTR) toggle. Full i18n via a dictionary system — no hardcoded strings. Layout, tables, charts, and icons must all mirror correctly in RTL.
- Modern, professional design — NOT a generic template look. Dark athletic theme for the public website; clean light dashboard for the admin panel. Use a distinctive Arabic font pairing (e.g., IBM Plex Sans Arabic).
- Fully responsive (reception staff will use tablets/phones).

## User Roles (Supabase Auth + RLS)
1. **Super Admin (HQ management)** — full access across all branches, analytics, settings, branding.
2. **Branch Reception** — scoped to their branch only: register members, renew, check-in, record payments.
3. **Member** — personal portal: view subscription status/expiry, payment history, check-in history, and request a renewal (creates a pending renewal that reception confirms after payment at the branch).

Enforce role + branch scoping with **Postgres RLS policies**, not just client-side checks.

## Part 1 — Public Website (marketing site)
- Home: hero, plans & pricing, branches (with map links), trainers, facilities gallery, testimonials, FAQ, contact.
- Plans page with comparison table.
- **Join Now flow**: visitor picks a plan + branch → creates an account → a **pending subscription** is created → they pay at the branch and reception activates it with one click. Reception sees pending sign-ups in a queue on their dashboard.
- All content (plans, branches, trainers, images) pulled from the database so any gym can customize it without touching code.

## Part 2 — Management Dashboard

### Members
- Register member: name, phone (primary identifier, Saudi format validation), gender, DOB, branch, photo (Supabase Storage), emergency contact, notes.
- Search/filter by name, phone, member ID, branch, status (active / expiring soon / expired / frozen).
- Member profile page: full history of subscriptions, payments, check-ins, freezes.

### Plans & Subscriptions
- Configurable plans: duration (1/3/6/12 months), price, freeze allowance (days), branch access (single branch vs all branches), sessions-based or unlimited.
- Subscription lifecycle: **pending → active → frozen → expired → cancelled**.
- Renew (extends from expiry date if still active, from today if expired), upgrade with prorated calculation, freeze/unfreeze (extends expiry by frozen days, capped by plan allowance).
- Status badges everywhere: green (active), yellow (expires within 7 days), red (expired), blue (frozen).

### Check-in
- Fast check-in screen for reception: search by phone/member ID → shows photo + status → one-tap check-in.
- Block check-in if expired/frozen, with a clear message and quick "Renew" shortcut.
- Log every check-in (member, branch, timestamp) — this feeds analytics.

### Payments (manual only for now)
- Reception records cash / card (mada) payments with amount, method, and receipt number.
- Every payment linked to a subscription; printable/PDF-friendly receipt view.
- **No online payment integration in this version.** Just keep the payments table generic enough (method, provider, reference fields) that an online gateway can be added later without schema changes.

### Notifications
- **In-app**: dashboard alerts for staff (expiring this week, expired, pending activations) + member portal alerts.
- **WhatsApp/SMS**: build a notification service abstraction with a Supabase Edge Function + scheduled job (pg_cron) that finds subscriptions expiring in 7/3/1 days and queues messages. In dev, log messages to a `notifications` table with status `simulated`. Document exactly how to plug in Twilio or Meta WhatsApp Business API later.

### Analytics (management decision support)
Dashboard with date-range + branch filters:
- KPI cards: active members, new registrations this month, revenue this month, churn rate, renewal rate, expiring within 7 days.
- Charts: revenue over time (per branch comparison), member growth, check-in heatmap by hour/day (peak hours), plan popularity, retention cohort (simple version).
- Export any table to CSV/Excel.

### Settings (white-label)
- Gym identity: name (AR/EN), logo, colors, contact info, social links.
- Branch management: add/edit branches, working hours, location.
- Staff management: invite reception users, assign branch.

## Database (suggested core tables)
`gyms` (settings), `branches`, `profiles` (role, branch_id), `members`, `plans`, `subscriptions`, `payments`, `check_ins`, `freezes`, `notifications`, `trainers`, `site_content`.
Provide the full schema as SQL migration files with RLS policies, plus a **seed script** with realistic demo data (2 branches, 4 plans, ~50 members with mixed statuses, payments, and check-in history) so the dashboard and analytics look alive immediately.

## GitHub & Deployment (GitHub Pages)
- Initialize a git repo from the start. Create a **GitHub repository using the `gh` CLI** and push to it, with one clean, descriptive commit per completed phase.
- Set up a **GitHub Actions workflow** that builds the Vite app and deploys it to **GitHub Pages** automatically on every push to `main`. Configure the correct `base` path in `vite.config.ts` and handle SPA routing on Pages (404.html redirect trick or hash routing — pick the cleaner option and document why).
- The Supabase URL and anon key are safe to expose client-side (that's their design; RLS protects the data) — but never commit the service-role key. Provide `.env.example`.
- README must include: setup steps, how to enable Pages in repo settings, and the live URL format.

## Build Order
1. Supabase schema + RLS + seed data → push initial commit to GitHub.
2. Auth + single login with role-based routing (three layouts: public site, dashboard, member portal).
3. Members + plans + subscriptions core (the heart of the system).
4. Check-in + manual payments.
5. Notifications engine.
6. Analytics dashboard.
7. Public website + Join Now flow.
8. Polish: RTL audit, empty states, loading skeletons, error handling → final push, verify GitHub Pages deployment is live.

## Quality Bar
- TypeScript strict, zod validation on every form and API route.
- Handle edge cases: renewing a frozen subscription, duplicate phone numbers, member with multiple historical subscriptions, timezone-correct expiry (Asia/Riyadh).
- Clear README: setup steps, env vars, deploy steps, how to rebrand for a new gym, how to add online payments/WhatsApp later.

## Mandatory Testing After Every Phase
After completing each phase in the build order, before starting the next one:
1. Run `npm run build` and fix all TypeScript/build errors.
2. Run the app and **manually test every flow added in that phase** end-to-end with the seed data (e.g., after phase 3: register a member, create a subscription, renew it, freeze it, and confirm expiry dates and statuses are correct).
3. Test failure cases too: invalid inputs, wrong role trying to access another branch's data (RLS must block it), expired member trying to check in.
4. Write a short phase report: what was tested, what passed, what was fixed.
5. Only commit and push to GitHub after the phase passes all checks. A phase is not done until it works.

Start immediately: briefly summarize your schema design in a few lines, then proceed through the build order without waiting for my approval. Only pause if you need something from me (Supabase project keys, GitHub auth).
