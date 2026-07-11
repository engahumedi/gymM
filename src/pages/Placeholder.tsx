import { useI18n } from '@/i18n/I18nProvider';
import type { MessageKey } from '@/i18n/dictionary';

// Lightweight stub for screens delivered in later phases. Keeps routing and
// layouts fully wired and testable now without faking functionality.
export function Placeholder({ titleKey }: { titleKey: MessageKey }) {
  const { t } = useI18n();
  return (
    <section className="rounded-xl border border-dashed border-slate-300 bg-white/60 p-10 text-center">
      <h2 className="text-lg font-bold text-ink">{t(titleKey)}</h2>
      <p className="mt-2 text-sm text-slate-500">{t('common.soon')}</p>
    </section>
  );
}
