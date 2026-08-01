// Pure helpers for the analytics dashboard. All bucketing/aggregation now
// happens in SQL (analytics_overview), so what is left here is: picking the
// date window to ask for, and reshaping the RPC result for the charts.
import type { HeatCell, RevenueMonth } from './api';

const TZ = 'Asia/Riyadh';

// Today as 'YYYY-MM-DD' in the gym timezone (en-CA formats as ISO order).
export function riyadhToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

// Start of an N-month window ending in `today`'s month: the 1st of the month
// (N-1) months back. Plain string math, so no timezone drift.
export function rangeStart(today: string, months: number): string {
  const [y, m] = today.split('-').map(Number);
  const span = Math.max(1, Math.trunc(months));
  const index = y * 12 + (m - 1) - (span - 1);
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-01`;
}

export const HEATMAP_DAYS = 7;
export const HEATMAP_HOURS = 24;

// 7×24 grid [day-of-week 0=Sun][hour 0-23] from the RPC's sparse cells.
export function heatmapGrid(rows: HeatCell[]): number[][] {
  const grid: number[][] = Array.from({ length: HEATMAP_DAYS }, () =>
    Array<number>(HEATMAP_HOURS).fill(0),
  );
  for (const r of rows) {
    const dow = Number(r.dow);
    const hour = Number(r.hour);
    if (!Number.isInteger(dow) || dow < 0 || dow >= HEATMAP_DAYS) continue;
    if (!Number.isInteger(hour) || hour < 0 || hour >= HEATMAP_HOURS) continue;
    grid[dow][hour] += Number(r.count) || 0;
  }
  return grid;
}

// Recharts wants one flat row per month with a key per series, so the nested
// { branches: { id: amount } } map is pivoted into columns. Branches with no
// revenue that month still get a 0 so lines stay continuous.
export function pivotRevenue(
  rows: RevenueMonth[],
  branchIds: string[],
): Record<string, string | number>[] {
  return rows.map((r) => {
    const out: Record<string, string | number> = { month: r.month, total: Number(r.total) || 0 };
    for (const id of branchIds) out[id] = Number(r.branches?.[id]) || 0;
    return out;
  });
}
