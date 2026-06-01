import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Users, TrendingUp, TrendingDown, Clock, AlertTriangle, Activity,
  DollarSign, Building2, UserCheck, RefreshCw
} from 'lucide-react';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { reportsApi } from '@/api/reports';
import { useBranch } from '@/context/BranchContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency, formatDate } from '@/lib/utils';
import { DashboardData } from '@/types';

const BRANCH_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];
const STATUS_COLORS: Record<string, string> = {
  active: '#10B981',
  expired: '#EF4444',
  frozen: '#3B82F6',
  cancelled: '#6B7280',
};

const STATUS_LABELS: Record<string, string> = {
  active: 'نشط',
  expired: 'منتهي',
  frozen: 'مجمد',
  cancelled: 'ملغى',
};

function KPICard({ title, value, subtitle, icon: Icon, trend, color = 'blue' }: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  trend?: number;
  color?: string;
}) {
  const colorMap: Record<string, string> = {
    blue: 'text-blue-400 bg-blue-400/10',
    green: 'text-green-400 bg-green-400/10',
    yellow: 'text-yellow-400 bg-yellow-400/10',
    red: 'text-red-400 bg-red-400/10',
    purple: 'text-purple-400 bg-purple-400/10',
  };
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold mt-1">{value}</p>
            {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
          </div>
          <div className={`p-2.5 rounded-lg ${colorMap[color] || colorMap.blue}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
        {trend !== undefined && (
          <div className="flex items-center gap-1 mt-3 text-sm">
            {trend >= 0 ? (
              <><TrendingUp className="h-4 w-4 text-green-400" /><span className="text-green-400">+{trend.toFixed(1)}%</span></>
            ) : (
              <><TrendingDown className="h-4 w-4 text-red-400" /><span className="text-red-400">{trend.toFixed(1)}%</span></>
            )}
            <span className="text-muted-foreground">مقارنة بالشهر الماضي</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AlertsPanel({ alerts }: { alerts: DashboardData['alerts'] }) {
  const colorMap: Record<string, string> = {
    red: 'border-red-500/30 bg-red-500/10 text-red-400',
    orange: 'border-orange-500/30 bg-orange-500/10 text-orange-400',
    yellow: 'border-yellow-500/30 bg-yellow-500/10 text-yellow-400',
    green: 'border-green-500/30 bg-green-500/10 text-green-400',
    blue: 'border-blue-500/30 bg-blue-500/10 text-blue-400',
  };
  const icons: Record<string, string> = { red: '🔴', orange: '🟠', yellow: '🟡', green: '🟢', blue: '🔵' };

  if (alerts.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-yellow-400" />
          التنبيهات
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {alerts.map((alert, i) => (
          <div key={i} className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${colorMap[alert.level] || colorMap.blue}`}>
            <span>{icons[alert.level]}</span>
            <span>{alert.message}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function Dashboard() {
  const { selectedBranch } = useBranch();

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', selectedBranch?.id],
    queryFn: () => reportsApi.getDashboard(selectedBranch?.id),
    refetchInterval: 60000,
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array(4).fill(null).map((_, i) => <Skeleton key={i} className="h-32" />)}
        </div>
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!data) return null;

  const { kpis, revenueChart, statusDist, dailyCheckins, topPlans, branchComparison,
          revenueByBranch, dailyRevByBranch, alerts, heatmap, recentActivity } = data;

  // Process daily revenue by branch for line chart
  const allDays = [...new Set(dailyRevByBranch.map(d => d.day))].sort();
  const branchNames = [...new Set(dailyRevByBranch.map(d => d.branch_name))];
  const dailyRevChartData = allDays.map(day => {
    const entry: Record<string, unknown> = { day: day.slice(5) }; // MM-DD
    for (const branch of branchNames) {
      const found = dailyRevByBranch.find(d => d.day === day && d.branch_name === branch);
      entry[branch] = found?.revenue || 0;
    }
    return entry;
  });

  // Process monthly revenue by branch for stacked bar
  const allMonths = [...new Set(revenueByBranch.map(d => d.month))].sort();
  const monthlyBarData = allMonths.map(month => {
    const entry: Record<string, unknown> = { month };
    for (const branch of branchNames) {
      const found = revenueByBranch.find(d => d.month === month && d.branch_name === branch);
      entry[branch] = found?.revenue || 0;
    }
    return entry;
  });

  // Heatmap data
  const days = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  const maxHeatmapVal = Math.max(...heatmap.map(h => h.count), 1);

  // Generate dynamic insights
  const insights: string[] = [];
  if (kpis.revenueChange > 10) insights.push(`الإيرادات ارتفعت ${kpis.revenueChange.toFixed(0)}% هذا الشهر`);
  if (kpis.revenueChange < -10) insights.push(`الإيرادات انخفضت ${Math.abs(kpis.revenueChange).toFixed(0)}% هذا الشهر`);
  if (topPlans[0]) insights.push(`الخطة الأكثر مبيعاً: ${topPlans[0].plan_name} (${topPlans[0].subscriber_count} مشترك)`);
  if (kpis.atRiskCount > 0) insights.push(`${kpis.atRiskCount} عضو لم يحضر منذ أكثر من 14 يوم`);
  if (branchComparison && branchComparison.length > 1) {
    const top = branchComparison.reduce((a, b) => a.revenue_this_month > b.revenue_this_month ? a : b);
    insights.push(`${top.branch_name} يحقق أعلى إيرادات هذا الشهر`);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">لوحة التحكم</h1>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <RefreshCw className="h-3.5 w-3.5" />
          <span>يتحدث كل دقيقة</span>
        </div>
      </div>

      {/* KPI Bar */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 xl:grid-cols-6">
        <KPICard title="الأعضاء النشطون" value={kpis.activeMembers} icon={Users} color="blue" />
        <KPICard title="إيرادات الشهر" value={formatCurrency(kpis.revenueThisMonth)} trend={kpis.revenueChange} icon={DollarSign} color="green" />
        <KPICard title="أعضاء جدد" value={kpis.newThisMonth} trend={kpis.membersChange} icon={TrendingUp} color="purple" />
        <KPICard title="تنتهي هذا الأسبوع" value={kpis.expiringSoon} subtitle="اضغط للتفاصيل" icon={Clock} color="yellow" />
        <KPICard title="حضور اليوم" value={kpis.checkinsToday} icon={UserCheck} color="green" />
        <KPICard title="مجمدون" value={kpis.frozenCount} icon={Activity} color="blue" />
      </div>

      {/* Alerts */}
      {alerts.length > 0 && <AlertsPanel alerts={alerts} />}

      {/* Branch comparison */}
      {branchComparison && branchComparison.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              مقارنة الفروع
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-start pb-3 font-medium text-muted-foreground">الفرع</th>
                  <th className="text-start pb-3 font-medium text-muted-foreground">الأعضاء النشطون</th>
                  <th className="text-start pb-3 font-medium text-muted-foreground">إيرادات الشهر</th>
                  <th className="text-start pb-3 font-medium text-muted-foreground">اشتراكات جديدة</th>
                  <th className="text-start pb-3 font-medium text-muted-foreground">حضور اليوم</th>
                  <th className="text-start pb-3 font-medium text-muted-foreground">الموظفون</th>
                </tr>
              </thead>
              <tbody>
                {branchComparison.map((branch, i) => {
                  const maxRev = Math.max(...branchComparison.map(b => b.revenue_this_month));
                  const maxMembers = Math.max(...branchComparison.map(b => b.active_members));
                  const isTopRev = branch.revenue_this_month === maxRev;
                  const isBottomRev = branch.revenue_this_month === Math.min(...branchComparison.map(b => b.revenue_this_month));
                  return (
                    <tr key={i} className="border-b border-border/50 hover:bg-muted/30">
                      <td className="py-3 font-medium">{branch.branch_name}</td>
                      <td className="py-3">
                        <span className={branch.active_members === maxMembers ? 'text-green-400 font-semibold' : ''}>
                          {branch.active_members}
                        </span>
                      </td>
                      <td className="py-3">
                        <span className={isTopRev ? 'text-green-400 font-semibold' : isBottomRev ? 'text-red-400' : ''}>
                          {formatCurrency(branch.revenue_this_month)}
                        </span>
                      </td>
                      <td className="py-3">{branch.new_subs_this_month}</td>
                      <td className="py-3">{branch.checkins_today}</td>
                      <td className="py-3">{branch.staff_count}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Revenue Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Daily revenue by branch */}
        {dailyRevChartData.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">الإيرادات اليومية (30 يوم)</CardTitle>
            </CardHeader>
            <CardContent>
              <div style={{ height: 300 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={dailyRevChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
                    <Legend />
                    {branchNames.map((branch, i) => (
                      <Line key={branch} type="monotone" dataKey={branch} stroke={BRANCH_COLORS[i % BRANCH_COLORS.length]} strokeWidth={2} dot={false} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Monthly stacked bar */}
        {monthlyBarData.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">الإيرادات الشهرية (6 أشهر)</CardTitle>
            </CardHeader>
            <CardContent>
              <div style={{ height: 300 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyBarData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
                    <Legend />
                    {branchNames.map((branch, i) => (
                      <Bar key={branch} dataKey={branch} stackId="a" fill={BRANCH_COLORS[i % BRANCH_COLORS.length]} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Subscription status donut */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">توزيع الاشتراكات</CardTitle>
          </CardHeader>
          <CardContent>
            <div style={{ height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={statusDist} dataKey="count" nameKey="status" cx="50%" cy="50%" innerRadius={60} outerRadius={90} label={({ status, count }) => `${STATUS_LABELS[status] || status}: ${count}`} labelLine={false}>
                    {statusDist.map((entry, i) => (
                      <Cell key={i} fill={STATUS_COLORS[entry.status] || '#6B7280'} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(val, name) => [val, STATUS_LABELS[name as string] || name]} contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Top plans */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">أفضل الخطط</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {topPlans.map((plan, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-2 w-2 rounded-full" style={{ background: BRANCH_COLORS[i] }} />
                    <span className="text-sm">{plan.plan_name}</span>
                  </div>
                  <div className="text-end">
                    <p className="text-sm font-medium">{plan.subscriber_count} مشترك</p>
                    <p className="text-xs text-muted-foreground">{formatCurrency(plan.total_revenue)}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Attendance heatmap */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">خريطة الحضور (30 يوم)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <div className="min-w-[500px]">
              <div className="grid gap-1" style={{ gridTemplateColumns: `60px repeat(24, 1fr)` }}>
                <div />
                {Array.from({ length: 24 }, (_, h) => (
                  <div key={h} className="text-center text-xs text-muted-foreground pb-1">{h}</div>
                ))}
                {days.map((day, dayIdx) => (
                  <>
                    <div key={day} className="text-xs text-muted-foreground flex items-center">{day}</div>
                    {Array.from({ length: 24 }, (_, hour) => {
                      const cell = heatmap.find(h => h.day_of_week === dayIdx && h.hour === hour);
                      const intensity = cell ? cell.count / maxHeatmapVal : 0;
                      return (
                        <div
                          key={hour}
                          className="h-5 rounded-sm"
                          style={{ background: `rgba(59, 130, 246, ${intensity * 0.9 + (intensity > 0 ? 0.1 : 0)})` }}
                          title={cell ? `${day} ${hour}:00 — ${cell.count} حضور` : undefined}
                        />
                      );
                    })}
                  </>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Insights + Recent Activity */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Insights */}
        {insights.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">رؤى وتحليلات</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {insights.map((insight, i) => (
                <div key={i} className="flex items-start gap-2 rounded-lg bg-primary/10 border border-primary/20 p-3 text-sm">
                  <span className="text-primary mt-0.5">💡</span>
                  <span>{insight}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Recent activity */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">النشاط الأخير</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recentActivity.slice(0, 8).map((item, i) => (
                <div key={i} className="flex items-center gap-3 text-sm">
                  <div className={`h-2 w-2 rounded-full shrink-0 ${item.event_type === 'checkin' ? 'bg-green-400' : 'bg-blue-400'}`} />
                  <div className="flex-1 min-w-0">
                    <span className="font-medium">{item.member_name}</span>
                    <span className="text-muted-foreground mx-1">—</span>
                    <span className="text-muted-foreground">{item.event_type === 'checkin' ? 'حضور' : 'اشتراك'} في {item.branch_name}</span>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {new Date(item.event_time).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
