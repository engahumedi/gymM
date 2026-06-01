import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit, Trash2, RefreshCw, Download, AlertTriangle, Eye, EyeOff } from 'lucide-react';
import { settingsApi } from '@/api/settings';
import { branchesApi } from '@/api/branches';
import { extractError } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';

export function Settings() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: settings, isLoading: loadingSettings } = useQuery({
    queryKey: ['settings'],
    queryFn: settingsApi.get,
  });

  const { data: branches } = useQuery({
    queryKey: ['branches'],
    queryFn: () => branchesApi.getAll(),
  });

  const { data: users, isLoading: loadingUsers } = useQuery({
    queryKey: ['users'],
    queryFn: settingsApi.getUsers,
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">الإعدادات</h1>

      <Tabs defaultValue="gym">
        <TabsList className="grid grid-cols-4">
          <TabsTrigger value="gym">الصالة</TabsTrigger>
          <TabsTrigger value="users">المستخدمون</TabsTrigger>
          <TabsTrigger value="backup">النسخ الاحتياطي</TabsTrigger>
          <TabsTrigger value="danger">منطقة الخطر</TabsTrigger>
        </TabsList>

        {/* Gym Profile */}
        <TabsContent value="gym">
          <GymProfileTab settings={settings} isLoading={loadingSettings} />
        </TabsContent>

        {/* Users */}
        <TabsContent value="users">
          <UsersTab users={users} isLoading={loadingUsers} branches={branches || []} />
        </TabsContent>

        {/* Backup */}
        <TabsContent value="backup">
          <BackupTab />
        </TabsContent>

        {/* Danger Zone */}
        <TabsContent value="danger">
          <DangerZoneTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function GymProfileTab({ settings, isLoading }: { settings: any; isLoading: boolean }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ gym_name: '', currency: 'SAR', timezone: 'Asia/Riyadh' });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (settings) {
      setForm({
        gym_name: settings.gym_name || '',
        currency: settings.currency || 'SAR',
        timezone: settings.timezone || 'Asia/Riyadh',
      });
    }
  }, [settings]);

  const handleSave = async () => {
    setLoading(true);
    try {
      await settingsApi.update(form as any);
      qc.invalidateQueries({ queryKey: ['settings'] });
      toast.success('تم حفظ الإعدادات');
    } catch (err) {
      toast.error(extractError(err));
    } finally {
      setLoading(false);
    }
  };

  if (isLoading) return <Skeleton className="h-64" />;

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">معلومات الصالة</CardTitle></CardHeader>
      <CardContent className="space-y-4 max-w-lg">
        <div className="space-y-2">
          <Label>اسم الصالة</Label>
          <Input value={form.gym_name} onChange={e => setForm(f => ({ ...f, gym_name: e.target.value }))} placeholder="صالة الرياضية" />
        </div>
        <div className="space-y-2">
          <Label>العملة</Label>
          <Select value={form.currency} onValueChange={v => setForm(f => ({ ...f, currency: v }))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="SAR">ريال سعودي (SAR)</SelectItem>
              <SelectItem value="AED">درهم إماراتي (AED)</SelectItem>
              <SelectItem value="USD">دولار أمريكي (USD)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>المنطقة الزمنية</Label>
          <Select value={form.timezone} onValueChange={v => setForm(f => ({ ...f, timezone: v }))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Asia/Riyadh">الرياض (GMT+3)</SelectItem>
              <SelectItem value="Asia/Dubai">دبي (GMT+4)</SelectItem>
              <SelectItem value="Africa/Cairo">القاهرة (GMT+2)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={handleSave} disabled={loading}>{loading ? 'جاري الحفظ...' : 'حفظ الإعدادات'}</Button>
      </CardContent>
    </Card>
  );
}

function UsersTab({ users, isLoading, branches }: { users: any[] | undefined; isLoading: boolean; branches: any[] }) {
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);

  const toggleMutation = useMutation({
    mutationFn: (u: any) => settingsApi.updateUser(u.id, { is_active: u.is_active ? 0 : 1 }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
    onError: (err) => toast.error(extractError(err)),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">إدارة المستخدمين</CardTitle>
        <Button size="sm" onClick={() => { setEditing(null); setShowModal(true); }}>
          <Plus className="h-4 w-4 me-2" />
          مستخدم جديد
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? <Skeleton className="h-48" /> : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>الاسم</TableHead>
                <TableHead>البريد الإلكتروني</TableHead>
                <TableHead>الدور</TableHead>
                <TableHead>الفرع</TableHead>
                <TableHead>الحالة</TableHead>
                <TableHead>إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users?.map(u => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.name}</TableCell>
                  <TableCell className="text-sm font-mono">{u.email}</TableCell>
                  <TableCell>
                    <Badge variant={u.role === 'admin' ? 'default' : 'secondary'} className="text-xs">
                      {u.role === 'admin' ? 'مدير' : 'موظف استقبال'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">{u.branch_name || '—'}</TableCell>
                  <TableCell>
                    <Switch
                      checked={!!u.is_active}
                      onCheckedChange={() => toggleMutation.mutate(u)}
                    />
                  </TableCell>
                  <TableCell>
                    <Button size="sm" variant="ghost" onClick={() => { setEditing(u); setShowModal(true); }}>
                      <Edit className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <UserModal
        open={showModal}
        user={editing}
        branches={branches}
        onClose={() => { setShowModal(false); setEditing(null); }}
        onSuccess={() => { qc.invalidateQueries({ queryKey: ['users'] }); setShowModal(false); setEditing(null); }}
      />
    </Card>
  );
}

function UserModal({ open, user, branches, onClose, onSuccess }: {
  open: boolean;
  user: any | null;
  branches: any[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [form, setForm] = useState({
    name: user?.name || '',
    email: user?.email || '',
    password: '',
    role: user?.role || 'receptionist',
    branch_id: user?.branch_id?.toString() || '',
  });
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.email) {
      toast.error('الاسم والبريد الإلكتروني مطلوبان');
      return;
    }
    if (!user && !form.password) {
      toast.error('كلمة المرور مطلوبة للمستخدم الجديد');
      return;
    }
    if (form.role === 'receptionist' && !form.branch_id) {
      toast.error('يجب تعيين فرع لموظف الاستقبال');
      return;
    }
    setLoading(true);
    try {
      const data: any = {
        name: form.name,
        email: form.email,
        role: form.role,
        branch_id: form.branch_id ? parseInt(form.branch_id) : null,
      };
      if (form.password) data.password = form.password;

      if (user) {
        await settingsApi.updateUser(user.id, data);
        toast.success('تم تحديث المستخدم');
      } else {
        await settingsApi.createUser(data);
        toast.success('تم إضافة المستخدم');
      }
      onSuccess();
    } catch (err) {
      toast.error(extractError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{user ? 'تعديل المستخدم' : 'مستخدم جديد'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>الاسم *</Label>
            <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>البريد الإلكتروني *</Label>
            <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} dir="ltr" />
          </div>
          <div className="space-y-2">
            <Label>{user ? 'كلمة مرور جديدة (اتركها فارغة للإبقاء)' : 'كلمة المرور *'}</Label>
            <div className="relative">
              <Input
                type={showPw ? 'text' : 'password'}
                value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                dir="ltr"
                className="pe-9"
              />
              <button
                type="button"
                className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                onClick={() => setShowPw(!showPw)}
              >
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div className="space-y-2">
            <Label>الدور *</Label>
            <Select value={form.role} onValueChange={v => setForm(f => ({ ...f, role: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">مدير</SelectItem>
                <SelectItem value="receptionist">موظف استقبال</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {form.role === 'receptionist' && (
            <div className="space-y-2">
              <Label>الفرع *</Label>
              <Select value={form.branch_id} onValueChange={v => setForm(f => ({ ...f, branch_id: v }))}>
                <SelectTrigger><SelectValue placeholder="اختر الفرع" /></SelectTrigger>
                <SelectContent>
                  {branches.map(b => (
                    <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>إلغاء</Button>
            <Button type="submit" disabled={loading}>{loading ? 'جاري الحفظ...' : 'حفظ'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function BackupTab() {
  const [loading, setLoading] = useState(false);

  const handleBackup = async () => {
    setLoading(true);
    try {
      await settingsApi.backup();
      toast.success('تم تصدير النسخة الاحتياطية');
    } catch (err) {
      toast.error(extractError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">النسخ الاحتياطي</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          قم بتصدير نسخة احتياطية كاملة من جميع بيانات الصالة (الأعضاء، الاشتراكات، الحضور، وغيرها) بصيغة JSON.
        </p>
        <Button onClick={handleBackup} disabled={loading}>
          <Download className="h-4 w-4 me-2" />
          {loading ? 'جاري التصدير...' : 'تصدير النسخة الاحتياطية'}
        </Button>
        <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-4 text-sm text-yellow-400">
          يُنصح بأخذ نسخة احتياطية دورية وحفظها في مكان آمن.
        </div>
      </CardContent>
    </Card>
  );
}

function DangerZoneTab() {
  const { user } = useAuth();
  const [confirm, setConfirm] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);

  const handleReset = async () => {
    if (confirm !== 'CONFIRM') {
      toast.error('يجب كتابة CONFIRM للمتابعة');
      return;
    }
    if (!password) {
      toast.error('كلمة المرور مطلوبة');
      return;
    }
    setLoading(true);
    try {
      await settingsApi.reset(confirm, password);
      toast.success('تم حذف جميع البيانات بنجاح');
      setConfirm('');
      setPassword('');
    } catch (err) {
      toast.error(extractError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-red-500/20">
      <CardHeader>
        <CardTitle className="text-base text-red-400 flex items-center gap-2">
          <AlertTriangle className="h-5 w-5" />
          منطقة الخطر
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-400">
          <p className="font-semibold mb-1">تحذير: هذا الإجراء لا يمكن التراجع عنه!</p>
          <p>سيتم حذف جميع بيانات الأعضاء والاشتراكات والحضور والإشعارات نهائياً. بيانات الفروع والمستخدمين والخطط ستبقى.</p>
        </div>

        <div className="space-y-3 max-w-sm">
          <div className="space-y-2">
            <Label>اكتب <code className="bg-muted px-1 rounded text-red-400">CONFIRM</code> للتأكيد</Label>
            <Input
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              placeholder="CONFIRM"
              dir="ltr"
              className="font-mono"
            />
          </div>
          <div className="space-y-2">
            <Label>كلمة مرور المدير</Label>
            <div className="relative">
              <Input
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                dir="ltr"
                className="pe-9"
              />
              <button
                type="button"
                className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                onClick={() => setShowPw(!showPw)}
              >
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <Button
            variant="destructive"
            disabled={confirm !== 'CONFIRM' || !password || loading}
            onClick={handleReset}
            className="w-full"
          >
            <Trash2 className="h-4 w-4 me-2" />
            {loading ? 'جاري الحذف...' : 'حذف جميع البيانات'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
