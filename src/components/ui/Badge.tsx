import { useI18n } from '@/i18n/I18nProvider';
import { statusInfo, type DisplayStatus } from '@/lib/subscriptionStatus';

// Quiet status marker: a coloured dot + plain label. No filled pill, no glow.
export function StatusBadge({ status }: { status: DisplayStatus }) {
  const { t } = useI18n();
  const info = statusInfo(status);
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted">
      <span className={`inline-block h-1.5 w-1.5 rounded-full bg-current ${info.className}`} />
      <span className="text-text/80">{t(info.labelKey)}</span>
    </span>
  );
}
