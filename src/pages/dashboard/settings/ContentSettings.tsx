import { useState } from 'react';
import { useI18n } from '@/i18n/I18nProvider';
import { useReferenceData } from '@/lib/ReferenceData';
import { useAsync } from '@/lib/useAsync';
import { fetchSiteContent, upsertSiteContent } from '@/lib/api';
import { errorMessageKey } from '@/lib/errors';
import type { MessageKey } from '@/i18n/dictionary';
import { Button } from '@/components/ui/Button';
import { Field, TextInput, TextArea } from '@/components/ui/Field';
import { ErrorText, InlineLoading } from '@/components/ui/misc';
import { TrainersSettings } from './TrainersSettings';

type Content = Record<string, Record<string, unknown>>;

export function ContentSettings() {
  const { t } = useI18n();
  const { gym } = useReferenceData();
  const { data, loading, reload } = useAsync(fetchSiteContent, []);

  if (loading) return <InlineLoading />;
  const gymId = gym?.id;
  if (!gymId) return null;
  const content = (data ?? {}) as Content;

  return (
    <div className="space-y-12">
      <p className="text-sm text-muted">{t('content.desc')}</p>
      <HeroSection gymId={gymId} content={content} onSaved={reload} />
      <ListSection
        gymId={gymId}
        sectionKey="facilities"
        titleKey="content.facilities"
        content={content}
        fields={[
          { key: 'ar', labelKey: 'content.item.ar' },
          { key: 'en', labelKey: 'content.item.en', dir: 'ltr' },
        ]}
        onSaved={reload}
      />
      <ListSection
        gymId={gymId}
        sectionKey="testimonials"
        titleKey="content.testimonials"
        content={content}
        fields={[
          { key: 'name_ar', labelKey: 'content.item.name_ar' },
          { key: 'name_en', labelKey: 'content.item.name_en', dir: 'ltr' },
          { key: 'text_ar', labelKey: 'content.item.text_ar', area: true },
          { key: 'text_en', labelKey: 'content.item.text_en', dir: 'ltr', area: true },
        ]}
        onSaved={reload}
      />
      <ListSection
        gymId={gymId}
        sectionKey="faq"
        titleKey="content.faq"
        content={content}
        fields={[
          { key: 'q_ar', labelKey: 'content.item.q_ar' },
          { key: 'a_ar', labelKey: 'content.item.a_ar', area: true },
          { key: 'q_en', labelKey: 'content.item.q_en', dir: 'ltr' },
          { key: 'a_en', labelKey: 'content.item.a_en', dir: 'ltr', area: true },
        ]}
        onSaved={reload}
      />
      <TrainersSettings />
    </div>
  );
}

// --- Hero: title + subtitle, each bilingual -------------------------------
function pickStr(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function HeroSection({ gymId, content, onSaved }: { gymId: string; content: Content; onSaved: () => void }) {
  const { t } = useI18n();
  const hero = content.hero ?? {};
  const title = (hero.title ?? {}) as Record<string, unknown>;
  const subtitle = (hero.subtitle ?? {}) as Record<string, unknown>;
  const [f, setF] = useState({
    title_ar: pickStr(title.ar),
    title_en: pickStr(title.en),
    subtitle_ar: pickStr(subtitle.ar),
    subtitle_en: pickStr(subtitle.en),
  });
  const { error, saved, busy, save } = useSaver();

  return (
    <section>
      <h2 className="mb-4 font-display text-xl text-text">{t('content.hero')}</h2>
      <div className="max-w-2xl space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={`${t('content.hero.title')} · ${t('content.item.ar')}`}>
            <TextInput value={f.title_ar} onChange={(e) => setF({ ...f, title_ar: e.target.value })} />
          </Field>
          <Field label={`${t('content.hero.title')} · ${t('content.item.en')}`}>
            <TextInput dir="ltr" value={f.title_en} onChange={(e) => setF({ ...f, title_en: e.target.value })} />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={`${t('content.hero.subtitle')} · ${t('content.item.ar')}`}>
            <TextArea rows={2} value={f.subtitle_ar} onChange={(e) => setF({ ...f, subtitle_ar: e.target.value })} />
          </Field>
          <Field label={`${t('content.hero.subtitle')} · ${t('content.item.en')}`}>
            <TextArea rows={2} dir="ltr" value={f.subtitle_en} onChange={(e) => setF({ ...f, subtitle_en: e.target.value })} />
          </Field>
        </div>
        <ErrorText error={error} />
        <div className="flex flex-wrap items-center gap-3">
          <Button
            className="w-full sm:w-auto"
            loading={busy}
            onClick={() =>
              save(gymId, 'hero', {
                title: { ar: f.title_ar, en: f.title_en },
                subtitle: { ar: f.subtitle_ar, en: f.subtitle_en },
              }, onSaved)
            }
          >
            {t('common.save')}
          </Button>
          {saved && <span className="text-sm text-good">{t('settings.saved')}</span>}
        </div>
      </div>
    </section>
  );
}

// --- Generic list section (facilities / testimonials / faq) ---------------
interface FieldDef {
  key: string;
  labelKey: MessageKey;
  dir?: 'ltr' | 'rtl';
  area?: boolean;
}

function ListSection({
  gymId,
  sectionKey,
  titleKey,
  content,
  fields,
  onSaved,
}: {
  gymId: string;
  sectionKey: string;
  titleKey: MessageKey;
  content: Content;
  fields: FieldDef[];
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const initial = ((content[sectionKey]?.items as Record<string, string>[] | undefined) ?? []).map(
    (it) => ({ ...it }),
  );
  const [items, setItems] = useState<Record<string, string>[]>(initial);
  const { error, saved, busy, save } = useSaver();

  function update(i: number, key: string, value: string) {
    setItems((arr) => arr.map((it, idx) => (idx === i ? { ...it, [key]: value } : it)));
  }
  function add() {
    setItems((arr) => [...arr, Object.fromEntries(fields.map((f) => [f.key, ''])) as Record<string, string>]);
  }
  function remove(i: number) {
    setItems((arr) => arr.filter((_, idx) => idx !== i));
  }

  return (
    <section>
      <h2 className="mb-4 font-display text-xl text-text">{t(titleKey)}</h2>
      <div className="max-w-2xl space-y-4">
        {items.map((it, i) => (
          <div key={i} className="rounded border border-border p-3">
            <div className="mb-1 flex justify-end">
              <button
                className="focus-ring inline-flex min-h-[44px] items-center rounded px-2 text-xs text-muted hover:text-accent"
                onClick={() => remove(i)}
              >
                {t('content.remove')}
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {fields.map((fd) => (
                <Field key={fd.key} label={t(fd.labelKey)}>
                  {fd.area ? (
                    <TextArea rows={2} dir={fd.dir} value={it[fd.key] ?? ''} onChange={(e) => update(i, fd.key, e.target.value)} />
                  ) : (
                    <TextInput dir={fd.dir} value={it[fd.key] ?? ''} onChange={(e) => update(i, fd.key, e.target.value)} />
                  )}
                </Field>
              ))}
            </div>
          </div>
        ))}
        <Button variant="secondary" onClick={add} className="w-full sm:w-auto">{t('content.add_item')}</Button>
        <ErrorText error={error} />
        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-3">
          <Button loading={busy} onClick={() => save(gymId, sectionKey, { items }, onSaved)} className="w-full sm:w-auto">
            {t('common.save')}
          </Button>
          {saved && <span className="text-sm text-good">{t('settings.saved')}</span>}
        </div>
      </div>
    </section>
  );
}

// Shared save state + handler for the content sections.
function useSaver() {
  const { t } = useI18n();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  async function save(gymId: string, key: string, content: Record<string, unknown>, onSaved: () => void) {
    setError(null);
    setSaved(false);
    setBusy(true);
    try {
      await upsertSiteContent(gymId, key, content);
      setSaved(true);
      onSaved();
    } catch (err) {
      setError(t(errorMessageKey(err instanceof Error ? err.message : '')));
    } finally {
      setBusy(false);
    }
  }

  return { error, saved, busy, save };
}
