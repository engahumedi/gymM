import { useState } from 'react';
import { useI18n } from '@/i18n/I18nProvider';
import { useReferenceData } from '@/lib/ReferenceData';
import { useAuth } from '@/auth/AuthProvider';
import { useAsync } from '@/lib/useAsync';
import {
  fetchAllTrainers,
  createTrainer,
  updateTrainer,
  uploadPublicAsset,
  type TrainerInput,
} from '@/lib/api';
import { errorMessageKey } from '@/lib/errors';
import { localizedName } from '@/lib/display';
import type { Trainer } from '@/lib/database.types';
import { StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Field, SelectInput, TextInput } from '@/components/ui/Field';
import { InlineLoading, ErrorText } from '@/components/ui/misc';

export function TrainersSettings() {
  const { t, locale } = useI18n();
  const { data, loading, reload } = useAsync(fetchAllTrainers, []);
  const [editing, setEditing] = useState<Trainer | 'new' | null>(null);
  const trainers = data ?? [];

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-display text-xl text-text">{t('trainers.title')}</h2>
        <Button onClick={() => setEditing('new')}>{t('trainers.add')}</Button>
      </div>
      {loading ? (
        <InlineLoading />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-start text-sm">
            <thead className="border-b border-border text-muted">
              <tr>
                <th className="px-3 py-2 text-start font-medium">{t('trainer.field.name_ar')}</th>
                <th className="px-3 py-2 text-start font-medium">{t('trainer.field.specialty_ar')}</th>
                <th className="px-3 py-2 text-start font-medium">{t('branches.col.active')}</th>
              </tr>
            </thead>
            <tbody>
              {trainers.map((tr) => (
                <tr
                  key={tr.id}
                  className="cursor-pointer border-b border-border hover:bg-surface"
                  onClick={() => setEditing(tr)}
                >
                  <td className="px-3 py-2 font-medium">{localizedName(tr, locale)}</td>
                  <td className="px-3 py-2 text-muted">
                    {locale === 'ar' ? tr.specialty_ar ?? '—' : tr.specialty_en ?? '—'}
                  </td>
                  <td className="px-3 py-2">
                    <StatusBadge status={tr.is_active ? 'active' : 'none'} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <TrainerForm
          trainer={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      )}
    </section>
  );
}

function TrainerForm({ trainer, onClose, onSaved }: { trainer: Trainer | null; onClose: () => void; onSaved: () => void }) {
  const { t, locale } = useI18n();
  const { profile } = useAuth();
  const { branches } = useReferenceData();
  const [f, setF] = useState({
    name_ar: trainer?.name_ar ?? '',
    name_en: trainer?.name_en ?? '',
    specialty_ar: trainer?.specialty_ar ?? '',
    specialty_en: trainer?.specialty_en ?? '',
    photo_url: trainer?.photo_url ?? '',
    branch_id: trainer?.branch_id ?? '',
    is_active: trainer?.is_active ?? true,
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const url = await uploadPublicAsset(file, 'trainers');
      setF((s) => ({ ...s, photo_url: url }));
    } catch (err) {
      setError(t(errorMessageKey(err instanceof Error ? err.message : '')));
    } finally {
      setUploading(false);
    }
  }

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      const payload: TrainerInput = {
        gym_id: profile!.gym_id!,
        branch_id: f.branch_id || null,
        name_ar: f.name_ar.trim(),
        name_en: f.name_en.trim(),
        specialty_ar: f.specialty_ar.trim() || null,
        specialty_en: f.specialty_en.trim() || null,
        bio_ar: trainer?.bio_ar ?? null,
        bio_en: trainer?.bio_en ?? null,
        photo_url: f.photo_url.trim() || null,
        socials: trainer?.socials ?? {},
        sort_order: trainer?.sort_order ?? 99,
        is_active: f.is_active,
      };
      if (trainer) await updateTrainer(trainer.id, payload);
      else await createTrainer(payload);
      onSaved();
    } catch (err) {
      setError(t(errorMessageKey(err instanceof Error ? err.message : '')));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={t(trainer ? 'trainer.edit.title' : 'trainer.add.title')}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('trainer.field.name_ar')} required>
            <TextInput value={f.name_ar} onChange={(e) => setF({ ...f, name_ar: e.target.value })} />
          </Field>
          <Field label={t('trainer.field.name_en')} required>
            <TextInput dir="ltr" value={f.name_en} onChange={(e) => setF({ ...f, name_en: e.target.value })} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('trainer.field.specialty_ar')}>
            <TextInput value={f.specialty_ar} onChange={(e) => setF({ ...f, specialty_ar: e.target.value })} />
          </Field>
          <Field label={t('trainer.field.specialty_en')}>
            <TextInput dir="ltr" value={f.specialty_en} onChange={(e) => setF({ ...f, specialty_en: e.target.value })} />
          </Field>
        </div>
        <Field label={t('trainer.field.photo')}>
          <div className="flex items-center gap-4">
            {f.photo_url ? (
              <img src={f.photo_url} alt="" className="h-12 w-12 rounded object-cover" />
            ) : (
              <div className="h-12 w-12 rounded border border-dashed border-border" />
            )}
            <label className="cursor-pointer rounded border border-border-strong px-3 py-1.5 text-sm text-text hover:bg-surface-2">
              {uploading ? t('common.loading') : t('identity.logo.upload')}
              <input type="file" accept="image/*" className="hidden" onChange={onPhoto} disabled={uploading} />
            </label>
          </div>
        </Field>
        <Field label={t('trainer.field.branch')}>
          <SelectInput value={f.branch_id} onChange={(e) => setF({ ...f, branch_id: e.target.value })}>
            <option value="">{t('staff.no_branch')}</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{localizedName(b, locale)}</option>
            ))}
          </SelectInput>
        </Field>
        <label className="flex items-center gap-2 text-sm text-text">
          <input type="checkbox" checked={f.is_active} onChange={(e) => setF({ ...f, is_active: e.target.checked })} />
          {t('trainer.field.active')}
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
