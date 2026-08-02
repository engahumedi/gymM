import { useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { z } from 'zod';
import { useI18n } from '@/i18n/I18nProvider';
import { useAuth } from '@/auth/AuthProvider';
import { useReferenceData } from '@/lib/ReferenceData';
import { createMember, updateMember, fetchMember, uploadMemberPhoto } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { normalizeSaudiPhone, SAUDI_PHONE_RE, SAUDI_ID_RE } from '@/lib/phone';
import { errorMessageKey } from '@/lib/errors';
import { localizedName } from '@/lib/display';
import { Field, TextInput, SelectInput, TextArea } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { ErrorText, InlineLoading, PageHeader } from '@/components/ui/misc';
import { DateField } from '@/components/ui/DateField';
import type { MessageKey } from '@/i18n/dictionary';

const schema = z.object({
  full_name: z.string().trim().min(2),
  phone: z.string().trim().regex(SAUDI_PHONE_RE),
  national_id: z.string().trim().regex(SAUDI_ID_RE),
  gender: z.enum(['male', 'female']).nullable(),
  dob: z.string().nullable(),
  branch_id: z.string().uuid(),
  emergency_contact_name: z.string().nullable(),
  emergency_contact_phone: z.string().nullable(),
  notes: z.string().nullable(),
});

export function MemberForm() {
  const { t, locale } = useI18n();
  const { profile } = useAuth();
  const { branches } = useReferenceData();
  const navigate = useNavigate();
  const { id } = useParams();
  const editing = Boolean(id);
  const isAdmin = profile?.role === 'super_admin';

  const existing = useAsync(async () => (id ? fetchMember(id) : null), [id]);

  const [form, setForm] = useState({
    full_name: '',
    phone: '',
    national_id: '',
    gender: '' as '' | 'male' | 'female',
    dob: '',
    branch_id: profile?.branch_id ?? '',
    emergency_contact_name: '',
    emergency_contact_phone: '',
    notes: '',
  });
  const [initialized, setInitialized] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [fieldErr, setFieldErr] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Prefill when editing.
  if (editing && existing.data && !initialized) {
    const m = existing.data;
    setForm({
      full_name: m.full_name,
      phone: m.phone,
      national_id: m.national_id ?? '',
      gender: (m.gender as 'male' | 'female' | null) ?? '',
      dob: m.dob ?? '',
      branch_id: m.branch_id ?? '',
      emergency_contact_name: m.emergency_contact_name ?? '',
      emergency_contact_phone: m.emergency_contact_phone ?? '',
      notes: m.notes ?? '',
    });
    setInitialized(true);
  }

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErr({});

    const candidate = {
      ...form,
      phone: normalizeSaudiPhone(form.phone),
      gender: form.gender || null,
      dob: form.dob || null,
      emergency_contact_name: form.emergency_contact_name || null,
      emergency_contact_phone: form.emergency_contact_phone || null,
      notes: form.notes || null,
    };
    const parsed = schema.safeParse(candidate);
    if (!parsed.success) {
      const errs: Record<string, boolean> = {};
      for (const issue of parsed.error.issues) errs[String(issue.path[0])] = true;
      setFieldErr(errs);
      setError(errs.phone ? t('err.invalid_phone') : t('err.generic'));
      return;
    }

    setSaving(true);
    try {
      let memberId = id ?? null;
      if (editing && id) {
        await updateMember(id, parsed.data);
      } else {
        const created = await createMember({ gym_id: profile!.gym_id!, ...parsed.data });
        memberId = created.id;
      }
      if (file && memberId) {
        const path = await uploadMemberPhoto(memberId, file);
        await updateMember(memberId, { photo_url: path });
      }
      navigate(`/dashboard/members/${memberId}`);
    } catch (err) {
      setError(t(errorMessageKey(err instanceof Error ? err.message : '')));
    } finally {
      setSaving(false);
    }
  }

  if (editing && existing.loading) return <InlineLoading />;

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title={t((editing ? 'member.edit.title' : 'member.register.title') as MessageKey)} />
      <form onSubmit={onSubmit} className="max-w-xl space-y-5">
        <Field label={t('member.field.name')} required error={fieldErr.full_name ? t('err.generic') : undefined}>
          <TextInput value={form.full_name} onChange={(e) => set('full_name', e.target.value)} />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t('member.field.phone')} required error={fieldErr.phone ? t('err.invalid_phone') : undefined}>
            <TextInput dir="ltr" placeholder="05XXXXXXXX" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
          </Field>
          <Field label={t('member.field.national_id')} required error={fieldErr.national_id ? t('err.invalid_national_id') : undefined}>
            <TextInput dir="ltr" inputMode="numeric" maxLength={10} placeholder="1XXXXXXXXX" value={form.national_id} onChange={(e) => set('national_id', e.target.value)} />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t('member.field.gender')}>
            <SelectInput value={form.gender} onChange={(e) => set('gender', e.target.value)}>
              <option value="">—</option>
              <option value="male">{t('member.field.male')}</option>
              <option value="female">{t('member.field.female')}</option>
            </SelectInput>
          </Field>
          <Field label={t('member.field.dob')}>
            <DateField value={form.dob} onChange={(v) => set('dob', v)} />
          </Field>
        </div>

        <Field label={t('member.field.branch')} required error={fieldErr.branch_id ? t('err.generic') : undefined}>
          <SelectInput
            value={form.branch_id}
            onChange={(e) => set('branch_id', e.target.value)}
            disabled={!isAdmin}
          >
            <option value="">—</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {localizedName(b, locale)}
              </option>
            ))}
          </SelectInput>
        </Field>

        <Field label={t('member.field.photo')}>
          <TextInput type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t('member.field.emergency_name')}>
            <TextInput value={form.emergency_contact_name} onChange={(e) => set('emergency_contact_name', e.target.value)} />
          </Field>
          <Field label={t('member.field.emergency_phone')}>
            <TextInput dir="ltr" value={form.emergency_contact_phone} onChange={(e) => set('emergency_contact_phone', e.target.value)} />
          </Field>
        </div>

        <Field label={t('member.field.notes')}>
          <TextArea rows={3} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
        </Field>

        <ErrorText error={error} />

        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Button type="submit" loading={saving}>{t('common.save')}</Button>
          <Button type="button" variant="secondary" onClick={() => navigate(-1)}>{t('common.cancel')}</Button>
        </div>
      </form>
    </div>
  );
}
