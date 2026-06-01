import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit, MapPin, Phone, Users, TrendingUp, Activity } from 'lucide-react';
import { branchesApi } from '@/api/branches';
import { extractError } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/utils';
import { Branch } from '@/types';

export function Branches() {
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Branch | null>(null);

  const { data: branches, isLoading } = useQuery({
    queryKey: ['branches-admin'],
    queryFn: () => branchesApi.getAll(),
  });

  const toggleMutation = useMutation({
    mutationFn: (branch: Branch) => branchesApi.update(branch.id, { is_active: branch.is_active ? 0 : 1 } as any),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['branches-admin'] }),
    onError: (err) => toast.error(extractError(err)),
  });

  if (isLoading) return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array(3).fill(null).map((_, i) => <Skeleton key={i} className="h-56" />)}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">الفروع</h1>
        <Button size="sm" onClick={() => { setEditing(null); setShowModal(true); }}>
          <Plus className="h-4 w-4 me-2" />
          فرع جديد
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {branches?.map(branch => (
          <Card key={branch.id} className={!branch.is_active ? 'opacity-60' : ''}>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-lg">{branch.name}</CardTitle>
                  <div className="flex items-center gap-1 mt-1 text-sm text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5" />
                    <span className="truncate">{branch.address || 'لا يوجد عنوان'}</span>
                  </div>
                </div>
                <Switch
                  checked={!!branch.is_active}
                  onCheckedChange={() => toggleMutation.mutate(branch)}
                />
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {branch.phone && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Phone className="h-3.5 w-3.5" />
                  <span dir="ltr">{branch.phone}</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="bg-muted/50 rounded-lg p-2 text-center">
                  <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                    <Users className="h-3 w-3" />
                    <span className="text-xs">أعضاء نشطون</span>
                  </div>
                  <p className="font-semibold text-lg">{(branch as any).active_members || 0}</p>
                </div>
                <div className="bg-muted/50 rounded-lg p-2 text-center">
                  <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                    <Activity className="h-3 w-3" />
                    <span className="text-xs">موظفون</span>
                  </div>
                  <p className="font-semibold text-lg">{(branch as any).staff_count || 0}</p>
                </div>
              </div>

              {(branch as any).revenue_this_month !== undefined && (
                <div className="bg-muted/50 rounded-lg p-2">
                  <div className="flex items-center gap-1 text-muted-foreground mb-1">
                    <TrendingUp className="h-3 w-3" />
                    <span className="text-xs">إيرادات هذا الشهر</span>
                  </div>
                  <p className="font-semibold">{formatCurrency((branch as any).revenue_this_month)}</p>
                </div>
              )}

              <div className="flex items-center justify-between pt-1">
                <Badge variant={branch.is_active ? 'default' : 'secondary'} className="text-xs">
                  {branch.is_active ? 'نشط' : 'غير نشط'}
                </Badge>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setEditing(branch); setShowModal(true); }}
                >
                  <Edit className="h-3.5 w-3.5 me-1" />
                  تعديل
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <BranchModal
        open={showModal}
        branch={editing}
        onClose={() => { setShowModal(false); setEditing(null); }}
        onSuccess={() => { qc.invalidateQueries({ queryKey: ['branches-admin'] }); setShowModal(false); setEditing(null); }}
      />
    </div>
  );
}

function BranchModal({ open, branch, onClose, onSuccess }: {
  open: boolean;
  branch: Branch | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [form, setForm] = useState({
    name: branch?.name || '',
    address: branch?.address || '',
    phone: branch?.phone || '',
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error('اسم الفرع مطلوب');
      return;
    }
    setLoading(true);
    try {
      if (branch) {
        await branchesApi.update(branch.id, form);
        toast.success('تم تحديث الفرع');
      } else {
        await branchesApi.create(form);
        toast.success('تم إضافة الفرع');
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
          <DialogTitle>{branch ? 'تعديل الفرع' : 'فرع جديد'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>اسم الفرع *</Label>
            <Input
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="الفرع الرئيسي"
            />
          </div>
          <div className="space-y-2">
            <Label>العنوان</Label>
            <Input
              value={form.address}
              onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
              placeholder="شارع الملك فهد، الرياض"
            />
          </div>
          <div className="space-y-2">
            <Label>رقم الهاتف</Label>
            <Input
              value={form.phone}
              onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
              placeholder="0112345678"
              dir="ltr"
            />
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
