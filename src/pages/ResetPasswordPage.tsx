import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { isSupabaseConfigured } from '@/lib/supabase';
import { consumeRecoveryTokens, updatePassword } from '@/lib/api';
import { useAuth } from '@/auth/AuthProvider';
import { useI18n } from '@/i18n/I18nProvider';
import { errorMessageKey } from '@/lib/errors';
import { LangToggle } from '@/components/LangToggle';
import { ConfigError } from '@/components/ConfigError';
import { FullPageSpinner } from '@/components/FullPageSpinner';
import { Field, TextInput } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { ErrorText } from '@/components/ui/misc';

const schema = z.object({ password: z.string().min(6) });

export function ResetPasswordPage() {
  const { t } = useI18n();
  const { session } = useAuth();
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [recovered, setRecovered] = useState(false);
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // On mount, try to establish the recovery session from the email link tokens.
  useEffect(() => {
    let active = true;
    consumeRecoveryTokens()
      .then((ok) => { if (active) setRecovered(ok); })
      .catch(() => { if (active) setRecovered(false); })
      .finally(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, []);

  if (!isSupabaseConfigured) return <ConfigError />;
  if (!ready) return <FullPageSpinner />;

  // Valid entry requires either a freshly-consumed recovery link or an existing session.
  const canReset = recovered || Boolean(session);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = schema.safeParse({ password });
    if (!parsed.success) return setError(t('reset.err.short'));
    setSubmitting(true);
    try {
      await updatePassword(parsed.data.password);
      setDone(true);
      setTimeout(() => navigate('/login', { replace: true }), 1500);
    } catch (err) {
      setError(t(errorMessageKey(err instanceof Error ? err.message : '')));
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col justify-center bg-bg px-6 py-12">
      <div className="mx-auto w-full max-w-sm">
        <div className="mb-8 flex items-center justify-between">
          <h2 className="font-display text-2xl">{t('reset.title')}</h2>
          <LangToggle />
        </div>

        {done ? (
          <p className="border-s-2 border-good bg-surface-2 px-3 py-3 text-sm text-text">{t('reset.done')}</p>
        ) : canReset ? (
          <form onSubmit={onSubmit} className="space-y-5">
            <p className="text-sm text-muted">{t('reset.desc')}</p>
            <Field label={t('reset.new_password')}>
              <TextInput type="password" autoComplete="new-password" dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </Field>
            <ErrorText error={error} />
            <Button type="submit" loading={submitting} className="w-full">{t('reset.submit')}</Button>
          </form>
        ) : (
          <div className="space-y-5">
            <p className="border-s-2 border-accent bg-surface-2 px-3 py-3 text-sm text-text">{t('reset.invalid')}</p>
            <Link to="/forgot-password" className="inline-block text-sm text-muted hover:text-text">{t('forgot.title')}</Link>
          </div>
        )}
      </div>
    </div>
  );
}
