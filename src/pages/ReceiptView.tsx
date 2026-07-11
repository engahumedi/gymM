import { useNavigate, useParams } from 'react-router-dom';
import { useI18n } from '@/i18n/I18nProvider';
import { fetchGym, fetchPaymentWithMember } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { methodLabelKey } from '@/lib/display';
import { formatCurrency, formatDateTime } from '@/lib/format';
import { localizedName } from '@/lib/display';
import { Button } from '@/components/ui/Button';
import { InlineLoading, ErrorText } from '@/components/ui/misc';

// Printable, PDF-friendly receipt. Rendered as a top-level route so print output
// contains only the receipt (no dashboard chrome). Buttons are hidden on print.
export function ReceiptView() {
  const { t, locale } = useI18n();
  const { id } = useParams();
  const navigate = useNavigate();
  const payment = useAsync(() => fetchPaymentWithMember(id!), [id]);
  const gym = useAsync(fetchGym, []);

  if (payment.loading) return <InlineLoading />;
  if (payment.error || !payment.data) return <ErrorText error={payment.error ?? 'not found'} />;

  const p = payment.data;
  const gymName = gym.data ? localizedName(gym.data, locale) : '';

  return (
    <div className="min-h-screen bg-slate-100 p-4 print:bg-white">
      <div className="mx-auto max-w-md">
        <div className="mb-4 flex justify-between print:hidden">
          <Button variant="secondary" onClick={() => navigate(-1)}>← {t('common.cancel')}</Button>
          <Button onClick={() => window.print()}>{t('receipt.print')}</Button>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm print:border-0 print:shadow-none">
          <div className="mb-6 border-b border-dashed border-slate-300 pb-4 text-center">
            <h1 className="text-xl font-extrabold text-brand">{gymName}</h1>
            <p className="mt-1 text-sm text-slate-500">{t('receipt.title')}</p>
          </div>

          <dl className="space-y-3 text-sm">
            <Row label={t('receipt.no')} value={p.receipt_number ?? '—'} mono />
            <Row label={t('receipt.date')} value={formatDateTime(p.created_at, locale)} />
            <Row label={t('receipt.member')} value={p.members?.full_name ?? '—'} />
            <Row label={t('receipt.method')} value={t(methodLabelKey(p.method))} />
            <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-4">
              <span className="font-semibold text-slate-700">{t('receipt.amount')}</span>
              <span className="text-2xl font-extrabold text-ink">{formatCurrency(p.amount, locale)}</span>
            </div>
          </dl>

          <p className="mt-8 text-center text-xs text-slate-400">{t('receipt.thanks')}</p>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-slate-500">{label}</dt>
      <dd className={`font-medium text-slate-800 ${mono ? 'font-mono text-xs' : ''}`}>{value}</dd>
    </div>
  );
}
