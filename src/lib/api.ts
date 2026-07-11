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

// ---- Notifications (Phase 5) ---------------------------------------------
import type { Notification } from './database.types';

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
