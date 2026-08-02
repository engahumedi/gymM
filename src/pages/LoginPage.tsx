import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { loginEmailForPhone } from '@/lib/api';
import { errorMessageKey } from '@/lib/errors';
import { normalizeSaudiPhone, SAUDI_PHONE_RE } from '@/lib/phone';
import { useAuth } from '@/auth/AuthProvider';
import { roleHome } from '@/auth/roleHome';
import { useI18n } from '@/i18n/I18nProvider';
import { LangToggle } from '@/components/LangToggle';
import { ConfigError } from '@/components/ConfigError';
import { FullPageSpinner } from '@/components/FullPageSpinner';
import { Field, TextInput } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { ErrorText } from '@/components/ui/misc';

// One field for staff and members alike. Staff have an email; members are known
// by the phone number reception typed into their record and will not remember
// which address was used to create their account.
//
// No minimum length on the password: accounts created before any policy change
// must still be able to sign in. Length rules belong on sign-up, not here.
const schema = z.object({
  identifier: z.string().trim().min(1),
  password: z.string().min(1),
});

const emailSchema = z.string().email();

// A Saudi mobile in any of the shapes people type it: 05…, +9665…, 9665…, 5…,
// with or without spaces and dashes. Anything else is treated as an email — no
// email can survive normalizeSaudiPhone() and match this.
function asSaudiPhone(input: string): string | null {
  const normalized = normalizeSaudiPhone(input);
  return SAUDI_PHONE_RE.test(normalized) ? normalized : null;
}

export function LoginPage() {
  const { t } = useI18n();
  const { session, profile, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isSupabaseConfigured) return <ConfigError />;
  if (loading) return <FullPageSpinner />;
  if (session && profile) {
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={from ?? roleHome(profile.role)} replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = schema.safeParse({ identifier, password });
    if (!parsed.success) return setError(t('auth.error.invalid'));

    setSubmitting(true);
    try {
      // A phone is exchanged for the account's email first — and only if the
      // password already matches it, so this leaks nothing an attacker could
      // not learn by signing in. Everything after that is the normal flow.
      const phone = asSaudiPhone(parsed.data.identifier);
      const email = phone
        ? await loginEmailForPhone(phone, parsed.data.password)
        : parsed.data.identifier;

      // Unknown phone, no account, or a wrong password all land here — and all
      // get the same message as a wrong email. Never say which part was wrong.
      if (!email || !emailSchema.safeParse(email).success) {
        return setError(t('auth.error.invalid'));
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password: parsed.data.password,
      });
      if (signInError) return setError(t('auth.error.invalid'));
      navigate('/login', { replace: true });
    } catch (err: unknown) {
      // Server-side codes (rate_limited after 10 tries on one number) and any
      // network failure — mapped to a localized message, never shown raw.
      setError(t(errorMessageKey(err instanceof Error ? err.message : String(err))));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid min-h-screen bg-bg lg:grid-cols-[1.1fr_1fr]">
      {/* Editorial panel */}
      <div className="relative hidden flex-col justify-between border-e border-border p-12 lg:flex">
        <span className="font-display text-2xl">{t('app.name')}</span>
        <div>
          <p className="eyebrow mb-4">{t('auth.panel.eyebrow')}</p>
          <h1 className="font-display max-w-md text-5xl leading-[1.05] text-text">{t('auth.panel.title')}</h1>
        </div>
        <span className="text-sm text-faint">© {new Date().getFullYear()} {t('app.name')}</span>
      </div>

      {/* Form */}
      <div className="flex flex-col justify-center px-6 py-12 sm:px-16">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-8 flex items-center justify-between">
            <div>
              <p className="eyebrow mb-1 lg:hidden">{t('app.name')}</p>
              <h2 className="font-display text-2xl">{t('auth.login.title')}</h2>
            </div>
            <LangToggle />
          </div>

          <form onSubmit={onSubmit} className="space-y-5">
            {/* The hint sits outside <Field> on purpose: Field wraps its
                children in the <label>, and text in there becomes part of the
                input's accessible name instead of its description. */}
            <div>
              <Field label={t('auth.identifier')}>
                <TextInput
                  type="text"
                  autoComplete="username"
                  autoCapitalize="off"
                  spellCheck={false}
                  dir="ltr"
                  aria-describedby="identifier-hint"
                  className="focus-ring min-h-[44px]"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  required
                />
              </Field>
              <p id="identifier-hint" className="mt-1.5 text-xs text-faint">
                {t('auth.identifier_hint')}
              </p>
            </div>
            <Field label={t('auth.password')}>
              <TextInput
                type="password"
                autoComplete="current-password"
                dir="ltr"
                className="focus-ring min-h-[44px]"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </Field>
            <ErrorText error={error} />
            <Button type="submit" loading={submitting} className="focus-ring min-h-[44px] w-full">
              {submitting ? t('auth.signing_in') : t('auth.submit')}
            </Button>
            <Link
              to="/forgot-password"
              className="focus-ring mx-auto flex min-h-[44px] items-center justify-center text-sm text-muted hover:text-text"
            >
              {t('forgot.link')}
            </Link>
          </form>
        </div>
      </div>
    </div>
  );
}
