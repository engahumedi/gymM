import type { Locale } from '@/i18n/dictionary';

// Dates are stored as plain dates / timestamps; the gym operates in Asia/Riyadh.
const TZ = 'Asia/Riyadh';

// `ar-SA` resolves to the Umm al-Qura (Hijri) calendar in browsers — Chrome
// renders 2026-07-15 as "١ صفر ١٤٤٨ هـ" — while every date in this system is
// stored, computed and counted in Gregorian: expiry dates, the days-remaining
// counters beside them, receipts, and the monthly report all assume it. Showing
// a Hijri label next to a Gregorian day count is worse than either alone, so the
// calendar is pinned. Arabic-Indic numerals are unaffected.
export function dateLocale(locale: Locale): string {
  return locale === 'ar' ? 'ar-SA-u-ca-gregory' : 'en-GB';
}

export function formatDate(value: string | null | undefined, locale: Locale): string {
  if (!value) return '—';
  const d = new Date(value.length <= 10 ? value + 'T00:00:00' : value);
  return new Intl.DateTimeFormat(dateLocale(locale), {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: TZ,
  }).format(d);
}

export function formatDateTime(value: string | null | undefined, locale: Locale): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat(dateLocale(locale), {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: TZ,
  }).format(new Date(value));
}

export function formatCurrency(amount: number | null | undefined, locale: Locale): string {
  const n = amount ?? 0;
  return new Intl.NumberFormat(dateLocale(locale), {
    style: 'currency',
    currency: 'SAR',
    maximumFractionDigits: 2,
  }).format(n);
}

// Prices on the marketing site are round numbers shown at display size, where
// a trailing ",00" is noise that also overflows the card. Falls back to the
// full format the moment there are real halalas.
export function formatPrice(amount: number | null | undefined, locale: Locale): string {
  const n = amount ?? 0;
  if (!Number.isInteger(n)) return formatCurrency(n, locale);
  return new Intl.NumberFormat(dateLocale(locale), {
    style: 'currency',
    currency: 'SAR',
    maximumFractionDigits: 0,
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
