import { useNavigate, useParams } from 'react-router-dom';
import { useI18n } from '@/i18n/I18nProvider';
import { fetchGym, fetchPaymentWithMember } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { methodLabelKey, localizedName } from '@/lib/display';
import { formatCurrency, formatDateTime } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { InlineLoading, ErrorText } from '@/components/ui/misc';
import { ChevronRight, Printer, ICON_SM } from '@/components/ui/icons';

// Printable receipt. On screen it sits on the dark app; the receipt itself is a
// white "paper" so print output is clean. Top-level route → no dashboard chrome.
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
    <div className="min-h-screen bg-bg p-5 print:bg-white print:p-0">
      <div className="mx-auto max-w-md">
        <div className="mb-5 flex items-center justify-between print:hidden">
          <button onClick={() => navigate(-1)} className="inline-flex items-center gap-1 text-sm text-muted hover:text-text">
            <ChevronRight {...ICON_SM} className="rotate-180 rtl:rotate-0" /> {t('common.cancel')}
          </button>
          <Button onClick={() => window.print()}><Printer {...ICON_SM} />{t('receipt.print')}</Button>
        </div>

        <div className="bg-white p-10 text-[#14171a] print:p-6">
          <div className="mb-8 flex items-baseline justify-between border-b border-[#e6e2da] pb-5">
            <span className="font-display text-xl">{gymName}</span>
            <span className="text-xs uppercase tracking-[0.18em] text-[#8a8578]">{t('receipt.title')}</span>
          </div>

          <dl className="space-y-3.5 text-sm">
            <Row label={t('receipt.no')} value={p.receipt_number ?? '—'} mono />
            <Row label={t('receipt.date')} value={formatDateTime(p.created_at, locale)} />
            <Row label={t('receipt.member')} value={p.members?.full_name ?? '—'} />
            <Row label={t('receipt.method')} value={t(methodLabelKey(p.method))} />
          </dl>

          <div className="mt-6 flex items-end justify-between border-t border-[#e6e2da] pt-5">
            <span className="text-sm text-[#8a8578]">{t('receipt.amount')}</span>
            <span className="font-display text-3xl">{formatCurrency(p.amount, locale)}</span>
          </div>

          <p className="mt-10 text-xs text-[#a8a294]">{t('receipt.thanks')}</p>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-[#8a8578]">{label}</dt>
      <dd className={mono ? 'font-mono text-xs' : 'font-medium'}>{value}</dd>
    </div>
  );
}
