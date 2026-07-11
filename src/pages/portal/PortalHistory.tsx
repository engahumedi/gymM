import { useI18n } from '@/i18n/I18nProvider';
import { useAuth } from '@/auth/AuthProvider';
import { fetchCheckIns, fetchPayments } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { methodLabelKey } from '@/lib/display';
import { formatCurrency, formatDateTime } from '@/lib/format';
import { EmptyState, InlineLoading } from '@/components/ui/misc';

export function PortalPayments() {
  const { t, locale } = useI18n();
  const { profile } = useAuth();
  const { data, loading } = useAsync(
    () => (profile?.member_id ? fetchPayments(profile.member_id) : Promise.resolve([])),
    [profile?.member_id],
  );
  if (loading) return <InlineLoading />;
  if ((data ?? []).length === 0) return <EmptyState messageKey="pay.empty" />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-start text-sm">
        <thead className="border-b border-border text-muted">
          <tr>
            <th className="px-3 py-2 text-start font-medium">{t('pay.col.date')}</th>
            <th className="px-3 py-2 text-start font-medium">{t('pay.col.amount')}</th>
            <th className="px-3 py-2 text-start font-medium">{t('pay.col.method')}</th>
            <th className="px-3 py-2 text-start font-medium">{t('pay.col.receipt')}</th>
          </tr>
        </thead>
        <tbody>
          {(data ?? []).map((p) => (
            <tr key={p.id} className="border-b border-border">
              <td className="px-3 py-2">{formatDateTime(p.created_at, locale)}</td>
              <td className="px-3 py-2">{formatCurrency(p.amount, locale)}</td>
              <td className="px-3 py-2">{t(methodLabelKey(p.method))}</td>
              <td className="px-3 py-2 font-mono text-xs text-muted">{p.receipt_number ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
        <div key={c.id} className="px-4 py-2.5 text-sm">
          {formatDateTime(c.checked_in_at, locale)}
        </div>
      ))}
    </div>
  );
}
