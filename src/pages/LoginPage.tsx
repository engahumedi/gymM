import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useAuth } from '@/auth/AuthProvider';
import { roleHome } from '@/auth/roleHome';
import { useI18n } from '@/i18n/I18nProvider';
import { LangToggle } from '@/components/LangToggle';
import { ConfigError } from '@/components/ConfigError';
import { FullPageSpinner } from '@/components/FullPageSpinner';

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// Single login page for all roles. After sign-in, AuthProvider loads the
// profile and we redirect by role.
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

  // Already signed in → go to role home (or the page they came from).
  if (session && profile) {
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={from ?? roleHome(profile.role)} replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = schema.safeParse({ email, password });
    if (!parsed.success) {
      setError(t('auth.error.invalid'));
      return;
    }
    setSubmitting(true);
    const { error: signInError } = await supabase.auth.signInWithPassword(parsed.data);
    setSubmitting(false);
    if (signInError) {
      setError(t('auth.error.invalid'));
      return;
    }
    // AuthProvider's onAuthStateChange will populate the profile; navigate to a
    // neutral path and let the guard/redirect resolve the destination by role.
    navigate('/login', { replace: true });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-2xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-extrabold text-brand">{t('app.name')}</h1>
            <p className="text-sm text-slate-500">{t('auth.login.title')}</p>
          </div>
          <LangToggle />
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              {t('auth.email')}
            </label>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
              dir="ltr"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              {t('auth.password')}
            </label>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
              dir="ltr"
              required
            />
          </div>

          {error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-brand py-2 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-60"
          >
            {submitting ? t('auth.signing_in') : t('auth.submit')}
          </button>
        </form>
      </div>
    </div>
  );
}
