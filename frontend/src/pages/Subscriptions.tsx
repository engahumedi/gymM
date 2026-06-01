import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, RefreshCw, Snowflake, XCircle, Printer, MoreHorizontal } from 'lucide-react';
import { subscriptionsApi } from '@/api/subscriptions';
import { membersApi } from '@/api/members';
import { plansApi } from '@/api/plans';
import { branchesApi } from '@/api/branches';
import { Subscription, SubscriptionPlan, Member } from '@/types';
import { extractError } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { formatDate, formatCurrency, getSubscriptionStatusLabel, getSubscriptionStatusColor, getPaymentMethodLabel, daysUntil } from '@/lib/utils';

type ModalType = 'new' | 'freeze' | 'cancel' | 'receipt' | null;

export function Subscriptions() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState<ModalType>(null);
  const [selectedSub, setSelectedSub] = useState<Subscription | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['subscriptions', search, statusFilter, page],
    queryFn: () => subscriptionsApi.getAll({ search, status: statusFilter, page, per_page: 20 }),
  });

  const renewMutation = useMutation({
    mutationFn: (id: number) => subscriptionsApi.renew(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['subscriptions'] }); toast.success('تم تجديد الاشتراك'); },
    onError: (err) => toast.error(extractError(err)),
  });

  const openModal = (type: ModalType, sub: Subscription) => {
    setSelectedSub(sub);
    setModal(type);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">الاشتراكات</h1>
        <Button size="sm" onClick={() => { setSelectedSub(null); setModal('new'); }}>
          <Plus className="h-4 w-4 me-2" />
          اشتراك جديد
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4 flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="بحث بالاسم أو الرمز..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="ps-9" />
          </div>
          <Select value={statusFilter} onValueChange={v => { setStatusFilter(v === 'all' ? '' : v); setPage(1); }}>
            <SelectTrigger className="w-36"><SelectValue placeholder="الحالة" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">جميع الحالات</SelectItem>
              <SelectItem value="active">نشط</SelectItem>
              <SelectItem value="expired">منتهي</SelectItem>
              <SelectItem value="frozen">مجمد</SelectItem>
              <SelectItem value="cancelled">ملغى</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">{Array(5).fill(null).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>العضو</TableHead>
                  <TableHead>الخطة</TableHead>
                  <TableHead>الفرع</TableHead>
                  <TableHead>تاريخ الانتهاء</TableHead>
                  <TableHead>المبلغ</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.data.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-12">لا توجد اشتراكات</TableCell></TableRow>
                ) : data?.data.map(sub => {
                  const days = daysUntil(sub.end_date);
                  const isExpiring = sub.status === 'active' && days <= 7 && days >= 0;
                  return (
                    <TableRow key={sub.id}>
                      <TableCell>
                        <p className="font-medium text-sm">{sub.member_name}</p>
                        <p className="text-xs text-muted-foreground font-mono">{sub.member_code}</p>
                      </TableCell>
                      <TableCell className="text-sm">{sub.plan_name}</TableCell>
                      <TableCell className="text-sm">{sub.branch_name}</TableCell>
                      <TableCell>
                        <p className="text-sm">{formatDate(sub.end_date)}</p>
                        {isExpiring && <p className="text-xs text-yellow-400">ينتهي خلال {days} يوم</p>}
                        {sub.status === 'active' && days < 0 && <p className="text-xs text-red-400">منتهي</p>}
                      </TableCell>
                      <TableCell className="text-sm">{formatCurrency(sub.price_paid)}</TableCell>
                      <TableCell>
                        <Badge className={getSubscriptionStatusColor(sub.status)}>
                          {getSubscriptionStatusLabel(sub.status)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openModal('receipt', sub)}>
                              <Printer className="me-2 h-4 w-4" /> طباعة الإيصال
                            </DropdownMenuItem>
                            {sub.status === 'active' && <>
                              <DropdownMenuItem onClick={() => renewMutation.mutate(sub.id)}>
                                <RefreshCw className="me-2 h-4 w-4" /> تجديد
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => openModal('freeze', sub)}>
                                <Snowflake className="me-2 h-4 w-4" /> تجميد
                              </DropdownMenuItem>
                            </>}
                            {sub.status === 'frozen' && (
                              <DropdownMenuItem onClick={() => subscriptionsApi.unfreeze(sub.id).then(() => { qc.invalidateQueries({ queryKey: ['subscriptions'] }); toast.success('تم إلغاء التجميد'); }).catch(err => toast.error(extractError(err)))}>
                                <Snowflake className="me-2 h-4 w-4" /> إلغاء التجميد
                              </DropdownMenuItem>
                            )}
                            {(sub.status === 'active' || sub.status === 'frozen') && (
                              <DropdownMenuItem onClick={() => openModal('cancel', sub)} className="text-destructive">
                                <XCircle className="me-2 h-4 w-4" /> إلغاء الاشتراك
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
          )}
          {data && data.meta.total > 20 && (
            <div className="flex items-center justify-between px-6 py-4 border-t border-border">
              <p className="text-sm text-muted-foreground">{data.meta.total} اشتراك إجمالاً</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>السابق</Button>
                <Button variant="outline" size="sm" disabled={page * 20 >= data.meta.total} onClick={() => setPage(p => p + 1)}>التالي</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* New Subscription Wizard */}
      {modal === 'new' && <NewSubModal onClose={() => setModal(null)} onSuccess={() => { qc.invalidateQueries({ queryKey: ['subscriptions'] }); setModal(null); }} />}

      {/* Freeze Modal */}
      {modal === 'freeze' && selectedSub && (
        <FreezeModal sub={selectedSub} onClose={() => setModal(null)} onSuccess={() => { qc.invalidateQueries({ queryKey: ['subscriptions'] }); setModal(null); toast.success('تم تجميد الاشتراك'); }} />
      )}

      {/* Cancel Modal */}
      {modal === 'cancel' && selectedSub && (
        <CancelModal sub={selectedSub} onClose={() => setModal(null)} onSuccess={() => { qc.invalidateQueries({ queryKey: ['subscriptions'] }); setModal(null); toast.success('تم إلغاء الاشتراك'); }} />
      )}

      {/* Receipt */}
      {modal === 'receipt' && selectedSub && (
        <ReceiptModal sub={selectedSub} onClose={() => setModal(null)} />
      )}
    </div>
  );
}

function NewSubModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [step, setStep] = useState(1);
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan | null>(null);
  const [memberSearch, setMemberSearch] = useState('');
  const [form, setForm] = useState({ start_date: new Date().toISOString().split('T')[0], price_paid: '', discount_amount: '0', payment_method: 'cash', payment_reference: '', notes: '' });
  const [loading, setLoading] = useState(false);

  const { data: memberResults } = useQuery({
    queryKey: ['members-search', memberSearch],
    queryFn: () => membersApi.getAll({ search: memberSearch, per_page: 10 }),
    enabled: memberSearch.length > 1,
  });

  const { data: plans } = useQuery({ queryKey: ['plans'], queryFn: plansApi.getAll });

  const endDate = selectedPlan && form.start_date
    ? (() => { const d = new Date(form.start_date); d.setDate(d.getDate() + selectedPlan.duration_days - 1); return d.toISOString().split('T')[0]; })()
    : '';

  const handleSubmit = async () => {
    if (!selectedMember || !selectedPlan) return;
    setLoading(true);
    try {
      await subscriptionsApi.create({
        member_id: selectedMember.id,
        plan_id: selectedPlan.id,
        start_date: form.start_date,
        price_paid: parseFloat(form.price_paid) || selectedPlan.price,
        discount_amount: parseFloat(form.discount_amount) || 0,
        payment_method: form.payment_method,
        payment_reference: form.payment_reference,
        notes: form.notes,
      });
      onSuccess();
      toast.success('تم إنشاء الاشتراك بنجاح');
    } catch (err) {
      toast.error(extractError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>اشتراك جديد — الخطوة {step} من 3</DialogTitle>
        </DialogHeader>
        <div className="flex gap-2 mb-4">
          {[1,2,3].map(s => <div key={s} className={`h-1.5 flex-1 rounded-full transition-colors ${step >= s ? 'bg-primary' : 'bg-muted'}`} />)}
        </div>

        {step === 1 && (
          <div className="space-y-3">
            <Label>ابحث عن عضو</Label>
            <Input placeholder="الاسم أو رقم الهاتف..." value={memberSearch} onChange={e => setMemberSearch(e.target.value)} />
            {memberResults?.data.map(m => (
              <div key={m.id} onClick={() => { setSelectedMember(m); setMemberSearch(m.name_ar); }} className={`cursor-pointer p-3 rounded-lg border transition-colors ${selectedMember?.id === m.id ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted/50'}`}>
                <p className="font-medium">{m.name_ar}</p>
                <p className="text-xs text-muted-foreground">{m.member_code} · {m.phone}</p>
              </div>
            ))}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <Label>اختر الخطة</Label>
            {plans?.filter(p => p.is_active).map(p => (
              <div key={p.id} onClick={() => { setSelectedPlan(p); setForm(f => ({ ...f, price_paid: p.price.toString() })); }} className={`cursor-pointer p-3 rounded-lg border transition-colors ${selectedPlan?.id === p.id ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted/50'}`}>
                <div className="flex items-center justify-between">
                  <p className="font-medium">{p.name}</p>
                  <p className="font-bold text-primary">{formatCurrency(p.price)}</p>
                </div>
                <p className="text-xs text-muted-foreground">{p.duration_days} يوم</p>
              </div>
            ))}
            <div className="space-y-2 pt-2">
              <Label>تاريخ البدء</Label>
              <Input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} dir="ltr" />
              {endDate && <p className="text-sm text-muted-foreground">تاريخ الانتهاء: {formatDate(endDate)}</p>}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <div className="bg-muted/50 rounded-lg p-4 text-sm space-y-1">
              <p><strong>العضو:</strong> {selectedMember?.name_ar}</p>
              <p><strong>الخطة:</strong> {selectedPlan?.name} ({selectedPlan?.duration_days} يوم)</p>
              <p><strong>من:</strong> {formatDate(form.start_date)} <strong className="mx-2">إلى:</strong> {formatDate(endDate)}</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>المبلغ المدفوع</Label>
                <Input type="number" value={form.price_paid} onChange={e => setForm(f => ({ ...f, price_paid: e.target.value }))} dir="ltr" />
              </div>
              <div className="space-y-2">
                <Label>الخصم</Label>
                <Input type="number" value={form.discount_amount} onChange={e => setForm(f => ({ ...f, discount_amount: e.target.value }))} dir="ltr" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>طريقة الدفع</Label>
              <Select value={form.payment_method} onValueChange={v => setForm(f => ({ ...f, payment_method: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">نقداً</SelectItem>
                  <SelectItem value="transfer">تحويل بنكي</SelectItem>
                  <SelectItem value="card">بطاقة</SelectItem>
                  <SelectItem value="online">إلكتروني</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>ملاحظات</Label>
              <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          {step > 1 && <Button variant="outline" onClick={() => setStep(s => s - 1)}>السابق</Button>}
          {step < 3 && <Button onClick={() => setStep(s => s + 1)} disabled={(step === 1 && !selectedMember) || (step === 2 && !selectedPlan)}>التالي</Button>}
          {step === 3 && <Button onClick={handleSubmit} disabled={loading}>{loading ? 'جاري الحفظ...' : 'تأكيد الاشتراك'}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FreezeModal({ sub, onClose, onSuccess }: { sub: Subscription; onClose: () => void; onSuccess: () => void }) {
  const [days, setDays] = useState('7');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  const handleFreeze = async () => {
    setLoading(true);
    try {
      await subscriptionsApi.freeze(sub.id, parseInt(days), reason);
      onSuccess();
    } catch (err) {
      toast.error(extractError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>تجميد الاشتراك</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground">تجميد اشتراك: <strong>{sub.member_name}</strong></p>
          <p className="text-xs text-yellow-400">التجميدات المتبقية: {2 - sub.freeze_count} من 2</p>
          <div className="space-y-2">
            <Label>عدد أيام التجميد</Label>
            <Input type="number" min="1" max="90" value={days} onChange={e => setDays(e.target.value)} dir="ltr" />
          </div>
          <div className="space-y-2">
            <Label>سبب التجميد</Label>
            <Textarea value={reason} onChange={e => setReason(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={handleFreeze} disabled={loading}>{loading ? 'جاري التجميد...' : 'تجميد'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CancelModal({ sub, onClose, onSuccess }: { sub: Subscription; onClose: () => void; onSuccess: () => void }) {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCancel = async () => {
    if (!reason) { toast.error('سبب الإلغاء مطلوب'); return; }
    setLoading(true);
    try {
      await subscriptionsApi.cancel(sub.id, reason);
      onSuccess();
    } catch (err) {
      toast.error(extractError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>إلغاء الاشتراك</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground">إلغاء اشتراك: <strong>{sub.member_name}</strong></p>
          <div className="space-y-2">
            <Label>سبب الإلغاء *</Label>
            <Textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button variant="destructive" onClick={handleCancel} disabled={loading}>{loading ? 'جاري الإلغاء...' : 'تأكيد الإلغاء'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReceiptModal({ sub, onClose }: { sub: Subscription; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>إيصال الاشتراك</DialogTitle></DialogHeader>
        <div id="receipt" className="border border-border rounded-lg p-6 space-y-4 text-sm">
          <div className="text-center border-b border-border pb-4">
            <h2 className="text-xl font-bold">الصالة الرياضية</h2>
            <p className="text-muted-foreground text-xs mt-1">إيصال اشتراك</p>
          </div>
          <div className="space-y-2">
            <Row2 label="العضو" value={sub.member_name} />
            <Row2 label="الرمز" value={sub.member_code} />
            <Row2 label="الخطة" value={sub.plan_name} />
            <Row2 label="الفرع" value={sub.branch_name} />
            <Row2 label="من" value={formatDate(sub.start_date)} />
            <Row2 label="إلى" value={formatDate(sub.end_date)} />
          </div>
          <div className="border-t border-border pt-3 space-y-1">
            <Row2 label="طريقة الدفع" value={getPaymentMethodLabel(sub.payment_method)} />
            {sub.discount_amount > 0 && <Row2 label="الخصم" value={formatCurrency(sub.discount_amount)} />}
            <div className="flex justify-between font-bold text-base">
              <span>الإجمالي</span>
              <span className="text-primary">{formatCurrency(sub.price_paid)}</span>
            </div>
          </div>
          <p className="text-center text-xs text-muted-foreground border-t border-border pt-3">
            {new Date().toLocaleDateString('ar-SA')} · {sub.processed_by_name}
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إغلاق</Button>
          <Button onClick={() => window.print()}>طباعة</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row2({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span>{value || '-'}</span>
    </div>
  );
}
