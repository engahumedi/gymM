import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, QrCode, Hash, CheckCircle, XCircle, Camera } from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
import { attendanceApi, CheckInResult } from '@/api/attendance';
import { membersApi } from '@/api/members';
import { extractError } from '@/api/client';
import { useBranch } from '@/context/BranchContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDateTime, daysUntil } from '@/lib/utils';

function SuccessCard({ result, onDismiss }: { result: CheckInResult; onDismiss: () => void }) {
  const days = daysUntil(result.subscription.end_date);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onDismiss}>
      <div className="bg-card border border-green-500/30 rounded-2xl p-8 max-w-sm w-full mx-4 text-center" onClick={e => e.stopPropagation()}>
        <CheckCircle className="h-16 w-16 text-green-400 mx-auto mb-4" />
        <h2 className="text-xl font-bold mb-1">تم تسجيل الحضور!</h2>
        {result.member.photo_path && (
          <img src={result.member.photo_path} className="h-20 w-20 rounded-full object-cover mx-auto my-3" />
        )}
        <p className="text-2xl font-bold mb-1">{result.member.name_ar}</p>
        <p className="text-sm text-muted-foreground mb-3">{result.member.member_code}</p>
        <div className={`rounded-lg p-3 mb-4 ${days <= 7 ? 'bg-yellow-500/10 text-yellow-400' : 'bg-green-500/10 text-green-400'}`}>
          <p className="text-sm font-medium">
            {days > 0 ? `${days} يوم متبقي في الاشتراك` : 'الاشتراك ينتهي اليوم!'}
          </p>
          <p className="text-xs mt-0.5 opacity-80">{result.branch_name}</p>
        </div>
        <Button className="w-full" onClick={onDismiss}>موافق</Button>
      </div>
    </div>
  );
}

function ErrorCard({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onDismiss}>
      <div className="bg-card border border-red-500/30 rounded-2xl p-8 max-w-sm w-full mx-4 text-center">
        <XCircle className="h-16 w-16 text-red-400 mx-auto mb-4" />
        <h2 className="text-xl font-bold mb-2">خطأ في تسجيل الحضور</h2>
        <p className="text-muted-foreground mb-4">{message}</p>
        <Button className="w-full" onClick={onDismiss}>موافق</Button>
      </div>
    </div>
  );
}

export function CheckIn() {
  const { selectedBranch } = useBranch();
  const [activeTab, setActiveTab] = useState('manual');
  const [checkInResult, setCheckInResult] = useState<CheckInResult | null>(null);
  const [checkInError, setCheckInError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Manual search
  const [search, setSearch] = useState('');
  const { data: searchResults } = useQuery({
    queryKey: ['members-checkin-search', search],
    queryFn: () => membersApi.getAll({ search, per_page: 5 }),
    enabled: search.length > 1,
  });

  // Quick ID
  const [quickId, setQuickId] = useState('');

  // Attendance log
  const { data: attendanceData, refetch: refetchAttendance } = useQuery({
    queryKey: ['attendance-today'],
    queryFn: () => attendanceApi.getAll({
      date_from: new Date().toISOString().split('T')[0],
      date_to: new Date().toISOString().split('T')[0],
      per_page: 30,
    }),
    refetchInterval: 30000,
  });

  // QR Scanner
  const qrRef = useRef<Html5Qrcode | null>(null);
  const [scannerActive, setScannerActive] = useState(false);

  useEffect(() => {
    if (activeTab === 'qr' && !scannerActive) {
      setTimeout(() => {
        const el = document.getElementById('qr-reader');
        if (!el) return;
        qrRef.current = new Html5Qrcode('qr-reader');
        qrRef.current.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (decodedText) => handleCheckIn(decodedText, 'qr'),
          () => {}
        ).then(() => setScannerActive(true)).catch(console.error);
      }, 100);
    }
    if (activeTab !== 'qr' && scannerActive && qrRef.current) {
      qrRef.current.stop().catch(() => {}).finally(() => setScannerActive(false));
    }
    return () => {
      if (qrRef.current && scannerActive) {
        qrRef.current.stop().catch(() => {});
      }
    };
  }, [activeTab]);

  const handleCheckIn = async (memberCode: string, method: 'manual' | 'qr' | 'id_entry' = 'manual') => {
    if (loading) return;
    setLoading(true);
    try {
      const result = await attendanceApi.checkIn({
        member_code: memberCode,
        method,
        branch_id: selectedBranch?.id,
      });
      setCheckInResult(result);
      setCheckInError(null);
      setSearch('');
      setQuickId('');
      refetchAttendance();
    } catch (err) {
      setCheckInError(extractError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">تسجيل الحضور</h1>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="manual"><Search className="h-4 w-4 me-2" />بحث يدوي</TabsTrigger>
          <TabsTrigger value="qr"><QrCode className="h-4 w-4 me-2" />مسح QR</TabsTrigger>
          <TabsTrigger value="quick"><Hash className="h-4 w-4 me-2" />رمز سريع</TabsTrigger>
        </TabsList>

        <TabsContent value="manual" className="space-y-3">
          <Card>
            <CardContent className="p-4">
              <div className="relative">
                <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="ابحث بالاسم أو رمز العضو..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="ps-9"
                />
              </div>
              {search.length > 1 && searchResults?.data.map(member => (
                <div key={member.id} className="flex items-center justify-between p-3 mt-2 rounded-lg bg-muted/50 hover:bg-muted">
                  <div className="flex items-center gap-3">
                    {member.photo_path ? (
                      <img src={member.photo_path} className="h-9 w-9 rounded-full object-cover" />
                    ) : (
                      <div className="h-9 w-9 rounded-full bg-primary/20 flex items-center justify-center text-sm font-bold">{member.name_ar[0]}</div>
                    )}
                    <div>
                      <p className="font-medium text-sm">{member.name_ar}</p>
                      <p className="text-xs text-muted-foreground">{member.member_code}</p>
                    </div>
                  </div>
                  <Button size="sm" disabled={loading} onClick={() => handleCheckIn(member.member_code, 'manual')}>
                    تسجيل الحضور
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="qr">
          <Card>
            <CardContent className="p-6">
              <div className="flex flex-col items-center gap-4">
                <Camera className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground text-center">وجّه الكاميرا نحو رمز QR الخاص بالعضو</p>
                <div id="qr-reader" className="w-full max-w-sm rounded-lg overflow-hidden bg-black min-h-[250px]" />
                {!scannerActive && (
                  <p className="text-xs text-muted-foreground">جاري تشغيل الكاميرا...</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="quick">
          <Card>
            <CardContent className="p-6">
              <div className="max-w-sm mx-auto space-y-4">
                <p className="text-sm text-muted-foreground text-center">أدخل رمز العضو واضغط Enter</p>
                <Input
                  placeholder="GYM-0001"
                  value={quickId}
                  onChange={e => setQuickId(e.target.value.toUpperCase())}
                  onKeyDown={e => { if (e.key === 'Enter' && quickId) handleCheckIn(quickId, 'id_entry'); }}
                  dir="ltr"
                  className="text-center text-lg font-mono tracking-widest"
                  autoFocus
                />
                <Button className="w-full" disabled={!quickId || loading} onClick={() => handleCheckIn(quickId, 'id_entry')}>
                  {loading ? 'جاري التسجيل...' : 'تسجيل الحضور'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Today's attendance log */}
      <Card>
        <CardHeader><CardTitle className="text-base">حضور اليوم ({attendanceData?.meta?.total || 0})</CardTitle></CardHeader>
        <CardContent className="p-0">
          {attendanceData?.data.length === 0 ? (
            <p className="text-center text-muted-foreground py-8 text-sm">لا يوجد حضور اليوم</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>العضو</TableHead>
                  <TableHead>وقت الحضور</TableHead>
                  <TableHead>الفرع</TableHead>
                  <TableHead>الطريقة</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {attendanceData?.data.map(att => (
                  <TableRow key={att.id}>
                    <TableCell>
                      <p className="text-sm font-medium">{att.member_name}</p>
                      <p className="text-xs text-muted-foreground font-mono">{att.member_code}</p>
                    </TableCell>
                    <TableCell className="text-sm">{formatDateTime(att.check_in_time)}</TableCell>
                    <TableCell className="text-sm">{att.branch_name}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {att.method === 'qr' ? 'QR' : att.method === 'id_entry' ? 'رمز' : 'يدوي'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Success/Error overlays */}
      {checkInResult && <SuccessCard result={checkInResult} onDismiss={() => setCheckInResult(null)} />}
      {checkInError && <ErrorCard message={checkInError} onDismiss={() => setCheckInError(null)} />}
    </div>
  );
}
