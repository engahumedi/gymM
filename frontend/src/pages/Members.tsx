import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Plus, Search, Download, User, Eye, Edit, Trash2, MoreHorizontal } from 'lucide-react';
import * as XLSX from 'xlsx';
import { membersApi } from '@/api/members';
import { plansApi } from '@/api/plans';
import { branchesApi } from '@/api/branches';
import { useAuth } from '@/context/AuthContext';
import { Member } from '@/types';
import { extractError } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { formatDate, getSubscriptionStatusLabel, getSubscriptionStatusColor, getGenderLabel, daysUntil } from '@/lib/utils';

export function Members() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const isAdmin = user?.role === 'admin';

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [genderFilter, setGenderFilter] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const [page, setPage] = useState(1);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [deletingMember, setDeletingMember] = useState<Member | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['members', search, statusFilter, genderFilter, branchFilter, page],
    queryFn: () => membersApi.getAll({ search, status: statusFilter, gender: genderFilter, branchId: branchFilter ? parseInt(branchFilter) : undefined, page, per_page: 20 }),
  });

  const { data: branches } = useQuery({
    queryKey: ['branches'],
    queryFn: () => branchesApi.getAll(),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => membersApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['members'] });
      toast.success('تم حذف العضو');
      setDeletingMember(null);
    },
    onError: (err) => toast.error(extractError(err)),
  });

  const handleExport = () => {
    if (!data?.data) return;
    const exportData = data.data.map(m => ({
      'الرمز': m.member_code,
      'الاسم': m.name_ar,
      'الهاتف': m.phone || '-',
      'الجنس': getGenderLabel(m.gender || ''),
      'الفرع': m.home_branch_name,
      'الحالة': getSubscriptionStatusLabel(m.status),
      'تاريخ الانضمام': formatDate(m.join_date),
    }));
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'الأعضاء');
    XLSX.writeFile(wb, `members-${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">الأعضاء</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-4 w-4 me-2" />
            تصدير
          </Button>
          <Button size="sm" onClick={() => setShowAddModal(true)}>
            <Plus className="h-4 w-4 me-2" />
            عضو جديد
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="بحث بالاسم أو الهاتف أو الرمز..."
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
                className="ps-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={v => { setStatusFilter(v === 'all' ? '' : v); setPage(1); }}>
              <SelectTrigger className="w-36"><SelectValue placeholder="الحالة" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">جميع الحالات</SelectItem>
                <SelectItem value="active">نشط</SelectItem>
                <SelectItem value="frozen">مجمد</SelectItem>
                <SelectItem value="cancelled">ملغى</SelectItem>
              </SelectContent>
            </Select>
            <Select value={genderFilter} onValueChange={v => { setGenderFilter(v === 'all' ? '' : v); setPage(1); }}>
              <SelectTrigger className="w-32"><SelectValue placeholder="الجنس" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">الجنسان</SelectItem>
                <SelectItem value="male">ذكر</SelectItem>
                <SelectItem value="female">أنثى</SelectItem>
              </SelectContent>
            </Select>
            {isAdmin && (
              <Select value={branchFilter} onValueChange={v => { setBranchFilter(v === 'all' ? '' : v); setPage(1); }}>
                <SelectTrigger className="w-40"><SelectValue placeholder="الفرع" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع الفروع</SelectItem>
                  {branches?.map(b => <SelectItem key={b.id} value={b.id.toString()}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {Array(5).fill(null).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>الرمز</TableHead>
                    <TableHead>الاسم</TableHead>
                    <TableHead>الهاتف</TableHead>
                    <TableHead>الفرع</TableHead>
                    <TableHead>الاشتراك</TableHead>
                    <TableHead>الحالة</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data?.data.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-12">
                        <User className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        لا يوجد أعضاء
                      </TableCell>
                    </TableRow>
                  ) : data?.data.map((member) => {
                    const daysLeft = member.sub_end_date ? daysUntil(member.sub_end_date) : null;
                    return (
                      <TableRow key={member.id}>
                        <TableCell>
                          <Badge variant="outline" className="font-mono text-xs">{member.member_code}</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            {member.photo_path ? (
                              <img src={member.photo_path} className="h-8 w-8 rounded-full object-cover" />
                            ) : (
                              <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-medium">
                                {member.name_ar[0]}
                              </div>
                            )}
                            <div>
                              <p className="font-medium text-sm">{member.name_ar}</p>
                              {member.name_en && <p className="text-xs text-muted-foreground">{member.name_en}</p>}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">{member.phone || '-'}</TableCell>
                        <TableCell className="text-sm">{member.home_branch_name}</TableCell>
                        <TableCell>
                          {member.plan_name ? (
                            <div>
                              <p className="text-sm">{member.plan_name}</p>
                              {daysLeft !== null && (
                                <p className={`text-xs ${daysLeft <= 7 ? 'text-yellow-400' : daysLeft <= 0 ? 'text-red-400' : 'text-muted-foreground'}`}>
                                  {daysLeft > 0 ? `${daysLeft} يوم متبقي` : 'منتهي'}
                                </p>
                              )}
                            </div>
                          ) : <span className="text-muted-foreground text-xs">لا يوجد</span>}
                        </TableCell>
                        <TableCell>
                          {member.sub_status ? (
                            <Badge className={getSubscriptionStatusColor(member.sub_status)}>
                              {getSubscriptionStatusLabel(member.sub_status)}
                            </Badge>
                          ) : <Badge variant="outline">بدون اشتراك</Badge>}
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem asChild>
                                <Link to={`/members/${member.id}`}>
                                  <Eye className="me-2 h-4 w-4" /> عرض الملف
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setEditingMember(member)}>
                                <Edit className="me-2 h-4 w-4" /> تعديل
                              </DropdownMenuItem>
                              {isAdmin && (
                                <DropdownMenuItem onClick={() => setDeletingMember(member)} className="text-destructive">
                                  <Trash2 className="me-2 h-4 w-4" /> حذف
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              {/* Pagination */}
              {data && data.meta.total_pages && data.meta.total_pages > 1 && (
                <div className="flex items-center justify-between px-6 py-4 border-t border-border">
                  <p className="text-sm text-muted-foreground">
                    {((page - 1) * 20) + 1}–{Math.min(page * 20, data.meta.total)} من {data.meta.total}
                  </p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>السابق</Button>
                    <Button variant="outline" size="sm" disabled={page >= (data.meta.total_pages || 1)} onClick={() => setPage(p => p + 1)}>التالي</Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Modal */}
      <MemberModal
        open={showAddModal || editingMember !== null}
        member={editingMember}
        branches={branches || []}
        onClose={() => { setShowAddModal(false); setEditingMember(null); }}
        onSuccess={() => {
          qc.invalidateQueries({ queryKey: ['members'] });
          setShowAddModal(false);
          setEditingMember(null);
        }}
      />

      {/* Delete Confirm */}
      <AlertDialog open={deletingMember !== null} onOpenChange={() => setDeletingMember(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف العضو</AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من حذف {deletingMember?.name_ar}؟ لا يمكن التراجع.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={() => deletingMember && deleteMutation.mutate(deletingMember.id)} className="bg-destructive hover:bg-destructive/90">
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function MemberModal({ open, member, branches, onClose, onSuccess }: {
  open: boolean;
  member: Member | null;
  branches: import('@/types').Branch[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [form, setForm] = useState({
    name_ar: '', name_en: '', phone: '', email: '', gender: '', dob: '',
    national_id: '', emergency_contact_name: '', emergency_contact_phone: '',
    health_notes: '', home_branch_id: '', status: 'active',
  });
  const [photo, setPhoto] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  useState(() => {
    if (member) {
      setForm({
        name_ar: member.name_ar || '',
        name_en: member.name_en || '',
        phone: member.phone || '',
        email: member.email || '',
        gender: member.gender || '',
        dob: member.dob || '',
        national_id: member.national_id || '',
        emergency_contact_name: member.emergency_contact_name || '',
        emergency_contact_phone: member.emergency_contact_phone || '',
        health_notes: member.health_notes || '',
        home_branch_id: member.home_branch_id?.toString() || '',
        status: member.status || 'active',
      });
    }
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name_ar) { toast.error('الاسم بالعربية مطلوب'); return; }
    setLoading(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => { if (v) fd.append(k, v); });
      if (photo) fd.append('photo', photo);
      if (member) {
        await membersApi.update(member.id, fd);
        toast.success('تم تحديث بيانات العضو');
      } else {
        await membersApi.create(fd);
        toast.success('تم إضافة العضو بنجاح');
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
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{member ? 'تعديل بيانات العضو' : 'إضافة عضو جديد'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>الاسم بالعربية *</Label>
              <Input value={form.name_ar} onChange={e => setForm(f => ({ ...f, name_ar: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>الاسم بالإنجليزية</Label>
              <Input value={form.name_en} onChange={e => setForm(f => ({ ...f, name_en: e.target.value }))} dir="ltr" />
            </div>
            <div className="space-y-2">
              <Label>رقم الهاتف</Label>
              <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} dir="ltr" />
            </div>
            <div className="space-y-2">
              <Label>رقم الهوية</Label>
              <Input value={form.national_id} onChange={e => setForm(f => ({ ...f, national_id: e.target.value }))} dir="ltr" />
            </div>
            <div className="space-y-2">
              <Label>الجنس</Label>
              <Select value={form.gender} onValueChange={v => setForm(f => ({ ...f, gender: v }))}>
                <SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">ذكر</SelectItem>
                  <SelectItem value="female">أنثى</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>تاريخ الميلاد</Label>
              <Input type="date" value={form.dob} onChange={e => setForm(f => ({ ...f, dob: e.target.value }))} dir="ltr" />
            </div>
            {user?.role === 'admin' && (
              <div className="space-y-2">
                <Label>الفرع</Label>
                <Select value={form.home_branch_id} onValueChange={v => setForm(f => ({ ...f, home_branch_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="اختر الفرع" /></SelectTrigger>
                  <SelectContent>
                    {branches.map(b => <SelectItem key={b.id} value={b.id.toString()}>{b.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label>جهة اتصال الطوارئ</Label>
              <Input value={form.emergency_contact_name} onChange={e => setForm(f => ({ ...f, emergency_contact_name: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>هاتف الطوارئ</Label>
              <Input value={form.emergency_contact_phone} onChange={e => setForm(f => ({ ...f, emergency_contact_phone: e.target.value }))} dir="ltr" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>ملاحظات صحية</Label>
            <Textarea value={form.health_notes} onChange={e => setForm(f => ({ ...f, health_notes: e.target.value }))} rows={2} />
          </div>
          <div className="space-y-2">
            <Label>الصورة الشخصية</Label>
            <Input type="file" accept="image/*" onChange={e => setPhoto(e.target.files?.[0] || null)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>إلغاء</Button>
            <Button type="submit" disabled={loading}>{loading ? 'جاري الحفظ...' : 'حفظ'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
