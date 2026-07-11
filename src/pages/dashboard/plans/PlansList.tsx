import { useState } from 'react';
import { useI18n } from '@/i18n/I18nProvider';
import { useReferenceData } from '@/lib/ReferenceData';
import { useAuth } from '@/auth/AuthProvider';
import { createPlan, updatePlan, type PlanInput } from '@/lib/api';
import { errorMessageKey } from '@/lib/errors';
import { localizedName } from '@/lib/display';
import { formatCurrency } from '@/lib/format';
import type { Plan } from '@/lib/database.types';
import { StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Field, SelectInput, TextInput } from '@/components/ui/Field';
import { EmptyState, ErrorText, InlineLoading, PageHeader } from '@/components/ui/misc';

export function PlansList() {
  const { t, locale } = useI18n();
  const { plans, loading, reload } = useReferenceData();
  const [editing, setEditing] = useState<Plan | 'new' | null>(null);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={t('plans.title')}
        action={<Button onClick={() => setEditing('new')}>{t('plans.add')}</Button>}
      />
      {loading ? (
        <InlineLoading />
      ) : plans.length === 0 ? (
        <EmptyState messageKey="sub.empty" />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-start text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
              <tr>
                <th className="px-3 py-2 text-start font-medium">{t('plans.col.name')}</th>
                <th className="px-3 py-2 text-start font-medium">{t('plans.col.duration')}</th>
                <th className="px-3 py-2 text-start font-medium">{t('plans.col.price')}</th>
                <th className="px-3 py-2 text-start font-medium">{t('plans.col.freeze')}</th>
                <th className="px-3 py-2 text-start font-medium">{t('plans.col.access')}</th>
                <th className="px-3 py-2 text-start font-medium">{t('plans.col.active')}</th>
              </tr>
            </thead>
            <tbody>
              {plans.map((p) => (
                <tr
                  key={p.id}
                  className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50"
                  onClick={() => setEditing(p)}
                >
                  <td className="px-3 py-2 font-medium">{localizedName(p, locale)}</td>
                  <td className="px-3 py-2">{p.duration_months} {t('common.months')}</td>
                  <td className="px-3 py-2">{formatCurrency(p.price, locale)}</td>
                  <td className="px-3 py-2">{p.freeze_allowance_days}</td>
                  <td className="px-3 py-2">{t(p.all_branches_access ? 'plans.access.all' : 'plans.access.single')}</td>
                  <td className="px-3 py-2">
                    <StatusBadge status={p.is_active ? 'active' : 'none'} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <PlanForm
          plan={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      )}
    </div>
  );
}

function PlanForm({ plan, onClose, onSaved }: { plan: Plan | null; onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n();
  const { profile } = useAuth();
  const [f, setF] = useState({
    name_ar: plan?.name_ar ?? '',
    name_en: plan?.name_en ?? '',
    duration_months: String(plan?.duration_months ?? 1),
    price: String(plan?.price ?? ''),
    freeze_allowance_days: String(plan?.freeze_allowance_days ?? 0),
    all_branches_access: plan?.all_branches_access ?? false,
    sessions_count: plan?.sessions_count != null ? String(plan.sessions_count) : '',
    is_active: plan?.is_active ?? true,
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      const payload: PlanInput = {
        gym_id: profile!.gym_id!,
        name_ar: f.name_ar.trim(),
        name_en: f.name_en.trim(),
        description_ar: plan?.description_ar ?? null,
        description_en: plan?.description_en ?? null,
        duration_months: Number(f.duration_months),
        price: Number(f.price),
        freeze_allowance_days: Number(f.freeze_allowance_days),
        all_branches_access: f.all_branches_access,
        sessions_count: f.sessions_count === '' ? null : Number(f.sessions_count),
        is_active: f.is_active,
        sort_order: plan?.sort_order ?? 99,
      };
      if (plan) await updatePlan(plan.id, payload);
      else await createPlan(payload);
      onSaved();
    } catch (err) {
      setError(t(errorMessageKey(err instanceof Error ? err.message : '')));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={t(plan ? 'plan.edit.title' : 'plan.add.title')}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('plan.field.name_ar')} required>
            <TextInput value={f.name_ar} onChange={(e) => setF({ ...f, name_ar: e.target.value })} />
          </Field>
          <Field label={t('plan.field.name_en')} required>
            <TextInput dir="ltr" value={f.name_en} onChange={(e) => setF({ ...f, name_en: e.target.value })} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('plan.field.duration')} required>
            <SelectInput value={f.duration_months} onChange={(e) => setF({ ...f, duration_months: e.target.value })}>
              {[1, 3, 6, 12].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </SelectInput>
          </Field>
          <Field label={t('plan.field.price')} required>
            <TextInput type="number" step="0.01" min={0} value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('plan.field.freeze')}>
            <TextInput type="number" min={0} value={f.freeze_allowance_days} onChange={(e) => setF({ ...f, freeze_allowance_days: e.target.value })} />
          </Field>
          <Field label={t('plan.field.sessions')}>
            <TextInput type="number" min={1} value={f.sessions_count} onChange={(e) => setF({ ...f, sessions_count: e.target.value })} />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={f.all_branches_access} onChange={(e) => setF({ ...f, all_branches_access: e.target.checked })} />
          {t('plan.field.all_branches')}
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={f.is_active} onChange={(e) => setF({ ...f, is_active: e.target.checked })} />
          {t('plan.field.active')}
        </label>
        <ErrorText error={error} />
        <div className="flex gap-2">
          <Button onClick={submit} loading={busy}>{t('common.save')}</Button>
          <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
        </div>
      </div>
    </Modal>
  );
}
