import { useI18n } from '@/i18n/I18nProvider';
import { useAuth } from '@/auth/AuthProvider';
import { fetchMembers } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { pickCurrent, subscriptionDisplayStatus } from '@/lib/subscriptionStatus';
import { Card, InlineLoading, PageHeader } from '@/components/ui/misc';
import type { MessageKey } from '@/i18n/dictionary';

export function DashboardHome() {
  const { t } = useI18n();
  const { profile } = useAuth();
  const { data, loading } = useAsync(fetchMembers, []);

  const members = data ?? [];
  const statuses = members.map((m) => subscriptionDisplayStatus(pickCurrent(m.subscriptions ?? [])));
  const kpis: { key: MessageKey; value: number; tone: string }[] = [
    { key: 'dash.kpi.members', value: members.length, tone: 'text-ink' },
    { key: 'dash.kpi.expiring', value: statuses.filter((s) => s === 'expiring').length, tone: 'text-amber-600' },
    { key: 'dash.kpi.pending', value: statuses.filter((s) => s === 'pending').length, tone: 'text-slate-600' },
  ];

  return (
    <div>
      <PageHeader title={`${t('dash.welcome')}، ${profile?.full_name ?? ''}`} />
      {loading ? (
        <InlineLoading />
      ) : (
        <div className="grid gap-4 sm:grid-cols-3">
          {kpis.map((k) => (
            <Card key={k.key}>
              <p className="text-sm text-slate-500">{t(k.key)}</p>
              <p className={`mt-2 text-3xl font-extrabold ${k.tone}`}>{k.value}</p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
