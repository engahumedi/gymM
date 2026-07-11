import { useMemo, useState } from 'react';
import {
  ResponsiveContainer, LineChart, Line, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { useI18n } from '@/i18n/I18nProvider';
import { useReferenceData } from '@/lib/ReferenceData';
import { fetchAllCheckIns, fetchAllPayments, fetchMembers } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { localizedName } from '@/lib/display';
import { formatCurrency } from '@/lib/format';
import { monthKey, monthsBetween, riyadhDowHour, inRange } from '@/lib/analytics';
import { pickCurrent, subscriptionDisplayStatus } from '@/lib/subscriptionStatus';
import { exportCsv } from '@/lib/csv';
import { Card, InlineLoading, PageHeader, EmptyState } from '@/components/ui/misc';
import { Button } from '@/components/ui/Button';
import { SelectInput } from '@/components/ui/Field';
import { Heatmap } from './Heatmap';
import type { MessageKey } from '@/i18n/dictionary';

const BRANCH_COLORS = ['#2563eb', '#16a34a', '#f59e0b', '#7c3aed'];

export function Analytics() {
  const { t, locale } = useI18n();
  const { branches, plans } = useReferenceData();
  const members = useAsync(fetchMembers, []);
  const payments = useAsync(fetchAllPayments, []);
  const checkins = useAsync(fetchAllCheckIns, []);

  const [rangeMonths, setRangeMonths] = useState(6);
  const [branchId, setBranchId] = useState('');

  const to = useMemo(() => new Date(), []);
  const from = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - (rangeMonths - 1));
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [rangeMonths]);

  const loading = members.loading || payments.loading || checkins.loading;

  const data = useMemo(() => {
    const M = (members.data ?? []).filter((m) => !branchId || m.branch_id === branchId);
    const P = (payments.data ?? []).filter((p) => !branchId || p.branch_id === branchId);
    const C = (checkins.data ?? []).filter((c) => !branchId || c.branch_id === branchId);
    const thisMonth = monthKey(new Date());
    const shownBranches = branchId ? branches.filter((b) => b.id === branchId) : branches;

    // KPIs
    const statuses = M.map((m) => subscriptionDisplayStatus(pickCurrent(m.subscriptions ?? [])));
    const active = statuses.filter((s) => s === 'active' || s === 'expiring').length;
    const expiring = statuses.filter((s) => s === 'expiring').length;
    const newThisMonth = M.filter((m) => monthKey(new Date(m.created_at)) === thisMonth).length;
    const revenueThisMonth = P.filter((p) => monthKey(new Date(p.created_at)) === thisMonth)
      .reduce((s, p) => s + Number(p.amount), 0);
    const withSub = M.filter((m) => (m.subscriptions ?? []).some((s) => s.status !== 'pending'));
    const renewed = withSub.filter((m) => (m.subscriptions ?? []).filter((s) => s.status !== 'pending').length > 1);
    const renewalRate = withSub.length ? Math.round((renewed.length / withSub.length) * 100) : 0;
    const churned = M.filter((m) => subscriptionDisplayStatus(pickCurrent(m.subscriptions ?? [])) === 'expired');
    const churnRate = withSub.length ? Math.round((churned.length / withSub.length) * 100) : 0;

    // Revenue over time (per branch + total)
    const months = monthsBetween(from, to);
    const revenueSeries = months.map((mk) => {
      const row: Record<string, string | number> = { month: mk, total: 0 };
      for (const b of shownBranches) row[b.id] = 0;
      for (const p of P) {
        if (monthKey(new Date(p.created_at)) !== mk) continue;
        row.total = Number(row.total) + Number(p.amount);
        if (p.branch_id && row[p.branch_id] !== undefined) row[p.branch_id] = Number(row[p.branch_id]) + Number(p.amount);
      }
      return row;
    });

    // Member growth (cumulative)
    const growth = months.map((mk) => {
      const count = M.filter((m) => monthKey(new Date(m.created_at)) <= mk).length;
      return { month: mk, count };
    });

    // Plan popularity (current subscription per member)
    const planCounts = new Map<string, number>();
    for (const m of M) {
      const cur = pickCurrent(m.subscriptions ?? []);
      if (cur) planCounts.set(cur.plan_id, (planCounts.get(cur.plan_id) ?? 0) + 1);
    }
    const planPopularity = plans.map((p) => ({ plan: localizedName(p, locale), count: planCounts.get(p.id) ?? 0 }));

    // Heatmap 7×24 within range
    const grid: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
    for (const c of C) {
      if (!inRange(c.checked_in_at, from, to)) continue;
      const { dow, hour } = riyadhDowHour(c.checked_in_at);
      grid[dow][hour] += 1;
    }

    return {
      kpis: { active, newThisMonth, revenueThisMonth, expiring, renewalRate, churnRate },
      revenueSeries, growth, planPopularity, grid, shownBranches,
    };
  }, [members.data, payments.data, checkins.data, branchId, from, to, branches, plans, locale]);

  if (loading) return <InlineLoading />;

  const kpiCards: { key: MessageKey; value: string; tone: string }[] = [
    { key: 'analytics.kpi.active', value: String(data.kpis.active), tone: 'text-green-600' },
    { key: 'analytics.kpi.new_month', value: String(data.kpis.newThisMonth), tone: 'text-ink' },
    { key: 'analytics.kpi.revenue_month', value: formatCurrency(data.kpis.revenueThisMonth, locale), tone: 'text-brand' },
    { key: 'analytics.kpi.expiring', value: String(data.kpis.expiring), tone: 'text-amber-600' },
    { key: 'analytics.kpi.renewal_rate', value: `${data.kpis.renewalRate}%`, tone: 'text-blue-600' },
    { key: 'analytics.kpi.churn_rate', value: `${data.kpis.churnRate}%`, tone: 'text-red-600' },
  ];

  return (
    <div>
      <PageHeader title={t('analytics.title')} />

      {/* Filters */}
      <div className="mb-5 flex flex-wrap gap-2">
        <SelectInput value={rangeMonths} onChange={(e) => setRangeMonths(Number(e.target.value))} className="w-auto">
          <option value={3}>{t('analytics.range.3')}</option>
          <option value={6}>{t('analytics.range.6')}</option>
          <option value={12}>{t('analytics.range.12')}</option>
        </SelectInput>
        <SelectInput value={branchId} onChange={(e) => setBranchId(e.target.value)} className="w-auto">
          <option value="">{t('analytics.filter.branch')}: {t('common.all')}</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>{localizedName(b, locale)}</option>
          ))}
        </SelectInput>
      </div>

      {/* KPI cards */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {kpiCards.map((k) => (
          <Card key={k.key}>
            <p className="text-sm text-slate-500">{t(k.key)}</p>
            <p className={`mt-1 text-2xl font-extrabold ${k.tone}`}>{k.value}</p>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Revenue over time */}
        <Card>
          <ChartHead
            titleKey="analytics.chart.revenue"
            onExport={() => exportCsv('revenue', data.revenueSeries as Record<string, string | number>[])}
          />
          <div dir="ltr" className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.revenueSeries} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                <XAxis dataKey="month" fontSize={11} />
                <YAxis fontSize={11} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="total" name={t('analytics.total')} stroke="#e11d2a" strokeWidth={2} dot={false} />
                {data.shownBranches.map((b, i) => (
                  <Line key={b.id} type="monotone" dataKey={b.id} name={localizedName(b, locale)}
                    stroke={BRANCH_COLORS[i % BRANCH_COLORS.length]} strokeWidth={1.5} dot={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Member growth */}
        <Card>
          <ChartHead
            titleKey="analytics.chart.growth"
            onExport={() => exportCsv('member-growth', data.growth)}
          />
          <div dir="ltr" className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.growth} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                <XAxis dataKey="month" fontSize={11} />
                <YAxis fontSize={11} allowDecimals={false} />
                <Tooltip />
                <Area type="monotone" dataKey="count" name={t('analytics.members')} stroke="#2563eb" fill="#93c5fd" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Plan popularity */}
        <Card>
          <ChartHead
            titleKey="analytics.chart.plans"
            onExport={() => exportCsv('plan-popularity', data.planPopularity)}
          />
          <div dir="ltr" className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.planPopularity} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                <XAxis dataKey="plan" fontSize={10} />
                <YAxis fontSize={11} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" name={t('analytics.members')} fill="#e11d2a" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Peak hours heatmap */}
        <Card>
          <ChartHead titleKey="analytics.chart.heatmap" />
          {data.grid.flat().every((v) => v === 0) ? (
            <EmptyState messageKey="analytics.empty" />
          ) : (
            <Heatmap grid={data.grid} />
          )}
        </Card>
      </div>
    </div>
  );
}

function ChartHead({ titleKey, onExport }: { titleKey: MessageKey; onExport?: () => void }) {
  const { t } = useI18n();
  return (
    <div className="mb-3 flex items-center justify-between">
      <h3 className="text-sm font-semibold text-slate-600">{t(titleKey)}</h3>
      {onExport && (
        <Button variant="ghost" onClick={onExport} className="!px-2 !py-1 text-xs">
          {t('analytics.export')}
        </Button>
      )}
    </div>
  );
}
