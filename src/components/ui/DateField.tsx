import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useI18n } from '@/i18n/I18nProvider';
import { formatDateDual, getGymCalendar } from '@/lib/format';
import { CalendarClock, ICON_SM } from '@/components/ui/icons';

// A date field that speaks the gym's calendar.
//
// The native input stays: it is the reliable, familiar, keyboard-friendly way
// to type a date, and it is what phones give a numeric keypad for. Next to it
// sits a calendar button that opens react-day-picker's Hijri (Umm al-Qura)
// calendar — the library the ecosystem already maintains, not a hand-rolled
// widget. Whichever way the date is entered, the other calendar is echoed
// underneath, so nobody has to convert in their head.
//
// The picker is lazy: its calendar engine is a few tens of kilobytes and most
// visits to a form never open it.
const HijriPicker = lazy(() =>
  import('./HijriPicker').then((m) => ({ default: m.HijriPicker })),
);

export function DateField({
  value,
  onChange,
  id,
}: {
  value: string;
  onChange: (next: string) => void;
  id?: string;
}) {
  const { t, locale } = useI18n();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const dual = formatDateDual(value, locale);

  // Close on Escape or a click outside — the panel is a popover, not a modal.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onDown);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <div className="flex items-stretch gap-2">
        <input
          id={id}
          type="date"
          dir="ltr"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="focus-ring min-h-[44px] w-full rounded border border-border bg-surface px-3 text-start text-base text-text outline-none transition-colors focus:border-accent md:text-sm"
        />
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={getGymCalendar() === 'hijri' ? t('cal.hijri') : t('cal.gregorian')}
          className="focus-ring inline-flex min-h-[44px] w-11 shrink-0 items-center justify-center rounded border border-border text-muted transition-colors hover:border-accent hover:text-accent"
        >
          <CalendarClock {...ICON_SM} />
        </button>
      </div>

      {dual && (
        <p className="mt-1.5 text-xs text-faint">
          <span className="text-muted">
            {getGymCalendar() === 'hijri' ? t('cal.hijri') : t('cal.gregorian')}:
          </span>{' '}
          {dual.primary}
        </p>
      )}

      {open && (
        <div className="absolute z-30 mt-2 rounded-lg border border-border bg-surface p-2 shadow-none">
          <Suspense fallback={<p className="p-4 text-sm text-muted">{t('common.loading')}</p>}>
            <HijriPicker
              value={value}
              onSelect={(next) => {
                onChange(next);
                setOpen(false);
              }}
            />
          </Suspense>
        </div>
      )}
    </div>
  );
}
