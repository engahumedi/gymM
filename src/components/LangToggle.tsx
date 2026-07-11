import { useI18n } from '@/i18n/I18nProvider';

export function LangToggle({ className = '' }: { className?: string }) {
  const { t, toggleLocale } = useI18n();
  return (
    <button
      type="button"
      onClick={toggleLocale}
      className={`rounded-md border border-current/20 px-3 py-1 text-sm font-medium transition hover:bg-black/5 ${className}`}
    >
      {t('lang.toggle')}
    </button>
  );
}
