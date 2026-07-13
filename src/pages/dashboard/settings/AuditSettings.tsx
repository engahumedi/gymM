import { useI18n } from '@/i18n/I18nProvider';
import { fetchAuditLog } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { formatDateTime } from '@/lib/format';
import type { MessageKey } from '@/i18n/dictionary';
import { EmptyState, InlineLoading } from '@/components/ui/misc';

// Known action codes → localized label; unknown codes fall back to the raw code.
const KNOWN = new Set([
  'payment_recorded', 'password_set_by_staff', 'password_change_requested',
  'password_change_approved', 'password_change_rejected',
  'subscription_active', 'subscription_frozen', 'subscription_expired',
  'subscription_cancelled', 'subscription_pending',
]);

export function AuditSettings() {
  const { t, locale } = useI18n();
  const { data, loading } = useAsync(() => fetchAuditLog(150), []);
  const rows = data ?? [];

  function actionLabel(a: string): string {
    return KNOWN.has(a) ? t(`audit.action.${a}` as MessageKey) : a;
  }
  function detail(meta: Record<string, unknown>): string {
    const v = meta.member ?? meta.email ?? meta.to ?? '';
    return typeof v === 'string' ? v : '';
  }

  return (
    <div>
      <p className="mb-6 text-sm text-muted">{t('audit.desc')}</p>
      {loading ? (
        <InlineLoading />
      ) : rows.length === 0 ? (
        <EmptyState messageKey="audit.empty" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-start text-sm">
            <thead className="border-b border-border text-muted">
              <tr>
                <th className="px-3 py-2 text-start font-medium">{t('audit.col.time')}</th>
                <th className="px-3 py-2 text-start font-medium">{t('audit.col.actor')}</th>
                <th className="px-3 py-2 text-start font-medium">{t('audit.col.action')}</th>
                <th className="px-3 py-2 text-start font-medium">{t('audit.col.detail')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border">
                  <td className="whitespace-nowrap px-3 py-2 text-faint">{formatDateTime(r.created_at, locale)}</td>
                  <td className="px-3 py-2">{r.actor_name ?? '—'}</td>
                  <td className="px-3 py-2 text-text">{actionLabel(r.action)}</td>
                  <td className="px-3 py-2 text-muted">{detail(r.meta)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
