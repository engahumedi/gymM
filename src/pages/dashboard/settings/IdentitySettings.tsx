import { useState } from 'react';
import { useI18n } from '@/i18n/I18nProvider';
import { useReferenceData } from '@/lib/ReferenceData';
import { updateGym, uploadPublicAsset, type GymPatch } from '@/lib/api';
import { errorMessageKey } from '@/lib/errors';
import { Button } from '@/components/ui/Button';
import { Field, TextInput } from '@/components/ui/Field';
import { ErrorText, InlineLoading } from '@/components/ui/misc';

const SOCIALS: { key: string; labelKey: 'identity.social.instagram' | 'identity.social.twitter' | 'identity.social.tiktok' | 'identity.social.whatsapp' }[] = [
  { key: 'instagram', labelKey: 'identity.social.instagram' },
  { key: 'twitter', labelKey: 'identity.social.twitter' },
  { key: 'tiktok', labelKey: 'identity.social.tiktok' },
  { key: 'whatsapp', labelKey: 'identity.social.whatsapp' },
];

export function IdentitySettings() {
  const { gym, loading, reload } = useReferenceData();

  if (loading) return <InlineLoading />;
  if (!gym) return null;

  return <IdentityForm key={gym.id} onReload={reload} />;
}

function IdentityForm({ onReload }: { onReload: () => void }) {
  const { t } = useI18n();
  const { gym } = useReferenceData();
  const g = gym!;
  const [f, setF] = useState({
    name_ar: g.name_ar,
    name_en: g.name_en,
    logo_url: g.logo_url ?? '',
    primary_color: g.primary_color,
    secondary_color: g.secondary_color,
    contact_email: g.contact_email ?? '',
    contact_phone: g.contact_phone ?? '',
    social: { ...(g.social_links ?? {}) } as Record<string, string>,
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [uploading, setUploading] = useState(false);

  async function onLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const url = await uploadPublicAsset(file, 'logos');
      setF((s) => ({ ...s, logo_url: url }));
    } catch (err) {
      setError(t(errorMessageKey(err instanceof Error ? err.message : '')));
    } finally {
      setUploading(false);
    }
  }

  async function submit() {
    setError(null);
    setSaved(false);
    setBusy(true);
    try {
      const social = Object.fromEntries(
        Object.entries(f.social).filter(([, v]) => v.trim() !== ''),
      );
      const patch: GymPatch = {
        name_ar: f.name_ar.trim(),
        name_en: f.name_en.trim(),
        logo_url: f.logo_url.trim() || null,
        primary_color: f.primary_color,
        secondary_color: f.secondary_color,
        contact_email: f.contact_email.trim() || null,
        contact_phone: f.contact_phone.trim() || null,
        social_links: social,
      };
      await updateGym(g.id, patch);
      setSaved(true);
      onReload();
    } catch (err) {
      setError(t(errorMessageKey(err instanceof Error ? err.message : '')));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <p className="text-sm text-muted">{t('identity.desc')}</p>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('identity.name_ar')} required>
          <TextInput value={f.name_ar} onChange={(e) => setF({ ...f, name_ar: e.target.value })} />
        </Field>
        <Field label={t('identity.name_en')} required>
          <TextInput dir="ltr" value={f.name_en} onChange={(e) => setF({ ...f, name_en: e.target.value })} />
        </Field>
      </div>

      <Field label={t('identity.logo')}>
        <div className="flex items-center gap-4">
          {f.logo_url ? (
            <img src={f.logo_url} alt="logo" className="h-12 w-12 rounded object-contain" />
          ) : (
            <div className="h-12 w-12 rounded border border-dashed border-border" />
          )}
          <label className="cursor-pointer rounded border border-border-strong px-3 py-1.5 text-sm text-text hover:bg-surface-2">
            {uploading ? t('common.loading') : t('identity.logo.upload')}
            <input type="file" accept="image/*" className="hidden" onChange={onLogo} disabled={uploading} />
          </label>
          {f.logo_url && (
            <button type="button" className="text-sm text-muted hover:text-accent" onClick={() => setF({ ...f, logo_url: '' })}>
              {t('identity.logo.remove')}
            </button>
          )}
        </div>
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('identity.primary_color')}>
          <ColorInput value={f.primary_color} onChange={(v) => setF({ ...f, primary_color: v })} />
        </Field>
        <Field label={t('identity.secondary_color')}>
          <ColorInput value={f.secondary_color} onChange={(v) => setF({ ...f, secondary_color: v })} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('identity.contact_email')}>
          <TextInput dir="ltr" type="email" value={f.contact_email} onChange={(e) => setF({ ...f, contact_email: e.target.value })} />
        </Field>
        <Field label={t('identity.contact_phone')}>
          <TextInput dir="ltr" value={f.contact_phone} onChange={(e) => setF({ ...f, contact_phone: e.target.value })} />
        </Field>
      </div>

      <div>
        <p className="mb-2 text-xs font-medium tracking-wide text-muted">{t('identity.social')}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          {SOCIALS.map(({ key, labelKey }) => (
            <Field key={key} label={t(labelKey)}>
              <TextInput
                dir="ltr"
                value={f.social[key] ?? ''}
                onChange={(e) => setF({ ...f, social: { ...f.social, [key]: e.target.value } })}
              />
            </Field>
          ))}
        </div>
      </div>

      <ErrorText error={error} />
      <div className="flex items-center gap-3">
        <Button onClick={submit} loading={busy}>{t('common.save')}</Button>
        {saved && <span className="text-sm text-good">{t('settings.saved')}</span>}
      </div>
    </div>
  );
}

// Native color picker paired with a hex text field (kept in sync).
function ColorInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-12 shrink-0 cursor-pointer rounded border border-border bg-surface"
        aria-label="color"
      />
      <TextInput dir="ltr" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
