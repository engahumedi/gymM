import { useI18n } from '@/i18n/I18nProvider';

export function LangToggle({ className = '' }: { className?: string }) {
  const { t, toggleLocale } = useI18n();
  return (
    <button
      type="button"
      onClick={toggleLocale}
      // 44px is the minimum comfortable tap target; the label alone was ~17px.
      className={`focus-ring inline-flex min-h-[44px] items-center rounded-lg px-3 text-xs font-semibold tracking-wide text-muted transition-colors hover:text-text ${className}`}
    >
      {t('lang.toggle')}
    </button>
  );
}
