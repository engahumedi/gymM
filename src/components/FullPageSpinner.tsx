import { useI18n } from '@/i18n/I18nProvider';

export function FullPageSpinner() {
  const { t } = useI18n();
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="flex flex-col items-center gap-3 text-slate-500">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-brand" />
        <span className="text-sm">{t('common.loading')}</span>
      </div>
    </div>
  );
}
