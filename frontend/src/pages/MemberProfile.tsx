import { useQuery } from '@tanstack/react-query';
import { useParams, Link } from 'react-router-dom';
import { ArrowRight, QrCode, Phone, Calendar, MapPin, CreditCard, Activity, CheckCircle } from 'lucide-react';
import { membersApi } from '@/api/members';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDate, formatDateTime, getSubscriptionStatusLabel, getSubscriptionStatusColor, getGenderLabel, daysUntil, formatCurrency, getPaymentMethodLabel } from '@/lib/utils';
import { Subscription, AttendanceRecord } from '@/types';
import { useState } from 'react';

export function MemberProfile() {
  const { id } = useParams<{ id: string }>();
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['member', id],
    queryFn: () => membersApi.getById(parseInt(id!)),
    enabled: !!id,
  });

  const member = data?.data;

  const handleShowQR = async () => {
    if (!id) return;
    try {
      const res = await membersApi.getQR(parseInt(id));
      setQrUrl(res.qr);
      setShowQr(true);
    } catch {
      // ignore
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-32 w-full" />
        <div className="grid grid-cols-2 gap-4">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      </div>
    );
  }

  if (!member) return <div className="text-muted-foreground">العضو غير موجود</div>;

  const activeSub = member.subscriptions?.find(s => s.status === 'active');
  const daysLeft = activeSub ? daysUntil(activeSub.end_date) : null;
  const subDuration = activeSub ? (activeSub.duration_days || 30) : 1;
  const daysUsed = activeSub ? (subDuration - (daysLeft || 0)) : 0;
  const progressPct = Math.min(100, Math.max(0, (daysUsed / subDuration) * 100));

  return (
    <div className="space-y-6">
      {/* Back button */}
      <Link to="/members" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowRight className="h-4 w-4" />
        العودة إلى قائمة الأعضاء
      </Link>

      {/* Hero */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-start gap-6">
            {member.photo_path ? (
              <img src={member.photo_path} className="h-20 w-20 rounded-xl object-cover" />
            ) : (
              <div className="h-20 w-20 rounded-xl bg-primary/20 flex items-center justify-center text-3xl font-bold text-primary">
                {member.name_ar[0]}
              </div>
            )}
            <div className="flex-1">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl font-bold">{member.name_ar}</h1>
                {member.name_en && <span className="text-muted-foreground">{member.name_en}</span>}
                <Badge variant="outline" className="font-mono">{member.member_code}</Badge>
                {activeSub ? (
                  <Badge className={getSubscriptionStatusColor(activeSub.status)}>
                    {getSubscriptionStatusLabel(activeSub.status)}
                  </Badge>
                ) : <Badge variant="outline">بدون اشتراك</Badge>}
              </div>
              <div className="flex flex-wrap gap-4 mt-3 text-sm text-muted-foreground">
                {member.phone && <span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" />{member.phone}</span>}
                {member.dob && <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />مواليد {formatDate(member.dob)}</span>}
                <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{member.home_branch_name}</span>
                {member.gender && <span>{getGenderLabel(member.gender)}</span>}
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={handleShowQR}>
              <QrCode className="h-4 w-4 me-2" />
              رمز QR
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* QR Modal */}
      {showQr && qrUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowQr(false)}>
          <div className="bg-card p-6 rounded-xl text-center" onClick={e => e.stopPropagation()}>
            <p className="font-bold mb-3">{member.name_ar}</p>
            <img src={qrUrl} className="w-48 h-48 mx-auto" />
            <p className="text-sm text-muted-foreground mt-2">{member.member_code}</p>
            <Button className="mt-4" size="sm" onClick={() => setShowQr(false)}>إغلاق</Button>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Personal Info */}
        <Card>
          <CardHeader><CardTitle className="text-base">البيانات الشخصية</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row label="رقم الهوية" value={member.national_id} />
            <Row label="البريد الإلكتروني" value={member.email} />
            <Row label="تاريخ الانضمام" value={formatDate(member.join_date)} />
            <Row label="جهة اتصال الطوارئ" value={member.emergency_contact_name} />
            <Row label="هاتف الطوارئ" value={member.emergency_contact_phone} />
            {member.health_notes && (
              <div>
                <p className="text-muted-foreground mb-1">ملاحظات صحية</p>
                <p className="text-yellow-400 bg-yellow-400/10 rounded p-2 text-xs">{member.health_notes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Active Subscription */}
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><CreditCard className="h-4 w-4" />الاشتراك الحالي</CardTitle></CardHeader>
          <CardContent>
            {activeSub ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-lg">{activeSub.plan_name}</p>
                    <p className="text-sm text-muted-foreground">{activeSub.branch_name}</p>
                  </div>
                  <Badge className={getSubscriptionStatusColor(activeSub.status)}>
                    {getSubscriptionStatusLabel(activeSub.status)}
                  </Badge>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">التقدم</span>
                    <span className={daysLeft && daysLeft <= 7 ? 'text-yellow-400' : ''}>
                      {daysLeft !== null ? `${daysLeft} يوم متبقي` : '-'}
                    </span>
                  </div>
                  <Progress value={progressPct} className="h-2" />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{formatDate(activeSub.start_date)}</span>
                    <span>{formatDate(activeSub.end_date)}</span>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div className="bg-muted/50 rounded p-2">
                    <p className="text-muted-foreground text-xs">المبلغ المدفوع</p>
                    <p className="font-medium">{formatCurrency(activeSub.price_paid)}</p>
                  </div>
                  <div className="bg-muted/50 rounded p-2">
                    <p className="text-muted-foreground text-xs">طريقة الدفع</p>
                    <p className="font-medium">{getPaymentMethodLabel(activeSub.payment_method)}</p>
                  </div>
                  <div className="bg-muted/50 rounded p-2">
                    <p className="text-muted-foreground text-xs">عدد التجميدات</p>
                    <p className="font-medium">{activeSub.freeze_count} / 2</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <CreditCard className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>لا يوجد اشتراك نشط</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Subscription History */}
      {member.subscriptions && member.subscriptions.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">سجل الاشتراكات</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {member.subscriptions.map((sub: Subscription) => (
                <div key={sub.id} className="flex items-center justify-between rounded-lg bg-muted/30 p-3">
                  <div>
                    <p className="text-sm font-medium">{sub.plan_name}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(sub.start_date)} — {formatDate(sub.end_date)} · {sub.branch_name}</p>
                  </div>
                  <div className="text-end">
                    <Badge className={getSubscriptionStatusColor(sub.status)}>{getSubscriptionStatusLabel(sub.status)}</Badge>
                    <p className="text-xs text-muted-foreground mt-1">{formatCurrency(sub.price_paid)}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Attendance Log */}
      {member.attendance && member.attendance.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Activity className="h-4 w-4" />سجل الحضور</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {member.attendance.slice(0, 50).map((att: AttendanceRecord) => (
                <div key={att.id} className="flex items-center justify-between text-sm rounded-lg bg-muted/20 px-3 py-2">
                  <div className="flex items-center gap-3">
                    <CheckCircle className="h-4 w-4 text-green-400 shrink-0" />
                    <div>
                      <p>{formatDateTime(att.check_in_time)}</p>
                      <p className="text-xs text-muted-foreground">{att.branch_name}</p>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-xs">{att.method === 'qr' ? 'QR' : att.method === 'id_entry' ? 'رمز' : 'يدوي'}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}
