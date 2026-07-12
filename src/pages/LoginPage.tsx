import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useAuth } from '@/auth/AuthProvider';
import { roleHome } from '@/auth/roleHome';
import { useI18n } from '@/i18n/I18nProvider';
import { LangToggle } from '@/components/LangToggle';
import { ConfigError } from '@/components/ConfigError';
import { FullPageSpinner } from '@/components/FullPageSpinner';
import { Field, TextInput } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { ErrorText } from '@/components/ui/misc';

const schema = z.object({ email: z.string().email(), password: z.string().min(1) });

export function LoginPage() {
  const { t } = useI18n();
  const { session, profile, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
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
    const parsed = schema.safeParse({ email, password });
    if (!parsed.success) return setError(t('auth.error.invalid'));
    setSubmitting(true);
    const { error: signInError } = await supabase.auth.signInWithPassword(parsed.data);
    setSubmitting(false);
    if (signInError) return setError(t('auth.error.invalid'));
    navigate('/login', { replace: true });
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
            <Field label={t('auth.email')}>
              <TextInput type="email" autoComplete="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </Field>
            <Field label={t('auth.password')}>
              <TextInput type="password" autoComplete="current-password" dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </Field>
            <ErrorText error={error} />
            <Button type="submit" loading={submitting} className="w-full">
              {submitting ? t('auth.signing_in') : t('auth.submit')}
            </Button>
            <Link to="/forgot-password" className="block text-center text-sm text-muted hover:text-text">
              {t('forgot.link')}
            </Link>
          </form>
        </div>
      </div>
    </div>
  );
}
