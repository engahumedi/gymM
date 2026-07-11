import { useI18n } from '@/i18n/I18nProvider';

export function FullPageSpinner() {
  const { t } = useI18n();
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg">
      <div className="flex items-center gap-3 text-sm text-muted">
        <span className="h-4 w-4 animate-spin rounded-full border border-border-strong border-t-text" />
        {t('common.loading')}
      </div>
    </div>
  );
}
