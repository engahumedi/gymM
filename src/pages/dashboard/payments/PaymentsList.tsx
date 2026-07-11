import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '@/i18n/I18nProvider';
import { fetchAllPayments } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { methodLabelKey } from '@/lib/display';
import { formatCurrency, formatDateTime } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { EmptyState, InlineLoading, ErrorText, PageHeader } from '@/components/ui/misc';
import { RecordPaymentModal } from './RecordPaymentModal';

export function PaymentsList() {
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const { data, loading, error, reload } = useAsync(fetchAllPayments, []);
  const [recording, setRecording] = useState(false);

  return (
    <div>
      <PageHeader
        title={t('payments.title')}
        action={<Button onClick={() => setRecording(true)}>{t('payments.record')}</Button>}
      />
      <ErrorText error={error} />
      {loading ? (
        <InlineLoading />
      ) : (data ?? []).length === 0 ? (
        <EmptyState messageKey="payments.empty" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-start text-sm">
            <thead className="border-b border-border text-muted">
              <tr>
                <th className="px-3 py-2 text-start font-medium">{t('payments.col.date')}</th>
                <th className="px-3 py-2 text-start font-medium">{t('payments.col.member')}</th>
                <th className="px-3 py-2 text-start font-medium">{t('payments.col.amount')}</th>
                <th className="px-3 py-2 text-start font-medium">{t('payments.col.method')}</th>
                <th className="px-3 py-2 text-start font-medium">{t('payments.col.receipt')}</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((p) => (
                <tr key={p.id} className="border-b border-border hover:bg-surface">
                  <td className="px-3 py-2 text-muted">{formatDateTime(p.created_at, locale)}</td>
                  <td className="px-3 py-2 font-medium text-text">{p.members?.full_name ?? '—'}</td>
                  <td className="px-3 py-2">{formatCurrency(p.amount, locale)}</td>
                  <td className="px-3 py-2">{t(methodLabelKey(p.method))}</td>
                  <td className="px-3 py-2 font-mono text-xs text-muted">{p.receipt_number ?? '—'}</td>
                  <td className="px-3 py-2 text-end">
                    <button
                      className="text-sm font-semibold text-accent hover:underline"
                      onClick={() => navigate(`/receipt/${p.id}`)}
                    >
                      {t('payments.print')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {recording && (
        <RecordPaymentModal
          onClose={() => setRecording(false)}
          onSaved={(paymentId) => {
            setRecording(false);
            reload();
            navigate(`/receipt/${paymentId}`);
          }}
        />
      )}
    </div>
  );
}
