import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { z } from 'zod';
import { isSupabaseConfigured } from '@/lib/supabase';
import { sendPasswordReset } from '@/lib/api';
import { useI18n } from '@/i18n/I18nProvider';
import { errorMessageKey } from '@/lib/errors';
import { LangToggle } from '@/components/LangToggle';
import { ConfigError } from '@/components/ConfigError';
import { Field, TextInput } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { ErrorText } from '@/components/ui/misc';

const schema = z.object({ email: z.string().email() });

export function ForgotPasswordPage() {
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  if (!isSupabaseConfigured) return <ConfigError />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = schema.safeParse({ email });
    if (!parsed.success) return setError(t('err.email_required'));
    setSubmitting(true);
    try {
      await sendPasswordReset(parsed.data.email.trim().toLowerCase());
      setSent(true);
    } catch (err) {
      setError(t(errorMessageKey(err instanceof Error ? err.message : '')));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col justify-center bg-bg px-6 py-12">
      <div className="mx-auto w-full max-w-sm">
        <div className="mb-8 flex items-center justify-between">
          <h2 className="font-display text-2xl">{t('forgot.title')}</h2>
          <LangToggle />
        </div>

        {sent ? (
          <div className="space-y-5">
            <p className="border-s-2 border-good bg-surface-2 px-3 py-3 text-sm text-text">{t('forgot.sent')}</p>
            <Link to="/login" className="inline-block text-sm text-muted hover:text-text">{t('forgot.back_login')}</Link>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-5">
            <p className="text-sm text-muted">{t('forgot.desc')}</p>
            <Field label={t('auth.email')}>
              <TextInput type="email" autoComplete="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </Field>
            <ErrorText error={error} />
            <Button type="submit" loading={submitting} className="w-full">{t('forgot.submit')}</Button>
            <Link to="/login" className="inline-block text-sm text-muted hover:text-text">{t('forgot.back_login')}</Link>
          </form>
        )}
      </div>
    </div>
  );
}
