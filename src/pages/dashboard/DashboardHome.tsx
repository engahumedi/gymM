import { Link } from 'react-router-dom';
import { useI18n } from '@/i18n/I18nProvider';
import { useAuth } from '@/auth/AuthProvider';
import {
  fetchMemberCounts, fetchMembersPage, fetchPendingFreezeRequests, approveFreezeRequest, rejectFreezeRequest,
  fetchPendingPasswordRequests, approvePasswordChange, rejectPasswordChange,
  type MemberOverview,
} from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import type { MemberDisplayStatus } from '@/lib/database.types';
import { PageHeader, InlineLoading } from '@/components/ui/misc';
import { Button } from '@/components/ui/Button';
import { ArrowUpRight, Snowflake, KeyRound, ICON_SM } from '@/components/ui/icons';
import { useState } from 'react';
import type { MessageKey } from '@/i18n/dictionary';

const ALERT_LIMIT = 5;

export function DashboardHome() {
  const { t } = useI18n();
  const { profile } = useAuth();

  // Counts come back as Content-Range headers (no rows), and each alert list is
  // capped at five rows — the dashboard never downloads the member table.
  const { data, loading } = useAsync(async () => {
    const [counts, expiring, pending, expired] = await Promise.all([
      fetchMemberCounts(),
      fetchMembersPage({ status: 'expiring', limit: ALERT_LIMIT }),
      fetchMembersPage({ status: 'pending', limit: ALERT_LIMIT }),
      fetchMembersPage({ status: 'expired', limit: ALERT_LIMIT }),
    ]);
    return { counts, expiring, pending, expired };
  }, []);

  const counts = data?.counts ?? {};

  return (
    <div>
      <PageHeader
        eyebrow={t('dash.eyebrow')}
        title={`${t('dash.welcome')}${t('common.list_sep')} ${profile?.full_name ?? ''}`}
      />

      {loading || !data ? (
        <InlineLoading />
      ) : (
        <>
          {/* Lead stat — one big number, two quieter ones alongside (asymmetric) */}
          <div className="mb-14 flex flex-col gap-8 sm:flex-row sm:items-end sm:gap-16">
            <div>
              <p className="eyebrow mb-2">{t('dash.kpi.members')}</p>
              <p className="font-display text-7xl leading-none text-text">{counts.total ?? 0}</p>
            </div>
            <div className="flex gap-12 pb-2">
              <Stat label={t('dash.kpi.expiring')} value={counts.expiring ?? 0} tone="text-warn" />
              <Stat label={t('dash.kpi.pending')} value={counts.pending ?? 0} tone="text-text" />
            </div>
          </div>

          <PasswordRequestsPanel />
          <FreezeRequestsPanel />

          {/* Alerts — uneven split, hairline lists (no boxes) */}
          <div className="grid gap-x-16 gap-y-10 md:grid-cols-[1.4fr_1fr]">
            <AlertList titleKey="dash.alerts.expiring" status="expiring" members={data.expiring.rows} total={data.expiring.total} />
            <AlertList titleKey="dash.alerts.pending" status="pending" members={data.pending.rows} total={data.pending.total} />
            <AlertList titleKey="dash.alerts.expired" status="expired" members={data.expired.rows} total={data.expired.total} />
          </div>
        </>
      )}
    </div>
  );
}

function PasswordRequestsPanel() {
  const { t } = useI18n();
  const { data, loading, reload } = useAsync(fetchPendingPasswordRequests, []);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function act(id: string, kind: 'approve' | 'reject') {
    setBusyId(id);
    try {
      if (kind === 'approve') await approvePasswordChange(id);
      else await rejectPasswordChange(id);
      reload();
    } finally { setBusyId(null); }
  }

  if (loading || (data ?? []).length === 0) return null;
  return (
    <section className="mb-12">
      <h3 className="mb-1 flex items-center gap-2 border-b border-border pb-3 text-sm font-semibold text-text">
        <KeyRound {...ICON_SM} className="text-sand" />
        {t('pwreq.queue')}
        <span className="text-faint">{(data ?? []).length}</span>
      </h3>
      <ul>
        {(data ?? []).map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-border py-3 text-sm">
            <div>
              <span className="text-text">{r.requested_name ?? r.requested_email}</span>
              <span dir="ltr" className="ms-3 text-faint">{r.requested_email}</span>
            </div>
            <div className="flex items-center gap-2">
              <Button loading={busyId === r.id} onClick={() => act(r.id, 'approve')}>{t('pwreq.approve')}</Button>
              <Button variant="secondary" onClick={() => act(r.id, 'reject')}>{t('pwreq.reject')}</Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function FreezeRequestsPanel() {
  const { t } = useI18n();
  const { data, loading, reload } = useAsync(fetchPendingFreezeRequests, []);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function act(id: string, kind: 'approve' | 'reject') {
    setBusyId(id);
    try {
      if (kind === 'approve') await approveFreezeRequest(id);
      else await rejectFreezeRequest(id);
      reload();
    } finally { setBusyId(null); }
  }

  if (loading || (data ?? []).length === 0) return null;
  return (
    <section className="mb-12">
      <h3 className="mb-1 flex items-center gap-2 border-b border-border pb-3 text-sm font-semibold text-text">
        <Snowflake {...ICON_SM} className="text-sand" />
        {t('freezereq.queue')}
        <span className="text-faint">{(data ?? []).length}</span>
      </h3>
      <ul>
        {(data ?? []).map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-border py-3 text-sm">
            <div>
              <span className="text-text">{r.members?.full_name ?? '—'}</span>
              <span className="ms-3 text-muted">{r.days} {t('freezereq.days_short')}</span>
              {r.note && <span className="ms-3 text-faint">· {r.note}</span>}
            </div>
            <div className="flex items-center gap-2">
              <Button loading={busyId === r.id} onClick={() => act(r.id, 'approve')}>{t('freezereq.approve')}</Button>
              <Button variant="secondary" onClick={() => act(r.id, 'reject')}>{t('freezereq.reject')}</Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div>
      <p className="eyebrow mb-2">{label}</p>
      <p className={`font-display text-3xl leading-none ${tone}`}>{value}</p>
    </div>
  );
}

function AlertList({
  titleKey,
  status,
  members,
  total,
}: {
  titleKey: MessageKey;
  status: MemberDisplayStatus;
  members: MemberOverview[];
  total: number;
}) {
  const { t } = useI18n();
  const dot: Record<string, string> = { expiring: 'bg-warn', pending: 'bg-text', expired: 'bg-accent' };
  return (
    <section>
      <h3 className="mb-1 flex items-center gap-2 border-b border-border pb-3 text-sm font-semibold text-text">
        <span className={`inline-block h-1.5 w-1.5 rounded-full ${dot[status] ?? 'bg-muted'}`} />
        {t(titleKey)}
        <span className="text-faint">{total}</span>
      </h3>
      {members.length === 0 ? (
        <p className="py-4 text-sm text-faint">{t('dash.alerts.none')}</p>
      ) : (
        <ul>
          {members.map((m) => (
            <li key={m.id}>
              <Link to={`/dashboard/members/${m.id}`} className="group flex items-center justify-between border-b border-border py-2.5 text-sm">
                <span className="text-text">{m.full_name}</span>
                <span dir="ltr" className="flex items-center gap-2 text-faint">
                  {m.phone}
                  <ArrowUpRight {...ICON_SM} className="opacity-0 transition-opacity group-hover:opacity-100" />
                </span>
              </Link>
            </li>
          ))}
          {total > members.length && <li className="py-2.5 text-xs text-faint">+{total - members.length}</li>}
        </ul>
      )}
    </section>
  );
}
