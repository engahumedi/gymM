import type { Locale } from '@/i18n/dictionary';

// Dates are stored as plain dates / timestamps; the gym operates in Asia/Riyadh.
const TZ = 'Asia/Riyadh';

function loc(locale: Locale): string {
  return locale === 'ar' ? 'ar-SA' : 'en-GB';
}

export function formatDate(value: string | null | undefined, locale: Locale): string {
  if (!value) return '—';
  const d = new Date(value.length <= 10 ? value + 'T00:00:00' : value);
  return new Intl.DateTimeFormat(loc(locale), {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: TZ,
  }).format(d);
}

export function formatDateTime(value: string | null | undefined, locale: Locale): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat(loc(locale), {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: TZ,
  }).format(new Date(value));
}

export function formatCurrency(amount: number | null | undefined, locale: Locale): string {
  const n = amount ?? 0;
  return new Intl.NumberFormat(loc(locale), {
    style: 'currency',
    currency: 'SAR',
    maximumFractionDigits: 2,
  }).format(n);
}

// Days until a date (Riyadh), negative if past.
export function daysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const today = new Date(
    new Date().toLocaleString('en-US', { timeZone: TZ }),
  );
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + 'T00:00:00');
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}
