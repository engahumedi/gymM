import { useI18n } from '@/i18n/I18nProvider';

export function LangToggle({ className = '' }: { className?: string }) {
  const { t, toggleLocale } = useI18n();
  return (
    <button
      type="button"
      onClick={toggleLocale}
      className={`text-xs font-semibold tracking-wide text-muted transition-colors hover:text-text ${className}`}
    >
      {t('lang.toggle')}
    </button>
  );
}
