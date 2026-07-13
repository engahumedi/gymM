import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { z } from 'zod';
import { isSupabaseConfigured } from '@/lib/supabase';
import { requestPasswordChange } from '@/lib/api';
import { useI18n } from '@/i18n/I18nProvider';
import type { MessageKey } from '@/i18n/dictionary';
import { LangToggle } from '@/components/LangToggle';
import { ConfigError } from '@/components/ConfigError';
import { Field, TextInput } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { ErrorText } from '@/components/ui/misc';

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

// Map the RPC's coded errors to localized messages (this form owns its wording).
function errorKey(raw: string): MessageKey {
  const m = raw.toLowerCase();
  if (m.includes('user_not_found')) return 'pwreq.err.no_user';
  if (m.includes('weak_password')) return 'reset.err.short';
  if (m.includes('request_exists')) return 'pwreq.err.exists';
  return 'err.generic';
}

export function ForgotPasswordPage() {
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  if (!isSupabaseConfigured) return <ConfigError />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = schema.safeParse({ email, password });
    if (!parsed.success) return setError(t('pwreq.err.invalid'));
    if (password !== confirm) return setError(t('pwreq.err.mismatch'));
    setSubmitting(true);
    try {
      await requestPasswordChange(parsed.data.email.trim().toLowerCase(), parsed.data.password);
      setSent(true);
    } catch (err) {
      setError(t(errorKey(err instanceof Error ? err.message : '')));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col justify-center bg-bg px-6 py-12">
      <div className="mx-auto w-full max-w-sm">
        <div className="mb-8 flex items-center justify-between">
          <h2 className="font-display text-2xl">{t('pwreq.title')}</h2>
          <LangToggle />
        </div>

        {sent ? (
          <div className="space-y-5">
            <p className="border-s-2 border-good bg-surface-2 px-3 py-3 text-sm text-text">{t('pwreq.sent')}</p>
            <Link to="/login" className="inline-block text-sm text-muted hover:text-text">{t('forgot.back_login')}</Link>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-5">
            <p className="text-sm text-muted">{t('pwreq.desc')}</p>
            <Field label={t('auth.email')}>
              <TextInput type="email" autoComplete="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </Field>
            <Field label={t('pwreq.new_password')}>
              <TextInput type="password" autoComplete="new-password" dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </Field>
            <Field label={t('pwreq.confirm')}>
              <TextInput type="password" autoComplete="new-password" dir="ltr" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
            </Field>
            <ErrorText error={error} />
            <Button type="submit" loading={submitting} className="w-full">{t('pwreq.submit')}</Button>
            <Link to="/login" className="inline-block text-sm text-muted hover:text-text">{t('forgot.back_login')}</Link>
          </form>
        )}
      </div>
    </div>
  );
}
