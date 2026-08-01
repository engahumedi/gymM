import type { MessageKey } from '@/i18n/dictionary';

// Map known server error messages (RPC RAISE codes, Postgres errors) to i18n
// keys so users see a clear localized message instead of a raw SQL string.
// Order matters: most specific match first — every test is a substring test, so
// a broad code (`forbidden`, `not_pending`) must never be checked before the
// longer code that contains it.
export function errorMessageKey(message: string | null | undefined): MessageKey {
  const m = (message ?? '').toLowerCase();
  if (m.includes('members_phone_unique') || m.includes('duplicate key') && m.includes('phone'))
    return 'err.duplicate_phone';
  if (m.includes('members_phone_saudi') || m.includes('invalid_phone')) return 'err.invalid_phone';
  if (m.includes('freeze_cap_exceeded')) return 'err.freeze_cap';
  if (m.includes('not_active')) return 'err.not_active';
  if (m.includes('not_frozen')) return 'err.not_frozen';
  if (m.includes('cannot_renew_cancelled')) return 'err.cancelled';
  if (m.includes('invalid_days')) return 'err.invalid_days';
  if (m.includes('invalid_amount')) return 'err.invalid_amount';
  if (m.includes('checkin_no_subscription')) return 'err.checkin_no_sub';
  if (m.includes('checkin_pending')) return 'err.checkin_pending';
  if (m.includes('checkin_frozen')) return 'err.checkin_frozen';
  if (m.includes('checkin_expired')) return 'err.checkin_expired';
  if (m.includes('checkin_no_sessions')) return 'err.checkin_no_sessions';
  // One visit per member per hour (migration 0014) — a re-scanned QR, not a fault.
  if (m.includes('checkin_duplicate')) return 'err.checkin_duplicate';
  if (m.includes('request_exists')) return 'err.freeze_request_exists';
  // Staff invite: wrong/expired/already-used token (migration 0014).
  if (
    m.includes('invite_invalid') ||
    m.includes('invalid_invite') ||
    m.includes('invite_expired') ||
    m.includes('invite_not_found')
  )
    return 'err.invite_invalid';
  // Member has no auth user, so staff cannot set a password for them.
  if (m.includes('no_account')) return 'err.no_account';
  // Self-service role/branch/member/gym change blocked by the profiles trigger.
  if (m.includes('forbidden_privilege_change')) return 'err.forbidden';
  if (m.includes('not_pending')) return 'err.not_pending';
  if (m.includes('already_member')) return 'err.already_member';
  if (m.includes('already registered') || m.includes('user already') || m.includes('email_exists'))
    return 'err.email_taken';
  if (m.includes('weak') && m.includes('password')) return 'err.weak_password';
  if (m.includes('forbidden')) return 'err.forbidden';
  if (m.includes('row-level security') || m.includes('violates row-level')) return 'err.forbidden';
  return 'err.generic';
}
