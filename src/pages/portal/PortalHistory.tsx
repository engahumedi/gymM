import { useI18n } from '@/i18n/I18nProvider';
import { useAuth } from '@/auth/AuthProvider';
import { fetchCheckIns, fetchPayments } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { methodLabelKey } from '@/lib/display';
import { formatCurrency, formatDateTime } from '@/lib/format';
import { EmptyState, InlineLoading } from '@/components/ui/misc';
import { TableWrap, Th, Td, CardList, DataCard, CardHead, CardMeta, CardRow } from '@/components/dashboard/DataTable';

export function PortalPayments() {
  const { t, locale } = useI18n();
  const { profile } = useAuth();
  const { data, loading } = useAsync(
    () => (profile?.member_id ? fetchPayments(profile.member_id) : Promise.resolve([])),
    [profile?.member_id],
  );
  if (loading) return <InlineLoading />;
  const rows = data ?? [];
  if (rows.length === 0) return <EmptyState messageKey="pay.empty" />;
  return (
    <>
      <TableWrap>
        <thead className="border-b border-border">
          <tr>
            <Th>{t('pay.col.date')}</Th>
            <Th>{t('pay.col.amount')}</Th>
            <Th>{t('pay.col.method')}</Th>
            <Th>{t('pay.col.receipt')}</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id} className="border-b border-border">
              <Td>{formatDateTime(p.created_at, locale)}</Td>
              <Td>{formatCurrency(p.amount, locale)}</Td>
              <Td>{t(methodLabelKey(p.method))}</Td>
              <Td className="font-mono text-xs text-muted">{p.receipt_number ?? '—'}</Td>
            </tr>
          ))}
        </tbody>
      </TableWrap>

      <CardList>
        {rows.map((p) => (
          <DataCard key={p.id}>
            <CardHead
              title={formatDateTime(p.created_at, locale)}
              aside={<span className="font-medium text-text">{formatCurrency(p.amount, locale)}</span>}
            />
            <CardMeta>
              <CardRow label={t('pay.col.method')}>{t(methodLabelKey(p.method))}</CardRow>
              <CardRow label={t('pay.col.receipt')}>
                <span className="font-mono text-xs">{p.receipt_number ?? '—'}</span>
              </CardRow>
            </CardMeta>
          </DataCard>
        ))}
      </CardList>
    </>
  );
}

export function PortalCheckins() {
  const { locale } = useI18n();
  const { profile } = useAuth();
  const { data, loading } = useAsync(
    () => (profile?.member_id ? fetchCheckIns(profile.member_id) : Promise.resolve([])),
    [profile?.member_id],
  );
  if (loading) return <InlineLoading />;
  if ((data ?? []).length === 0) return <EmptyState messageKey="checkin.empty" />;
  return (
    <div className="divide-y divide-border rounded border border-border bg-surface">
      {(data ?? []).map((c) => (
        <div key={c.id} className="flex min-h-[48px] items-center px-4 py-2.5 text-sm">
          {formatDateTime(c.checked_in_at, locale)}
        </div>
      ))}
    </div>
  );
}
