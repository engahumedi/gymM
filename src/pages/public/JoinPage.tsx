import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { useI18n } from '@/i18n/I18nProvider';
import { useAuth } from '@/auth/AuthProvider';
import { usePublicData } from '@/lib/PublicData';
import { signUpAndJoin } from '@/lib/api';
import { normalizeSaudiPhone, SAUDI_PHONE_RE } from '@/lib/phone';
import { errorMessageKey } from '@/lib/errors';
import { localizedName } from '@/lib/display';
import { formatCurrency } from '@/lib/format';
import { InlineLoading } from '@/components/ui/misc';
import { TextInput, SelectInput } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { ErrorText } from '@/components/ui/misc';
import type { Gender } from '@/lib/database.types';

const schema = z.object({
  fullName: z.string().trim().min(2),
  phone: z.string().regex(SAUDI_PHONE_RE),
  email: z.string().email(),
  password: z.string().min(6),
  planId: z.string().uuid(),
  branchId: z.string().uuid(),
});

export function JoinPage() {
  const { t, locale } = useI18n();
  const { plans, branches, loading } = usePublicData();
  const { refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const [form, setForm] = useState({
    fullName: '', phone: '', email: '', password: '',
    gender: '' as '' | Gender,
    planId: params.get('plan') ?? '',
    branchId: '',
  });
  const [fieldErr, setFieldErr] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  if (loading) return <InlineLoading />;

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErr({});
    const candidate = { ...form, phone: normalizeSaudiPhone(form.phone) };
    const parsed = schema.safeParse(candidate);
    if (!parsed.success) {
      const errs: Record<string, boolean> = {};
      for (const i of parsed.error.issues) errs[String(i.path[0])] = true;
      setFieldErr(errs);
      setError(errs.phone ? t('err.invalid_phone') : t('err.generic'));
      return;
    }
    setBusy(true);
    try {
      await signUpAndJoin({
        email: parsed.data.email,
        password: parsed.data.password,
        fullName: parsed.data.fullName,
        phone: parsed.data.phone,
        gender: form.gender || null,
        planId: parsed.data.planId,
        branchId: parsed.data.branchId,
      });
      await refreshProfile();
      setDone(true);
    } catch (err) {
      setError(t(errorMessageKey(err instanceof Error ? err.message : '')));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4 text-center text-slate-100">
        <div className="max-w-md rounded-2xl border border-white/10 bg-slate-800/60 p-8">
          <h1 className="text-2xl font-extrabold text-brand">{t('join.success.title')}</h1>
          <p className="mt-3 text-slate-300">{t('join.success.body')}</p>
          <Button onClick={() => navigate('/portal')} className="mt-6">{t('join.success.portal')}</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-16 text-slate-100">
      <h1 className="text-3xl font-extrabold">{t('join.title')}</h1>
      <p className="mt-2 text-slate-400">{t('join.subtitle')}</p>

      <form onSubmit={onSubmit} className="mt-8 space-y-4 rounded-2xl border border-white/10 bg-slate-800/50 p-6">
        <FieldDark label={t('join.plan')} required error={fieldErr.planId}>
          <SelectInput value={form.planId} onChange={(e) => set('planId', e.target.value)} className="!bg-slate-900 !text-slate-100">
            <option value="">—</option>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>{localizedName(p, locale)} · {formatCurrency(p.price, locale)}</option>
            ))}
          </SelectInput>
        </FieldDark>
        <FieldDark label={t('join.branch')} required error={fieldErr.branchId}>
          <SelectInput value={form.branchId} onChange={(e) => set('branchId', e.target.value)} className="!bg-slate-900 !text-slate-100">
            <option value="">—</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{localizedName(b, locale)}</option>
            ))}
          </SelectInput>
        </FieldDark>
        <FieldDark label={t('join.name')} required error={fieldErr.fullName}>
          <TextInput value={form.fullName} onChange={(e) => set('fullName', e.target.value)} className="!bg-slate-900 !text-slate-100" />
        </FieldDark>
        <div className="grid grid-cols-2 gap-3">
          <FieldDark label={t('join.phone')} required error={fieldErr.phone}>
            <TextInput dir="ltr" placeholder="05XXXXXXXX" value={form.phone} onChange={(e) => set('phone', e.target.value)} className="!bg-slate-900 !text-slate-100" />
          </FieldDark>
          <FieldDark label={t('join.gender')}>
            <SelectInput value={form.gender} onChange={(e) => set('gender', e.target.value)} className="!bg-slate-900 !text-slate-100">
              <option value="">—</option>
              <option value="male">{t('member.field.male')}</option>
              <option value="female">{t('member.field.female')}</option>
            </SelectInput>
          </FieldDark>
        </div>
        <FieldDark label={t('join.email')} required error={fieldErr.email}>
          <TextInput type="email" dir="ltr" value={form.email} onChange={(e) => set('email', e.target.value)} className="!bg-slate-900 !text-slate-100" />
        </FieldDark>
        <FieldDark label={t('join.password')} required error={fieldErr.password}>
          <TextInput type="password" dir="ltr" value={form.password} onChange={(e) => set('password', e.target.value)} className="!bg-slate-900 !text-slate-100" />
        </FieldDark>

        <ErrorText error={error} />
        <Button type="submit" loading={busy} className="w-full">{t('join.submit')}</Button>
        <Link to="/login" className="block text-center text-sm text-slate-400 hover:text-brand">{t('join.have_account')}</Link>
      </form>
    </div>
  );
}

function FieldDark({ label, required, error, children }: { label: string; required?: boolean; error?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-300">
        {label}{required && <span className="text-brand"> *</span>}
      </span>
      {children}
      {error && <span className="mt-1 block text-xs text-red-400">—</span>}
    </label>
  );
}
