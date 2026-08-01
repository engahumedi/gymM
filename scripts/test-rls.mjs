#!/usr/bin/env node
// =============================================================================
// RLS regression test — runs against the LIVE Supabase project.
//
// The entire security model of this app is Postgres row-level security: the
// browser talks to Supabase directly with the anon key, so a wrong policy is a
// data breach, not a bug. A privilege-escalation hole (a member could PATCH its
// own profiles.role to super_admin) shipped undetected because nothing tested
// the policies. This script does.
//
// Plain Node, no dependencies, global fetch. It signs in as the demo accounts
// and asserts what each role may and may not see. Run it after any migration
// that touches policies, helper functions or grants:
//
//     npm run test:rls
//
// It is deliberately NOT part of CI: it needs a live project, and CI holds no
// secrets. Skips (exit 0) when the Supabase env vars are absent.
// =============================================================================

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// Demo-account password. It is documented in the README, so it lives here as a
// default; override with RLS_TEST_PASSWORD once the accounts are rotated.
const PASSWORD = process.env.RLS_TEST_PASSWORD || 'GymDemo#2026';
const ACCOUNTS = {
  admin: 'admin@powergym.sa',
  receptionOlaya: 'reception.olaya@powergym.sa',
  member: 'member@powergym.sa',
};

// ---- env --------------------------------------------------------------------

// Minimal .env reader (KEY=VALUE, # comments, optional quotes). Real environment
// variables win, so CI/shell overrides work.
function loadEnv() {
  const env = { ...process.env };
  try {
    for (const raw of readFileSync(join(ROOT, '.env'), 'utf8').split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq < 1) continue;
      const key = line.slice(0, eq).trim();
      if (env[key]) continue;
      env[key] = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    }
  } catch {
    /* no .env — environment variables only */
  }
  return env;
}

const env = loadEnv();
const URL_BASE = (env.VITE_SUPABASE_URL ?? '').replace(/\/+$/, '');
const ANON_KEY = env.VITE_SUPABASE_ANON_KEY ?? '';

if (!URL_BASE || !ANON_KEY) {
  console.log(
    'SKIP  RLS tests: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set.\n' +
      '      Put them in .env (see .env.example) or export them, then re-run `npm run test:rls`.',
  );
  process.exit(0);
}

// ---- tiny HTTP helpers ------------------------------------------------------

async function request(path, { token, method = 'GET', body, prefer } = {}) {
  const res = await fetch(`${URL_BASE}${path}`, {
    method,
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${token ?? ANON_KEY}`,
      'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  return { status: res.status, ok: res.ok, data };
}

const rest = (path, opts) => request(`/rest/v1${path}`, opts);

async function signIn(email) {
  const res = await request('/auth/v1/token?grant_type=password', {
    method: 'POST',
    body: { email, password: PASSWORD },
  });
  if (!res.ok || !res.data?.access_token) {
    throw new Error(`sign-in failed for ${email} (${res.status}) ${describe(res.data)}`);
  }
  return { token: res.data.access_token, userId: res.data.user.id };
}

function describe(data) {
  if (data === null || data === undefined) return '';
  if (typeof data === 'string') return data.slice(0, 200);
  if (data.message || data.error_description || data.error) {
    return String(data.message ?? data.error_description ?? data.error).slice(0, 200);
  }
  return JSON.stringify(data).slice(0, 200);
}

const rows = (res) => (Array.isArray(res.data) ? res.data : []);
// A table the role may not read is either filtered to nothing by RLS (200 [])
// or refused outright (401/403) — both are correct outcomes.
const readBlocked = (res) =>
  res.status === 401 || res.status === 403 || (res.ok && rows(res).length === 0);

// ---- assertions -------------------------------------------------------------

let passed = 0;
let failed = 0;

function check(id, name, ok, detail = '') {
  const line = `${ok ? 'PASS' : 'FAIL'}  ${id.padEnd(3)} ${name}`;
  console.log(detail ? `${line} — ${detail}` : line);
  ok ? passed++ : failed++;
}

function info(text) {
  console.log(`      ${text}`);
}

// ---- the tests --------------------------------------------------------------

async function anonymousVisitor() {
  console.log('\nAnonymous (public marketing site)');

  const plans = await rest('/plans?select=id&is_active=eq.true');
  check('1a', 'anon reads plans', plans.ok && rows(plans).length > 0,
    plans.ok ? `${rows(plans).length} rows` : `HTTP ${plans.status} ${describe(plans.data)}`);

  const members = await rest('/members?select=id&limit=5');
  check('1b', 'anon reads no members', readBlocked(members),
    `HTTP ${members.status}, ${rows(members).length} rows${members.ok ? '' : ` (${describe(members.data)})`}`);
}

async function memberScope() {
  console.log('\nMember (own portal)');

  let session;
  try {
    session = await signIn(ACCOUNTS.member);
  } catch (e) {
    check('2a', 'member signs in', false, e.message);
    check('2b', 'member reads no audit log', false, 'skipped: no session');
    check('3', 'member cannot escalate to super_admin', false, 'skipped: no session');
    return;
  }
  const { token, userId } = session;

  const members = await rest('/members?select=id,full_name', { token });
  check('2a', 'member sees exactly its own member row', members.ok && rows(members).length === 1,
    `HTTP ${members.status}, ${rows(members).length} rows`);

  const audit = await rest('/audit_log?select=id&limit=5', { token });
  check('2b', 'member reads no audit log', readBlocked(audit),
    `HTTP ${audit.status}, ${rows(audit).length} rows`);

  // --- privilege escalation (the hole migration 0014 closes) ---------------
  const before = await rest(`/profiles?select=id,role&id=eq.${userId}`, { token });
  const roleBefore = rows(before)[0]?.role ?? null;
  if (roleBefore !== 'member') {
    check('3', 'member cannot escalate to super_admin', false,
      `precondition failed: demo profile role is "${roleBefore}", expected "member"`);
    return;
  }

  const attempt = await rest(`/profiles?id=eq.${userId}`, {
    token,
    method: 'PATCH',
    body: { role: 'super_admin' },
    prefer: 'return=representation',
  });

  const after = await rest(`/profiles?select=id,role&id=eq.${userId}`, { token });
  const roleAfter = rows(after)[0]?.role ?? null;
  const held = roleAfter === 'member';

  check('3', 'member cannot escalate to super_admin', held,
    `PATCH → HTTP ${attempt.status}${attempt.ok ? '' : ` (${describe(attempt.data)})`}, role is now "${roleAfter}"`);

  if (!held) {
    // Never leave the demo account privileged, even after a failed run.
    const restore = await rest(`/profiles?id=eq.${userId}`, {
      token,
      method: 'PATCH',
      body: { role: 'member' },
      prefer: 'return=representation',
    });
    const check2 = await rest(`/profiles?select=role&id=eq.${userId}`, { token });
    info(
      rows(check2)[0]?.role === 'member'
        ? 'restored the demo member back to role "member"'
        : `COULD NOT RESTORE the demo member's role (HTTP ${restore.status}) — fix it manually`,
    );
  }
}

async function receptionScope() {
  console.log('\nReception (own branch only)');

  let session;
  try {
    session = await signIn(ACCOUNTS.receptionOlaya);
  } catch (e) {
    check('4a', 'reception sees only its own branch', false, e.message);
    check('4b', 'reception reads no audit log', false, 'skipped: no session');
    check('5', 'reception cannot add a member to another branch', false, 'skipped: no session');
    return;
  }
  const { token, userId } = session;

  const me = await rest(`/profiles?select=branch_id,gym_id&id=eq.${userId}`, { token });
  const branchId = rows(me)[0]?.branch_id ?? null;
  const gymId = rows(me)[0]?.gym_id ?? null;

  const members = await rest('/members?select=id,branch_id&limit=500', { token });
  const foreign = rows(members).filter((m) => m.branch_id !== branchId);
  check('4a', 'reception sees only its own branch', members.ok && branchId !== null && foreign.length === 0,
    `HTTP ${members.status}, ${rows(members).length} rows, ${foreign.length} from another branch`);

  const audit = await rest('/audit_log?select=id&limit=5', { token });
  check('4b', 'reception reads no audit log', readBlocked(audit),
    `HTTP ${audit.status}, ${rows(audit).length} rows`);

  // --- cross-branch write --------------------------------------------------
  const branches = await rest('/branches?select=id&limit=50');
  const other = rows(branches).find((b) => b.id !== branchId)?.id ?? null;
  if (!gymId || !other) {
    check('5', 'reception cannot add a member to another branch', false,
      'precondition failed: need a second branch and a gym id');
    return;
  }

  const phone = `05${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
  const insert = await rest('/members', {
    token,
    method: 'POST',
    body: { gym_id: gymId, branch_id: other, full_name: 'RLS regression probe', phone },
    prefer: 'return=representation',
  });

  check('5', 'reception cannot add a member to another branch',
    insert.status === 401 || insert.status === 403,
    `HTTP ${insert.status} ${describe(insert.data)}`);

  // Leave nothing behind if the policy let it through.
  const strayId = rows(insert)[0]?.id;
  if (strayId) {
    const del = await rest(`/members?id=eq.${strayId}`, { token, method: 'DELETE' });
    info(del.ok ? 'cleaned up the row that should not have been insertable'
               : `COULD NOT DELETE probe member ${strayId} (HTTP ${del.status}) — remove it manually`);
  }
}

// ---- run --------------------------------------------------------------------

console.log(`RLS regression tests against ${URL_BASE}`);

try {
  await anonymousVisitor();
  await memberScope();
  await receptionScope();
} catch (e) {
  console.error(`\nAborted: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
