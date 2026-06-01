import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck, AlertTriangle, Info, XCircle, Copy, Check } from 'lucide-react';
import { notificationsApi } from '@/api/notifications';
import { extractError } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { useState } from 'react';

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `منذ ${mins} دقيقة`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `منذ ${hours} ساعة`;
  const days = Math.floor(hours / 24);
  return `منذ ${days} يوم`;
}

function notifIcon(type: string) {
  if (type === 'expiring_soon') return <AlertTriangle className="h-5 w-5 text-yellow-400" />;
  if (type === 'expired_today') return <XCircle className="h-5 w-5 text-red-400" />;
  if (type === 'new_member') return <Check className="h-5 w-5 text-green-400" />;
  if (type === 'no_checkin') return <AlertTriangle className="h-5 w-5 text-orange-400" />;
  return <Info className="h-5 w-5 text-blue-400" />;
}

function WhatsAppButton({ memberName, daysLeft }: { memberName: string; daysLeft?: number }) {
  const [copied, setCopied] = useState(false);
  const text = daysLeft !== undefined
    ? `عزيزي/عزيزتي ${memberName}،\nنود تذكيرك بأن اشتراكك في الصالة الرياضية ينتهي خلال ${daysLeft} يوم.\nنأمل تجديد اشتراكك للاستمرار في الاستفادة من خدماتنا.\nللاستفسار والتجديد تواصل معنا. 💪`
    : `عزيزي/عزيزتي ${memberName}،\nلقد انتهى اشتراكك في الصالة الرياضية.\nنتمنى استمرار رحلتك الرياضية معنا — تواصل معنا لتجديد اشتراكك. 💪`;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success('تم نسخ الرسالة');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Button
      size="sm"
      variant="outline"
      className="text-green-400 border-green-400/30 hover:bg-green-400/10 text-xs"
      onClick={handleCopy}
    >
      {copied ? <Check className="h-3 w-3 me-1" /> : <Copy className="h-3 w-3 me-1" />}
      واتساب
    </Button>
  );
}

export function Notifications() {
  const qc = useQueryClient();

  const { data: notifications, isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => notificationsApi.getAll(),
    refetchInterval: 30000,
  });

  const generateMutation = useMutation({
    mutationFn: () => notificationsApi.generate(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
      toast.success('تم توليد الإشعارات');
    },
    onError: (err) => toast.error(extractError(err)),
  });

  const readMutation = useMutation({
    mutationFn: (id: number) => notificationsApi.markRead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const readAllMutation = useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
      toast.success('تم تحديد الكل كمقروء');
    },
    onError: (err) => toast.error(extractError(err)),
  });

  const unread = notifications?.filter(n => !n.is_read).length || 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">الإشعارات</h1>
          {unread > 0 && (
            <Badge className="bg-primary/20 text-primary">{unread} غير مقروء</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => generateMutation.mutate()} disabled={generateMutation.isPending}>
            <Bell className="h-4 w-4 me-2" />
            توليد الإشعارات
          </Button>
          {unread > 0 && (
            <Button size="sm" variant="outline" onClick={() => readAllMutation.mutate()} disabled={readAllMutation.isPending}>
              <CheckCheck className="h-4 w-4 me-2" />
              تحديد الكل كمقروء
            </Button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array(5).fill(null).map((_, i) => <Skeleton key={i} className="h-20" />)}
        </div>
      ) : notifications?.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <Bell className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <p>لا توجد إشعارات</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {notifications?.map(notif => (
            <Card
              key={notif.id}
              className={`transition-all ${!notif.is_read ? 'border-primary/30 bg-primary/5' : ''}`}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 shrink-0">{notifIcon(notif.type)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className={`text-sm font-medium ${!notif.is_read ? 'text-foreground' : 'text-muted-foreground'}`}>
                          {notif.title}
                        </p>
                        <p className="text-sm text-muted-foreground mt-0.5">{notif.message}</p>
                        <div className="flex items-center gap-2 mt-2">
                          <span className="text-xs text-muted-foreground">{timeAgo(notif.created_at)}</span>
                          {notif.branch_name && (
                            <Badge variant="outline" className="text-xs">{notif.branch_name}</Badge>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {(notif.type === 'expiring_soon' || notif.type === 'expired_today') && notif.member_name && (
                          <WhatsAppButton
                            memberName={notif.member_name}
                            daysLeft={notif.type === 'expiring_soon' ? 3 : undefined}
                          />
                        )}
                        {!notif.is_read && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-xs text-muted-foreground"
                            onClick={() => readMutation.mutate(notif.id)}
                          >
                            <Check className="h-3 w-3 me-1" />
                            قراءة
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                  {!notif.is_read && (
                    <div className="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0" />
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
