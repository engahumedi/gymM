import { Link } from 'react-router-dom';
import { useI18n } from '@/i18n/I18nProvider';
import { useAuth } from '@/auth/AuthProvider';
import { fetchMembers, type MemberListItem } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { pickCurrent, subscriptionDisplayStatus, type DisplayStatus } from '@/lib/subscriptionStatus';
import { Card, InlineLoading, PageHeader } from '@/components/ui/misc';
import { StatusBadge } from '@/components/ui/Badge';
import type { MessageKey } from '@/i18n/dictionary';

export function DashboardHome() {
  const { t } = useI18n();
  const { profile } = useAuth();
  const { data, loading } = useAsync(fetchMembers, []);

  const members = data ?? [];
  const withStatus = members.map((m) => ({ m, status: subscriptionDisplayStatus(pickCurrent(m.subscriptions ?? [])) }));
  const count = (s: DisplayStatus) => withStatus.filter((x) => x.status === s).length;

  const kpis: { key: MessageKey; value: number; tone: string }[] = [
    { key: 'dash.kpi.members', value: members.length, tone: 'text-ink' },
    { key: 'dash.kpi.expiring', value: count('expiring'), tone: 'text-amber-600' },
    { key: 'dash.kpi.pending', value: count('pending'), tone: 'text-slate-600' },
  ];

  const listFor = (s: DisplayStatus) => withStatus.filter((x) => x.status === s).map((x) => x.m);

  return (
    <div>
      <PageHeader title={`${t('dash.welcome')}، ${profile?.full_name ?? ''}`} />
      {loading ? (
        <InlineLoading />
      ) : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-3">
            {kpis.map((k) => (
              <Card key={k.key}>
                <p className="text-sm text-slate-500">{t(k.key)}</p>
                <p className={`mt-2 text-3xl font-extrabold ${k.tone}`}>{k.value}</p>
              </Card>
            ))}
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <AlertList titleKey="dash.alerts.expiring" status="expiring" members={listFor('expiring')} />
            <AlertList titleKey="dash.alerts.pending" status="pending" members={listFor('pending')} />
            <AlertList titleKey="dash.alerts.expired" status="expired" members={listFor('expired')} />
          </div>
        </>
      )}
    </div>
  );
}

function AlertList({
  titleKey,
  status,
  members,
}: {
  titleKey: MessageKey;
  status: DisplayStatus;
  members: MemberListItem[];
}) {
  const { t } = useI18n();
  return (
    <Card>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-600">{t(titleKey)}</h3>
        <StatusBadge status={status} />
      </div>
      {members.length === 0 ? (
        <p className="py-3 text-sm text-slate-400">{t('dash.alerts.none')}</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {members.slice(0, 8).map((m) => (
            <li key={m.id}>
              <Link
                to={`/dashboard/members/${m.id}`}
                className="flex items-center justify-between py-2 text-sm hover:text-brand"
              >
                <span className="font-medium">{m.full_name}</span>
                <span dir="ltr" className="text-xs text-slate-400">{m.phone}</span>
              </Link>
            </li>
          ))}
          {members.length > 8 && (
            <li className="pt-2 text-xs text-slate-400">+{members.length - 8}</li>
          )}
        </ul>
      )}
    </Card>
  );
}
