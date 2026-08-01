import { useI18n } from '@/i18n/I18nProvider';
import type { MessageKey } from '@/i18n/dictionary';

// Check-in heatmap: 7 days (rows) × opening hours (cols). A clean CSS grid with
// hour ticks, day labels, and an intensity legend. Crimson accent scale.
const HOURS = Array.from({ length: 18 }, (_, i) => i + 6); // 06:00–23:00
const TICKS = [6, 9, 12, 15, 18, 21];

// Row order matches the grid: index 0 = Sunday (same as Postgres' dow).
const DAY_KEYS: MessageKey[] = ['day.sun', 'day.mon', 'day.tue', 'day.wed', 'day.thu', 'day.fri', 'day.sat'];

function cellColor(v: number, max: number): string {
  if (v === 0) return 'var(--surface-2)';
  const intensity = 0.18 + (v / max) * 0.82;
  return `rgba(200,52,47,${intensity.toFixed(2)})`;
}

export function Heatmap({ grid }: { grid: number[][] }) {
  const { t } = useI18n();
  const max = Math.max(1, ...grid.flat());
  // The label column fits the longest Arabic weekday ("الأربعاء") without clipping.
  const gridCols = `4.2rem repeat(${HOURS.length}, minmax(0, 1fr))`;

  return (
    <div dir="ltr" className="min-w-[36rem]">
      {/* Hour ticks */}
      <div className="grid items-center" style={{ gridTemplateColumns: gridCols }}>
        <span />
        {HOURS.map((h) => (
          <span key={h} className="text-center text-[10px] text-faint">
            {TICKS.includes(h) ? h : ''}
          </span>
        ))}
      </div>

      {/* Rows */}
      <div className="mt-1 space-y-1">
        {DAY_KEYS.map((dk, d) => (
          <div key={dk} className="grid items-center gap-1" style={{ gridTemplateColumns: gridCols }}>
            <span className="whitespace-nowrap text-[11px] text-muted">{t(dk)}</span>
            {HOURS.map((h) => {
              const v = grid[d]?.[h] ?? 0;
              return (
                <div
                  key={h}
                  title={`${v}`}
                  className="h-4 rounded-sm"
                  style={{ backgroundColor: cellColor(v, max) }}
                />
              );
            })}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="mt-4 flex items-center justify-end gap-1.5 text-[10px] text-faint">
        <span>{t('analytics.heat.less')}</span>
        {[0, 0.25, 0.5, 0.75, 1].map((s) => (
          <span key={s} className="h-3 w-3 rounded-sm" style={{ backgroundColor: s === 0 ? 'var(--surface-2)' : `rgba(200,52,47,${0.18 + s * 0.82})` }} />
        ))}
        <span>{t('analytics.heat.more')}</span>
      </div>
    </div>
  );
}
