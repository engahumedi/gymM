import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useI18n } from '@/i18n/I18nProvider';
import { useReferenceData } from '@/lib/ReferenceData';
import {
  fetchCheckIns, fetchFreezes, fetchMember, fetchPayments, fetchSubscriptions,
  signedPhotoUrl, unfreezeSubscription,
} from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { localizedName, methodLabelKey } from '@/lib/display';
import { formatCurrency, formatDate, formatDateTime } from '@/lib/format';
import { pickCurrent, subscriptionDisplayStatus } from '@/lib/subscriptionStatus';
import type { Plan, Subscription } from '@/lib/database.types';
import { StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorText, InlineLoading, PageHeader } from '@/components/ui/misc';
import { ChevronRight, Pencil, RefreshCw, Snowflake, ArrowUpRight, Check, ICON_SM } from '@/components/ui/icons';
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
  const branchName = (bid: string | null) => { const b = branches.find((x) => x.id === bid); return b ? localizedName(b, locale) : '—'; };
  const reloadAll = () => { subs.reload(); payments.reload(); checkins.reload(); freezes.reload(); };

  if (member.loading) return <InlineLoading />;
  if (member.error || !member.data) return <ErrorText error={member.error ?? 'not found'} />;

  const m = member.data;
  const current = pickCurrent(subs.data ?? []);
  const status = subscriptionDisplayStatus(current);

  async function doUnfreeze() {
    if (!current) return;
    setBusy(true);
    try { await unfreezeSubscription(current.id); reloadAll(); } finally { setBusy(false); }
  }

  return (
    <div>
      <button onClick={() => navigate('/dashboard/members')} className="mb-6 inline-flex items-center gap-1 text-sm text-muted hover:text-text">
        <ChevronRight {...ICON_SM} className="rotate-180 rtl:rotate-0" /> {t('members.title')}
      </button>

      <PageHeader
        eyebrow={m.member_code ?? undefined}
        title={m.full_name}
        action={<Button variant="secondary" onClick={() => navigate(`/dashboard/members/${m.id}/edit`)}><Pencil {...ICON_SM} />{t('profile.edit')}</Button>}
      />

      {/* Identity row */}
      <div className="mb-12 flex items-start gap-5">
        <div className="h-20 w-20 shrink-0 overflow-hidden border border-border-strong">
          {photo.data ? (
            <img src={photo.data} alt={m.full_name} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center font-display text-2xl text-faint">{m.full_name.charAt(0)}</div>
          )}
        </div>
        <div className="grid flex-1 grid-cols-2 gap-x-8 gap-y-2 pt-1 text-sm sm:grid-cols-4">
          <Meta label={t('members.col.status')}><StatusBadge status={status} /></Meta>
          <Meta label={t('members.col.phone')}><span dir="ltr" className="text-start text-text">{m.phone}</span></Meta>
          <Meta label={t('member.field.national_id')}><span dir="ltr" className="text-start text-text">{m.national_id ?? '—'}</span></Meta>
          <Meta label={t('members.col.branch')}><span className="text-text">{branchName(m.branch_id)}</span></Meta>
          {m.dob && <Meta label={t('member.field.dob')}><span className="text-text">{formatDate(m.dob, locale)}</span></Meta>}
          {m.emergency_contact_phone && <Meta label={t('profile.emergency')}><span dir="ltr" className="text-start text-text">{m.emergency_contact_phone}</span></Meta>}
        </div>
      </div>

      {/* Current subscription — lead panel */}
      <section className="mb-12">
        <p className="eyebrow mb-4">{t('profile.current_sub')}</p>
        {current ? (
          <div className="flex flex-wrap items-end justify-between gap-6 border-t border-border pt-5">
            <div className="flex gap-12">
              <div>
                <p className="text-xs text-muted">{t('profile.plan')}</p>
                <p className="font-display mt-1 text-2xl text-text">{planName(current.plan_id)}</p>
              </div>
              <div>
                <p className="text-xs text-muted">{t('profile.end')}</p>
                <p className="font-display mt-1 text-2xl text-text">{formatDate(current.end_date, locale)}</p>
              </div>
              {current.frozen_days_used > 0 && (
                <div>
                  <p className="text-xs text-muted">{t('profile.frozen_days')}</p>
                  <p className="font-display mt-1 text-2xl text-sand">{current.frozen_days_used}</p>
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={() => setAction('new')}>{t('sub.new')}</Button>
              {current.status === 'pending' && <Button variant="secondary" onClick={() => setAction('activate')}><Check {...ICON_SM} />{t('sub.activate')}</Button>}
              {current.status === 'active' && <>
                <Button variant="secondary" onClick={() => setAction('renew')}><RefreshCw {...ICON_SM} />{t('sub.renew')}</Button>
                <Button variant="secondary" onClick={() => setAction('freeze')}><Snowflake {...ICON_SM} />{t('sub.freeze')}</Button>
                <Button variant="secondary" onClick={() => setAction('upgrade')}><ArrowUpRight {...ICON_SM} />{t('sub.upgrade')}</Button>
              </>}
              {current.status === 'frozen' && <>
                <Button variant="secondary" loading={busy} onClick={doUnfreeze}>{t('sub.unfreeze')}</Button>
                <Button variant="secondary" onClick={() => setAction('renew')}><RefreshCw {...ICON_SM} />{t('sub.renew')}</Button>
              </>}
              {(current.status === 'expired' || current.status === 'cancelled') && <Button variant="secondary" onClick={() => setAction('renew')}><RefreshCw {...ICON_SM} />{t('sub.renew')}</Button>}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between border-t border-border pt-5">
            <p className="text-muted">{t('profile.no_sub')}</p>
            <Button onClick={() => setAction('new')}>{t('sub.new')}</Button>
          </div>
        )}
      </section>

      {/* History tabs */}
      <div className="mb-4 flex gap-6 border-b border-border">
        {(['subscriptions', 'payments', 'checkins', 'freezes'] as Tab[]).map((tk) => (
          <button
            key={tk}
            onClick={() => setTab(tk)}
            className={`-mb-px border-b-2 pb-2.5 text-sm transition-colors ${tab === tk ? 'border-accent text-text' : 'border-transparent text-muted hover:text-text'}`}
          >
            {t(`profile.tab.${tk}` as MessageKey)}
          </button>
        ))}
      </div>

      {tab === 'subscriptions' && <SubsTable subs={subs.data ?? []} planName={planName} />}
      {tab === 'payments' && <PaymentsTable rows={payments.data ?? []} />}
      {tab === 'checkins' && <CheckinsTable rows={checkins.data ?? []} branchName={branchName} />}
      {tab === 'freezes' && <FreezesTable rows={freezes.data ?? []} />}

      {action && (
        <SubscriptionActionModal action={action} member={m} subscription={current} onClose={() => setAction(null)} onDone={reloadAll} />
      )}
    </div>
  );
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-faint">{label}</p>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}

function Table({ children }: { children: React.ReactNode }) {
  return <div className="overflow-x-auto"><table className="w-full min-w-[30rem] text-start text-sm">{children}</table></div>;
}
function Th({ children }: { children: React.ReactNode }) { return <th className="px-3 py-2.5 text-start text-xs font-medium tracking-wide text-muted">{children}</th>; }
function Td({ children, dir, className = '' }: { children: React.ReactNode; dir?: string; className?: string }) { return <td dir={dir} className={`px-3 py-3 ${className}`}>{children}</td>; }

function SubsTable({ subs, planName }: { subs: Subscription[]; planName: (id: string) => string }) {
  const { t, locale } = useI18n();
  if (subs.length === 0) return <EmptyState messageKey="sub.empty" />;
  return (
    <Table>
      <thead><tr className="border-b border-border"><Th>{t('sub.col.plan')}</Th><Th>{t('sub.col.status')}</Th><Th>{t('sub.col.start')}</Th><Th>{t('sub.col.end')}</Th><Th>{t('sub.col.price')}</Th></tr></thead>
      <tbody>
        {subs.map((s) => (
          <tr key={s.id} className="border-b border-border">
            <Td className="font-medium text-text">{planName(s.plan_id)}</Td>
            <Td><StatusBadge status={subscriptionDisplayStatus(s)} /></Td>
            <Td className="text-muted">{formatDate(s.start_date, locale)}</Td>
            <Td className="text-muted">{formatDate(s.end_date, locale)}</Td>
            <Td className="text-text">{formatCurrency(s.price_paid, locale)}</Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

function PaymentsTable({ rows }: { rows: import('@/lib/database.types').Payment[] }) {
  const { t, locale } = useI18n();
  if (rows.length === 0) return <EmptyState messageKey="pay.empty" />;
  return (
    <Table>
      <thead><tr className="border-b border-border"><Th>{t('pay.col.date')}</Th><Th>{t('pay.col.amount')}</Th><Th>{t('pay.col.method')}</Th><Th>{t('pay.col.receipt')}</Th></tr></thead>
      <tbody>
        {rows.map((p) => (
          <tr key={p.id} className="border-b border-border">
            <Td className="text-muted">{formatDateTime(p.created_at, locale)}</Td>
            <Td className="text-text">{formatCurrency(p.amount, locale)}</Td>
            <Td className="text-muted">{t(methodLabelKey(p.method))}</Td>
            <Td className="font-mono text-xs text-faint">{p.receipt_number ?? '—'}</Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

function CheckinsTable({ rows, branchName }: { rows: import('@/lib/database.types').CheckIn[]; branchName: (id: string | null) => string }) {
  const { t, locale } = useI18n();
  if (rows.length === 0) return <EmptyState messageKey="checkin.empty" />;
  return (
    <Table>
      <thead><tr className="border-b border-border"><Th>{t('checkin.col.date')}</Th><Th>{t('checkin.col.branch')}</Th></tr></thead>
      <tbody>
        {rows.map((c) => (
          <tr key={c.id} className="border-b border-border">
            <Td className="text-muted">{formatDateTime(c.checked_in_at, locale)}</Td>
            <Td className="text-text">{branchName(c.branch_id)}</Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

function FreezesTable({ rows }: { rows: import('@/lib/database.types').Freeze[] }) {
  const { t, locale } = useI18n();
  if (rows.length === 0) return <EmptyState messageKey="freeze.empty" />;
  return (
    <Table>
      <thead><tr className="border-b border-border"><Th>{t('freeze.col.period')}</Th><Th>{t('freeze.col.days')}</Th></tr></thead>
      <tbody>
        {rows.map((f) => (
          <tr key={f.id} className="border-b border-border">
            <Td className="text-muted">{formatDate(f.start_date, locale)} — {formatDate(f.end_date, locale)}</Td>
            <Td className="text-text">{f.days}</Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
