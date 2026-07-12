import { useState, type FormEvent } from 'react';
import { Navigate, Link, useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { isSupabaseConfigured } from '@/lib/supabase';
import { signUpStaff } from '@/lib/api';
import { useAuth } from '@/auth/AuthProvider';
import { roleHome } from '@/auth/roleHome';
import { useI18n } from '@/i18n/I18nProvider';
import { errorMessageKey } from '@/lib/errors';
import { LangToggle } from '@/components/LangToggle';
import { ConfigError } from '@/components/ConfigError';
import { FullPageSpinner } from '@/components/FullPageSpinner';
import { Field, TextInput } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { ErrorText } from '@/components/ui/misc';

const schema = z.object({ email: z.string().email(), password: z.string().min(6) });

export function StaffSignupPage() {
  const { t } = useI18n();
  const { session, profile, loading } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState(params.get('email') ?? '');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isSupabaseConfigured) return <ConfigError />;
  if (loading) return <FullPageSpinner />;
  if (session && profile) return <Navigate to={roleHome(profile.role)} replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = schema.safeParse({ email, password });
    if (!parsed.success) return setError(t('err.email_required'));
    setSubmitting(true);
    try {
      await signUpStaff(parsed.data.email.trim().toLowerCase(), parsed.data.password);
      // Autoconfirm is on: a session is active and the auth trigger has applied
      // the invited role. Route through /login, which redirects by role.
      navigate('/login', { replace: true });
    } catch (err) {
      setError(t(errorMessageKey(err instanceof Error ? err.message : '')));
      setSubmitting(false);
    }
  }

  return (
    <div className="grid min-h-screen bg-bg lg:grid-cols-[1.1fr_1fr]">
      <div className="relative hidden flex-col justify-between border-e border-border p-12 lg:flex">
        <span className="font-display text-2xl">{t('app.name')}</span>
        <div>
          <p className="eyebrow mb-4">{t('auth.panel.eyebrow')}</p>
          <h1 className="font-display max-w-md text-5xl leading-[1.05] text-text">{t('staffsignup.title')}</h1>
        </div>
        <span className="text-sm text-faint">© {new Date().getFullYear()} {t('app.name')}</span>
      </div>

      <div className="flex flex-col justify-center px-6 py-12 sm:px-16">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-8 flex items-center justify-between">
            <div>
              <p className="eyebrow mb-1 lg:hidden">{t('app.name')}</p>
              <h2 className="font-display text-2xl">{t('staffsignup.title')}</h2>
            </div>
            <LangToggle />
          </div>

          <p className="mb-6 text-sm text-muted">{t('staffsignup.desc')}</p>

          <form onSubmit={onSubmit} className="space-y-5">
            <Field label={t('staffsignup.email')}>
              <TextInput type="email" autoComplete="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </Field>
            <Field label={t('staffsignup.password')}>
              <TextInput type="password" autoComplete="new-password" dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </Field>
            <ErrorText error={error} />
            <Button type="submit" loading={submitting} className="w-full">
              {t('staffsignup.submit')}
            </Button>
          </form>

          <Link to="/login" className="mt-6 inline-block text-sm text-muted hover:text-text">
            {t('staffsignup.have_account')}
          </Link>
        </div>
      </div>
    </div>
  );
}
