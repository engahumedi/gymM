import { useI18n } from '@/i18n/I18nProvider';
import { statusInfo, type DisplayStatus } from '@/lib/subscriptionStatus';

export function StatusBadge({ status }: { status: DisplayStatus }) {
  const { t } = useI18n();
  const info = statusInfo(status);
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${info.className}`}>
      {t(info.labelKey)}
    </span>
  );
}
