import { useI18n } from '@/i18n/I18nProvider';
import { formatDateDual, getGymCalendar } from '@/lib/format';

// Native date inputs are Gregorian in every browser — there is no Hijri picker
// to switch them to, and hand-rolling one would be a calendar widget nobody
// asked for. So the input stays native and reliable, and the same date is
// echoed underneath in the gym's leading calendar as soon as one is picked.
// Whoever is typing sees both without having to convert anything in their head.
export function DateHint({ value, className = '' }: { value: string | null | undefined; className?: string }) {
  const { t, locale } = useI18n();
  const dual = formatDateDual(value, locale);
  if (!dual) return null;

  const leadLabel = getGymCalendar() === 'hijri' ? t('cal.hijri') : t('cal.gregorian');
  return (
    <p className={`mt-1.5 text-xs text-faint ${className}`}>
      <span className="text-muted">{leadLabel}:</span> {dual.primary}
    </p>
  );
}
