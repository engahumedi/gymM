# Progress

Build order from SPEC.md. Check a box only after the phase builds, passes end-to-end and
failure-case testing, and is committed.

- [x] **Phase 1** — Supabase schema + RLS + seed data → push initial commit
- [x] **Phase 2** — Auth + single login with role-based routing (public / dashboard / member layouts)
- [x] **Phase 3** — Members + plans + subscriptions core
- [x] **Phase 4** — Check-in + manual payments
- [x] **Phase 5** — Notifications engine
- [x] **Phase 6** — Analytics dashboard
- [x] **Phase 7** — Public website + Join Now flow
- [x] **Phase 8** — Polish + UI redesign (editorial-athletic), RTL audit, error handling → verify Pages deploy

**Status: all 8 phases complete.** Verified against the live Supabase project; the app is
redesigned (editorial-athletic) and deployed to GitHub Pages.

## Handoff — read this first in a new session

- **Repo layout:** `main` holds the merged history. Continue development on branch
  **`claude/gym-system-context-setup-ezbbxk`**. Docs live at the repo root: `SPEC.md`,
  `CLAUDE.md`, `PROGRESS.md`, `DECISIONS.md`, `README.md`.
- **Status:** all 8 phases + post-launch tweaks + the full **white-label Settings screen**
  (Identity / Branches / Staff invites / Site content) are done and verified live. The UI
  redesign (editorial-athletic) already shipped in Phase 8 — no "rough UI" work pending.
- **Auth config note:** the public Join flow and staff-invite sign-up need email **autoconfirm
  ON** (enabled on this project via the Management API). For a fresh project, turn off "Confirm
  email" in Auth settings so sign-ups get an immediate session.
- **Possible next work** (owner-facing suggestions, not started): real WhatsApp/SMS send (deploy
  the `notify` Edge Function), 15% VAT on receipts, cross-branch check-in for all-branch plans,
  captcha on the public forms (needs a provider key), SEO/prerender for the marketing pages, and a
  deliberate react-router 7 upgrade.
- **After any migration touching policies, helpers or grants, run `npm run test:rls`** — it signs in
  as the demo accounts and asserts what each role can and cannot reach against the live project. (Done already: white-label Settings, runtime
  brand colors/logo, CSV member import, member QR + reception scan check-in, password reset by
  request→staff approval, staff-set password, printable membership card, audit log, pg_cron expiry
  job, and Vitest unit tests for `lib/`.)
- **Live Supabase project:** URL `https://hfjyaduiynigylvunnto.supabase.co` (ref
  `hfjyaduiynigylvunnto`, Postgres 17). Schema + RLS + functions + seed are already applied,
  **migrations through `0016`** (`supabase/apply_all.sql` is the regenerated one-paste bundle).
- **What a new session must get from the user** (nothing secret is committed):
  1. `VITE_SUPABASE_URL` + **anon** key → create a local `.env` (gitignored) so `npm run
     dev/build` hit the live project. The anon key is client-safe (RLS protects data).
  2. To apply *new* migrations: a Supabase **personal access token** (`sbp_…`). This sandbox
     only allows outbound HTTPS, so raw Postgres (5432/6543) is unreachable — run SQL via the
     Management API: `POST https://api.supabase.com/v1/projects/<ref>/database/query`
     with `Authorization: Bearer <PAT>` and body `{"query":"…"}`. (Or the user pastes
     `supabase/apply_all.sql` / the new migration into the dashboard SQL Editor.)
- **Demo logins** (password `GymDemo#2026`): `admin@powergym.sa` (super_admin),
  `reception.olaya@powergym.sa` / `reception.malqa@powergym.sa` (reception),
  `member@powergym.sa` (member).
- **Sandbox limitation:** the headless browser can't tunnel to Supabase here, so verify
  authenticated flows through their data layer (curl against PostgREST with a user JWT / the
  Management API) rather than a rendered browser session. Build + these checks are the bar.
- **Still manual (repo owner, for live Pages):** add the two `VITE_SUPABASE_*` values as GitHub
  Actions secrets and set Pages source to "GitHub Actions" (see README).

## Session notes
<!-- Append a short report after each phase: what was tested, what passed, what was fixed. -->

### Marketing-site first-load time (2026-08-01) ✅
Owner reported the public site sitting on "loading" for a long time on first open. Measured in a
real browser, not guessed: the home page fired **six** database requests (five selects + a duplicate
gym fetch from the brand provider) and rendered `<InlineLoading />` *in place of the page* until the
slowest one returned — against a database in **ap-northeast-1 (Tokyo)** while the users are in Saudi
Arabia, so each of those round trips is intercontinental.

- **`0016_public_site_payload.sql`** (applied live): `public_site_data()` returns gym + plans +
  branches + trainers + site content as one `jsonb` document (9 KB), SECURITY INVOKER over the same
  anon-readable tables — no new access.
- **App:** `PublicDataProvider` and `BrandProvider` now share a single in-flight request; the payload
  is cached in `localStorage` (stale-while-revalidate, 24h ceiling); the home page renders its hero
  immediately and lets each data section fill in, with a small inline loader instead of a full-page
  one; `index.html` preconnects to the Supabase origin so DNS + TLS overlap the bundle download.

**Measured before → after (headless Chromium against the production build):**
- database requests on first paint: **6 → 1**
- hero visible: **only after all six requests → 185 ms**
- repeat visit (warm cache): real plan names on screen in **159 ms with no network on the path**
- first visit while data is still loading: hero, nav, footer and login are all present and usable
  (previously the page was a bare spinner)

**Tested:** `npm run build` ✅ · `npm test` ✅ 36/36 · payload verified live (4 plans / 2 branches /
4 trainers / 4 content blocks) · anon-callable as intended.

**Note for the owner:** the remaining wait is distance — the project region cannot be changed in
place; moving to a nearer region means a new project and a data migration. Flagged, not done.

### Security + performance + quality pass (2026-08-01) ✅
A full review of the live system, then every finding in the critical / important / performance /
code-quality tiers fixed and re-verified. Migrations **0014** (security) and **0015** (analytics +
indexes) are applied live; `supabase/apply_all.sql` regenerated.

**Critical (all reproduced live before the fix):**
- **Privilege escalation** — `profiles_self_update` had no column restriction, so a member could
  `PATCH` its own row to `role = 'super_admin'`: verified live going from 1 visible member to all
  50 plus payments and the audit log. Fixed with a BEFORE UPDATE trigger (SECURITY INVOKER, so the
  DEFINER RPCs still work); role/branch changes are now audited. Re-tested: `forbidden_privilege_change`,
  role unchanged, `public_join` and staff branch reassignment both still work.
- **PostgREST `max_rows = 1000`** silently truncated the analytics fetch (`.limit(5000)`), so
  check-in reporting would have gone quietly wrong past ~1000 visits. Aggregation moved into
  `analytics_overview()`; cross-checked against direct SQL (303/303 check-ins, 21,100 revenue,
  26 active / 8 expiring / 19 expired) and confirmed RLS-scoped (reception sees 25 / 146, not 50 / 303).
- **Member photos** were readable and listable by *any* authenticated user; now staff + the owner.

**Important:** maintenance/audit RPCs revoked from `PUBLIC` (Postgres grants EXECUTE there by
default, so "granted to authenticated" was never the whole story — a member could forge audit
entries); password requests no longer leak whether an email exists and can no longer be parked on a
victim's account; check-in is idempotent within an hour (`checkin_duplicate`) and a scanned QR now
requires a human confirmation instead of checking in on sight; members get one pending renewal,
priced by the gym; staff invites need a secret token + 7-day expiry (tested all three paths: no
token → member, valid → reception at the invited branch, expired → member); password minimum 8 in
both the RPCs and the GoTrue config.

**Performance:** `members_overview` (security_invoker view) + server-side search/filter/paging
replaced `fetchMembers()` on five screens; dashboard KPIs use `head:true` counts; member profile
went from 7 round trips to 1; payments paginate; new indexes incl. pg_trgm for search. Entry bundle
677 KB → 570 KB (186 → 162 KB gzip) by lazy-loading the dashboard/portal trees.

**Quality:** error boundary (no more white screens), Modal made accessible (role/aria/focus trap/
scroll lock), `errors.ts` covers the new server codes, `index.html` de-branded with `document.title`
+ favicon driven by the `gyms` row, CI now runs type-check + tests on every branch and before deploy,
and **`npm run test:rls`** (new) asserts the policies against the live project — 8/8 passing,
including the escalation attempt. All 25 `as never` casts removed by fixing their root cause
(schema types declared as `interface` instead of `type`), which surfaced two real type defects.

**Tested:** `npm run build` ✅ · `npm test` ✅ 36/36 · `npm run test:rls` ✅ 8/8 · live data-layer
checks listed above. All test rows removed afterwards — seed intact (50 members / 303 check-ins /
57 payments / 4 accounts / 0 invites).

### Hardening + staff password reset + card + audit + cron + tests (2026-07-13) ✅
Six additions (`0012`, `0013` migrations):

- **Password-request rate limit** (`0012`): `request_password_change` now caps at 5/user/24h on top
  of the one-pending dedup. (Captcha on the public forms still needs a provider key — noted, not wired.)
- **Staff-set member password** (`staff_set_member_password`): reception (own branch) / super-admin
  (gym) sets a member's password on the spot from the member profile — writes a bcrypt hash to
  `auth.users`, audited. UI: "Set password" button + modal on `MemberProfile`.
- **Printable membership card** (`/card/:id`, `MembershipCard`): brand logo + name + `member_code`
  + QR on a light card, print-friendly; opened from the portal QR card and the member profile.
- **pg_cron** (`0013`): `expire_due_subscriptions` scheduled daily (`5 0 * * *`) so lapsed subs
  flip to `expired` in the DB, not just in the derived UI status.
- **Audit log** (`0012`): `audit_log` + `record_audit()` + triggers on `payments` (insert) and
  `subscriptions` (status change) + explicit logging in the credential RPCs. Super-admin-only read,
  surfaced as a **Settings → Activity** tab.
- **Vitest** (`npm test`): unit tests for `phone`, `subscriptionStatus`, `csv`, `analytics`
  (28 tests). **Caught a real bug**: `normalizeSaudiPhone` sliced the wrong offset for `+9665`/`9665`
  inputs (`966501234567` → `06501234567`); fixed to produce `0501234567`. Never hit in practice
  because forms submit the local `05…` form, but a genuine defect now covered.

**Tested (live data layer):** staff-set password → member signs in with it (204 + login OK);
rate-limit → `rate_limited` on the 6th/24h; payment + `password_set_by_staff` land in `audit_log`
with the actor name; **reception is blocked from reading `audit_log`** (0 rows); cron job present
(`expire-subscriptions-daily @ 5 0 * * *`). All test rows removed; seed intact. `npm run build`
passes; `npm test` green (28/28).

### Password reset reworked: request → staff approval (no SMTP) (2026-07-13) ✅
Replaced the email/SMTP password recovery with a **request→approval** flow (owner's idea; fits a
gym where staff verify members in person), mirroring the freeze-request pattern. **No email, no
SMTP, no cost, no `service_role` in the browser.**

- **`0011_password_change_requests.sql`** (applied live): a `password_change_requests` table +
  three SECURITY DEFINER RPCs. `request_password_change(email, new_password)` is granted to **anon**
  (the user forgot their password → not signed in): it resolves the account, stores the new
  password as a **bcrypt hash** (`extensions.crypt(..., gen_salt('bf',10))`), dedupes one pending
  per user. `approve_password_change` / `reject_password_change` are staff-only (super-admin gym /
  reception branch); approve writes the stored hash into `auth.users.encrypted_password` so the
  user can sign in with the new password. RLS: staff-read only (the hash is never selected by the
  app; the RPCs blank it in their return).
- **App:** the old email pages are gone (`ResetPasswordPage` deleted; `sendPasswordReset` /
  `consumeRecoveryTokens` / `updatePassword` removed). `ForgotPasswordPage` is now a request form
  (email + new password + confirm). The dashboard home gained a **PasswordRequestsPanel** (approve/
  reject queue) next to the freeze queue.
- **Supabase config:** custom SMTP was configured then **removed** (Resend key cleared from the
  project); `site_url` left at the Pages URL.

**Tested (live data layer):**
- De-risk first: a SQL bcrypt write to `auth.users.encrypted_password` is accepted by GoTrue login
  (new password works, old rejected).
- Full flow: anon `request_password_change` → 204; duplicate → `request_exists`; admin sees the
  pending row (name/email); `approve_password_change` → status approved (hash blanked in return);
  **sign-in with the new password succeeds**. All test users deleted; seed intact.
- `npm run build` passes.

**Trust model (documented in DECISIONS):** requests are open to anon and the member picks the new
password, so **staff must verify identity before approving** — safe for a gym (reception knows its
members); an admin who is the sole super-admin should reset via the Supabase dashboard if locked out.

### Brand runtime + CSV import + password reset + member QR check-in (2026-07-12) ✅
Five owner-requested additions on top of the Settings work:

- **Brand colors + logo applied at runtime** (`src/lib/Brand.tsx` + `components/BrandMark`): a
  `BrandProvider` at the app root fetches the (anon-readable) `gyms` row, sets the `--accent`
  design token from `primary_color`, and exposes the gym so every header renders the uploaded
  **logo** (falling back to the name). Saving Identity settings re-skins the app immediately
  (`useBrand().reload()`). Closes the white-label loop — the saved color/logo now actually change
  the UI, not just the DB row.
- **CSV member import** (`members/MemberImport.tsx`, route `/dashboard/members/import`): upload →
  client-side `parseCsv` → per-row validation (Saudi phone/ID) → preview table → batch insert via
  the RLS-scoped `createMember`. Reception imports into their own branch; super-admin picks one.
  Downloadable template. New `parseCsv` in `lib/csv.ts`.
- **Password reset** — _(email/SMTP version; **superseded 2026-07-13** by the request→approval
  flow below — see the "Password reset reworked" note. This bullet is kept only as history.)_
  Original: `ForgotPasswordPage` + `ResetPasswordPage` used `resetPasswordForEmail` + a manual
  recovery-token parse. Dropped because free tier / GitHub Pages has no mail server.
- **Member QR + reception scan check-in**: the member portal shows a QR of their `member_code`
  (`qrcode.react`, on a white tile so it scans). The reception check-in screen gained a **Scan**
  button opening a camera scanner (`html5-qrcode`, dynamically imported → its own ~375 KB chunk);
  a decoded code is matched against the RLS-scoped member list and **checked in via the existing
  `record_check_in` RPC**, so a scan reflects in the system identically to a manual check-in.

**Tested (build + live data layer):**
- `npm run build` passes; `html5-qrcode` is code-split (lazy), not in the main bundle.
- **Scan→check-in reflects live:** as a real reception user, `record_check_in` for `M00002`
  created a `check_ins` row that appears in the feed (then cleaned up) — this is the exact call the
  scanner triggers.
- **CSV import path:** reception insert into own branch succeeds (auto `member_code`); insert into
  another branch → HTTP 403 (import can't cross branch). Test rows deleted; **seed intact (50
  members / 2 branches / 4 trainers / 0 invites, no leftovers)**.
- Brand runtime + QR rendering are client-only (no DB) and verified via build; they render in a
  real browser / on Pages (the sandbox browser can't reach Supabase).

**New deps:** `qrcode.react` (QR render), `html5-qrcode` (camera scan, lazy-loaded).

### Settings — white-label admin (Category 1) (2026-07-12) ✅
Built the entire **Settings** screen (was a `Placeholder`), super-admin only, as a tabbed page
(`src/pages/dashboard/settings/`): **Identity · Branches · Staff · Site content**. Completes the
SPEC's white-label promise — a new gym is now rebrandable from the UI, no SQL needed.

- **Identity** (`IdentitySettings`): edits the `gyms` row — name AR/EN, **logo upload** to the
  public `public-assets` bucket, primary/secondary colors (native picker + hex), contact
  email/phone, and social links (instagram/twitter/tiktok/whatsapp). Saves via `updateGym`.
- **Branches** (`BranchesSettings`): table + add/edit modal — name AR/EN, city, phone, address
  AR/EN, map link, a 7-day **working-hours** editor, active toggle. `createBranch`/`updateBranch`;
  reference data reloads after save.
- **Staff** (`StaffSettings`): lists current staff (reception branch is reassignable inline) and
  pending invites. **Invite flow avoids putting `service_role` in the browser**: super-admin
  creates a `staff_invites` row (`0010` migration) and shares a `#/staff-signup?email=…` link; the
  invited person signs up on the new public **`StaffSignupPage`**, and the extended
  `handle_new_user()` trigger promotes their profile to `reception` + the invited branch and marks
  the invite `accepted`.
- **Site content** (`ContentSettings` + `TrainersSettings`): structured editors for the
  `site_content` keys the public site reads (**hero** title/subtitle, **facilities**,
  **testimonials**, **faq** — generic list editor) via `upsertSiteContent`, plus **trainers CRUD**
  (photo upload, specialty, branch, active). The marketing site is now editable from the dashboard.

**DB:** `0010_staff_invites.sql` applied live (table + RLS `staff_invites_admin_all` + trigger
update). Features 1/2/4 needed **no new RLS** — `0002` already grants super-admin writes to
gyms/branches/trainers/site_content.

**Tested (build + live data layer, sandbox browser can't reach Supabase):**
- `npm run build` passes (tsc strict + vite; 2487 modules).
- **Identity:** admin PATCH `gyms` succeeds; **reception PATCH blocked** (0 rows, value unchanged); reverted.
- **Branches / Trainers / Site content:** admin create+update succeed; **reception writes → HTTP 403**; temp rows deleted (seed intact).
- **Staff invite → promotion:** admin creates invite (`role=reception`, `pending`) → invited email
  signs up (anon) → **profile auto-promoted to `reception` with the invited `branch_id`** and invite
  flips to `accepted` (`accepted_user_id` set). **RLS:** reception reads `staff_invites` → 0 rows;
  reception insert → 403. All test users deleted via the Auth Admin API; 0 leftover rows.

### Phase 8 — Polish + editorial-athletic redesign (2026-07-11) ✅
Full UI redesign to an **editorial-athletic** aesthetic (owner-approved), following a strict
"no generic AI look" brief.

- **Design tokens** (`src/index.css`) as CSS variables: deep charcoal ground `#0d0f12`,
  surfaces stepping up, hairline borders, warm off-white ink, one restrained crimson accent
  `#c8342f` + a rare sand. No default Tailwind palette — `tailwind.config.js` maps colours to
  the variables; single radius vocabulary (≤8px) and spacing scale.
- **Distinctive self-hosted fonts** (no CDN at runtime): Reem Kufi (Arabic display), Fraunces
  (Latin display, switched by `html[lang]`), IBM Plex Sans Arabic (body). 11 woff2 subsets
  bundled by Vite.
- **Thin lucide-react icons** (one stroke/size system) replace every emoji; emoji scrubbed
  from the dictionary too.
- **De-carded**: hairline dividers + whitespace instead of rounded-card-everything; no
  shadows/glow; strong type hierarchy (oversized display titles, calm body); asymmetric,
  off-centre compositions; one primary action per screen.
- Rebuilt primitives (Button/Field/Badge/Modal/misc), all three layouts, and every screen
  (public site, login, dashboard + all admin screens, member portal, receipt, analytics with
  dark Recharts theming + custom heatmap). RTL handled with logical properties throughout.

**Tested:**
- `npm run build` passes; fonts bundle; Analytics stays lazy-loaded.
- Compliance sweep: no banned Tailwind palette classes, no `shadow`/`rounded-xl/2xl`, no stray
  `bg-white` (except the intentional printable receipt paper), no emoji anywhere in `src`.
- Rendered check (headless Chromium) of login + 404: Reem Kufi display face applied, body ground
  `rgb(13,15,18)`, asymmetric editorial layout, single crimson action, no page errors.
- Live GitHub Pages deploy verified after merge.

### Post-launch tweaks (owner requests) ✅
- **Member-initiated freeze requests** (`0009` migration): a member requests to pause their
  active subscription for N days (portal button + modal, capped by the plan's freeze allowance,
  one pending request at a time); reception/super-admin see a **freeze-requests queue** on the
  dashboard and **Approve/Reject**. Approve applies `freeze_subscription`, so the expiry is
  extended by N days — the paused days are **not** deducted from remaining. RPCs:
  `request_freeze` / `approve_freeze_request` / `reject_freeze_request` (SECURITY DEFINER with
  role checks); `freeze_requests` table with member/staff read RLS. Verified live end-to-end
  (request → duplicate blocked → reception sees it → approve → expiry +N, `frozen_days_used`+N).
- Added a **Login link** to the public home hero (+ header login visible on mobile).
- Rebranded the gym to **أبطال الرياضة** / Sports Champions (dictionary `app.name` + `gyms` row + seed).
- Added **national ID** to members (`0008` migration; required in reception + Join forms with
  Saudi-ID validation, shown on the profile; `public_join` gained `p_national_id`; live members backfilled).
- Members list (reception + admin) now shows **subscription start / expiry + a days-remaining counter**.
- Member portal shows a **days-remaining counter** beside the expiry date.
- Redesigned the **peak-hours heatmap** (aligned grid, hour ticks, day labels, legend).
- `npm run build` passes; new `public_join(national_id)` tested live end-to-end.

### Phase 7 — Public website + Join Now (2026-07-11) ✅
**DB (`0007_public_join.sql`, applied live):** `public_join(full_name, phone, gender, plan, branch)`
— SECURITY DEFINER, scoped to `auth.uid()`: creates the member (links `user_id`), sets
`profiles.member_id`, and inserts a `pending` subscription; guards `already_member` and validates
plan/branch. Enabled **email autoconfirm** on the project (Management API) so a sign-up has a
session immediately.

**UI (data-driven from the DB):** full marketing home (hero, plans, branches w/ map links,
trainers, facilities, testimonials, FAQ, contact) + dedicated Plans (with comparison table),
Branches, Trainers, Contact pages, all fed by a `PublicDataProvider` (gym/plans/branches/
trainers/site_content, anon-readable). **Join Now** page: pick plan+branch (plan can be
pre-selected via `?plan=`), enter details, `signUpAndJoin()` creates the account + member +
pending subscription, then routes to the member portal. Pending sign-ups surface in the
reception dashboard's "pending activations" panel and are activated from the member profile.

**Tested:**
- `npm run build` passes.
- **Join flow end-to-end over HTTP:** visitor signs up (immediate session) → `public_join`
  creates member (`member_code`, `user_id` linked) + `pending` sub; visitor sees own pending
  sub (RLS); reception at the chosen branch sees it in their queue; a second join → `already_member`.
  Test account + member cleaned up (seed back to 50).
- **Anon reads** confirmed for all public content (gym/4 plans/2 branches/4 trainers/4 content
  blocks) while `members` stays private (0 rows to anon).

**Env limitation:** the marketing pages fetch from Supabase, which the sandbox browser can't
reach, so they were verified via anon data reads + build rather than a rendered session — they
populate on the live Pages site.

### Phase 6 — Analytics dashboard (2026-07-11) ✅
**UI (super-admin only):** date-range (3/6/12 mo) + branch filters; six KPI cards (active
members, new this month, revenue this month, expiring ≤7d, renewal rate, churn rate — simple
proxies); charts via **Recharts** — revenue over time (total + per-branch lines), member growth
(cumulative area), plan popularity (bar); a custom CSS **check-in heatmap** (7 days × hours,
Riyadh time); **CSV export** on each dataset (BOM for Arabic in Excel). Pure aggregation lives
in `src/lib/analytics.ts`; all client-side on RLS-scoped rows. No new migration.

**Tested:**
- `npm run build` passes; **Analytics route lazy-loaded** so Recharts sits in a separate 402 KB
  chunk and the main bundle drops back to ~558 KB (loads only when analytics is opened).
- Data sources fetch correctly as admin via PostgREST (50 members / 56 payments / 302 check-ins).
- Aggregation cross-checked against SQL: plan popularity (~12–13 per plan), total revenue
  (44,800), and check-in peak hours (Riyadh 21/22/10) all match the client-side computations.

**Env limitation (unchanged):** charts verified via data + build, not a rendered browser
session (sandbox browser can't reach Supabase). They'll render in a real browser / on Pages.
Chart styling is intentionally minimal — refined in the Phase 8 UI polish.

### Phase 5 — Notifications engine (2026-07-11) ✅
**DB (`0006_notifications.sql`, applied live):** `enqueue_expiry_notifications()` inserts one
row per (subscription, milestone) for active subs expiring in exactly 7/3/1 days, bilingual
message, `status='simulated'`, deduped per day (idempotent). Scheduled daily at 06:00 UTC
(09:00 Riyadh) via **pg_cron** (`expiry-notifications-daily`). **Edge Function**
`supabase/functions/notify/index.ts` is the real-send abstraction (reads `queued` rows, sends
via Twilio or Meta WhatsApp behind one `sendMessage()`, marks `sent`/`failed`) — documented,
not deployed in dev (see README "notifications later").

**UI:** staff dashboard alert panels (expiring this week / pending activations / expired, each
a linked member list) alongside the KPI cards; member portal home (subscription status card +
notifications list with mark-as-read + "request renewal" → creates a pending subscription that
reception activates); member payments & check-ins views. Portal wrapped in the reference-data
provider. All strings via i18n; RTL-aware.

**Tested (live):**
- `npm run build` passes (127 modules).
- `enqueue_expiry_notifications()` created exactly the due rows (`expiring_1`, `expiring_3`),
  `status=simulated`, `channel=whatsapp`; a second run created 0 (dedup). Bilingual messages
  correct. **pg_cron job present and active** (`0 6 * * *`).
- Member flows via PostgREST as the real member: reads only own notifications (RLS-scoped,
  all mine=true), marks a notification read (RLS update), and "request renewal" creates a
  `pending` subscription (RLS `subs_member_request`). Test rows cleaned.

**To go live with real messaging:** flip `enqueue` status to `queued`, deploy the `notify`
Edge Function, set `NOTIFY_PROVIDER` + provider secrets, and schedule it (pg_net/pg_cron or
external). Documented in the function header + README.

**Env limitation (unchanged):** authenticated screens verified via their data layer (curl),
not a rendered browser session.

### Phase 4 — Check-in + manual payments (2026-07-11) ✅
**DB (`0005_checkin_payment_functions.sql`, applied live):** `record_check_in(member, branch)`
— validates the member's current subscription and raises a coded block when needed
(`checkin_no_subscription | checkin_pending | checkin_frozen | checkin_expired |
checkin_no_sessions`), logs the visit, and decrements `sessions_remaining` for sessions-based
plans; `record_payment(member, subscription, amount, method, receipt)` — standalone manual
payment (gym/branch derived from the member). Both SECURITY INVOKER, granted to `authenticated`.

**UI:** fast check-in screen (search by phone/code/name, member card with photo/status/expiry,
one-tap check-in, clear block message + "Renew" shortcut on failure, today's check-in feed;
branch selector for super-admin); payments screen (RLS-scoped list with member join, "record
payment" modal with member search + optional subscription link); printable/PDF-friendly receipt
at a top-level `/receipt/:id` route (dashboard chrome hidden via `print:` utilities, gym name
from settings). New i18n keys; RTL-aware.

**Tested:**
- `npm run build` passes (tsc strict + vite, 125 modules).
- Live RPCs as a **real reception user** via PostgREST: check-in on an active member logs a row
  at the correct branch; check-in on an expired member is blocked with `checkin_expired`;
  `record_payment` returns the row; the payments↔member and check-ins↔member embed queries the
  UI uses return the expected shape. Also validated as superuser: frozen → `checkin_frozen`,
  freeze/session guards. All test rows cleaned; seed intact (50 members / 302 check-ins /
  56 payments).

**Env limitation (unchanged):** authenticated screens verified via their data layer (curl),
not a rendered browser session, because the sandbox browser can't tunnel to Supabase.

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

### Phase 1 & 2 — live verification on Supabase project (2026-07-11) ✅
Project `hfjyaduiynigylvunnto` (Postgres 17.6). Applied over HTTPS via the Management API
(`/database/query`) using a temporary account PAT (raw Postgres ports are blocked in the
build sandbox; only HTTPS egress is available).

- **DB applied:** `0001`+`0002`+`0003` migrations then `seed.sql` — all succeeded. Verified
  live: 50 members, 58 subscriptions, 56 payments, 302 check-ins, 4 plans, 2 branches;
  state split 30 active / 6 expiring / 8 expired / 4 frozen / 2 pending; RLS enabled on all
  12 public tables.
- **Demo auth accounts created** (Auth Admin API) and role-wired:
  `admin@powergym.sa` (super_admin), `reception.olaya@powergym.sa` (reception → Olaya),
  `reception.malqa@powergym.sa` (reception → Malqa), `member@powergym.sa` (member, linked to
  a real branch-A member row). Password: `GymDemo#2026` (see README; change for production).
- **RLS verified live via real logins** (sign in with anon key → query with the user JWT):
  admin sees 50 members / 2 branches; each reception sees exactly its 25 branch members /
  1 branch; member sees 1; anon sees 0 members but 4 plans. Matches the local Postgres run.
- **Auth→role chain verified live:** for every demo user, sign-in returns a session and the
  profiles self-read returns the correct role, so `roleHome(role)` resolves to the right
  destination (super_admin/reception → `/dashboard`, member → `/portal`).

**Fixed during testing:** (1) test harness pointed Chromium's proxy at all traffic incl.
`localhost`, so the local preview page itself got proxied → added `bypass: localhost`.
**Known env limitation (not an app bug):** the headless browser's tunnel to Supabase hangs
in this sandbox, so the literal in-browser click-through (submit → redirect) couldn't be
demonstrated here; the app issues the correct `POST /auth/v1/token`, and every dependency of
the redirect (auth, profile self-read, role map) is verified live via curl. Will render
fully in a normal browser / on Pages.

**Still manual (repo owner):** add `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` as GitHub
Actions secrets and enable Pages (Source: GitHub Actions) to go live — steps in README.

### Phase 3 — Members + plans + subscriptions core (2026-07-11) ✅
**DB (`0004_subscription_functions.sql`, applied live):** `riyadh_today()` plus lifecycle
RPCs (SECURITY INVOKER, so RLS still applies): `create_subscription`, `activate_subscription`,
`renew_subscription`, `freeze_subscription`, `unfreeze_subscription`, `upgrade_quote`,
`upgrade_subscription`, `expire_due_subscriptions`. Execute granted to `authenticated`.

**UI (React):** members list (search by name/phone/code + status/branch filters, RLS-scoped),
register/edit member form (zod + Saudi-phone validation/normalisation, optional photo upload
to the private `member-photos` bucket via signed URLs), member profile (photo, status badge,
current subscription with contextual actions, and Subscriptions/Payments/Check-ins/Freezes
history tabs), subscription action modal (new/activate/renew/freeze/upgrade with payment
capture + live prorated upgrade quote), plans management (super-admin CRUD), and a dashboard
overview with KPI cards. All strings via the i18n dictionary; RTL-aware. Reference data
(branches/plans) loaded once via a context provider.

**Tested:**
- `npm run build` passes (tsc strict + vite, 121 modules).
- **Lifecycle logic on live DB** (temp members, then deleted): activate → today+duration;
  renew → extends from expiry (stacking unused days); freeze → status frozen, expiry +days,
  `frozen_days_used` incremented; freeze cap → 8>7 rejected (`freeze_cap_exceeded`), 7 == cap
  accepted; unfreeze → active; prorated upgrade quote correct (1600 − credit for remaining
  days) and upgrade resets expiry to today+new duration; payments recorded each step.
- **Data layer as a real reception user via PostgREST** (the exact calls the UI issues):
  nested `members?select=*,subscriptions(*)` scoped to the user's branch; member insert
  (auto `member_code` M00053); `create_subscription`/`renew`/`freeze` RPCs succeed under RLS
  (proves SECURITY INVOKER + grants work for the app role, not just superuser); registering
  into another branch is blocked with HTTP 403.

**Fixed during build:** supabase-js generics rejected the hand-written `Insert`/RPC arg types
(resolved to `never`) even after adding `Relationships`/`CompositeTypes`; kept typed reads and
cast only write/RPC arguments through a small `rpcCall` helper — runtime unaffected.

**Env limitation (unchanged):** headless-browser click-through still can't tunnel to Supabase
in this sandbox, so the authenticated screens were verified via their data layer (curl) rather
than a rendered browser session; they render normally in a real browser / on Pages.
