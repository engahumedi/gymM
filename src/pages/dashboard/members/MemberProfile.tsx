import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useI18n } from '@/i18n/I18nProvider';
import { useReferenceData } from '@/lib/ReferenceData';
import {
  fetchMemberProfile, signedPhotoUrl, unfreezeSubscription, staffSetMemberPassword,
} from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { localizedName, methodLabelKey } from '@/lib/display';
import { formatCurrency, formatDate, formatDateTime } from '@/lib/format';
import { pickCurrent, subscriptionDisplayStatus } from '@/lib/subscriptionStatus';
import { errorMessageKey } from '@/lib/errors';
import type { Plan, Subscription } from '@/lib/database.types';
import { StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Field, TextInput } from '@/components/ui/Field';
import { EmptyState, ErrorText, InlineLoading, PageHeader } from '@/components/ui/misc';
import { TableWrap, Th, Td, CardList, DataCard, CardHead, CardMeta, CardRow } from '@/components/dashboard/DataTable';
import { ChevronRight, Pencil, RefreshCw, Snowflake, ArrowUpRight, Check, QrCode, KeyRound, ICON_SM } from '@/components/ui/icons';
import { SubscriptionActionModal, type SubAction } from './SubscriptionActionModal';
import type { MessageKey } from '@/i18n/dictionary';

type Tab = 'subscriptions' | 'payments' | 'checkins' | 'freezes';

const MIN_PASSWORD_LENGTH = 8;

export function MemberProfile() {
  const { t, locale } = useI18n();
  const { id } = useParams();
  const navigate = useNavigate();
  const { branches, plans } = useReferenceData();

  // Member + subscriptions (with freezes) + payments + check-ins in ONE query.
  const profile = useAsync(() => fetchMemberProfile(id!), [id]);
  const photoPath = profile.data?.member.photo_url ?? null;
  const photo = useAsync(() => signedPhotoUrl(photoPath), [photoPath]);

  const [tab, setTab] = useState<Tab>('subscriptions');
  const [action, setAction] = useState<SubAction | null>(null);
  const [busy, setBusy] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);

  const planName = (planId: string) => localizedName(plans.find((p) => p.id === planId) as Plan, locale);
  const branchName = (bid: string | null) => { const b = branches.find((x) => x.id === bid); return b ? localizedName(b, locale) : '—'; };
  const reloadAll = () => profile.reload();

  if (profile.loading) return <InlineLoading />;
  if (profile.error || !profile.data) return <ErrorText error={profile.error ?? 'not found'} />;

  const m = profile.data.member;
  const subs = profile.data.subscriptions;
  const current = pickCurrent(subs);
  const status = subscriptionDisplayStatus(current);

  async function doUnfreeze() {
    if (!current) return;
    setBusy(true);
    try { await unfreezeSubscription(current.id); reloadAll(); } finally { setBusy(false); }
  }

  return (
    <div>
      <button
        onClick={() => navigate('/dashboard/members')}
        className="focus-ring mb-4 inline-flex min-h-[44px] items-center gap-1 rounded text-sm text-muted hover:text-text"
      >
        <ChevronRight {...ICON_SM} className="rotate-180 rtl:rotate-0" /> {t('members.title')}
      </button>

      <PageHeader
        eyebrow={m.member_code ?? undefined}
        title={m.full_name}
        action={
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <Button variant="secondary" onClick={() => navigate(`/card/${m.id}`)} className="flex-1 sm:flex-none"><QrCode {...ICON_SM} />{t('profile.card')}</Button>
            {m.user_id && (
              <Button variant="secondary" onClick={() => setPwOpen(true)} className="flex-1 sm:flex-none"><KeyRound {...ICON_SM} />{t('profile.set_password')}</Button>
            )}
            <Button variant="secondary" onClick={() => navigate(`/dashboard/members/${m.id}/edit`)} className="flex-1 sm:flex-none"><Pencil {...ICON_SM} />{t('profile.edit')}</Button>
          </div>
        }
      />

      {/* Identity row */}
      <div className="mb-10 flex flex-col gap-5 sm:flex-row sm:items-start md:mb-12">
        <div className="h-20 w-20 shrink-0 overflow-hidden border border-border-strong">
          {photo.data ? (
            <img src={photo.data} alt={m.full_name} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center font-display text-2xl text-faint">{m.full_name.charAt(0)}</div>
          )}
        </div>
        <div className="grid flex-1 grid-cols-2 gap-x-6 gap-y-3 pt-1 text-sm sm:gap-x-8 sm:gap-y-2 sm:grid-cols-4">
          <Meta label={t('members.col.status')}><StatusBadge status={status} /></Meta>
          <Meta label={t('members.col.phone')}><span dir="ltr" className="text-start text-text">{m.phone}</span></Meta>
          <Meta label={t('member.field.national_id')}><span dir="ltr" className="text-start text-text">{m.national_id ?? '—'}</span></Meta>
          <Meta label={t('members.col.branch')}><span className="text-text">{branchName(m.branch_id)}</span></Meta>
          {m.dob && <Meta label={t('member.field.dob')}><span className="text-text">{formatDate(m.dob, locale)}</span></Meta>}
          {m.emergency_contact_phone && <Meta label={t('profile.emergency')}><span dir="ltr" className="text-start text-text">{m.emergency_contact_phone}</span></Meta>}
        </div>
      </div>

      {/* Current subscription — lead panel */}
      <section className="mb-10 md:mb-12">
        <p className="eyebrow mb-4">{t('profile.current_sub')}</p>
        {current ? (
          <div className="flex flex-col items-stretch gap-6 border-t border-border pt-5 lg:flex-row lg:flex-wrap lg:items-end lg:justify-between">
            <div className="flex flex-wrap gap-x-10 gap-y-5 sm:gap-x-12">
              <div>
                <p className="text-xs text-muted">{t('profile.plan')}</p>
                <p className="font-display mt-1 text-xl text-text sm:text-2xl">{planName(current.plan_id)}</p>
              </div>
              <div>
                <p className="text-xs text-muted">{t('profile.end')}</p>
                <p className="font-display mt-1 text-xl text-text sm:text-2xl">{formatDate(current.end_date, locale)}</p>
              </div>
              {current.frozen_days_used > 0 && (
                <div>
                  <p className="text-xs text-muted">{t('profile.frozen_days')}</p>
                  <p className="font-display mt-1 text-xl text-sand sm:text-2xl">{current.frozen_days_used}</p>
                </div>
              )}
            </div>
            {/* Each action gets at least half a phone width; they stay inline
                from sm upwards exactly as before. */}
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
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
          <div className="flex flex-col items-start gap-4 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-muted">{t('profile.no_sub')}</p>
            <Button onClick={() => setAction('new')} className="w-full sm:w-auto">{t('sub.new')}</Button>
          </div>
        )}
      </section>

      {/* History tabs — four Arabic labels do not fit on a 390px line, so the
          strip scrolls inside itself rather than widening the page. */}
      <div className="mb-4 flex gap-4 overflow-x-auto border-b border-border sm:gap-6">
        {(['subscriptions', 'payments', 'checkins', 'freezes'] as Tab[]).map((tk) => (
          <button
            key={tk}
            onClick={() => setTab(tk)}
            className={`focus-ring -mb-px flex min-h-[48px] shrink-0 items-center whitespace-nowrap border-b-2 text-sm transition-colors ${tab === tk ? 'border-accent text-text' : 'border-transparent text-muted hover:text-text'}`}
          >
            {t(`profile.tab.${tk}` as MessageKey)}
          </button>
        ))}
      </div>

      {tab === 'subscriptions' && <SubsTable subs={subs} planName={planName} />}
      {tab === 'payments' && <PaymentsTable rows={profile.data.payments} />}
      {tab === 'checkins' && <CheckinsTable rows={profile.data.checkIns} branchName={branchName} />}
      {tab === 'freezes' && <FreezesTable rows={profile.data.freezes} />}

      {action && (
        <SubscriptionActionModal action={action} member={m} subscription={current} onClose={() => setAction(null)} onDone={reloadAll} />
      )}
      {pwOpen && <StaffPasswordModal memberId={m.id} onClose={() => setPwOpen(false)} />}
    </div>
  );
}

function StaffPasswordModal({ memberId, onClose }: { memberId: string; onClose: () => void }) {
  const { t } = useI18n();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit() {
    setError(null);
    // Server rule (migration 0014) is 8 characters — fail here, not on the RPC.
    if (password.length < MIN_PASSWORD_LENGTH) return setError(t('err.weak_password'));
    setBusy(true);
    try {
      await staffSetMemberPassword(memberId, password);
      setDone(true);
    } catch (err) {
      setError(t(errorMessageKey(err instanceof Error ? err.message : '')));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={t('profile.set_password')}>
      {done ? (
        <div className="space-y-4">
          <p className="border-s-2 border-good bg-surface-2 px-3 py-2 text-sm text-text">{t('profile.pw_done')}</p>
          <Button onClick={onClose}>{t('common.close')}</Button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted">{t('profile.pw_hint')}</p>
          <Field label={t('pwreq.new_password')} required>
            <TextInput type="text" dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
          </Field>
          <ErrorText error={error} />
          <div className="flex gap-2">
            <Button onClick={submit} loading={busy}>{t('common.save')}</Button>
            <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
          </div>
        </div>
      )}
    </Modal>
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

// Each history tab renders a table at md+ and the same rows as stacked cards
// below it (see components/dashboard/DataTable).
function SubsTable({ subs, planName }: { subs: Subscription[]; planName: (id: string) => string }) {
  const { t, locale } = useI18n();
  if (subs.length === 0) return <EmptyState messageKey="sub.empty" />;
  return (
    <>
      <TableWrap minWidth="min-w-[30rem]">
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
      </TableWrap>
      <CardList>
        {subs.map((s) => (
          <DataCard key={s.id}>
            <CardHead title={planName(s.plan_id)} aside={<StatusBadge status={subscriptionDisplayStatus(s)} />} />
            <CardMeta>
              <CardRow label={t('sub.col.start')}>{formatDate(s.start_date, locale)}</CardRow>
              <CardRow label={t('sub.col.end')}>{formatDate(s.end_date, locale)}</CardRow>
              <CardRow label={t('sub.col.price')}>{formatCurrency(s.price_paid, locale)}</CardRow>
            </CardMeta>
          </DataCard>
        ))}
      </CardList>
    </>
  );
}

function PaymentsTable({ rows }: { rows: import('@/lib/database.types').Payment[] }) {
  const { t, locale } = useI18n();
  if (rows.length === 0) return <EmptyState messageKey="pay.empty" />;
  return (
    <>
      <TableWrap minWidth="min-w-[30rem]">
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

function CheckinsTable({ rows, branchName }: { rows: import('@/lib/database.types').CheckIn[]; branchName: (id: string | null) => string }) {
  const { t, locale } = useI18n();
  if (rows.length === 0) return <EmptyState messageKey="checkin.empty" />;
  return (
    <>
      <TableWrap minWidth="min-w-[24rem]">
        <thead><tr className="border-b border-border"><Th>{t('checkin.col.date')}</Th><Th>{t('checkin.col.branch')}</Th></tr></thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.id} className="border-b border-border">
              <Td className="text-muted">{formatDateTime(c.checked_in_at, locale)}</Td>
              <Td className="text-text">{branchName(c.branch_id)}</Td>
            </tr>
          ))}
        </tbody>
      </TableWrap>
      <CardList>
        {rows.map((c) => (
          <DataCard key={c.id}>
            <CardHead
              title={formatDateTime(c.checked_in_at, locale)}
              aside={<span className="text-sm text-muted">{branchName(c.branch_id)}</span>}
            />
          </DataCard>
        ))}
      </CardList>
    </>
  );
}

function FreezesTable({ rows }: { rows: import('@/lib/database.types').Freeze[] }) {
  const { t, locale } = useI18n();
  if (rows.length === 0) return <EmptyState messageKey="freeze.empty" />;
  return (
    <>
      <TableWrap minWidth="min-w-[24rem]">
        <thead><tr className="border-b border-border"><Th>{t('freeze.col.period')}</Th><Th>{t('freeze.col.days')}</Th></tr></thead>
        <tbody>
          {rows.map((f) => (
            <tr key={f.id} className="border-b border-border">
              <Td className="text-muted">{formatDate(f.start_date, locale)} — {formatDate(f.end_date, locale)}</Td>
              <Td className="text-text">{f.days}</Td>
            </tr>
          ))}
        </tbody>
      </TableWrap>
      <CardList>
        {rows.map((f) => (
          <DataCard key={f.id}>
            <CardHead
              title={`${formatDate(f.start_date, locale)} — ${formatDate(f.end_date, locale)}`}
              aside={<span className="text-sm text-muted">{f.days} {t('common.days')}</span>}
            />
          </DataCard>
        ))}
      </CardList>
    </>
  );
}
