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
import { InlineLoading, PageHeader, EmptyState } from '@/components/ui/misc';
import { SelectInput } from '@/components/ui/Field';
import { Download } from '@/components/ui/icons';
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

  const kpis: { key: MessageKey; value: string; tone: string; lead?: boolean }[] = [
    { key: 'analytics.kpi.revenue_month', value: formatCurrency(data.kpis.revenueThisMonth, locale), tone: 'text-accent', lead: true },
    { key: 'analytics.kpi.active', value: String(data.kpis.active), tone: 'text-text' },
    { key: 'analytics.kpi.new_month', value: String(data.kpis.newThisMonth), tone: 'text-text' },
    { key: 'analytics.kpi.expiring', value: String(data.kpis.expiring), tone: 'text-warn' },
    { key: 'analytics.kpi.renewal_rate', value: `${data.kpis.renewalRate}%`, tone: 'text-text' },
    { key: 'analytics.kpi.churn_rate', value: `${data.kpis.churnRate}%`, tone: 'text-text' },
  ];

  return (
    <div>
      <PageHeader
        eyebrow={t('analytics.eyebrow')}
        title={t('analytics.title')}
        action={
          <div className="flex gap-2">
            <SelectInput value={rangeMonths} onChange={(e) => setRangeMonths(Number(e.target.value))} className="w-auto">
              <option value={3}>{t('analytics.range.3')}</option>
              <option value={6}>{t('analytics.range.6')}</option>
              <option value={12}>{t('analytics.range.12')}</option>
            </SelectInput>
            <SelectInput value={branchId} onChange={(e) => setBranchId(e.target.value)} className="w-auto">
              <option value="">{t('common.all')}</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{localizedName(b, locale)}</option>)}
            </SelectInput>
          </div>
        }
      />

      {/* KPI strip — revenue leads, the rest are quieter, hairline-divided */}
      <div className="mb-14 flex flex-wrap items-end gap-x-10 gap-y-6">
        {kpis.map((k) => (
          <div key={k.key} className={k.lead ? 'pe-10 border-e border-border' : ''}>
            <p className="eyebrow mb-2">{t(k.key)}</p>
            <p className={`font-display leading-none ${k.lead ? 'text-4xl' : 'text-2xl'} ${k.tone}`}>{k.value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-12 lg:grid-cols-2">
        <ChartPanel titleKey="analytics.chart.revenue" onExport={() => exportCsv('revenue', data.revenueSeries as Record<string, string | number>[])}>
          <LineChart data={data.revenueSeries} margin={CHART_MARGIN}>
            <CartesianGrid strokeDasharray="2 4" stroke={GRID} />
            <XAxis dataKey="month" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} />
            <YAxis tick={AXIS} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={TOOLTIP} cursor={{ stroke: GRID }} />
            <Legend wrapperStyle={{ fontSize: 11, color: '#8b8b82' }} />
            <Line type="monotone" dataKey="total" name={t('analytics.total')} stroke="#c8342f" strokeWidth={2} dot={false} />
            {data.shownBranches.map((b, i) => (
              <Line key={b.id} type="monotone" dataKey={b.id} name={localizedName(b, locale)} stroke={BRANCH_COLORS[i % BRANCH_COLORS.length]} strokeWidth={1.5} dot={false} />
            ))}
          </LineChart>
        </ChartPanel>

        <ChartPanel titleKey="analytics.chart.growth" onExport={() => exportCsv('member-growth', data.growth)}>
          <AreaChart data={data.growth} margin={CHART_MARGIN}>
            <CartesianGrid strokeDasharray="2 4" stroke={GRID} />
            <XAxis dataKey="month" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} />
            <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
            <Tooltip contentStyle={TOOLTIP} cursor={{ stroke: GRID }} />
            <Area type="monotone" dataKey="count" name={t('analytics.members')} stroke="#cbb994" strokeWidth={1.5} fill="#cbb994" fillOpacity={0.08} />
          </AreaChart>
        </ChartPanel>

        <ChartPanel titleKey="analytics.chart.plans" onExport={() => exportCsv('plan-popularity', data.planPopularity)}>
          <BarChart data={data.planPopularity} margin={CHART_MARGIN}>
            <CartesianGrid strokeDasharray="2 4" stroke={GRID} vertical={false} />
            <XAxis dataKey="plan" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} />
            <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
            <Tooltip contentStyle={TOOLTIP} cursor={{ fill: '#16191d' }} />
            <Bar dataKey="count" name={t('analytics.members')} fill="#c8342f" radius={[2, 2, 0, 0]} />
          </BarChart>
        </ChartPanel>

        <section>
          <ChartHead titleKey="analytics.chart.heatmap" />
          {data.grid.flat().every((v) => v === 0) ? <EmptyState messageKey="analytics.empty" /> : <Heatmap grid={data.grid} />}
        </section>
      </div>
    </div>
  );
}

const CHART_MARGIN = { top: 8, right: 8, left: -14, bottom: 0 };
const GRID = '#262a31';
const AXIS = { fill: '#8b8b82', fontSize: 11 } as const;
const TOOLTIP = { background: '#16191d', border: '1px solid #262a31', borderRadius: 4, color: '#ece7df', fontSize: 12 } as const;

function ChartHead({ titleKey, onExport }: { titleKey: MessageKey; onExport?: () => void }) {
  const { t } = useI18n();
  return (
    <div className="mb-4 flex items-center justify-between border-b border-border pb-3">
      <h3 className="text-sm font-semibold text-text">{t(titleKey)}</h3>
      {onExport && (
        <button onClick={onExport} className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted transition-colors hover:text-text">
          <Download size={14} strokeWidth={1.5} /> {t('analytics.export')}
        </button>
      )}
    </div>
  );
}

function ChartPanel({ titleKey, onExport, children }: { titleKey: MessageKey; onExport?: () => void; children: React.ReactElement }) {
  return (
    <section>
      <ChartHead titleKey={titleKey} onExport={onExport} />
      <div dir="ltr" className="h-60">
        <ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer>
      </div>
    </section>
  );
}
