import type { Locale } from '@/i18n/dictionary';

// Dates are stored as plain dates / timestamps; the gym operates in Asia/Riyadh.
const TZ = 'Asia/Riyadh';

// Which calendar the gym leads with. Storage and every calculation stay
// Gregorian — this only decides what a human reads first. Set once at boot from
// the gyms row (see BrandProvider); the default matches the column's default so
// the first paint is already right.
export type GymCalendar = 'hijri' | 'gregorian';
let gymCalendar: GymCalendar = 'hijri';

export function setGymCalendar(pref: GymCalendar | null | undefined): void {
  gymCalendar = pref === 'gregorian' ? 'gregorian' : 'hijri';
}

export function getGymCalendar(): GymCalendar {
  return gymCalendar;
}

// A bare `ar-SA` resolves to Umm al-Qura in browsers, so both calendars are
// always named explicitly: nothing here should depend on a runtime default.
export function dateLocale(locale: Locale): string {
  return locale === 'ar' ? 'ar-SA-u-ca-gregory' : 'en-GB';
}

function hijriLocale(locale: Locale): string {
  return locale === 'ar' ? 'ar-SA-u-ca-islamic-umalqura' : 'en-GB-u-ca-islamic-umalqura';
}

function parse(value: string): Date {
  return new Date(value.length <= 10 ? value + 'T00:00:00' : value);
}

const DATE_OPTS: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' };

function gregorian(d: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(dateLocale(locale), { ...DATE_OPTS, timeZone: TZ }).format(d);
}

function hijri(d: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(hijriLocale(locale), { ...DATE_OPTS, timeZone: TZ }).format(d);
}

// Both calendars, in the gym's preferred order. A Saudi gym reads Hijri, but
// the same date has to be matched against bank statements, VAT filings and
// supplier invoices in Gregorian — so neither one is ever dropped.
export interface DualDate {
  primary: string;
  secondary: string;
}

export function formatDateDual(value: string | null | undefined, locale: Locale): DualDate | null {
  if (!value) return null;
  const d = parse(value);
  if (Number.isNaN(d.getTime())) return null;
  const g = gregorian(d, locale);
  const h = hijri(d, locale);
  return gymCalendar === 'hijri' ? { primary: h, secondary: g } : { primary: g, secondary: h };
}

// One line carrying both, for tables and other tight places.
export function formatDate(value: string | null | undefined, locale: Locale): string {
  const dual = formatDateDual(value, locale);
  return dual ? `${dual.primary} · ${dual.secondary}` : '—';
}

// The leading calendar only — for places where both would not fit, such as a
// dense chart axis.
export function formatDateShort(value: string | null | undefined, locale: Locale): string {
  const dual = formatDateDual(value, locale);
  return dual ? dual.primary : '—';
}

// A Gregorian month straddles two Hijri months, so a month picker cannot show
// one Hijri month — it shows the span the report actually covers.
export function formatMonthDual(month: string, locale: Locale): DualDate | null {
  if (!/^\d{4}-\d{2}$/.test(month)) return null;
  const first = new Date(`${month}-01T00:00:00`);
  if (Number.isNaN(first.getTime())) return null;
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);

  const greg = new Intl.DateTimeFormat(dateLocale(locale), {
    year: 'numeric',
    month: 'long',
    timeZone: TZ,
  }).format(first);

  const hijriMonth = (d: Date) =>
    new Intl.DateTimeFormat(hijriLocale(locale), { month: 'long', timeZone: TZ }).format(d);
  const hijriYear = new Intl.DateTimeFormat(hijriLocale(locale), {
    year: 'numeric',
    timeZone: TZ,
  }).format(last);
  const from = hijriMonth(first);
  const to = hijriMonth(last);
  const hij = from === to ? `${from} ${hijriYear}` : `${from} – ${to} ${hijriYear}`;

  return gymCalendar === 'hijri' ? { primary: hij, secondary: greg } : { primary: greg, secondary: hij };
}

export function formatDateTime(value: string | null | undefined, locale: Locale): string {
  if (!value) return '—';
  const d = parse(value);
  if (Number.isNaN(d.getTime())) return '—';
  const time = new Intl.DateTimeFormat(dateLocale(locale), { timeStyle: 'short', timeZone: TZ }).format(d);
  const dual = formatDateDual(value, locale);
  return dual ? `${dual.primary} · ${dual.secondary} — ${time}` : time;
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

// Days until a date (Riyadh), negative if past. Always Gregorian arithmetic —
// the calendar setting is presentation only.
export function daysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const today = new Date(new Date().toLocaleString('en-US', { timeZone: TZ }));
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + 'T00:00:00');
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}
