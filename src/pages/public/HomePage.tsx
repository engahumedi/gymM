import { Link } from 'react-router-dom';
import { useI18n } from '@/i18n/I18nProvider';
import { usePublicData } from '@/lib/PublicData';
import { localizedName } from '@/lib/display';
import { InlineLoading } from '@/components/ui/misc';
import { ArrowUpRight, MapPin, LogIn, ICON_SM } from '@/components/ui/icons';
import { Section, PlanCard, pick } from './components';

export function HomePage() {
  const { t, locale } = useI18n();
  const { gym, plans, branches, trainers, content, loading } = usePublicData();

  // No full-page spinner: the hero is static copy from the dictionary, so it
  // paints immediately and the data-driven sections below fill in when the
  // (single) request lands. Every section is already conditional on its data.
  const heroTitle = pick(content.hero, 'title', locale) || (gym ? localizedName(gym, locale) : t('app.name'));
  const heroSub = pick(content.hero, 'subtitle', locale) || t('app.tagline');
  const facilities = (content.facilities?.items as { ar: string; en: string }[] | undefined) ?? [];
  const testimonials = (content.testimonials?.items as { name_ar: string; name_en: string; text_ar: string; text_en: string }[] | undefined) ?? [];
  const faq = (content.faq?.items as { q_ar: string; a_ar: string; q_en: string; a_en: string }[] | undefined) ?? [];
  const featuredId = plans.reduce((a, b) => (b.duration_months > (a?.duration_months ?? 0) ? b : a), plans[0])?.id;

  return (
    <div>
      {/* Hero — asymmetric: oversized title, meta pinned to the side */}
      <section className="mx-auto max-w-content px-5 pt-20 pb-24">
        <p className="eyebrow mb-6">{t('pub.hero.eyebrow')}</p>
        <h1 className="font-display max-w-4xl text-balance text-5xl leading-[1.02] text-text sm:text-7xl md:text-8xl">
          {heroTitle}
        </h1>
        <div className="mt-10 flex flex-col gap-8 border-t border-border pt-8 md:flex-row md:items-end md:justify-between">
          <p className="max-w-md text-lg leading-relaxed text-muted">{heroSub}</p>
          <div className="flex items-center gap-6">
            <Link to="/join" className="rounded bg-accent px-6 py-3 text-sm font-semibold text-white hover:brightness-110">
              {t('pub.hero.cta')}
            </Link>
            <Link to="/plans" className="inline-flex items-center gap-1.5 text-sm font-semibold text-text hover:text-accent">
              {t('pub.hero.plans')} <ArrowUpRight {...ICON_SM} />
            </Link>
            <Link to="/login" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-text">
              <LogIn {...ICON_SM} /> {t('nav.login')}
            </Link>
          </div>
        </div>
      </section>

      {loading && plans.length === 0 && <InlineLoading />}

      {/* Plans */}
      {plans.length > 0 && (
        <Section id="plans" eyebrow={t('pub.plans.eyebrow')} title={t('pub.plans.title')}>
          <div className="grid gap-x-8 sm:grid-cols-2 lg:grid-cols-4">
            {plans.map((p) => <PlanCard key={p.id} plan={p} featured={p.id === featuredId} />)}
          </div>
        </Section>
      )}

      {/* Branches — two-column list, hairline separated */}
      {branches.length > 0 && (
        <Section id="branches" eyebrow={t('pub.branches.eyebrow')} title={t('pub.branches.title')}>
          <div className="grid gap-x-12 md:grid-cols-2">
            {branches.map((b) => (
              <div key={b.id} className="flex items-start justify-between gap-4 border-t border-border py-6">
                <div>
                  <h3 className="font-display text-xl">{localizedName(b, locale)}</h3>
                  <p className="mt-1 text-sm text-muted">{locale === 'ar' ? b.address_ar : b.address_en} — {b.city}</p>
                  {b.phone && <p dir="ltr" className="mt-1 text-start text-sm text-faint">{b.phone}</p>}
                </div>
                {b.map_url && (
                  <a href={b.map_url} target="_blank" rel="noreferrer" className="mt-1 inline-flex shrink-0 items-center gap-1 text-sm text-accent hover:gap-2 transition-all">
                    <MapPin {...ICON_SM} /> {t('pub.branches.map')}
                  </a>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Trainers */}
      {trainers.length > 0 && (
        <Section eyebrow={t('pub.trainers.eyebrow')} title={t('pub.trainers.title')}>
          <div className="grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
            {trainers.map((tr) => (
              <div key={tr.id}>
                <div className="mb-4 flex h-16 w-16 items-center justify-center border border-border-strong font-display text-2xl text-muted">
                  {(locale === 'ar' ? tr.name_ar : tr.name_en).charAt(0)}
                </div>
                <h3 className="font-display text-lg">{locale === 'ar' ? tr.name_ar : tr.name_en}</h3>
                <p className="text-sm text-accent">{locale === 'ar' ? tr.specialty_ar : tr.specialty_en}</p>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Facilities — numbered editorial list */}
      {facilities.length > 0 && (
        <Section eyebrow={t('pub.facilities.eyebrow')} title={t('pub.facilities.title')}>
          <div className="grid gap-x-8 sm:grid-cols-2 lg:grid-cols-4">
            {facilities.map((f, i) => (
              <div key={i} className="flex items-baseline gap-3 border-t border-border py-5">
                <span className="font-display text-sm text-faint">{String(i + 1).padStart(2, '0')}</span>
                <span className="text-lg text-text">{locale === 'ar' ? f.ar : f.en}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Testimonials */}
      {testimonials.length > 0 && (
        <Section eyebrow={t('pub.testimonials.eyebrow')} title={t('pub.testimonials.title')}>
          <div className="grid gap-12 md:grid-cols-2">
            {testimonials.map((tm, i) => (
              <figure key={i}>
                <blockquote className="font-display text-2xl leading-snug text-text">
                  {locale === 'ar' ? tm.text_ar : tm.text_en}
                </blockquote>
                <figcaption className="mt-4 text-sm text-accent">— {locale === 'ar' ? tm.name_ar : tm.name_en}</figcaption>
              </figure>
            ))}
          </div>
        </Section>
      )}

      {/* FAQ */}
      {faq.length > 0 && (
        <Section eyebrow={t('pub.faq.eyebrow')} title={t('pub.faq.title')}>
          <div className="max-w-2xl">
            {faq.map((item, i) => (
              <details key={i} className="group border-t border-border py-5">
                <summary className="cursor-pointer list-none text-lg text-text marker:hidden">
                  {locale === 'ar' ? item.q_ar : item.q_en}
                </summary>
                <p className="mt-3 text-muted">{locale === 'ar' ? item.a_ar : item.a_en}</p>
              </details>
            ))}
          </div>
        </Section>
      )}

      {/* Contact / closing CTA — asymmetric */}
      <Section id="contact" eyebrow={t('pub.contact.eyebrow')} title={t('pub.contact.title')}>
        <div className="flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
          <div className="space-y-1 text-muted">
            {gym?.contact_phone && <p dir="ltr" className="text-start">{gym.contact_phone}</p>}
            {gym?.contact_email && <p dir="ltr" className="text-start">{gym.contact_email}</p>}
          </div>
          <Link to="/join" className="rounded bg-accent px-6 py-3 text-sm font-semibold text-white hover:brightness-110">
            {t('pub.hero.cta')}
          </Link>
        </div>
      </Section>
    </div>
  );
}
