import { describe, it, expect } from 'vitest';
import { monthKey, monthsBetween, riyadhDowHour, inRange } from '../analytics';

describe('monthKey', () => {
  it('formats YYYY-MM with zero-padding', () => {
    expect(monthKey(new Date(2026, 0, 15))).toBe('2026-01');
    expect(monthKey(new Date(2026, 11, 1))).toBe('2026-12');
  });
});

describe('monthsBetween', () => {
  it('lists inclusive month keys across a year boundary', () => {
    expect(monthsBetween(new Date(2025, 10, 3), new Date(2026, 1, 20))).toEqual([
      '2025-11', '2025-12', '2026-01', '2026-02',
    ]);
  });
  it('returns a single month when from and to share it', () => {
    expect(monthsBetween(new Date(2026, 5, 1), new Date(2026, 5, 28))).toEqual(['2026-06']);
  });
});

describe('riyadhDowHour', () => {
  it('converts UTC to Riyadh (UTC+3) hour', () => {
    // 2026-07-12 20:00Z → 23:00 Riyadh, still Sunday
    const { hour } = riyadhDowHour('2026-07-12T20:00:00Z');
    expect(hour).toBe(23);
  });
  it('rolls the day over when +3 crosses midnight', () => {
    // 2026-07-12 22:00Z → 01:00 Mon Riyadh
    const { dow, hour } = riyadhDowHour('2026-07-12T22:00:00Z');
    expect(hour).toBe(1);
    expect(dow).toBe(1); // Monday
  });
});

describe('inRange', () => {
  const from = new Date('2026-01-01T00:00:00Z');
  const to = new Date('2026-01-31T23:59:59Z');
  it('includes dates within the window', () => {
    expect(inRange('2026-01-15T12:00:00Z', from, to)).toBe(true);
  });
  it('excludes dates outside and nulls', () => {
    expect(inRange('2025-12-31T12:00:00Z', from, to)).toBe(false);
    expect(inRange(null, from, to)).toBe(false);
  });
});
