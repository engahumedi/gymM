import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, TrendingUp, Users, Calendar, BarChart3 } from 'lucide-react';
import { reportsApi } from '@/api/reports';
import { useBranch } from '@/context/BranchContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { formatCurrency, formatDate, getSubscriptionStatusLabel, getSubscriptionStatusColor } from '@/lib/utils';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import * as XLSX from 'xlsx';

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];

function exportToExcel(data: any[], filename: string) {
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

export function Reports() {
  const { branches, selectedBranch } = useBranch();
  const [branchFilter, setBranchFilter] = useState<string>('all');
  const [expiringDays, setExpiringDays] = useState('7');
  const [inactiveDays, setInactiveDays] = useState('30');

  const branchId = branchFilter !== 'all' ? parseInt(branchFilter) : selectedBranch?.id;

  const { data: revenueDaily, isLoading: loadingDaily } = useQuery({
    queryKey: ['report-revenue-daily', branchId],
    queryFn: () => reportsApi.revenueDaily({ branch_id: branchId }),
  });

  const { data: revenueMonthly, isLoading: loadingMonthly } = useQuery({
    queryKey: ['report-revenue-monthly', branchId],
    queryFn: () => reportsApi.revenueMonthly({ branch_id: branchId }),
  });

  const { data: revenueByPlan, isLoading: loadingByPlan } = useQuery({
    queryKey: ['report-revenue-by-plan', branchId],
    queryFn: () => reportsApi.revenueByPlan({ branch_id: branchId }),
  });

  const { data: expiring, isLoading: loadingExpiring } = useQuery({
    queryKey: ['report-expiring', expiringDays, branchId],
    queryFn: () => reportsApi.membersExpiring({ days: parseInt(expiringDays), branch_id: branchId }),
  });

  const { data: inactive, isLoading: loadingInactive } = useQuery({
    queryKey: ['report-inactive', inactiveDays, branchId],
    queryFn: () => reportsApi.membersInactive({ days: parseInt(inactiveDays), branch_id: branchId }),
  });

  const { data: attendanceSummary } = useQuery({
    queryKey: ['report-attendance', branchId],
    queryFn: () => reportsApi.attendanceSummary({ branch_id: branchId }),
  });

  const { data: branchComparison, isLoading: loadingBranches } = useQuery({
    queryKey: ['report-branches'],
    queryFn: () => reportsApi.branchComparison(),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">التقارير</h1>
        <Select value={branchFilter} onValueChange={setBranchFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="كل الفروع" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الفروع</SelectItem>
            {branches.map((b: any) => (
              <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Tabs defaultValue="revenue-daily">
        <TabsList className="grid grid-cols-4 lg:grid-cols-7 h-auto gap-1">
          <TabsTrigger value="revenue-daily" className="text-xs"><TrendingUp className="h-3 w-3 me-1" />يومي</TabsTrigger>
          <TabsTrigger value="revenue-monthly" className="text-xs"><BarChart3 className="h-3 w-3 me-1" />شهري</TabsTrigger>
          <TabsTrigger value="by-plan" className="text-xs">حسب الخطة</TabsTrigger>
          <TabsTrigger value="expiring" className="text-xs"><Calendar className="h-3 w-3 me-1" />منتهية</TabsTrigger>
          <TabsTrigger value="inactive" className="text-xs"><Users className="h-3 w-3 me-1" />خامل</TabsTrigger>
          <TabsTrigger value="attendance" className="text-xs">الحضور</TabsTrigger>
          <TabsTrigger value="branches" className="text-xs">الفروع</TabsTrigger>
        </TabsList>

        {/* Daily Revenue */}
        <TabsContent value="revenue-daily">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">الإيرادات اليومية (آخر 30 يوم)</CardTitle>
              <Button size="sm" variant="outline" onClick={() => revenueDaily && exportToExcel(revenueDaily, 'daily-revenue')}>
                <Download className="h-4 w-4 me-2" />تصدير
              </Button>
            </CardHeader>
            <CardContent>
              {loadingDaily ? <Skeleton className="h-64" /> : (
                <div style={{ height: 300 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={revenueDaily || []}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e2535" />
                      <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#6b7280' }} />
                      <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} />
                      <Tooltip
                        contentStyle={{ background: '#161B27', border: '1px solid #1e2535', borderRadius: 8 }}
                        formatter={(v: any) => [formatCurrency(v), 'الإيرادات']}
                      />
                      <Line type="monotone" dataKey="revenue" stroke="#3B82F6" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
              {revenueDaily && revenueDaily.length > 0 && (
                <div className="mt-4 overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>التاريخ</TableHead>
                        <TableHead>الإيرادات</TableHead>
                        <TableHead>عدد الاشتراكات</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {revenueDaily.slice(0, 10).map((row: any) => (
                        <TableRow key={row.date}>
                          <TableCell>{row.date}</TableCell>
                          <TableCell>{formatCurrency(row.revenue)}</TableCell>
                          <TableCell>{row.count}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Monthly Revenue */}
        <TabsContent value="revenue-monthly">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">الإيرادات الشهرية (آخر 6 أشهر)</CardTitle>
              <Button size="sm" variant="outline" onClick={() => revenueMonthly && exportToExcel(revenueMonthly, 'monthly-revenue')}>
                <Download className="h-4 w-4 me-2" />تصدير
              </Button>
            </CardHeader>
            <CardContent>
              {loadingMonthly ? <Skeleton className="h-64" /> : (
                <div style={{ height: 300 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={revenueMonthly || []}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e2535" />
                      <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#6b7280' }} />
                      <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} />
                      <Tooltip
                        contentStyle={{ background: '#161B27', border: '1px solid #1e2535', borderRadius: 8 }}
                        formatter={(v: any) => [formatCurrency(v), 'الإيرادات']}
                      />
                      <Legend />
                      <Bar dataKey="revenue" fill="#3B82F6" name="الإيرادات" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
              {revenueMonthly && (
                <div className="mt-4">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>الشهر</TableHead>
                        <TableHead>الإيرادات</TableHead>
                        <TableHead>عدد الاشتراكات</TableHead>
                        <TableHead>أعضاء جدد</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {revenueMonthly.map((row: any) => (
                        <TableRow key={row.month}>
                          <TableCell>{row.month}</TableCell>
                          <TableCell>{formatCurrency(row.revenue)}</TableCell>
                          <TableCell>{row.count}</TableCell>
                          <TableCell>{row.new_members || 0}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Revenue by Plan */}
        <TabsContent value="by-plan">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">الإيرادات حسب الخطة</CardTitle>
              <Button size="sm" variant="outline" onClick={() => revenueByPlan && exportToExcel(revenueByPlan, 'revenue-by-plan')}>
                <Download className="h-4 w-4 me-2" />تصدير
              </Button>
            </CardHeader>
            <CardContent>
              {loadingByPlan ? <Skeleton className="h-64" /> : (
                <div className="grid gap-6 lg:grid-cols-2">
                  <div style={{ height: 280 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={revenueByPlan || []}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={100}
                          paddingAngle={3}
                          dataKey="revenue"
                          nameKey="plan_name"
                          label={({ plan_name, percent }) => `${plan_name} ${(percent * 100).toFixed(0)}%`}
                          labelLine={false}
                        >
                          {(revenueByPlan || []).map((_: any, index: number) => (
                            <Cell key={index} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{ background: '#161B27', border: '1px solid #1e2535', borderRadius: 8 }}
                          formatter={(v: any) => [formatCurrency(v), 'الإيرادات']}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>الخطة</TableHead>
                        <TableHead>الإيرادات</TableHead>
                        <TableHead>عدد الاشتراكات</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(revenueByPlan || []).map((row: any) => (
                        <TableRow key={row.plan_name}>
                          <TableCell>{row.plan_name}</TableCell>
                          <TableCell>{formatCurrency(row.revenue)}</TableCell>
                          <TableCell>{row.count}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Expiring Subscriptions */}
        <TabsContent value="expiring">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base">الاشتراكات المنتهية قريباً</CardTitle>
              <div className="flex items-center gap-2">
                <Select value={expiringDays} onValueChange={setExpiringDays}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">خلال 7 أيام</SelectItem>
                    <SelectItem value="14">خلال 14 يوم</SelectItem>
                    <SelectItem value="30">خلال 30 يوم</SelectItem>
                  </SelectContent>
                </Select>
                <Button size="sm" variant="outline" onClick={() => expiring && exportToExcel(expiring, 'expiring-subscriptions')}>
                  <Download className="h-4 w-4 me-2" />تصدير
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {loadingExpiring ? <Skeleton className="h-48" /> : expiring?.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">لا توجد اشتراكات منتهية خلال هذه الفترة</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>العضو</TableHead>
                      <TableHead>الخطة</TableHead>
                      <TableHead>تاريخ الانتهاء</TableHead>
                      <TableHead>الأيام المتبقية</TableHead>
                      <TableHead>الفرع</TableHead>
                      <TableHead>الهاتف</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {expiring?.map((row: any) => (
                      <TableRow key={row.subscription_id}>
                        <TableCell>
                          <p className="font-medium text-sm">{row.member_name}</p>
                          <p className="text-xs text-muted-foreground font-mono">{row.member_code}</p>
                        </TableCell>
                        <TableCell className="text-sm">{row.plan_name}</TableCell>
                        <TableCell className="text-sm">{formatDate(row.end_date)}</TableCell>
                        <TableCell>
                          <Badge className={row.days_remaining <= 3 ? 'bg-red-500/20 text-red-400' : 'bg-yellow-500/20 text-yellow-400'}>
                            {row.days_remaining} يوم
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">{row.branch_name}</TableCell>
                        <TableCell className="text-sm font-mono">{row.phone || '-'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Inactive Members */}
        <TabsContent value="inactive">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base">الأعضاء الخاملون</CardTitle>
              <div className="flex items-center gap-2">
                <Select value={inactiveDays} onValueChange={setInactiveDays}>
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30">انتهى منذ 30 يوم</SelectItem>
                    <SelectItem value="60">انتهى منذ 60 يوم</SelectItem>
                    <SelectItem value="90">انتهى منذ 90 يوم</SelectItem>
                  </SelectContent>
                </Select>
                <Button size="sm" variant="outline" onClick={() => inactive && exportToExcel(inactive, 'inactive-members')}>
                  <Download className="h-4 w-4 me-2" />تصدير
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {loadingInactive ? <Skeleton className="h-48" /> : inactive?.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">لا يوجد أعضاء خاملون</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>العضو</TableHead>
                      <TableHead>آخر اشتراك</TableHead>
                      <TableHead>تاريخ الانتهاء</TableHead>
                      <TableHead>الفرع</TableHead>
                      <TableHead>الهاتف</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {inactive?.map((row: any) => (
                      <TableRow key={row.member_id}>
                        <TableCell>
                          <p className="font-medium text-sm">{row.member_name}</p>
                          <p className="text-xs text-muted-foreground font-mono">{row.member_code}</p>
                        </TableCell>
                        <TableCell className="text-sm">{row.plan_name}</TableCell>
                        <TableCell className="text-sm">{formatDate(row.end_date)}</TableCell>
                        <TableCell className="text-sm">{row.branch_name}</TableCell>
                        <TableCell className="text-sm font-mono">{row.phone || '-'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Attendance Summary */}
        <TabsContent value="attendance">
          <div className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-base">ملخص الحضور (آخر 30 يوم)</CardTitle></CardHeader>
              <CardContent>
                {!attendanceSummary ? <Skeleton className="h-64" /> : (
                  <div style={{ height: 280 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={attendanceSummary?.daily || []}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e2535" />
                        <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#6b7280' }} />
                        <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} />
                        <Tooltip
                          contentStyle={{ background: '#161B27', border: '1px solid #1e2535', borderRadius: 8 }}
                          formatter={(v: any) => [v, 'عدد الحضور']}
                        />
                        <Bar dataKey="count" fill="#10B981" name="الحضور" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
            {attendanceSummary?.peak_hours && (
              <Card>
                <CardHeader><CardTitle className="text-base">أوقات الذروة</CardTitle></CardHeader>
                <CardContent>
                  <div className="grid grid-cols-6 sm:grid-cols-12 gap-1">
                    {attendanceSummary.peak_hours.map((h: any) => (
                      <div key={h.hour} className="flex flex-col items-center gap-1">
                        <div
                          className="w-full rounded"
                          style={{
                            height: 40,
                            background: `rgba(59, 130, 246, ${Math.min(1, h.count / (attendanceSummary.max_hour_count || 1))})`,
                            minHeight: 4,
                          }}
                        />
                        <span className="text-xs text-muted-foreground">{h.hour}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* Branch Comparison */}
        <TabsContent value="branches">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">مقارنة الفروع</CardTitle>
              <Button size="sm" variant="outline" onClick={() => branchComparison && exportToExcel(branchComparison, 'branch-comparison')}>
                <Download className="h-4 w-4 me-2" />تصدير
              </Button>
            </CardHeader>
            <CardContent>
              {loadingBranches ? <Skeleton className="h-48" /> : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>الفرع</TableHead>
                      <TableHead>أعضاء نشطون</TableHead>
                      <TableHead>إيرادات الشهر</TableHead>
                      <TableHead>اشتراكات جديدة</TableHead>
                      <TableHead>حضور الشهر</TableHead>
                      <TableHead>اشتراكات تنتهي</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(branchComparison || []).map((row: any, i: number) => (
                      <TableRow key={row.branch_id}>
                        <TableCell className="font-medium">{row.branch_name}</TableCell>
                        <TableCell>
                          <span className={i === 0 ? 'text-green-400 font-medium' : i === (branchComparison.length - 1) ? 'text-red-400' : ''}>
                            {row.active_members}
                          </span>
                        </TableCell>
                        <TableCell>{formatCurrency(row.revenue_this_month)}</TableCell>
                        <TableCell>{row.new_subscriptions}</TableCell>
                        <TableCell>{row.checkins_this_month}</TableCell>
                        <TableCell>
                          {row.expiring_soon > 0 && (
                            <Badge className="bg-yellow-500/20 text-yellow-400">{row.expiring_soon}</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
