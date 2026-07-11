import { z } from 'zod';

// Saudi mobile numbers: 05XXXXXXXX (local) or +9665XXXXXXXX (international).
export const SAUDI_PHONE_RE = /^(?:\+9665|05)[0-9]{8}$/;

export const saudiPhoneSchema = z
  .string()
  .trim()
  .regex(SAUDI_PHONE_RE, 'invalid_phone');

// Normalise +9665… and 5… inputs to the canonical 05XXXXXXXX form.
export function normalizeSaudiPhone(input: string): string {
  const s = input.trim().replace(/\s|-/g, '');
  if (s.startsWith('+9665')) return '0' + s.slice(3);
  if (s.startsWith('9665')) return '0' + s.slice(2);
  if (s.startsWith('5') && s.length === 9) return '0' + s;
  return s;
}
