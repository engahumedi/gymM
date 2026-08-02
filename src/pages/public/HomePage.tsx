import { Link } from 'react-router-dom';
import { useI18n } from '@/i18n/I18nProvider';
import { usePublicData } from '@/lib/PublicData';
import { localizedName } from '@/lib/display';
import { Reveal } from '@/components/Reveal';
import { InlineLoading } from '@/components/ui/misc';
import { ArrowUpRight, LogIn, ICON_SM } from '@/components/ui/icons';
import { Band, BranchRow, PlanGrid, TrainerTile, pick } from './components';
import { ClosingCta } from './PublicPages';

// Marketing home page — "Exaggerated Minimalism" (ui-ux-pro-max):
// true black, oversized display type at weight 900, extreme negative space, and
// ONE brand colour doing all the shouting. Hero-Centric landing pattern: the
// hero owns the fold, then a value strip, proof, and a single primary CTA.
//
// The accent is never hardcoded — it is the gym's own colour, read at runtime
// from the gyms row, and --accent-on keeps text on filled accent surfaces
// readable whatever colour that is. Parallax was declined on purpose: the same
// database rates it poor for performance and accessibility, which outrank style
// in its own priority table.

export function HomePage() {
  const { t, locale } = useI18n();
  const { gym, plans, branches, trainers, content, loading } = usePublicData();

  // No full-page spinner: the hero is static copy from the dictionary, so it
  // paints immediately and the data-driven sections fill in when the (single)
  // request lands. Every section is already conditional on its own data.
  const heroTitle = pick(content.hero, 'title', locale) || (gym ? localizedName(gym, locale) : t('app.name'));
  const heroSub = pick(content.hero, 'subtitle', locale) || t('app.tagline');
  const facilities = (content.facilities?.items as { ar: string; en: string }[] | undefined) ?? [];
  const testimonials = (content.testimonials?.items as { name_ar: string; name_en: string; text_ar: string; text_en: string }[] | undefined) ?? [];
  const faq = (content.faq?.items as { q_ar: string; a_ar: string; q_en: string; a_en: string }[] | undefined) ?? [];
  const featured = plans.reduce((a, b) => (b.duration_months > (a?.duration_months ?? 0) ? b : a), plans[0]);

  const stats = [
    { value: branches.length, label: t('pub.stat.branches') },
    { value: trainers.length, label: t('pub.stat.trainers') },
    { value: plans.length, label: t('pub.stat.plans') },
  ].filter((s) => s.value > 0);

  return (
    <div className="bg-ground">
      {/* ══ HERO — owns the fold. Type is the only ornament. ══════════════ */}
      <section className="relative flex min-h-[78vh] flex-col justify-between overflow-hidden px-5 pt-12 pb-10 md:min-h-[82vh] md:pt-20">
        {/* One soft accent glow bleeding off the edge — the single graphic. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 end-[-20%] h-[36rem] w-[36rem] rounded-full bg-accent opacity-[0.16] blur-[110px] md:end-[-10%] md:h-[46rem] md:w-[46rem]"
        />

        <div className="relative mx-auto flex w-full max-w-content flex-1 flex-col justify-center">
          <Reveal>
            <p className="eyebrow mb-6 md:mb-8">{t('pub.hero.eyebrow')}</p>
            <h1 className="font-display display-xl max-w-[15ch] text-balance break-words text-text">{heroTitle}</h1>
            <p className="mt-8 max-w-xl text-lg leading-relaxed text-muted md:mt-10 md:text-2xl">{heroSub}</p>
          </Reveal>

          <Reveal delay={120}>
            {/* Full-width primary action on a phone; inline row from sm up. */}
            <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4 md:mt-12">
              <Link
                to="/join"
                className="focus-ring inline-flex min-h-[56px] items-center justify-center rounded-lg bg-accent px-9 text-lg font-bold text-accent-on transition-all duration-200 hover:brightness-110 active:scale-[0.98]"
              >
                {t('pub.hero.cta')}
              </Link>
              <Link
                to="/plans"
                className="focus-ring inline-flex min-h-[56px] items-center justify-center gap-2 rounded-lg border border-block-line px-7 text-lg font-semibold text-text transition-colors duration-200 hover:border-text hover:bg-block"
              >
                {t('pub.hero.plans')} <ArrowUpRight {...ICON_SM} />
              </Link>
              <Link
                to="/login"
                className="focus-ring inline-flex min-h-[56px] items-center justify-center gap-2 rounded-lg px-4 text-base text-muted transition-colors duration-200 hover:text-text"
              >
                <LogIn {...ICON_SM} /> {t('nav.login')}
              </Link>
            </div>
          </Reveal>
        </div>

        {/* Proof, as oversized numerals along the bottom of the fold. */}
        {stats.length > 0 && (
          <Reveal delay={200}>
            <div className="relative mx-auto mt-10 flex w-full max-w-content flex-wrap gap-x-10 gap-y-5 border-t border-block-line pt-7 md:gap-x-16 md:pt-8">
              {stats.map((s) => (
                <div key={s.label} className="flex items-baseline gap-2.5 md:gap-3">
                  <span className="font-display text-4xl leading-none text-accent md:text-7xl">{s.value}</span>
                  <span className="text-sm text-muted md:text-base">{s.label}</span>
                </div>
              ))}
            </div>
          </Reveal>
        )}
      </section>

      {/* ══ TICKER — an accent band across the full width ═════════════════ */}
      {facilities.length > 0 && (
        <div className="overflow-hidden bg-accent py-3.5 select-none md:py-4">
          <div className="ticker-track">
            {[0, 1].map((copy) => (
              <div key={copy} className="flex shrink-0 items-center" aria-hidden={copy === 1}>
                {facilities.map((f, i) => (
                  <span
                    key={i}
                    className="flex items-center whitespace-nowrap px-6 text-base font-bold text-accent-on md:px-8 md:text-lg"
                  >
                    {locale === 'ar' ? f.ar : f.en}
                    <span className="px-6 opacity-50 md:px-8">/</span>
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {loading && plans.length === 0 && <InlineLoading />}

      {/* ══ PLANS ════════════════════════════════════════════════════════ */}
      {plans.length > 0 && (
        <Band id="plans" eyebrow={t('pub.plans.eyebrow')} title={t('pub.plans.title')}>
          <PlanGrid plans={plans} featuredId={featured?.id} />
        </Band>
      )}

      {/* ══ BRANCHES ═════════════════════════════════════════════════════ */}
      {branches.length > 0 && (
        <Band id="branches" eyebrow={t('pub.branches.eyebrow')} title={t('pub.branches.title')}>
          <div>
            {branches.map((b, i) => (
              <Reveal key={b.id} delay={60 * i}>
                <BranchRow branch={b} index={i} locale={locale} />
              </Reveal>
            ))}
          </div>
        </Band>
      )}

      {/* ══ TRAINERS ═════════════════════════════════════════════════════ */}
      {trainers.length > 0 && (
        <Band eyebrow={t('pub.trainers.eyebrow')} title={t('pub.trainers.title')}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {trainers.map((tr, i) => (
              <Reveal key={tr.id} delay={50 * i}>
                <TrainerTile trainer={tr} locale={locale} />
              </Reveal>
            ))}
          </div>
        </Band>
      )}

      {/* ══ FACILITIES — numbered blocks ═════════════════════════════════ */}
      {facilities.length > 0 && (
        <Band eyebrow={t('pub.facilities.eyebrow')} title={t('pub.facilities.title')}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {facilities.map((f, i) => (
              <Reveal key={i} delay={50 * i}>
                <div className="block-panel h-full p-6">
                  <span className="font-display text-sm text-accent">{String(i + 1).padStart(2, '0')}</span>
                  <p className="mt-3 text-lg leading-snug text-text">{locale === 'ar' ? f.ar : f.en}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </Band>
      )}

      {/* ══ TESTIMONIALS — the one light band, full bleed ═════════════════ */}
      {testimonials.length > 0 && (
        <section className="bg-paper py-16 text-paper-ink md:py-28">
          <div className="mx-auto max-w-content px-5">
            <Reveal>
              <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-paper-muted">
                {t('pub.testimonials.eyebrow')}
              </p>
              <h2 className="font-display display-lg mb-10 text-paper-ink md:mb-12">{t('pub.testimonials.title')}</h2>
            </Reveal>
            <div className="grid gap-10 md:grid-cols-2">
              {testimonials.map((tm, i) => (
                <Reveal key={i} delay={70 * i}>
                  <figure>
                    <blockquote className="font-display text-xl leading-snug text-paper-ink md:text-3xl">
                      {locale === 'ar' ? tm.text_ar : tm.text_en}
                    </blockquote>
                    <figcaption className="mt-4 text-sm font-bold text-accent md:mt-5">
                      {locale === 'ar' ? tm.name_ar : tm.name_en}
                    </figcaption>
                  </figure>
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ══ FAQ ══════════════════════════════════════════════════════════ */}
      {faq.length > 0 && (
        <Band eyebrow={t('pub.faq.eyebrow')} title={t('pub.faq.title')}>
          <div className="mx-auto max-w-3xl">
            {faq.map((item, i) => (
              <Reveal key={i} delay={40 * i}>
                <details className="group border-t border-block-line">
                  <summary className="focus-ring flex min-h-[64px] cursor-pointer list-none items-center justify-between gap-4 py-3 text-lg text-text marker:hidden md:min-h-[72px] md:text-xl">
                    {locale === 'ar' ? item.q_ar : item.q_en}
                    <span className="font-display shrink-0 text-3xl text-accent transition-transform duration-200 group-open:rotate-45">
                      +
                    </span>
                  </summary>
                  <p className="pb-6 text-base leading-relaxed text-muted md:pb-7 md:text-lg">
                    {locale === 'ar' ? item.a_ar : item.a_en}
                  </p>
                </details>
              </Reveal>
            ))}
          </div>
        </Band>
      )}

      <div id="contact">
        <ClosingCta />
      </div>
    </div>
  );
}
