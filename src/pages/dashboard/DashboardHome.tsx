import { Link } from 'react-router-dom';
import { useI18n } from '@/i18n/I18nProvider';
import { useAuth } from '@/auth/AuthProvider';
import { fetchMembers, type MemberListItem } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { pickCurrent, subscriptionDisplayStatus, type DisplayStatus } from '@/lib/subscriptionStatus';
import { PageHeader, InlineLoading } from '@/components/ui/misc';
import { ArrowUpRight, ICON_SM } from '@/components/ui/icons';
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
