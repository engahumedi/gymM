import { Link } from 'react-router-dom';
import { useI18n } from '@/i18n/I18nProvider';
import { usePublicData } from '@/lib/PublicData';
import { localizedName } from '@/lib/display';
import { InlineLoading } from '@/components/ui/misc';
import { Section, PlanCard, pick } from './components';

export function HomePage() {
  const { t, locale } = useI18n();
  const { gym, plans, branches, trainers, content, loading } = usePublicData();

  if (loading) return <InlineLoading />;

  const heroTitle = pick(content.hero, 'title', locale) || (gym ? localizedName(gym, locale) : t('app.name'));
  const heroSub = pick(content.hero, 'subtitle', locale) || t('app.tagline');
  const facilities = (content.facilities?.items as { ar: string; en: string }[] | undefined) ?? [];
  const testimonials = (content.testimonials?.items as { name_ar: string; name_en: string; text_ar: string; text_en: string }[] | undefined) ?? [];
  const faq = (content.faq?.items as { q_ar: string; a_ar: string; q_en: string; a_en: string }[] | undefined) ?? [];

  return (
    <div className="text-slate-100">
      {/* Hero */}
      <section className="relative overflow-hidden bg-slate-950">
        <div className="mx-auto max-w-6xl px-4 py-28 text-center">
          <h1 className="mx-auto max-w-3xl text-4xl font-extrabold leading-tight md:text-6xl">{heroTitle}</h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-300">{heroSub}</p>
          <div className="mt-8 flex justify-center gap-3">
            <Link to="/join" className="rounded-lg bg-brand px-6 py-3 text-sm font-semibold text-white hover:bg-brand-dark">
              {t('pub.hero.cta')}
            </Link>
            <Link to="/plans" className="rounded-lg border border-white/20 px-6 py-3 text-sm font-semibold hover:bg-white/10">
              {t('pub.hero.plans')}
            </Link>
          </div>
        </div>
      </section>

      {/* Plans */}
      {plans.length > 0 && (
        <Section id="plans" title={t('pub.plans.title')}>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {plans.map((p) => <PlanCard key={p.id} plan={p} />)}
          </div>
        </Section>
      )}

      {/* Branches */}
      {branches.length > 0 && (
        <Section id="branches" title={t('pub.branches.title')} dark>
          <div className="grid gap-6 md:grid-cols-2">
            {branches.map((b) => (
              <div key={b.id} className="rounded-2xl border border-white/10 bg-slate-800/50 p-6">
                <h3 className="text-lg font-bold">{localizedName(b, locale)}</h3>
                <p className="mt-1 text-sm text-slate-400">
                  {locale === 'ar' ? b.address_ar : b.address_en} — {b.city}
                </p>
                {b.phone && <p dir="ltr" className="mt-1 text-start text-sm text-slate-400">{b.phone}</p>}
                {b.map_url && (
                  <a href={b.map_url} target="_blank" rel="noreferrer" className="mt-3 inline-block text-sm font-semibold text-brand hover:underline">
                    {t('pub.branches.map')} →
                  </a>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Trainers */}
      {trainers.length > 0 && (
        <Section id="trainers" title={t('pub.trainers.title')}>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {trainers.map((tr) => (
              <div key={tr.id} className="rounded-2xl border border-white/10 bg-slate-800/50 p-6 text-center">
                <div className="mx-auto mb-3 flex h-20 w-20 items-center justify-center rounded-full bg-slate-700 text-2xl">
                  {(locale === 'ar' ? tr.name_ar : tr.name_en).charAt(0)}
                </div>
                <h3 className="font-bold">{locale === 'ar' ? tr.name_ar : tr.name_en}</h3>
                <p className="text-sm text-brand">{locale === 'ar' ? tr.specialty_ar : tr.specialty_en}</p>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Facilities */}
      {facilities.length > 0 && (
        <Section title={t('pub.facilities.title')} dark>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {facilities.map((f, i) => (
              <div key={i} className="rounded-xl border border-white/10 bg-slate-800/50 p-6 text-center font-semibold">
                {locale === 'ar' ? f.ar : f.en}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Testimonials */}
      {testimonials.length > 0 && (
        <Section title={t('pub.testimonials.title')}>
          <div className="grid gap-6 md:grid-cols-2">
            {testimonials.map((tm, i) => (
              <div key={i} className="rounded-2xl border border-white/10 bg-slate-800/50 p-6">
                <p className="text-slate-200">“{locale === 'ar' ? tm.text_ar : tm.text_en}”</p>
                <p className="mt-3 text-sm font-semibold text-brand">— {locale === 'ar' ? tm.name_ar : tm.name_en}</p>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* FAQ */}
      {faq.length > 0 && (
        <Section title={t('pub.faq.title')} dark>
          <div className="mx-auto max-w-3xl space-y-4">
            {faq.map((item, i) => (
              <details key={i} className="rounded-xl border border-white/10 bg-slate-800/50 p-4">
                <summary className="cursor-pointer font-semibold">{locale === 'ar' ? item.q_ar : item.q_en}</summary>
                <p className="mt-2 text-sm text-slate-300">{locale === 'ar' ? item.a_ar : item.a_en}</p>
              </details>
            ))}
          </div>
        </Section>
      )}

      {/* Contact */}
      <Section id="contact" title={t('pub.contact.title')}>
        <div className="mx-auto max-w-md text-center text-slate-300">
          {gym?.contact_phone && <p dir="ltr">{t('pub.contact.phone')}: {gym.contact_phone}</p>}
          {gym?.contact_email && <p dir="ltr">{t('pub.contact.email')}: {gym.contact_email}</p>}
          <Link to="/join" className="mt-6 inline-block rounded-lg bg-brand px-6 py-3 text-sm font-semibold text-white hover:bg-brand-dark">
            {t('pub.hero.cta')}
          </Link>
        </div>
      </Section>
    </div>
  );
}
