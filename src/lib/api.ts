import { supabase } from './supabase';
import type {
  Branch,
  CheckIn,
  Freeze,
  Gym,
  Member,
  Payment,
  PaymentMethod,
  Plan,
  Subscription,
} from './database.types';

// Thin, typed data-access layer. Every call goes through RLS on the server;
// these helpers just keep query shapes in one place.

function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

// supabase-js generics reject our hand-written Insert/RPC arg types; the runtime
// is unaffected, so we cast just the write/RPC arguments and keep return types.
async function rpcCall<T>(name: string, args: Record<string, unknown>): Promise<T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)(name, args);
  if (error) throw new Error((error as { message: string }).message);
  return data as T;
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
export interface MemberListItem extends Member {
  subscriptions: Subscription[];
}

export async function fetchMembers(): Promise<MemberListItem[]> {
  // RLS scopes rows to the caller's role/branch automatically.
  return unwrap(
    await supabase
      .from('members')
      .select('*, subscriptions(*)')
      .order('created_at', { ascending: false }),
  ) as unknown as MemberListItem[];
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
  gender?: string | null;
  dob?: string | null;
  photo_url?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  notes?: string | null;
}

export async function createMember(payload: MemberInsert): Promise<Member> {
  return unwrap(await supabase.from('members').insert(payload as never).select().single());
}

export async function updateMember(
  id: string,
  patch: Partial<MemberInsert> & { photo_url?: string | null },
): Promise<Member> {
  return unwrap(await supabase.from('members').update(patch as never).eq('id', id).select().single());
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

export async function fetchFreezes(memberId: string): Promise<Freeze[]> {
  const subs = await fetchSubscriptions(memberId);
  if (subs.length === 0) return [];
  return unwrap(
    await supabase
      .from('freezes')
      .select('*')
      .in('subscription_id', subs.map((s) => s.id))
      .order('created_at', { ascending: false }),
  );
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
  return rpcCall<Subscription>('create_subscription', {
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
  return rpcCall<Subscription>('activate_subscription', {
    p_subscription_id: id,
    p_amount: pay?.amount ?? null,
    p_method: pay?.method ?? 'cash',
    p_receipt: pay?.receipt ?? null,
  });
}

export async function renewSubscription(id: string, pay?: PaymentInput): Promise<Subscription> {
  return rpcCall<Subscription>('renew_subscription', {
    p_subscription_id: id,
    p_amount: pay?.amount ?? null,
    p_method: pay?.method ?? 'cash',
    p_receipt: pay?.receipt ?? null,
  });
}

export async function freezeSubscription(id: string, days: number): Promise<Subscription> {
  return rpcCall<Subscription>('freeze_subscription', { p_subscription_id: id, p_days: days });
}

export async function unfreezeSubscription(id: string): Promise<Subscription> {
  return rpcCall<Subscription>('unfreeze_subscription', { p_subscription_id: id });
}

export async function upgradeQuote(id: string, newPlanId: string): Promise<number> {
  return rpcCall<number>('upgrade_quote', { p_subscription_id: id, p_new_plan_id: newPlanId });
}

export async function upgradeSubscription(
  id: string,
  newPlanId: string,
  pay?: PaymentInput,
): Promise<Subscription> {
  return rpcCall<Subscription>('upgrade_subscription', {
    p_subscription_id: id,
    p_new_plan_id: newPlanId,
    p_amount: pay?.amount ?? null,
    p_method: pay?.method ?? 'cash',
    p_receipt: pay?.receipt ?? null,
  });
}

// ---- Check-in + payments (Phase 4) ---------------------------------------
export async function recordCheckIn(memberId: string, branchId: string): Promise<CheckIn> {
  return rpcCall<CheckIn>('record_check_in', { p_member_id: memberId, p_branch_id: branchId });
}

export async function recordPayment(
  memberId: string,
  subscriptionId: string | null,
  amount: number,
  method: PaymentMethod,
  receipt: string | null,
): Promise<Payment> {
  return rpcCall<Payment>('record_payment', {
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

export async function fetchAllPayments(): Promise<PaymentWithMember[]> {
  return unwrap(
    await supabase
      .from('payments')
      .select('*, members(full_name, member_code)')
      .order('created_at', { ascending: false })
      .limit(200),
  ) as unknown as PaymentWithMember[];
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

// All check-ins within scope (for analytics: heatmap, trends). RLS-scoped.
export async function fetchAllCheckIns(): Promise<CheckIn[]> {
  return unwrap(
    await supabase
      .from('check_ins')
      .select('id, member_id, branch_id, subscription_id, checked_in_at, recorded_by')
      .order('checked_in_at', { ascending: false })
      .limit(5000),
  );
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
  return rpcCall<FreezeRequest>('request_freeze', { p_subscription_id: subscriptionId, p_days: days, p_note: note });
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
  return rpcCall<FreezeRequest>('approve_freeze_request', { p_request_id: id });
}

export async function rejectFreezeRequest(id: string): Promise<FreezeRequest> {
  return rpcCall<FreezeRequest>('reject_freeze_request', { p_request_id: id });
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
  return rpcCall<string>('public_join', {
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
    .update({ status: 'read', read_at: new Date().toISOString() } as never)
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
  return unwrap(await supabase.from('plans').insert(payload as never).select().single());
}

export async function updatePlan(id: string, patch: Partial<PlanInput>): Promise<Plan> {
  return unwrap(await supabase.from('plans').update(patch as never).eq('id', id).select().single());
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
  return unwrap(await supabase.from('gyms').update(patch as never).eq('id', id).select().single());
}

// ---- Settings: branches (super-admin CRUD) --------------------------------
export type BranchInput = Omit<Branch, 'id' | 'created_at'>;

export async function createBranch(payload: BranchInput): Promise<Branch> {
  return unwrap(await supabase.from('branches').insert(payload as never).select().single());
}

export async function updateBranch(id: string, patch: Partial<BranchInput>): Promise<Branch> {
  return unwrap(await supabase.from('branches').update(patch as never).eq('id', id).select().single());
}

// ---- Settings: trainers (super-admin CRUD) --------------------------------
export type TrainerInput = Omit<Trainer, 'id' | 'created_at'>;

// All trainers in scope (incl. inactive) for the admin editor.
export async function fetchAllTrainers(): Promise<Trainer[]> {
  return unwrap(await supabase.from('trainers').select('*').order('sort_order'));
}

export async function createTrainer(payload: TrainerInput): Promise<Trainer> {
  return unwrap(await supabase.from('trainers').insert(payload as never).select().single());
}

export async function updateTrainer(id: string, patch: Partial<TrainerInput>): Promise<Trainer> {
  return unwrap(await supabase.from('trainers').update(patch as never).eq('id', id).select().single());
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
      { gym_id: gymId, key, content, updated_at: new Date().toISOString() } as never,
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
      .insert({ ...payload, role: 'reception', status: 'pending' } as never)
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
    .update({ branch_id: branchId } as never)
    .eq('id', profileId);
  if (error) throw new Error(error.message);
}

// Sign up a staff member who was invited by email. The auth trigger promotes
// them to the invited role/branch. Autoconfirm is on, so a session is active.
export async function signUpStaff(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signUp({ email, password });
  if (error) throw new Error(error.message);
}

// ---- Password change requests (request → staff approval, no email) --------
import type { PasswordChangeRequest } from './database.types';

// A user who forgot their password submits the new one they want; staff verify
// identity in person and approve. Callable while signed out (anon).
export async function requestPasswordChange(email: string, newPassword: string): Promise<void> {
  await rpcCall<void>('request_password_change', {
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
  return rpcCall<PasswordChangeRequest>('approve_password_change', { p_request_id: id });
}

export async function rejectPasswordChange(id: string): Promise<PasswordChangeRequest> {
  return rpcCall<PasswordChangeRequest>('reject_password_change', { p_request_id: id });
}
