import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { useI18n } from '@/i18n/I18nProvider';
import { useAuth } from '@/auth/AuthProvider';
import { usePublicData } from '@/lib/PublicData';
import { signUpAndJoin } from '@/lib/api';
import { normalizeSaudiPhone, SAUDI_PHONE_RE, SAUDI_ID_RE } from '@/lib/phone';
import { errorMessageKey } from '@/lib/errors';
import { localizedName } from '@/lib/display';
import { formatPrice } from '@/lib/format';
import { InlineLoading, ErrorText } from '@/components/ui/misc';
import { Field, TextInput, SelectInput } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { Check, ICON_LG } from '@/components/ui/icons';
import type { Gender } from '@/lib/database.types';

const schema = z.object({
  fullName: z.string().trim().min(2),
  phone: z.string().regex(SAUDI_PHONE_RE),
  nationalId: z.string().trim().regex(SAUDI_ID_RE),
  email: z.string().email(),
  // Minimum 8 characters — same rule the server enforces (migration 0014).
  password: z.string().min(8),
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
    fullName: '', phone: '', nationalId: '', email: '', password: '',
    gender: '' as '' | Gender,
    planId: params.get('plan') ?? '', branchId: '',
  });
  const [fieldErr, setFieldErr] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const chosenPlan = plans.find((p) => p.id === form.planId) ?? null;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null); setFieldErr({});
    const parsed = schema.safeParse({ ...form, phone: normalizeSaudiPhone(form.phone) });
    if (!parsed.success) {
      const errs: Record<string, boolean> = {};
      for (const i of parsed.error.issues) errs[String(i.path[0])] = true;
      setFieldErr(errs);
      if (errs.phone) return setError(t('err.invalid_phone'));
      if (errs.password) return setError(t('err.weak_password'));
      return setError(t('err.generic'));
    }
    setBusy(true);
    try {
      await signUpAndJoin({ ...parsed.data, gender: form.gender || null });
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
      <div className="bg-ground">
        <div className="mx-auto max-w-content px-5 py-24">
        <div className="max-w-lg border-s-2 border-accent ps-8">
          <Check {...ICON_LG} className="mb-4 text-accent" />
          <h1 className="font-display text-4xl">{t('join.success.title')}</h1>
          <p className="mt-3 text-lg text-muted">{t('join.success.body')}</p>
          <Button onClick={() => navigate('/portal')} className="mt-8">{t('join.success.portal')}</Button>
        </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-ground">
      <div className="mx-auto grid max-w-content gap-10 px-5 pb-20 pt-12 md:pt-16 lg:grid-cols-[1fr_1.15fr] lg:gap-16">
        <div className="lg:sticky lg:top-24 lg:self-start">
          <p className="eyebrow mb-5">{t('join.eyebrow')}</p>
          <h1 className="font-display display-lg text-text">{t('join.title')}</h1>
          <p className="mt-6 max-w-sm text-lg leading-relaxed text-muted">{t('join.subtitle')}</p>

          {/* What they are about to buy, kept in view while they fill the form. */}
          {chosenPlan && (
            <div className="mt-8 rounded-lg border border-accent/40 bg-accent/[0.08] p-5">
              <p className="text-sm text-muted">{localizedName(chosenPlan, locale)}</p>
              <p className="font-display mt-1 whitespace-nowrap text-3xl text-text">
                {formatPrice(chosenPlan.price, locale)}
              </p>
              <p className="mt-1 text-sm text-faint">
                / {chosenPlan.duration_months}{' '}
                {chosenPlan.duration_months === 1 ? t('pub.plans.month') : t('pub.plans.months')}
              </p>
            </div>
          )}
        </div>

        <form onSubmit={onSubmit} className="block-panel space-y-5 p-6 md:p-8">
          {loading && plans.length === 0 && <InlineLoading />}
          <div className="grid gap-5 sm:grid-cols-2">
          <Field label={t('join.plan')} required error={fieldErr.planId ? ' ' : undefined}>
            <SelectInput value={form.planId} onChange={(e) => set('planId', e.target.value)}>
              <option value="">—</option>
              {plans.map((p) => <option key={p.id} value={p.id}>{localizedName(p, locale)} · {formatPrice(p.price, locale)}</option>)}
            </SelectInput>
          </Field>
          <Field label={t('join.branch')} required error={fieldErr.branchId ? ' ' : undefined}>
            <SelectInput value={form.branchId} onChange={(e) => set('branchId', e.target.value)}>
              <option value="">—</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{localizedName(b, locale)}</option>)}
            </SelectInput>
          </Field>
          </div>
          <Field label={t('join.name')} required error={fieldErr.fullName ? ' ' : undefined}>
          <TextInput value={form.fullName} onChange={(e) => set('fullName', e.target.value)} />
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
          <Field label={t('join.phone')} required error={fieldErr.phone ? t('err.invalid_phone') : undefined}>
            <TextInput dir="ltr" placeholder="05XXXXXXXX" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
          </Field>
          <Field label={t('join.national_id')} required error={fieldErr.nationalId ? t('err.invalid_national_id') : undefined}>
            <TextInput dir="ltr" inputMode="numeric" maxLength={10} placeholder="1XXXXXXXXX" value={form.nationalId} onChange={(e) => set('nationalId', e.target.value)} />
          </Field>
          </div>
          <Field label={t('join.gender')}>
          <SelectInput value={form.gender} onChange={(e) => set('gender', e.target.value)}>
            <option value="">—</option>
            <option value="male">{t('member.field.male')}</option>
            <option value="female">{t('member.field.female')}</option>
          </SelectInput>
          </Field>
          <Field label={t('join.email')} required error={fieldErr.email ? ' ' : undefined}>
          <TextInput type="email" dir="ltr" value={form.email} onChange={(e) => set('email', e.target.value)} />
          </Field>
          <Field label={t('join.password')} required error={fieldErr.password ? ' ' : undefined}>
          <TextInput type="password" dir="ltr" value={form.password} onChange={(e) => set('password', e.target.value)} />
          </Field>

          <ErrorText error={error} />
          {/* Full-width submit on a phone — it is the only action that matters. */}
          <div className="flex flex-col gap-4 pt-1 sm:flex-row sm:items-center sm:gap-6">
            <Button type="submit" loading={busy} className="min-h-[52px] w-full justify-center sm:w-auto">
              {t('join.submit')}
            </Button>
            <Link
              to="/login"
              className="focus-ring inline-flex min-h-[44px] items-center justify-center rounded text-sm text-muted transition-colors hover:text-text"
            >
              {t('join.have_account')}
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
