import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useI18n } from '@/i18n/I18nProvider';
import { useReferenceData } from '@/lib/ReferenceData';
import {
  fetchCheckIns,
  fetchFreezes,
  fetchMember,
  fetchPayments,
  fetchSubscriptions,
  signedPhotoUrl,
  unfreezeSubscription,
} from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { localizedName, methodLabelKey } from '@/lib/display';
import { formatCurrency, formatDate, formatDateTime } from '@/lib/format';
import { pickCurrent, subscriptionDisplayStatus } from '@/lib/subscriptionStatus';
import type { Plan, Subscription } from '@/lib/database.types';
import { StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, EmptyState, ErrorText, InlineLoading, PageHeader } from '@/components/ui/misc';
import { SubscriptionActionModal, type SubAction } from './SubscriptionActionModal';
import type { MessageKey } from '@/i18n/dictionary';

type Tab = 'subscriptions' | 'payments' | 'checkins' | 'freezes';

export function MemberProfile() {
  const { t, locale } = useI18n();
  const { id } = useParams();
  const navigate = useNavigate();
  const { branches, plans } = useReferenceData();

  const member = useAsync(() => fetchMember(id!), [id]);
  const subs = useAsync(() => fetchSubscriptions(id!), [id]);
  const payments = useAsync(() => fetchPayments(id!), [id]);
  const checkins = useAsync(() => fetchCheckIns(id!), [id]);
  const freezes = useAsync(() => fetchFreezes(id!), [id]);
  const photo = useAsync(async () => (member.data?.photo_url ? signedPhotoUrl(member.data.photo_url) : null), [member.data?.photo_url]);

  const [tab, setTab] = useState<Tab>('subscriptions');
  const [action, setAction] = useState<SubAction | null>(null);
  const [busy, setBusy] = useState(false);

  const planName = (planId: string) => localizedName(plans.find((p) => p.id === planId) as Plan, locale);
  const branchName = (bid: string | null) => {
    const b = branches.find((x) => x.id === bid);
    return b ? localizedName(b, locale) : '—';
  };

  const reloadAll = () => {
    subs.reload();
    payments.reload();
    checkins.reload();
    freezes.reload();
  };

  if (member.loading) return <InlineLoading />;
  if (member.error || !member.data) return <ErrorText error={member.error ?? 'not found'} />;

  const m = member.data;
  const current = pickCurrent(subs.data ?? []);
  const status = subscriptionDisplayStatus(current);

  async function doUnfreeze() {
    if (!current) return;
    setBusy(true);
    try {
      await unfreezeSubscription(current.id);
      reloadAll();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={t('members.title')}
        action={
          <Button variant="secondary" onClick={() => navigate('/dashboard/members')}>
            ← {t('members.title')}
          </Button>
        }
      />

      {/* Header card */}
      <Card className="mb-4">
        <div className="flex items-start gap-4">
          <div className="h-20 w-20 shrink-0 overflow-hidden rounded-full bg-slate-100">
            {photo.data ? (
              <img src={photo.data} alt={m.full_name} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-2xl text-slate-300">
                {m.full_name.charAt(0)}
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold text-ink">{m.full_name}</h2>
              <StatusBadge status={status} />
            </div>
            <p className="font-mono text-xs text-slate-400">{m.member_code}</p>
            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-slate-600">
              <span dir="ltr" className="text-start">{m.phone}</span>
              <span>{branchName(m.branch_id)}</span>
              {m.dob && <span>{t('member.field.dob')}: {formatDate(m.dob, locale)}</span>}
              {m.emergency_contact_phone && (
                <span dir="ltr" className="text-start">{t('profile.emergency')}: {m.emergency_contact_phone}</span>
              )}
            </div>
          </div>
          <Button variant="secondary" onClick={() => navigate(`/dashboard/members/${m.id}/edit`)}>
            {t('profile.edit')}
          </Button>
        </div>
      </Card>

      {/* Current subscription + actions */}
      <Card className="mb-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-500">{t('profile.current_sub')}</h3>
        {current ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
              <span className="text-slate-500">{t('profile.plan')}</span>
              <span className="font-medium">{planName(current.plan_id)}</span>
              <span className="text-slate-500">{t('profile.end')}</span>
              <span className="font-medium">{formatDate(current.end_date, locale)}</span>
              {current.frozen_days_used > 0 && (
                <>
                  <span className="text-slate-500">{t('profile.frozen_days')}</span>
                  <span className="font-medium">{current.frozen_days_used}</span>
                </>
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-500">{t('profile.no_sub')}</p>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={() => setAction('new')}>{t('sub.new')}</Button>
          {current?.status === 'pending' && (
            <Button variant="secondary" onClick={() => setAction('activate')}>{t('sub.activate')}</Button>
          )}
          {current?.status === 'active' && (
            <>
              <Button variant="secondary" onClick={() => setAction('renew')}>{t('sub.renew')}</Button>
              <Button variant="secondary" onClick={() => setAction('freeze')}>{t('sub.freeze')}</Button>
              <Button variant="secondary" onClick={() => setAction('upgrade')}>{t('sub.upgrade')}</Button>
            </>
          )}
          {current?.status === 'frozen' && (
            <>
              <Button variant="secondary" loading={busy} onClick={doUnfreeze}>{t('sub.unfreeze')}</Button>
              <Button variant="secondary" onClick={() => setAction('renew')}>{t('sub.renew')}</Button>
            </>
          )}
          {(current?.status === 'expired' || current?.status === 'cancelled') && (
            <Button variant="secondary" onClick={() => setAction('renew')}>{t('sub.renew')}</Button>
          )}
        </div>
      </Card>

      {/* History tabs */}
      <div className="mb-3 flex gap-1 border-b border-slate-200">
        {(['subscriptions', 'payments', 'checkins', 'freezes'] as Tab[]).map((tk) => (
          <button
            key={tk}
            onClick={() => setTab(tk)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition ${
              tab === tk ? 'border-brand text-brand' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {t(`profile.tab.${tk}` as MessageKey)}
          </button>
        ))}
      </div>

      {tab === 'subscriptions' && <SubsTable subs={subs.data ?? []} planName={planName} locale={locale} />}
      {tab === 'payments' && <PaymentsTable rows={payments.data ?? []} />}
      {tab === 'checkins' && <CheckinsTable rows={checkins.data ?? []} branchName={branchName} />}
      {tab === 'freezes' && <FreezesTable rows={freezes.data ?? []} />}

      {action && (
        <SubscriptionActionModal
          action={action}
          member={m}
          subscription={current}
          onClose={() => setAction(null)}
          onDone={reloadAll}
        />
      )}
    </div>
  );
}

// ---- small tables ----
function TableWrap({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full text-start text-sm">{children}</table>
    </div>
  );
}
function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-2 text-start font-medium text-slate-500">{children}</th>;
}
function Td({ children, dir, className = '' }: { children: React.ReactNode; dir?: string; className?: string }) {
  return <td dir={dir} className={`px-3 py-2 ${className}`}>{children}</td>;
}

function SubsTable({ subs, planName, locale }: { subs: Subscription[]; planName: (id: string) => string; locale: ReturnType<typeof useI18n>['locale'] }) {
  const { t } = useI18n();
  if (subs.length === 0) return <EmptyState messageKey="sub.empty" />;
  return (
    <TableWrap>
      <thead className="border-b border-slate-200 bg-slate-50">
        <tr>
          <Th>{t('sub.col.plan')}</Th><Th>{t('sub.col.status')}</Th><Th>{t('sub.col.start')}</Th>
          <Th>{t('sub.col.end')}</Th><Th>{t('sub.col.price')}</Th>
        </tr>
      </thead>
      <tbody>
        {subs.map((s) => (
          <tr key={s.id} className="border-b border-slate-100 last:border-0">
            <Td className="font-medium">{planName(s.plan_id)}</Td>
            <Td><StatusBadge status={subscriptionDisplayStatus(s)} /></Td>
            <Td>{formatDate(s.start_date, locale)}</Td>
            <Td>{formatDate(s.end_date, locale)}</Td>
            <Td>{formatCurrency(s.price_paid, locale)}</Td>
          </tr>
        ))}
      </tbody>
    </TableWrap>
  );
}

function PaymentsTable({ rows }: { rows: import('@/lib/database.types').Payment[] }) {
  const { t, locale } = useI18n();
  if (rows.length === 0) return <EmptyState messageKey="pay.empty" />;
  return (
    <TableWrap>
      <thead className="border-b border-slate-200 bg-slate-50">
        <tr><Th>{t('pay.col.date')}</Th><Th>{t('pay.col.amount')}</Th><Th>{t('pay.col.method')}</Th><Th>{t('pay.col.receipt')}</Th></tr>
      </thead>
      <tbody>
        {rows.map((p) => (
          <tr key={p.id} className="border-b border-slate-100 last:border-0">
            <Td>{formatDateTime(p.created_at, locale)}</Td>
            <Td>{formatCurrency(p.amount, locale)}</Td>
            <Td>{t(methodLabelKey(p.method))}</Td>
            <Td className="font-mono text-xs text-slate-500">{p.receipt_number ?? '—'}</Td>
          </tr>
        ))}
      </tbody>
    </TableWrap>
  );
}

function CheckinsTable({ rows, branchName }: { rows: import('@/lib/database.types').CheckIn[]; branchName: (id: string | null) => string }) {
  const { t, locale } = useI18n();
  if (rows.length === 0) return <EmptyState messageKey="checkin.empty" />;
  return (
    <TableWrap>
      <thead className="border-b border-slate-200 bg-slate-50">
        <tr><Th>{t('checkin.col.date')}</Th><Th>{t('checkin.col.branch')}</Th></tr>
      </thead>
      <tbody>
        {rows.map((c) => (
          <tr key={c.id} className="border-b border-slate-100 last:border-0">
            <Td>{formatDateTime(c.checked_in_at, locale)}</Td>
            <Td>{branchName(c.branch_id)}</Td>
          </tr>
        ))}
      </tbody>
    </TableWrap>
  );
}

function FreezesTable({ rows }: { rows: import('@/lib/database.types').Freeze[] }) {
  const { t, locale } = useI18n();
  if (rows.length === 0) return <EmptyState messageKey="freeze.empty" />;
  return (
    <TableWrap>
      <thead className="border-b border-slate-200 bg-slate-50">
        <tr><Th>{t('freeze.col.period')}</Th><Th>{t('freeze.col.days')}</Th></tr>
      </thead>
      <tbody>
        {rows.map((f) => (
          <tr key={f.id} className="border-b border-slate-100 last:border-0">
            <Td>{formatDate(f.start_date, locale)} — {formatDate(f.end_date, locale)}</Td>
            <Td>{f.days}</Td>
          </tr>
        ))}
      </tbody>
    </TableWrap>
  );
}
