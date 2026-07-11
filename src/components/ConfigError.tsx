import { useI18n } from '@/i18n/I18nProvider';

// Shown when Supabase env vars are missing so the app degrades gracefully
// instead of throwing a blank white screen.
export function ConfigError() {
  const { t } = useI18n();
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 p-6 text-center">
      <div className="max-w-md rounded-xl bg-slate-800 p-8 text-slate-100 shadow-xl">
        <h1 className="mb-3 text-xl font-bold text-brand">
          {t('error.config.title')}
        </h1>
        <p className="text-sm leading-relaxed text-slate-300">
          {t('error.config.body')}
        </p>
        <code className="mt-4 block rounded-md bg-slate-950 p-3 text-start text-xs text-slate-400">
          VITE_SUPABASE_URL=…
          <br />
          VITE_SUPABASE_ANON_KEY=…
        </code>
      </div>
    </div>
  );
}
