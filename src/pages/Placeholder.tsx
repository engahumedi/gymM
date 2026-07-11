import { useI18n } from '@/i18n/I18nProvider';
import { PageHeader } from '@/components/ui/misc';
import type { MessageKey } from '@/i18n/dictionary';

// Stub for screens delivered later. Keeps routing/layout live without faking UI.
export function Placeholder({ titleKey }: { titleKey: MessageKey }) {
  const { t } = useI18n();
  return (
    <div>
      <PageHeader title={t(titleKey)} eyebrow={t('common.soon')} />
      <p className="max-w-md text-muted">{t('common.soon.body')}</p>
    </div>
  );
}
