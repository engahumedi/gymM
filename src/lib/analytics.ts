// Pure aggregation helpers for the analytics dashboard. Small data volumes, so
// everything is computed client-side from RLS-scoped rows.
const TZ = 'Asia/Riyadh';

export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// List of 'YYYY-MM' keys from `from` to `to` inclusive.
export function monthsBetween(from: Date, to: Date): string[] {
  const out: string[] = [];
  const cur = new Date(from.getFullYear(), from.getMonth(), 1);
  const end = new Date(to.getFullYear(), to.getMonth(), 1);
  while (cur <= end) {
    out.push(monthKey(cur));
    cur.setMonth(cur.getMonth() + 1);
  }
  return out;
}

// Day-of-week (0=Sun) and hour (0-23) of a timestamp, in the gym timezone.
export function riyadhDowHour(iso: string): { dow: number; hour: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    weekday: 'short',
    hour: 'numeric',
    hour12: false,
  }).formatToParts(new Date(iso));
  const wd = parts.find((p) => p.type === 'weekday')?.value ?? 'Sun';
  const hourStr = parts.find((p) => p.type === 'hour')?.value ?? '0';
  const dowMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { dow: dowMap[wd] ?? 0, hour: Number(hourStr) % 24 };
}

export function inRange(iso: string | null, from: Date, to: Date): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return t >= from.getTime() && t <= to.getTime();
}
