import { daysUntil } from './format';
import type { Subscription } from './database.types';
import type { MessageKey } from '@/i18n/dictionary';

// The five display states used across the app (badges, filters). Distinct from
// the DB lifecycle status because "expiring soon" is derived from the date, and
// a row still marked 'active' in the DB may already be past its end date.
export type DisplayStatus =
  | 'active'
  | 'expiring'
  | 'expired'
  | 'frozen'
  | 'pending'
  | 'none';

export interface StatusInfo {
  key: DisplayStatus;
  labelKey: MessageKey;
  // Tailwind classes for the badge (soft background + text).
  className: string;
}

// Dot-colour token per state; the badge itself stays quiet (hairline + ink).
const STATUS_STYLES: Record<DisplayStatus, { labelKey: MessageKey; className: string }> = {
  active: { labelKey: 'status.active', className: 'text-good' },
  expiring: { labelKey: 'status.expiring', className: 'text-warn' },
  expired: { labelKey: 'status.expired', className: 'text-accent' },
  frozen: { labelKey: 'status.frozen', className: 'text-sand' },
  pending: { labelKey: 'status.pending', className: 'text-muted' },
  none: { labelKey: 'status.none', className: 'text-faint' },
};

export function subscriptionDisplayStatus(sub: Subscription | null | undefined): DisplayStatus {
  if (!sub) return 'none';
  if (sub.status === 'cancelled') return 'expired';
  if (sub.status === 'pending') return 'pending';
  if (sub.status === 'frozen') return 'frozen';
  if (sub.status === 'expired') return 'expired';
  // active in DB — refine by date
  const d = daysUntil(sub.end_date);
  if (d === null) return 'active';
  if (d < 0) return 'expired';
  if (d <= 7) return 'expiring';
  return 'active';
}

export function statusInfo(status: DisplayStatus): StatusInfo {
  return { key: status, ...STATUS_STYLES[status] };
}

// Pick the "current" subscription to represent a member: the most relevant one
// (active/frozen/pending first, else the latest by end date).
export function pickCurrent(subs: Subscription[]): Subscription | null {
  if (subs.length === 0) return null;
  const priority: Record<string, number> = { active: 0, frozen: 1, pending: 2, expired: 3, cancelled: 4 };
  return [...subs].sort((a, b) => {
    const pa = priority[a.status] ?? 9;
    const pb = priority[b.status] ?? 9;
    if (pa !== pb) return pa - pb;
    return (b.end_date ?? '').localeCompare(a.end_date ?? '');
  })[0];
}
