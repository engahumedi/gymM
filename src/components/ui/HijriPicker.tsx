import { DayPicker, arSA, enUS } from 'react-day-picker/hijri';
import 'react-day-picker/style.css';
import { useI18n } from '@/i18n/I18nProvider';
import { getGymCalendar } from '@/lib/format';

// react-day-picker's Umm al-Qura calendar, imported from its own `/hijri`
// entry point — the maintained implementation rather than a widget of our own.
// Loaded lazily by DateField, so its calendar engine only ships to someone who
// actually opens a date picker.
//
// The value crossing this boundary stays an ISO Gregorian string in both
// directions: storage never changes calendar, only the presentation does.
export function HijriPicker({
  value,
  onSelect,
}: {
  value: string;
  onSelect: (next: string) => void;
}) {
  const { locale } = useI18n();
  const selected = value ? new Date(`${value}T00:00:00`) : undefined;
  const valid = selected && !Number.isNaN(selected.getTime()) ? selected : undefined;

  return (
    <DayPicker
      mode="single"
      selected={valid}
      defaultMonth={valid}
      onSelect={(d) => {
        if (!d) return;
        // Local parts, not toISOString(): UTC would shift the date a day back
        // for anyone east of Greenwich, which is everyone here.
        const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        onSelect(iso);
      }}
      locale={locale === 'ar' ? arSA : enUS}
      dir={locale === 'ar' ? 'rtl' : 'ltr'}
      captionLayout="dropdown"
      startMonth={new Date(1940, 0)}
      endMonth={new Date(new Date().getFullYear() + 5, 11)}
      // The gym's own setting decides which calendar the picker leads with;
      // `numerals` keeps the digits in the script the rest of the UI uses.
      numerals={locale === 'ar' ? 'arab' : 'latn'}
      className={getGymCalendar() === 'hijri' ? 'rdp-hijri' : ''}
    />
  );
}
