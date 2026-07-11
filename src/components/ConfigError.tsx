import { useI18n } from '@/i18n/I18nProvider';
import { AlertCircle, ICON_LG } from './ui/icons';

// Shown when Supabase env vars are missing — graceful, not a blank screen.
export function ConfigError() {
  const { t } = useI18n();
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg p-6">
      <div className="max-w-md border-s-2 border-accent ps-6">
        <AlertCircle {...ICON_LG} className="mb-3 text-accent" />
        <h1 className="font-display mb-2 text-xl text-text">{t('error.config.title')}</h1>
        <p className="text-sm leading-relaxed text-muted">{t('error.config.body')}</p>
        <code className="mt-4 block bg-surface p-3 text-start text-xs text-faint">
          VITE_SUPABASE_URL=…
          <br />
          VITE_SUPABASE_ANON_KEY=…
        </code>
      </div>
    </div>
  );
}
