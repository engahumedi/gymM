import { useI18n } from '@/i18n/I18nProvider';

// Check-in heatmap: 7 days (rows) × hours (cols). Intensity = relative volume.
// A lightweight CSS grid (Recharts has no native heatmap).
const HOURS = Array.from({ length: 18 }, (_, i) => i + 6); // 06:00–23:00

export function Heatmap({ grid }: { grid: number[][] }) {
  const { t, locale } = useI18n();
  const max = Math.max(1, ...grid.flat());
  const dayKeys = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
  const dayLabels: Record<string, { ar: string; en: string }> = {
    sun: { ar: 'أحد', en: 'Sun' }, mon: { ar: 'اثن', en: 'Mon' }, tue: { ar: 'ثلا', en: 'Tue' },
    wed: { ar: 'أرب', en: 'Wed' }, thu: { ar: 'خمي', en: 'Thu' }, fri: { ar: 'جمع', en: 'Fri' },
    sat: { ar: 'سبت', en: 'Sat' },
  };

  return (
    <div dir="ltr" className="overflow-x-auto">
      <table className="border-separate" style={{ borderSpacing: 2 }}>
        <thead>
          <tr>
            <th></th>
            {HOURS.map((h) => (
              <th key={h} className="text-[10px] font-normal text-faint">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dayKeys.map((dk, d) => (
            <tr key={dk}>
              <td className="pe-1 text-[10px] text-muted">
                {locale === 'ar' ? dayLabels[dk].ar : dayLabels[dk].en}
              </td>
              {HOURS.map((h) => {
                const v = grid[d]?.[h] ?? 0;
                const intensity = v / max;
                return (
                  <td key={h}>
                    <div
                      title={`${v} ${t('checkin.title')}`}
                      className="h-5 w-5 rounded-sm"
                      style={{
                        backgroundColor: v === 0 ? 'var(--surface-2)' : `rgba(200,52,47,${0.15 + intensity * 0.85})`,
                      }}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
