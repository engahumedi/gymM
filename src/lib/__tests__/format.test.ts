import { describe, expect, it } from 'vitest';
import { dateLocale, formatDate, formatPrice, daysUntil } from '../format';

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
