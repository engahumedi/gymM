import { useI18n } from '@/i18n/I18nProvider';
import { fetchAuditLog } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { formatDateTime } from '@/lib/format';
import type { MessageKey } from '@/i18n/dictionary';
import { EmptyState, InlineLoading } from '@/components/ui/misc';
import { TableWrap, Th, Td, CardList, DataCard, CardHead, CardMeta, CardRow } from '@/components/dashboard/DataTable';

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
        <>
          <TableWrap>
            <thead className="border-b border-border">
              <tr>
                <Th>{t('audit.col.time')}</Th>
                <Th>{t('audit.col.actor')}</Th>
                <Th>{t('audit.col.action')}</Th>
                <Th>{t('audit.col.detail')}</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border">
                  <Td className="whitespace-nowrap text-faint">{formatDateTime(r.created_at, locale)}</Td>
                  <Td>{r.actor_name ?? '—'}</Td>
                  <Td className="text-text">{actionLabel(r.action)}</Td>
                  <Td className="text-muted">{detail(r.meta)}</Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>

          <CardList>
            {rows.map((r) => (
              <DataCard key={r.id}>
                <CardHead
                  title={actionLabel(r.action)}
                  aside={<span className="text-xs text-faint">{formatDateTime(r.created_at, locale)}</span>}
                />
                <CardMeta>
                  <CardRow label={t('audit.col.actor')}>{r.actor_name ?? '—'}</CardRow>
                  {detail(r.meta) && <CardRow label={t('audit.col.detail')}>{detail(r.meta)}</CardRow>}
                </CardMeta>
              </DataCard>
            ))}
          </CardList>
        </>
      )}
    </div>
  );
}
