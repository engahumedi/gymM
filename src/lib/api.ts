import { supabase } from './supabase';
import type {
  Branch,
  CheckIn,
  Database,
  Freeze,
  Gym,
  Member,
  MemberDisplayStatus,
  MemberOverview,
  Payment,
  PaymentMethod,
  Plan,
  Subscription,
} from './database.types';

export type { MemberOverview, MemberDisplayStatus };

// Thin, typed data-access layer. Every call goes through RLS on the server;
// these helpers just keep query shapes in one place.
//
// Writes and RPCs are fully type-checked against `Database` (the schema types
// are object type aliases, not interfaces — interfaces lack an implicit index
// signature, which made postgrest-js collapse every Insert/Update to `never`
// and forced the `as never` casts this file used to carry). The only remaining
// assertions are on embedded selects, where the schema type declares no foreign
// key metadata for postgrest-js to resolve.

function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

// RPC name -> { Args, Returns } from the schema type, so both the arguments and
// the result of every RPC are checked at compile time.
type Fn = Database['public']['Functions'];

async function rpcCall<K extends keyof Fn>(name: K, args: Fn[K]['Args']): Promise<Fn[K]['Returns']> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(error.message);
  return data as Fn[K]['Returns'];
}

// ---- Reference data -------------------------------------------------------
export async function fetchGym(): Promise<Gym | null> {
  return unwrap(await supabase.from('gyms').select('*').limit(1).maybeSingle());
}

export async function fetchBranches(): Promise<Branch[]> {
  return unwrap(await supabase.from('branches').select('*').order('name_ar'));
}

export async function fetchPlans(activeOnly = false): Promise<Plan[]> {
  let q = supabase.from('plans').select('*').order('sort_order');
  if (activeOnly) q = q.eq('is_active', true);
  return unwrap(await q);
}

// ---- Members --------------------------------------------------------------
// Every member list reads the RLS-scoped `members_overview` view (member +
// current subscription + display status), so search / filter / paging happen on
// the server. PostgREST caps any response at 1000 rows, so unbounded selects
// silently truncate — always page.

export const DEFAULT_PAGE_SIZE = 25;

// PostgREST parses `or=(…)` as a comma/paren separated list and treats `*` / `%`
// as ilike wildcards, so those characters in user input would change the query
// itself. None of them are meaningful in a name, phone or member code.
function escapeSearch(raw: string): string {
  return raw.replace(/[,()*%"\\]/g, ' ').replace(/\s+/g, ' ').trim();
}

function searchFilter(term: string): string {
  return `full_name.ilike.*${term}*,phone.ilike.*${term}*,member_code.ilike.*${term}*`;
}

export interface MembersPageOptions {
  search?: string;
  status?: MemberDisplayStatus;
  branchId?: string;
  limit?: number;
  offset?: number;
}

export interface Page<T> {
  rows: T[];
  total: number;
}

export async function fetchMembersPage(opts: MembersPageOptions = {}): Promise<Page<MemberOverview>> {
  const limit = opts.limit ?? DEFAULT_PAGE_SIZE;
  const offset = opts.offset ?? 0;
  let q = supabase.from('members_overview').select('*', { count: 'exact' });

  const term = escapeSearch(opts.search ?? '');
  if (term) q = q.or(searchFilter(term));
  if (opts.status) q = q.eq('display_status', opts.status);
  if (opts.branchId) q = q.eq('branch_id', opts.branchId);

  const { data, error, count } = await q
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw new Error(error.message);
  return { rows: data ?? [], total: count ?? 0 };
}

// Statuses the dashboard KPIs / alert lists are built from.
export const DASHBOARD_STATUSES: MemberDisplayStatus[] = ['active', 'expiring', 'expired', 'pending'];

// One `head: true` count per status (+ the grand total). No rows are
// transferred — the server just returns Content-Range.
export async function fetchMemberCounts(branchId?: string): Promise<Record<string, number>> {
  async function countOf(status?: MemberDisplayStatus): Promise<number> {
    let q = supabase.from('members_overview').select('id', { head: true, count: 'exact' });
    if (status) q = q.eq('display_status', status);
    if (branchId) q = q.eq('branch_id', branchId);
    const { count, error } = await q;
    if (error) throw new Error(error.message);
    return count ?? 0;
  }

  const [total, ...counts] = await Promise.all([
    countOf(),
    ...DASHBOARD_STATUSES.map((s) => countOf(s)),
  ]);
  const out: Record<string, number> = { total };
  DASHBOARD_STATUSES.forEach((s, i) => { out[s] = counts[i]; });
  return out;
}

// Type-ahead picker for the check-in screen and the payment modal.
export async function searchMembersQuick(q: string, limit = 8): Promise<MemberOverview[]> {
  const term = escapeSearch(q);
  if (!term) return [];
  const { data, error } = await supabase
    .from('members_overview')
    .select('*')
    .or(searchFilter(term))
    .order('full_name')
    .limit(limit);
  if (error) throw new Error(error.message);
  return data ?? [];
}

// QR scans carry the member_code; resolve it server-side (RLS-scoped).
export async function findMemberByCode(code: string): Promise<MemberOverview | null> {
  const clean = code.trim();
  if (!clean) return null;
  const { data, error } = await supabase
    .from('members_overview')
    .select('*')
    .eq('member_code', clean)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ?? null;
}

export async function fetchMember(id: string): Promise<Member> {
  return unwrap(await supabase.from('members').select('*').eq('id', id).single());
}

export interface MemberInsert {
  gym_id: string;
  branch_id: string;
  full_name: string;
  phone: string;
  national_id?: string | null;
  gender?: Gender | null;
  dob?: string | null;
  photo_url?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  notes?: string | null;
}

export async function createMember(payload: MemberInsert): Promise<Member> {
  return unwrap(await supabase.from('members').insert(payload).select().single());
}

export async function updateMember(
  id: string,
  patch: Partial<MemberInsert> & { photo_url?: string | null },
): Promise<Member> {
  return unwrap(await supabase.from('members').update(patch).eq('id', id).select().single());
}

// ---- Member history -------------------------------------------------------
export async function fetchSubscriptions(memberId: string): Promise<Subscription[]> {
  return unwrap(
    await supabase
      .from('subscriptions')
      .select('*')
      .eq('member_id', memberId)
      .order('created_at', { ascending: false }),
  );
}

export async function fetchPayments(memberId: string): Promise<Payment[]> {
  return unwrap(
    await supabase
      .from('payments')
      .select('*')
      .eq('member_id', memberId)
      .order('created_at', { ascending: false }),
  );
}

export async function fetchCheckIns(memberId: string): Promise<CheckIn[]> {
  return unwrap(
    await supabase
      .from('check_ins')
      .select('*')
      .eq('member_id', memberId)
      .order('checked_in_at', { ascending: false })
      .limit(100),
  );
}

// The whole member profile in ONE round trip: member + subscriptions (with
// their freezes) + payments + the latest check-ins. Replaces six parallel
// queries (one of which was itself two round trips).
export interface MemberProfileData {
  member: Member;
  subscriptions: Subscription[];
  payments: Payment[];
  checkIns: CheckIn[];
  freezes: Freeze[];
}

type SubscriptionWithFreezes = Subscription & { freezes: Freeze[] | null };
type MemberProfileRow = Member & {
  subscriptions: SubscriptionWithFreezes[] | null;
  payments: Payment[] | null;
  check_ins: CheckIn[] | null;
};

const CHECKIN_HISTORY_LIMIT = 100;

export async function fetchMemberProfile(id: string): Promise<MemberProfileData> {
  const { data, error } = await supabase
    .from('members')
    .select('*, subscriptions(*, freezes(*)), payments(*), check_ins(*)')
    .eq('id', id)
    .order('created_at', { ascending: false, referencedTable: 'subscriptions' })
    .order('created_at', { ascending: false, referencedTable: 'payments' })
    .order('checked_in_at', { ascending: false, referencedTable: 'check_ins' })
    .limit(CHECKIN_HISTORY_LIMIT, { referencedTable: 'check_ins' })
    .single();
  if (error) throw new Error(error.message);

  const row = data as unknown as MemberProfileRow;
  const nested = row.subscriptions ?? [];
  // Freezes arrive nested under their subscription; the history tab wants one
  // flat, newest-first list (small arrays — sorting here avoids a second query).
  const freezes = nested
    .flatMap((s) => s.freezes ?? [])
    .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''));

  const member: Member = {
    id: row.id,
    gym_id: row.gym_id,
    branch_id: row.branch_id,
    member_code: row.member_code,
    full_name: row.full_name,
    phone: row.phone,
    national_id: row.national_id,
    gender: row.gender,
    dob: row.dob,
    photo_url: row.photo_url,
    emergency_contact_name: row.emergency_contact_name,
    emergency_contact_phone: row.emergency_contact_phone,
    notes: row.notes,
    user_id: row.user_id,
    created_at: row.created_at,
  };

  return {
    member,
    subscriptions: nested.map(({ freezes: _nestedFreezes, ...s }) => s),
    payments: row.payments ?? [],
    checkIns: row.check_ins ?? [],
    freezes,
  };
}

// ---- Subscription lifecycle (RPCs) ---------------------------------------
export interface PaymentInput {
  amount?: number | null;
  method?: PaymentMethod;
  receipt?: string | null;
}

export async function createSubscription(
  memberId: string,
  planId: string,
  branchId: string,
  activate: boolean,
  pay?: PaymentInput,
): Promise<Subscription> {
  return rpcCall('create_subscription', {
    p_member_id: memberId,
    p_plan_id: planId,
    p_branch_id: branchId,
    p_activate: activate,
    p_amount: pay?.amount ?? null,
    p_method: pay?.method ?? 'cash',
    p_receipt: pay?.receipt ?? null,
  });
}

export async function activateSubscription(id: string, pay?: PaymentInput): Promise<Subscription> {
  return rpcCall('activate_subscription', {
    p_subscription_id: id,
    p_amount: pay?.amount ?? null,
    p_method: pay?.method ?? 'cash',
    p_receipt: pay?.receipt ?? null,
  });
}

export async function renewSubscription(id: string, pay?: PaymentInput): Promise<Subscription> {
  return rpcCall('renew_subscription', {
    p_subscription_id: id,
    p_amount: pay?.amount ?? null,
    p_method: pay?.method ?? 'cash',
    p_receipt: pay?.receipt ?? null,
  });
}

export async function freezeSubscription(id: string, days: number): Promise<Subscription> {
  return rpcCall('freeze_subscription', { p_subscription_id: id, p_days: days });
}

export async function unfreezeSubscription(id: string): Promise<Subscription> {
  return rpcCall('unfreeze_subscription', { p_subscription_id: id });
}

export async function upgradeQuote(id: string, newPlanId: string): Promise<number> {
  return rpcCall('upgrade_quote', { p_subscription_id: id, p_new_plan_id: newPlanId });
}

export async function upgradeSubscription(
  id: string,
  newPlanId: string,
  pay?: PaymentInput,
): Promise<Subscription> {
  return rpcCall('upgrade_subscription', {
    p_subscription_id: id,
    p_new_plan_id: newPlanId,
    p_amount: pay?.amount ?? null,
    p_method: pay?.method ?? 'cash',
    p_receipt: pay?.receipt ?? null,
  });
}

// ---- Check-in + payments (Phase 4) ---------------------------------------
export async function recordCheckIn(memberId: string, branchId: string): Promise<CheckIn> {
  return rpcCall('record_check_in', { p_member_id: memberId, p_branch_id: branchId });
}

export async function recordPayment(
  memberId: string,
  subscriptionId: string | null,
  amount: number,
  method: PaymentMethod,
  receipt: string | null,
): Promise<Payment> {
  return rpcCall('record_payment', {
    p_member_id: memberId,
    p_subscription_id: subscriptionId,
    p_amount: amount,
    p_method: method,
    p_receipt: receipt,
  });
}

// Payment rows joined with the member (for the payments list + receipt).
export interface PaymentWithMember extends Payment {
  members: { full_name: string; member_code: string | null } | null;
}

export async function fetchPaymentsPage(
  opts: { limit?: number; offset?: number } = {},
): Promise<Page<PaymentWithMember>> {
  const limit = opts.limit ?? DEFAULT_PAGE_SIZE;
  const offset = opts.offset ?? 0;
  const { data, error, count } = await supabase
    .from('payments')
    .select('*, members(full_name, member_code)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw new Error(error.message);
  // Embedded selects need the assertion: the schema type declares no FK
  // metadata, so postgrest-js cannot resolve `members(...)` on its own.
  return { rows: (data ?? []) as unknown as PaymentWithMember[], total: count ?? 0 };
}

export async function fetchPaymentWithMember(id: string): Promise<PaymentWithMember> {
  return unwrap(
    await supabase
      .from('payments')
      .select('*, members(full_name, member_code)')
      .eq('id', id)
      .single(),
  ) as unknown as PaymentWithMember;
}

// ---- Analytics (aggregated in SQL) ---------------------------------------
// One RPC replaces "download every member / payment / check-in and aggregate in
// JS" — which silently truncated at PostgREST's 1000-row cap.
export interface AnalyticsKpis {
  active: number;
  expiring: number;
  expired: number;
  total_members: number;
  new_month: number;
  revenue_month: number;
  renewal_rate: number;
  churn_rate: number;
}

export interface RevenueMonth {
  month: string;
  total: number;
  branches: Record<string, number>;
}

export interface GrowthPoint { month: string; count: number }
export interface PlanCount { plan_id: string; count: number }
export interface HeatCell { dow: number; hour: number; count: number }

export interface AnalyticsOverview {
  kpis: AnalyticsKpis;
  revenue_by_month: RevenueMonth[];
  member_growth: GrowthPoint[];
  plan_popularity: PlanCount[];
  heatmap: HeatCell[];
}

// Postgres numerics come back as JSON strings often enough to be worth one cast.
function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export async function fetchAnalyticsOverview(
  from: string,
  to: string,
  branchId: string | null,
): Promise<AnalyticsOverview> {
  const raw = await rpcCall('analytics_overview', {
    p_from: from,
    p_to: to,
    p_branch: branchId,
  });
  const k = raw?.kpis ?? {};
  return {
    kpis: {
      active: num(k.active),
      expiring: num(k.expiring),
      expired: num(k.expired),
      total_members: num(k.total_members),
      new_month: num(k.new_month),
      revenue_month: num(k.revenue_month),
      renewal_rate: num(k.renewal_rate),
      churn_rate: num(k.churn_rate),
    },
    revenue_by_month: (raw?.revenue_by_month ?? []).map((r) => ({
      month: r.month ?? '',
      total: num(r.total),
      branches: Object.fromEntries(
        Object.entries(r.branches ?? {}).map(([id, v]) => [id, num(v)]),
      ),
    })),
    member_growth: (raw?.member_growth ?? []).map((r) => ({ month: r.month ?? '', count: num(r.count) })),
    plan_popularity: (raw?.plan_popularity ?? [])
      .filter((r): r is { plan_id: string; count: unknown } => Boolean(r.plan_id))
      .map((r) => ({ plan_id: r.plan_id, count: num(r.count) })),
    heatmap: (raw?.heatmap ?? []).map((r) => ({ dow: num(r.dow), hour: num(r.hour), count: num(r.count) })),
  };
}

// Today's check-ins at the current scope (for the check-in screen feed).
export interface CheckInWithMember extends CheckIn {
  members: { full_name: string; member_code: string | null } | null;
}

export async function fetchTodayCheckIns(): Promise<CheckInWithMember[]> {
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  return unwrap(
    await supabase
      .from('check_ins')
      .select('*, members(full_name, member_code)')
      .gte('checked_in_at', since.toISOString())
      .order('checked_in_at', { ascending: false })
      .limit(50),
  ) as unknown as CheckInWithMember[];
}

// ---- Freeze requests (member → reception approval) -----------------------
import type { FreezeRequest } from './database.types';

export async function requestFreeze(subscriptionId: string, days: number, note: string | null): Promise<FreezeRequest> {
  return rpcCall('request_freeze', { p_subscription_id: subscriptionId, p_days: days, p_note: note });
}

export async function fetchMyFreezeRequests(): Promise<FreezeRequest[]> {
  return unwrap(
    await supabase.from('freeze_requests').select('*').order('created_at', { ascending: false }).limit(20),
  );
}

export interface FreezeRequestWithMember extends FreezeRequest {
  members: { full_name: string; member_code: string | null } | null;
}

export async function fetchPendingFreezeRequests(): Promise<FreezeRequestWithMember[]> {
  return unwrap(
    await supabase
      .from('freeze_requests')
      .select('*, members(full_name, member_code)')
      .eq('status', 'pending')
      .order('created_at', { ascending: true }),
  ) as unknown as FreezeRequestWithMember[];
}

export async function approveFreezeRequest(id: string): Promise<FreezeRequest> {
  return rpcCall('approve_freeze_request', { p_request_id: id });
}

export async function rejectFreezeRequest(id: string): Promise<FreezeRequest> {
  return rpcCall('reject_freeze_request', { p_request_id: id });
}

// ---- Public site content (Phase 7) ---------------------------------------
import type { Notification, Trainer, SiteContent, Gender } from './database.types';

export async function fetchTrainers(): Promise<Trainer[]> {
  return unwrap(
    await supabase.from('trainers').select('*').eq('is_active', true).order('sort_order'),
  );
}

// Returns site_content as a { key -> content } map for easy lookup.
export async function fetchSiteContent(): Promise<Record<string, Record<string, unknown>>> {
  const rows = unwrap(await supabase.from('site_content').select('key, content')) as
    | Pick<SiteContent, 'key' | 'content'>[]
    | null;
  const out: Record<string, Record<string, unknown>> = {};
  for (const r of rows ?? []) out[r.key] = r.content;
  return out;
}

// Public "Join Now": create the auth account, then the member + pending
// subscription via the public_join RPC. Returns the new member id.
export async function signUpAndJoin(params: {
  email: string;
  password: string;
  fullName: string;
  phone: string;
  nationalId: string;
  gender: Gender | null;
  planId: string;
  branchId: string;
}): Promise<string> {
  const { error: signErr } = await supabase.auth.signUp({
    email: params.email,
    password: params.password,
    options: { data: { full_name: params.fullName } },
  });
  if (signErr) throw new Error(signErr.message);
  // autoconfirm is on, so a session is active now — call the join RPC.
  return rpcCall('public_join', {
    p_full_name: params.fullName,
    p_phone: params.phone,
    p_national_id: params.nationalId,
    p_gender: params.gender,
    p_plan_id: params.planId,
    p_branch_id: params.branchId,
  });
}

// ---- Notifications (Phase 5) ---------------------------------------------

export async function fetchMyNotifications(): Promise<Notification[]> {
  return unwrap(
    await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50),
  );
}

export async function markNotificationRead(id: string): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ status: 'read', read_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

// Recent notifications outbox for staff (simulated messages), RLS-scoped.
export async function fetchNotificationsLog(): Promise<Notification[]> {
  return unwrap(
    await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100),
  );
}

// Member self-service: request a renewal → creates a PENDING subscription that
// reception activates after payment (RLS allows a member to insert only pending).
export async function requestRenewal(
  memberId: string,
  planId: string,
  branchId: string,
): Promise<Subscription> {
  return createSubscription(memberId, planId, branchId, false);
}

// ---- Member photo (private bucket) ---------------------------------------
export async function uploadMemberPhoto(memberId: string, file: File): Promise<string> {
  const ext = file.name.split('.').pop() || 'jpg';
  const path = `${memberId}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from('member-photos').upload(path, file, { upsert: true });
  if (error) throw new Error(error.message);
  return path;
}

export async function signedPhotoUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data } = await supabase.storage.from('member-photos').createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

// ---- Plans (admin) --------------------------------------------------------
export type PlanInput = Omit<Plan, 'id' | 'created_at'>;

export async function createPlan(payload: PlanInput): Promise<Plan> {
  return unwrap(await supabase.from('plans').insert(payload).select().single());
}

export async function updatePlan(id: string, patch: Partial<PlanInput>): Promise<Plan> {
  return unwrap(await supabase.from('plans').update(patch).eq('id', id).select().single());
}

// ---- Settings: gym identity (super-admin) ---------------------------------
export type GymPatch = Partial<
  Pick<
    Gym,
    | 'name_ar'
    | 'name_en'
    | 'logo_url'
    | 'primary_color'
    | 'secondary_color'
    | 'contact_email'
    | 'contact_phone'
    | 'social_links'
  >
>;

export async function updateGym(id: string, patch: GymPatch): Promise<Gym> {
  return unwrap(await supabase.from('gyms').update(patch).eq('id', id).select().single());
}

// ---- Settings: branches (super-admin CRUD) --------------------------------
export type BranchInput = Omit<Branch, 'id' | 'created_at'>;

export async function createBranch(payload: BranchInput): Promise<Branch> {
  return unwrap(await supabase.from('branches').insert(payload).select().single());
}

export async function updateBranch(id: string, patch: Partial<BranchInput>): Promise<Branch> {
  return unwrap(await supabase.from('branches').update(patch).eq('id', id).select().single());
}

// ---- Settings: trainers (super-admin CRUD) --------------------------------
export type TrainerInput = Omit<Trainer, 'id' | 'created_at'>;

// All trainers in scope (incl. inactive) for the admin editor.
export async function fetchAllTrainers(): Promise<Trainer[]> {
  return unwrap(await supabase.from('trainers').select('*').order('sort_order'));
}

export async function createTrainer(payload: TrainerInput): Promise<Trainer> {
  return unwrap(await supabase.from('trainers').insert(payload).select().single());
}

export async function updateTrainer(id: string, patch: Partial<TrainerInput>): Promise<Trainer> {
  return unwrap(await supabase.from('trainers').update(patch).eq('id', id).select().single());
}

// ---- Settings: site content (super-admin) ---------------------------------
// Upsert one key's JSON blob (hero / facilities / testimonials / faq).
export async function upsertSiteContent(
  gymId: string,
  key: string,
  content: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase
    .from('site_content')
    .upsert(
      { gym_id: gymId, key, content, updated_at: new Date().toISOString() },
      { onConflict: 'gym_id,key' },
    );
  if (error) throw new Error(error.message);
}

// ---- Public assets (logos / trainer photos) -------------------------------
// Uploads to the public `public-assets` bucket and returns the public URL.
export async function uploadPublicAsset(file: File, prefix: string): Promise<string> {
  const ext = file.name.split('.').pop() || 'jpg';
  const path = `${prefix}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from('public-assets').upload(path, file, { upsert: true });
  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from('public-assets').getPublicUrl(path);
  return data.publicUrl;
}

// ---- Settings: staff (super-admin) ----------------------------------------
import type { StaffInvite } from './database.types';

export interface StaffMember {
  id: string;
  role: string;
  branch_id: string | null;
  full_name: string | null;
  created_at: string;
}

// Reception + admin profiles in the gym (RLS lets the super-admin read all).
export async function fetchStaff(): Promise<StaffMember[]> {
  return unwrap(
    await supabase
      .from('profiles')
      .select('id, role, branch_id, full_name, created_at')
      .in('role', ['super_admin', 'reception'])
      .order('created_at', { ascending: true }),
  ) as unknown as StaffMember[];
}

export async function fetchStaffInvites(): Promise<StaffInvite[]> {
  return unwrap(
    await supabase.from('staff_invites').select('*').order('created_at', { ascending: false }),
  );
}

export interface StaffInviteInput {
  gym_id: string;
  email: string;
  full_name: string | null;
  branch_id: string | null;
}

export async function createStaffInvite(payload: StaffInviteInput): Promise<StaffInvite> {
  return unwrap(
    await supabase
      .from('staff_invites')
      .insert({ ...payload, role: 'reception', status: 'pending' })
      .select()
      .single(),
  );
}

export async function deleteStaffInvite(id: string): Promise<void> {
  const { error } = await supabase.from('staff_invites').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// Reassign a reception user's branch (super-admin via profiles RLS).
export async function updateStaffBranch(profileId: string, branchId: string | null): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ branch_id: branchId })
    .eq('id', profileId);
  if (error) throw new Error(error.message);
}

// Sign up an invited staff member. The invite token travels as sign-up metadata
// (the DB trigger reads raw_user_meta_data->>'invite_token') and only a token +
// email + not-expired match promotes the new user to the invited role/branch.
// Autoconfirm is on, so a session is active straight after.
export async function signUpStaff(
  email: string,
  password: string,
  inviteToken: string,
): Promise<void> {
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { invite_token: inviteToken } },
  });
  if (error) throw new Error(error.message);
}

// ---- Password change requests (request → staff approval, no email) --------
import type { PasswordChangeRequest } from './database.types';

// A user who forgot their password submits the new one they want; staff verify
// identity in person and approve. Callable while signed out (anon).
export async function requestPasswordChange(email: string, newPassword: string): Promise<void> {
  await rpcCall('request_password_change', {
    p_email: email,
    p_new_password: newPassword,
  });
}

// Staff queue: pending requests in scope. Never selects the password hash.
export interface PasswordRequestItem {
  id: string;
  requested_email: string;
  requested_name: string | null;
  branch_id: string | null;
  created_at: string;
}

export async function fetchPendingPasswordRequests(): Promise<PasswordRequestItem[]> {
  return unwrap(
    await supabase
      .from('password_change_requests')
      .select('id, requested_email, requested_name, branch_id, created_at')
      .eq('status', 'pending')
      .order('created_at', { ascending: true }),
  ) as unknown as PasswordRequestItem[];
}

export async function approvePasswordChange(id: string): Promise<PasswordChangeRequest> {
  return rpcCall('approve_password_change', { p_request_id: id });
}

export async function rejectPasswordChange(id: string): Promise<PasswordChangeRequest> {
  return rpcCall('reject_password_change', { p_request_id: id });
}

// Staff resets a member's password on the spot (member present at the desk).
export async function staffSetMemberPassword(memberId: string, newPassword: string): Promise<void> {
  await rpcCall('staff_set_member_password', { p_member_id: memberId, p_new_password: newPassword });
}

// ---- Audit log (super-admin) ----------------------------------------------
import type { AuditEntry } from './database.types';

export async function fetchAuditLog(limit = 100): Promise<AuditEntry[]> {
  return unwrap(
    await supabase
      .from('audit_log')
      .select('id, actor_name, action, entity, entity_id, meta, created_at')
      .order('created_at', { ascending: false })
      .limit(limit),
  ) as unknown as AuditEntry[];
}
