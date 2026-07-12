import { Link } from 'react-router-dom';
import { useI18n } from '@/i18n/I18nProvider';
import { useAuth } from '@/auth/AuthProvider';
import { fetchMembers, fetchPendingFreezeRequests, approveFreezeRequest, rejectFreezeRequest, type MemberListItem } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { pickCurrent, subscriptionDisplayStatus, type DisplayStatus } from '@/lib/subscriptionStatus';
import { PageHeader, InlineLoading } from '@/components/ui/misc';
import { Button } from '@/components/ui/Button';
import { ArrowUpRight, Snowflake, ICON_SM } from '@/components/ui/icons';
import { useState } from 'react';
import type { MessageKey } from '@/i18n/dictionary';

export function DashboardHome() {
  const { t } = useI18n();
  const { profile } = useAuth();
  const { data, loading } = useAsync(fetchMembers, []);

  const members = data ?? [];
  const withStatus = members.map((m) => ({ m, status: subscriptionDisplayStatus(pickCurrent(m.subscriptions ?? [])) }));
  const count = (s: DisplayStatus) => withStatus.filter((x) => x.status === s).length;
  const listFor = (s: DisplayStatus) => withStatus.filter((x) => x.status === s).map((x) => x.m);

  return (
    <div>
      <PageHeader eyebrow={t('dash.eyebrow')} title={`${t('dash.welcome')}، ${profile?.full_name ?? ''}`} />

      {loading ? (
        <InlineLoading />
      ) : (
        <>
          {/* Lead stat — one big number, two quieter ones alongside (asymmetric) */}
          <div className="mb-14 flex flex-col gap-8 sm:flex-row sm:items-end sm:gap-16">
            <div>
              <p className="eyebrow mb-2">{t('dash.kpi.members')}</p>
              <p className="font-display text-7xl leading-none text-text">{members.length}</p>
            </div>
            <div className="flex gap-12 pb-2">
              <Stat label={t('dash.kpi.expiring')} value={count('expiring')} tone="text-warn" />
              <Stat label={t('dash.kpi.pending')} value={count('pending')} tone="text-text" />
            </div>
          </div>

          <FreezeRequestsPanel />

          {/* Alerts — uneven split, hairline lists (no boxes) */}
          <div className="grid gap-x-16 gap-y-10 md:grid-cols-[1.4fr_1fr]">
            <AlertList titleKey="dash.alerts.expiring" status="expiring" members={listFor('expiring')} />
            <AlertList titleKey="dash.alerts.pending" status="pending" members={listFor('pending')} />
            <AlertList titleKey="dash.alerts.expired" status="expired" members={listFor('expired')} />
          </div>
        </>
      )}
    </div>
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

function AlertList({ titleKey, status, members }: { titleKey: MessageKey; status: DisplayStatus; members: MemberListItem[] }) {
  const { t } = useI18n();
  const dot: Record<string, string> = { expiring: 'bg-warn', pending: 'bg-text', expired: 'bg-accent' };
  return (
    <section>
      <h3 className="mb-1 flex items-center gap-2 border-b border-border pb-3 text-sm font-semibold text-text">
        <span className={`inline-block h-1.5 w-1.5 rounded-full ${dot[status] ?? 'bg-muted'}`} />
        {t(titleKey)}
        <span className="text-faint">{members.length}</span>
      </h3>
      {members.length === 0 ? (
        <p className="py-4 text-sm text-faint">{t('dash.alerts.none')}</p>
      ) : (
        <ul>
          {members.slice(0, 7).map((m) => (
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
          {members.length > 7 && <li className="py-2.5 text-xs text-faint">+{members.length - 7}</li>}
        </ul>
      )}
    </section>
  );
}
