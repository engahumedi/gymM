import { describe, expect, it } from 'vitest';
import {
  dateLocale,
  daysUntil,
  formatDate,
  formatDateDual,
  formatPrice,
  getGymCalendar,
  setGymCalendar,
} from '../format';

describe('dateLocale', () => {
  // Browsers resolve a bare `ar-SA` to the Umm al-Qura (Hijri) calendar: Chrome
  // renders 2026-07-15 as "١ صفر ١٤٤٨ هـ". Every date in this system is stored
  // and counted in Gregorian, so the calendar must stay pinned. Node's ICU
  // happens to default to Gregorian, which is why this asserts the locale tag
  // itself — a formatted-output check would pass here and still ship the bug.
  it('pins the Gregorian calendar for Arabic', () => {
    expect(dateLocale('ar')).toContain('ca-gregory');
  });

  it('leaves English alone', () => {
    expect(dateLocale('en')).toBe('en-GB');
  });

  it('produces a Gregorian year when the runtime honours the tag', () => {
    expect(formatDate('2026-07-15', 'ar')).toMatch(/٢٠٢٦|2026/);
    expect(formatDate('2026-07-15', 'en')).toContain('2026');
  });
});

describe('formatPrice', () => {
  it('drops the decimals on a round price', () => {
    expect(formatPrice(1600, 'en')).not.toContain('.00');
  });

  it('keeps them when there are real halalas', () => {
    expect(formatPrice(1600.5, 'en')).toContain('.5');
  });

  it('treats null as zero rather than throwing', () => {
    expect(formatPrice(null, 'en')).toMatch(/0/);
  });
});

describe('daysUntil', () => {
  it('returns null without a date', () => {
    expect(daysUntil(null)).toBeNull();
  });

  it('is negative for a past date and positive for a future one', () => {
    const past = new Date(Date.now() - 5 * 86400000).toISOString().slice(0, 10);
    const future = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
    expect(daysUntil(past)).toBeLessThan(0);
    expect(daysUntil(future)).toBeGreaterThan(0);
  });
});

describe('dual calendar', () => {
  // The gym decides which calendar leads (migration 0019); both are always
  // present, because the same date has to be read by a member in Hijri and
  // reconciled against a bank statement in Gregorian.
  it('leads with Hijri when the gym says so, and still carries Gregorian', () => {
    setGymCalendar('hijri');
    const dual = formatDateDual('2026-07-15', 'ar');
    expect(dual).not.toBeNull();
    expect(dual!.secondary).toMatch(/٢٠٢٦|2026/);
    expect(formatDate('2026-07-15', 'ar')).toContain(dual!.primary);
    expect(formatDate('2026-07-15', 'ar')).toContain(dual!.secondary);
  });

  it('swaps the order for a Gregorian gym without losing the other', () => {
    setGymCalendar('hijri');
    const hijriFirst = formatDateDual('2026-07-15', 'ar')!;
    setGymCalendar('gregorian');
    const gregFirst = formatDateDual('2026-07-15', 'ar')!;
    expect(gregFirst.primary).toBe(hijriFirst.secondary);
    expect(gregFirst.secondary).toBe(hijriFirst.primary);
  });

  it('defaults an unknown or missing preference to Hijri', () => {
    setGymCalendar(null);
    expect(getGymCalendar()).toBe('hijri');
  });

  it('keeps day arithmetic Gregorian whatever the display calendar', () => {
    const future = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
    setGymCalendar('hijri');
    const asHijri = daysUntil(future);
    setGymCalendar('gregorian');
    expect(daysUntil(future)).toBe(asHijri);
    expect(asHijri).toBeGreaterThan(8);
  });

  it('returns a dash for an empty or unparseable date', () => {
    expect(formatDate(null, 'ar')).toBe('—');
    expect(formatDate('not-a-date', 'ar')).toBe('—');
    expect(formatDateDual('', 'en')).toBeNull();
  });
});
