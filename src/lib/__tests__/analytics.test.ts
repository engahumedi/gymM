import { describe, it, expect } from 'vitest';
import {
  HEATMAP_DAYS,
  HEATMAP_HOURS,
  heatmapGrid,
  pivotRevenue,
  rangeStart,
  riyadhToday,
} from '../analytics';
import type { HeatCell, RevenueMonth } from '../api';

describe('riyadhToday', () => {
  it('formats as YYYY-MM-DD', () => {
    expect(riyadhToday(new Date('2026-07-12T09:00:00Z'))).toBe('2026-07-12');
  });
  it('is already the next day late in the UTC evening (Riyadh is UTC+3)', () => {
    expect(riyadhToday(new Date('2026-07-12T21:30:00Z'))).toBe('2026-07-13');
  });
});

describe('rangeStart', () => {
  it('returns the 1st of the month for a 1-month window', () => {
    expect(rangeStart('2026-07-12', 1)).toBe('2026-07-01');
  });
  it('walks back across a year boundary', () => {
    expect(rangeStart('2026-02-20', 6)).toBe('2025-09-01');
    expect(rangeStart('2026-01-05', 12)).toBe('2025-02-01');
  });
  it('clamps a zero/negative window to the current month', () => {
    expect(rangeStart('2026-07-12', 0)).toBe('2026-07-01');
    expect(rangeStart('2026-07-12', -3)).toBe('2026-07-01');
  });
});

describe('heatmapGrid', () => {
  it('returns an all-zero 7×24 grid for empty input', () => {
    const grid = heatmapGrid([]);
    expect(grid).toHaveLength(HEATMAP_DAYS);
    expect(grid.every((row) => row.length === HEATMAP_HOURS)).toBe(true);
    expect(grid.flat().every((v) => v === 0)).toBe(true);
  });

  it('places counts at [dow][hour]', () => {
    const grid = heatmapGrid([
      { dow: 0, hour: 21, count: 5 },
      { dow: 6, hour: 23, count: 2 },
    ]);
    expect(grid[0][21]).toBe(5);
    expect(grid[6][23]).toBe(2);
    expect(grid[3][10]).toBe(0);
  });

  it('sums duplicate cells', () => {
    const grid = heatmapGrid([
      { dow: 2, hour: 18, count: 3 },
      { dow: 2, hour: 18, count: 4 },
    ]);
    expect(grid[2][18]).toBe(7);
  });

  it('ignores out-of-range and non-integer dow/hour', () => {
    const rows = [
      { dow: 7, hour: 5, count: 9 },
      { dow: -1, hour: 5, count: 9 },
      { dow: 1, hour: 24, count: 9 },
      { dow: 1, hour: -2, count: 9 },
      { dow: 1.5, hour: 5, count: 9 },
    ] as HeatCell[];
    expect(heatmapGrid(rows).flat().every((v) => v === 0)).toBe(true);
  });

  it('coerces string counts arriving from JSON numerics', () => {
    const rows = [{ dow: 1, hour: 7, count: '12' }] as unknown as HeatCell[];
    expect(heatmapGrid(rows)[1][7]).toBe(12);
  });
});

describe('pivotRevenue', () => {
  const rows: RevenueMonth[] = [
    { month: '2026-06', total: 4200, branches: { a: 2500, b: 1700 } },
    { month: '2026-07', total: 1000, branches: { a: 1000 } },
  ];

  it('flattens branches into columns keyed by branch id', () => {
    expect(pivotRevenue(rows, ['a', 'b'])).toEqual([
      { month: '2026-06', total: 4200, a: 2500, b: 1700 },
      { month: '2026-07', total: 1000, a: 1000, b: 0 },
    ]);
  });

  it('fills 0 for branch ids the month has no revenue for', () => {
    expect(pivotRevenue(rows, ['zzz'])[0]).toEqual({ month: '2026-06', total: 4200, zzz: 0 });
  });

  it('keeps only the total when no branch ids are requested', () => {
    expect(pivotRevenue(rows, [])).toEqual([
      { month: '2026-06', total: 4200 },
      { month: '2026-07', total: 1000 },
    ]);
  });

  it('returns an empty array for empty input', () => {
    expect(pivotRevenue([], ['a'])).toEqual([]);
  });

  it('coerces string amounts and a missing branches map to numbers', () => {
    const raw = [{ month: '2026-08', total: '99.5' }] as unknown as RevenueMonth[];
    expect(pivotRevenue(raw, ['a'])).toEqual([{ month: '2026-08', total: 99.5, a: 0 }]);
  });
});
