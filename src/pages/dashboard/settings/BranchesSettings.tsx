import { useState } from 'react';
import { useI18n } from '@/i18n/I18nProvider';
import { useReferenceData } from '@/lib/ReferenceData';
import { useAuth } from '@/auth/AuthProvider';
import { createBranch, updateBranch, type BranchInput } from '@/lib/api';
import { errorMessageKey } from '@/lib/errors';
import { localizedName } from '@/lib/display';
import type { Branch } from '@/lib/database.types';
import type { MessageKey } from '@/i18n/dictionary';
import { StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Field, TextInput } from '@/components/ui/Field';
import { EmptyState, ErrorText, InlineLoading, PageHeader } from '@/components/ui/misc';

const DAYS: { key: string; labelKey: MessageKey }[] = [
  { key: 'sun', labelKey: 'day.sun' },
  { key: 'mon', labelKey: 'day.mon' },
  { key: 'tue', labelKey: 'day.tue' },
  { key: 'wed', labelKey: 'day.wed' },
  { key: 'thu', labelKey: 'day.thu' },
  { key: 'fri', labelKey: 'day.fri' },
  { key: 'sat', labelKey: 'day.sat' },
];

export function BranchesSettings() {
  const { t, locale } = useI18n();
  const { branches, loading, reload } = useReferenceData();
  const [editing, setEditing] = useState<Branch | 'new' | null>(null);

  return (
    <div>
      <PageHeader
        title={t('branches.title')}
        action={<Button onClick={() => setEditing('new')}>{t('branches.add')}</Button>}
      />
      {loading ? (
        <InlineLoading />
      ) : branches.length === 0 ? (
        <EmptyState messageKey="sub.empty" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-start text-sm">
            <thead className="border-b border-border text-muted">
              <tr>
                <th className="px-3 py-2 text-start font-medium">{t('branches.col.name')}</th>
                <th className="px-3 py-2 text-start font-medium">{t('branches.col.city')}</th>
                <th className="px-3 py-2 text-start font-medium">{t('branches.col.phone')}</th>
                <th className="px-3 py-2 text-start font-medium">{t('branches.col.active')}</th>
              </tr>
            </thead>
            <tbody>
              {branches.map((b) => (
                <tr
                  key={b.id}
                  className="cursor-pointer border-b border-border hover:bg-surface"
                  onClick={() => setEditing(b)}
                >
                  <td className="px-3 py-2 font-medium">{localizedName(b, locale)}</td>
                  <td className="px-3 py-2">{b.city ?? '—'}</td>
                  <td className="px-3 py-2" dir="ltr">{b.phone ?? '—'}</td>
                  <td className="px-3 py-2">
                    <StatusBadge status={b.is_active ? 'active' : 'none'} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <BranchForm
          branch={editing === 'new' ? null : editing}
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

function BranchForm({ branch, onClose, onSaved }: { branch: Branch | null; onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n();
  const { profile } = useAuth();
  const [f, setF] = useState({
    name_ar: branch?.name_ar ?? '',
    name_en: branch?.name_en ?? '',
    city: branch?.city ?? '',
    phone: branch?.phone ?? '',
    address_ar: branch?.address_ar ?? '',
    address_en: branch?.address_en ?? '',
    map_url: branch?.map_url ?? '',
    is_active: branch?.is_active ?? true,
    hours: { ...(branch?.working_hours ?? {}) } as Record<string, { open: string; close: string }>,
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function setDay(day: string, part: 'open' | 'close', value: string) {
    setF((s) => {
      const cur = s.hours[day] ?? { open: '', close: '' };
      return { ...s, hours: { ...s.hours, [day]: { ...cur, [part]: value } } };
    });
  }

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      const hours = Object.fromEntries(
        Object.entries(f.hours).filter(([, v]) => v.open || v.close),
      );
      const payload: BranchInput = {
        gym_id: profile!.gym_id!,
        name_ar: f.name_ar.trim(),
        name_en: f.name_en.trim(),
        city: f.city.trim() || null,
        phone: f.phone.trim() || null,
        address_ar: f.address_ar.trim() || null,
        address_en: f.address_en.trim() || null,
        map_url: f.map_url.trim() || null,
        working_hours: hours,
        is_active: f.is_active,
      };
      if (branch) await updateBranch(branch.id, payload);
      else await createBranch(payload);
      onSaved();
    } catch (err) {
      setError(t(errorMessageKey(err instanceof Error ? err.message : '')));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={t(branch ? 'branches.edit.title' : 'branches.add.title')}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('branch.field.name_ar')} required>
            <TextInput value={f.name_ar} onChange={(e) => setF({ ...f, name_ar: e.target.value })} />
          </Field>
          <Field label={t('branch.field.name_en')} required>
            <TextInput dir="ltr" value={f.name_en} onChange={(e) => setF({ ...f, name_en: e.target.value })} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('branch.field.city')}>
            <TextInput value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} />
          </Field>
          <Field label={t('branch.field.phone')}>
            <TextInput dir="ltr" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
          </Field>
        </div>
        <Field label={t('branch.field.address_ar')}>
          <TextInput value={f.address_ar} onChange={(e) => setF({ ...f, address_ar: e.target.value })} />
        </Field>
        <Field label={t('branch.field.address_en')}>
          <TextInput dir="ltr" value={f.address_en} onChange={(e) => setF({ ...f, address_en: e.target.value })} />
        </Field>
        <Field label={t('branch.field.map_url')}>
          <TextInput dir="ltr" value={f.map_url} onChange={(e) => setF({ ...f, map_url: e.target.value })} placeholder="https://maps.google.com/…" />
        </Field>

        <div>
          <p className="mb-1.5 text-xs font-medium tracking-wide text-muted">{t('branch.field.hours')}</p>
          <div className="space-y-1.5">
            {DAYS.map(({ key, labelKey }) => (
              <div key={key} className="flex items-center gap-2 text-sm">
                <span className="w-16 shrink-0 text-muted">{t(labelKey)}</span>
                <TextInput
                  type="time"
                  value={f.hours[key]?.open ?? ''}
                  onChange={(e) => setDay(key, 'open', e.target.value)}
                  aria-label={t('branch.field.open')}
                />
                <TextInput
                  type="time"
                  value={f.hours[key]?.close ?? ''}
                  onChange={(e) => setDay(key, 'close', e.target.value)}
                  aria-label={t('branch.field.close')}
                />
              </div>
            ))}
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-text">
          <input type="checkbox" checked={f.is_active} onChange={(e) => setF({ ...f, is_active: e.target.checked })} />
          {t('branch.field.active')}
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
