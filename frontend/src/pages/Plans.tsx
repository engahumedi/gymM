import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit, Check, X } from 'lucide-react';
import { plansApi } from '@/api/plans';
import { SubscriptionPlan } from '@/types';
import { extractError } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/utils';

export function Plans() {
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<SubscriptionPlan | null>(null);

  const { data: plans, isLoading } = useQuery({
    queryKey: ['plans'],
    queryFn: plansApi.getAll,
  });

  const toggleMutation = useMutation({
    mutationFn: (plan: SubscriptionPlan) => plansApi.update(plan.id, { is_active: plan.is_active ? 0 : 1 } as any),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['plans'] }),
    onError: (err) => toast.error(extractError(err)),
  });

  if (isLoading) return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {Array(4).fill(null).map((_, i) => <Skeleton key={i} className="h-48" />)}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">خطط الاشتراك</h1>
        <Button size="sm" onClick={() => { setEditing(null); setShowModal(true); }}>
          <Plus className="h-4 w-4 me-2" />
          خطة جديدة
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {plans?.map(plan => {
          const features = (() => { try { return JSON.parse(plan.features_json); } catch { return []; } })();
          return (
            <Card key={plan.id} className={!plan.is_active ? 'opacity-60' : ''}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg">{plan.name}</CardTitle>
                    <p className="text-sm text-muted-foreground mt-1">{plan.duration_days} يوم</p>
                  </div>
                  <Switch
                    checked={!!plan.is_active}
                    onCheckedChange={() => toggleMutation.mutate(plan)}
                  />
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-primary mb-1">
                  {formatCurrency(plan.price)}
                </p>
                {plan.description && <p className="text-sm text-muted-foreground mb-3">{plan.description}</p>}
                {features.length > 0 && (
                  <ul className="space-y-1 mb-4">
                    {features.map((f: string, i: number) => (
                      <li key={i} className="flex items-center gap-2 text-sm">
                        <Check className="h-3.5 w-3.5 text-green-400 shrink-0" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => { setEditing(plan); setShowModal(true); }}
                >
                  <Edit className="h-3.5 w-3.5 me-2" />
                  تعديل
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <PlanModal
        open={showModal}
        plan={editing}
        onClose={() => { setShowModal(false); setEditing(null); }}
        onSuccess={() => { qc.invalidateQueries({ queryKey: ['plans'] }); setShowModal(false); setEditing(null); }}
      />
    </div>
  );
}

function PlanModal({ open, plan, onClose, onSuccess }: {
  open: boolean;
  plan: SubscriptionPlan | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [form, setForm] = useState({
    name: plan?.name || '',
    duration_days: plan?.duration_days?.toString() || '',
    price: plan?.price?.toString() || '',
    description: plan?.description || '',
    features: (() => { try { return (JSON.parse(plan?.features_json || '[]') as string[]).join('\n'); } catch { return ''; } })(),
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.duration_days || !form.price) {
      toast.error('يرجى ملء الحقول المطلوبة'); return;
    }
    setLoading(true);
    try {
      const data = {
        name: form.name,
        duration_days: parseInt(form.duration_days),
        price: parseFloat(form.price),
        description: form.description,
        features_json: JSON.stringify(form.features.split('\n').filter(Boolean)),
      };
      if (plan) {
        await plansApi.update(plan.id, data);
        toast.success('تم تحديث الخطة');
      } else {
        await plansApi.create(data);
        toast.success('تم إضافة الخطة');
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
          <DialogTitle>{plan ? 'تعديل الخطة' : 'خطة جديدة'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>اسم الخطة *</Label>
            <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>المدة (بالأيام) *</Label>
              <Input type="number" value={form.duration_days} onChange={e => setForm(f => ({ ...f, duration_days: e.target.value }))} dir="ltr" />
            </div>
            <div className="space-y-2">
              <Label>السعر (ريال) *</Label>
              <Input type="number" step="0.01" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} dir="ltr" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>الوصف</Label>
            <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>المميزات (سطر لكل ميزة)</Label>
            <Textarea value={form.features} onChange={e => setForm(f => ({ ...f, features: e.target.value }))} rows={4} placeholder="دخول غير محدود&#10;استخدام الصالة الرئيسية" />
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
