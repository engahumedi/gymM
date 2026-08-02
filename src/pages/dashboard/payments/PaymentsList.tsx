import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '@/i18n/I18nProvider';
import { fetchPaymentsPage, DEFAULT_PAGE_SIZE } from '@/lib/api';
import { usePaged } from '@/lib/useAsync';
import { methodLabelKey } from '@/lib/display';
import { formatCurrency, formatDateTime } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { EmptyState, InlineLoading, ErrorText, PageHeader } from '@/components/ui/misc';
import { TableWrap, Th, Td, CardList, DataCard, CardHead, CardMeta, CardRow } from '@/components/dashboard/DataTable';
import { RecordPaymentModal } from './RecordPaymentModal';

export function PaymentsList() {
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const page = usePaged(
    (offset, limit) => fetchPaymentsPage({ offset, limit }),
    [],
    DEFAULT_PAGE_SIZE,
  );
  const [recording, setRecording] = useState(false);

  return (
    <div>
      <PageHeader
        title={t('payments.title')}
        action={<Button onClick={() => setRecording(true)} className="w-full sm:w-auto">{t('payments.record')}</Button>}
      />

      {page.error && (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <ErrorText error={page.error} />
          <Button variant="secondary" onClick={page.reload}>{t('common.retry')}</Button>
        </div>
      )}

      {page.loading ? (
        <InlineLoading />
      ) : page.rows.length === 0 ? (
        <EmptyState messageKey="payments.empty" />
      ) : (
        <>
          <TableWrap>
            <thead className="border-b border-border">
              <tr>
                <Th>{t('payments.col.date')}</Th>
                <Th>{t('payments.col.member')}</Th>
                <Th>{t('payments.col.amount')}</Th>
                <Th>{t('payments.col.method')}</Th>
                <Th>{t('payments.col.receipt')}</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {page.rows.map((p) => (
                <tr key={p.id} className="border-b border-border hover:bg-surface">
                  <Td className="text-muted">{formatDateTime(p.created_at, locale)}</Td>
                  <Td className="font-medium text-text">{p.members?.full_name ?? '—'}</Td>
                  <Td>{formatCurrency(p.amount, locale)}</Td>
                  <Td>{t(methodLabelKey(p.method))}</Td>
                  <Td className="font-mono text-xs text-muted">{p.receipt_number ?? '—'}</Td>
                  <Td className="text-end">
                    <button
                      className="focus-ring inline-flex min-h-[44px] items-center rounded px-2 text-sm font-semibold text-accent hover:underline"
                      onClick={() => navigate(`/receipt/${p.id}`)}
                    >
                      {t('payments.print')}
                    </button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>

          {/* Phone: one card per payment, with the print action as a full-width
              button instead of a 14px text link at the end of a scrolled row. */}
          <CardList>
            {page.rows.map((p) => (
              <DataCard key={p.id}>
                <CardHead
                  title={p.members?.full_name ?? '—'}
                  aside={<span className="font-medium text-text">{formatCurrency(p.amount, locale)}</span>}
                />
                <CardMeta>
                  <CardRow label={t('payments.col.date')}>{formatDateTime(p.created_at, locale)}</CardRow>
                  <CardRow label={t('payments.col.method')}>{t(methodLabelKey(p.method))}</CardRow>
                  <CardRow label={t('payments.col.receipt')}>
                    <span className="font-mono text-xs">{p.receipt_number ?? '—'}</span>
                  </CardRow>
                </CardMeta>
                <Button
                  variant="secondary"
                  className="mt-3 w-full"
                  onClick={() => navigate(`/receipt/${p.id}`)}
                >
                  {t('payments.print')}
                </Button>
              </DataCard>
            ))}
          </CardList>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-faint">
              {t('common.showing')} {page.rows.length} {t('common.of')} {page.total}
            </p>
            {page.hasMore && (
              <Button variant="secondary" loading={page.loadingMore} onClick={page.loadMore} className="w-full sm:w-auto">
                {t('common.load_more')}
              </Button>
            )}
          </div>
        </>
      )}

      {recording && (
        <RecordPaymentModal
          onClose={() => setRecording(false)}
          onSaved={(paymentId) => {
            setRecording(false);
            page.reload();
            navigate(`/receipt/${paymentId}`);
          }}
        />
      )}
    </div>
  );
}
