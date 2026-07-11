import type { MessageKey } from '@/i18n/dictionary';

// Map known server error messages (RPC RAISE codes, Postgres errors) to i18n
// keys so users see a clear localized message instead of a raw SQL string.
export function errorMessageKey(message: string | null | undefined): MessageKey {
  const m = (message ?? '').toLowerCase();
  if (m.includes('members_phone_unique') || m.includes('duplicate key') && m.includes('phone'))
    return 'err.duplicate_phone';
  if (m.includes('members_phone_saudi') || m.includes('invalid_phone')) return 'err.invalid_phone';
  if (m.includes('freeze_cap_exceeded')) return 'err.freeze_cap';
  if (m.includes('not_active')) return 'err.not_active';
  if (m.includes('not_frozen')) return 'err.not_frozen';
  if (m.includes('not_pending')) return 'err.not_pending';
  if (m.includes('cannot_renew_cancelled')) return 'err.cancelled';
  if (m.includes('invalid_days')) return 'err.invalid_days';
  if (m.includes('row-level security') || m.includes('violates row-level')) return 'err.forbidden';
  return 'err.generic';
}
