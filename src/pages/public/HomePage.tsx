import { Link } from 'react-router-dom';
import { useI18n } from '@/i18n/I18nProvider';
import { usePublicData } from '@/lib/PublicData';
import { localizedName } from '@/lib/display';
import { formatPrice } from '@/lib/format';
import { Reveal } from '@/components/Reveal';
import { InlineLoading } from '@/components/ui/misc';
import { ArrowUpRight, MapPin, LogIn, Check, ICON_SM } from '@/components/ui/icons';
import { pick } from './components';

// Marketing home page — "Exaggerated Minimalism" (ui-ux-pro-max):
// true black, oversized display type (clamp 3rem → 10.5rem at weight 900),
// extreme negative space, and ONE vibrant accent doing all the shouting.
// Hero-Centric landing pattern: full-bleed hero owning most of the fold, then a
// value strip, proof, and a single primary CTA.
//
// The accent is never hardcoded — it is the gym's own colour, read at runtime
// from the gyms row, so this whole page rebrands with the client. Parallax was
// declined on purpose: the same database rates it poor for performance and
// accessibility, which outrank style in its own priority table.

export function HomePage() {
  const { t, locale } = useI18n();
  const { gym, plans, branches, trainers, content, loading } = usePublicData();

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
      <section className="relative flex min-h-[82vh] flex-col justify-between overflow-hidden px-5 pt-14 pb-10 md:pt-20">
        {/* One accent slab bleeding off the edge — the single graphic element. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 end-[-10%] h-[46rem] w-[46rem] rounded-full bg-accent opacity-[0.13] blur-[120px]"
        />

        <div className="relative mx-auto flex w-full max-w-content flex-1 flex-col justify-center">
          <Reveal>
            <p className="eyebrow mb-8">{t('pub.hero.eyebrow')}</p>
            <h1 className="font-display display-xl max-w-[15ch] text-balance break-words text-text">{heroTitle}</h1>
            <p className="mt-10 max-w-xl text-xl leading-relaxed text-muted md:text-2xl">{heroSub}</p>
          </Reveal>

          <Reveal delay={120}>
            <div className="mt-12 flex flex-wrap items-center gap-4">
              <Link
                to="/join"
                className="focus-ring inline-flex min-h-[56px] items-center rounded-lg bg-accent px-9 text-lg font-bold text-white transition-all duration-200 hover:brightness-110 active:scale-[0.98]"
              >
                {t('pub.hero.cta')}
              </Link>
              <Link
                to="/plans"
                className="focus-ring inline-flex min-h-[56px] items-center gap-2 rounded-lg border border-block-line px-7 text-lg font-semibold text-text transition-colors duration-200 hover:border-text hover:bg-block"
              >
                {t('pub.hero.plans')} <ArrowUpRight {...ICON_SM} />
              </Link>
              <Link
                to="/login"
                className="focus-ring inline-flex min-h-[56px] items-center gap-2 rounded-lg px-4 text-base text-muted transition-colors duration-200 hover:text-text"
              >
                <LogIn {...ICON_SM} /> {t('nav.login')}
              </Link>
            </div>
          </Reveal>
        </div>

        {/* Proof, as oversized numerals along the bottom of the fold. */}
        {stats.length > 0 && (
          <Reveal delay={200}>
            <div className="relative mx-auto flex w-full max-w-content flex-wrap gap-x-16 gap-y-6 border-t border-block-line pt-8">
              {stats.map((s) => (
                <div key={s.label} className="flex items-baseline gap-3">
                  <span className="font-display text-6xl leading-none text-accent md:text-7xl">{s.value}</span>
                  <span className="text-base text-muted">{s.label}</span>
                </div>
              ))}
            </div>
          </Reveal>
        )}
      </section>

      {/* ══ TICKER — an accent band across the full width ═════════════════ */}
      {facilities.length > 0 && (
        <div className="overflow-hidden border-y border-accent bg-accent py-4 select-none">
          <div className="ticker-track">
            {[0, 1].map((copy) => (
              <div key={copy} className="flex shrink-0 items-center" aria-hidden={copy === 1}>
                {facilities.map((f, i) => (
                  <span key={i} className="flex items-center whitespace-nowrap px-8 text-lg font-bold text-white">
                    {locale === 'ar' ? f.ar : f.en}
                    <span className="px-8 opacity-50">/</span>
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {loading && plans.length === 0 && <InlineLoading />}

      {/* ══ PLANS — the featured one is a solid accent block ══════════════ */}
      {plans.length > 0 && (
        <Band id="plans" eyebrow={t('pub.plans.eyebrow')} title={t('pub.plans.title')}>
          <div className="grid gap-4 sm:grid-cols-2 lg:[grid-template-columns:repeat(auto-fit,minmax(15rem,1fr))]">
            {featured && (
              <Reveal>
                <article className="flex h-full flex-col justify-between rounded-lg bg-accent p-8 text-white">
                  <div>
                    <span className="inline-flex rounded bg-black/25 px-3 py-1 text-xs font-bold">
                      {t('pub.plans.featured')}
                    </span>
                    <h3 className="mt-6 text-base font-semibold opacity-80">{localizedName(featured, locale)}</h3>
                    <p className="font-display mt-2 whitespace-nowrap leading-none [font-size:clamp(2rem,3.4vw,3.25rem)]">
                      {formatPrice(featured.price, locale)}
                    </p>
                    <p className="mt-2 text-sm opacity-75">
                      / {featured.duration_months}{' '}
                      {featured.duration_months === 1 ? t('pub.plans.month') : t('pub.plans.months')}
                    </p>
                    <ul className="mt-7 space-y-3 text-base">
                      <li className="flex items-center gap-2.5">
                        <Check {...ICON_SM} />
                        {featured.all_branches_access ? t('pub.plans.access_all') : t('pub.plans.access_single')}
                      </li>
                      <li className="flex items-center gap-2.5">
                        <Check {...ICON_SM} />
                        {featured.freeze_allowance_days} {t('pub.plans.freeze')}
                      </li>
                    </ul>
                  </div>
                  <Link
                    to={`/join?plan=${featured.id}`}
                    className="focus-ring mt-8 inline-flex min-h-[52px] items-center justify-center rounded-lg bg-white px-6 text-base font-bold text-paper-ink transition-transform duration-200 hover:scale-[1.02] active:scale-[0.98]"
                  >
                    {t('pub.plans.choose')}
                  </Link>
                </article>
              </Reveal>
            )}

            {plans
              .filter((p) => p.id !== featured?.id)
              .map((p, i) => (
                <Reveal key={p.id} delay={70 * (i + 1)}>
                  <article className="block-panel flex h-full flex-col justify-between p-7">
                    <div>
                      <h3 className="text-sm font-semibold text-muted">{localizedName(p, locale)}</h3>
                      <p className="font-display mt-2 whitespace-nowrap leading-none text-text [font-size:clamp(1.75rem,2.8vw,2.75rem)]">
                        {formatPrice(p.price, locale)}
                      </p>
                      <p className="mt-1.5 text-sm text-faint">
                        / {p.duration_months} {p.duration_months === 1 ? t('pub.plans.month') : t('pub.plans.months')}
                      </p>
                      <p className="mt-6 text-sm text-text/70">
                        {p.all_branches_access ? t('pub.plans.access_all') : t('pub.plans.access_single')} ·{' '}
                        {p.freeze_allowance_days} {t('pub.plans.freeze')}
                      </p>
                    </div>
                    <Link
                      to={`/join?plan=${p.id}`}
                      className="focus-ring mt-7 inline-flex min-h-[44px] items-center gap-1.5 text-base font-bold text-text transition-all duration-200 hover:gap-3 hover:text-accent"
                    >
                      {t('pub.plans.choose')} <ArrowUpRight {...ICON_SM} />
                    </Link>
                  </article>
                </Reveal>
              ))}
          </div>
        </Band>
      )}

      {/* ══ BRANCHES — oversized numerals, split rows ═════════════════════ */}
      {branches.length > 0 && (
        <Band id="branches" eyebrow={t('pub.branches.eyebrow')} title={t('pub.branches.title')}>
          <div>
            {branches.map((b, i) => (
              <Reveal key={b.id} delay={60 * i}>
                <div className="group flex flex-col gap-4 border-t border-block-line py-8 md:flex-row md:items-center md:gap-10">
                  <span className="font-display text-5xl leading-none text-block-2 transition-colors duration-200 group-hover:text-accent md:text-7xl">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <div className="flex-1">
                    <h3 className="font-display text-3xl text-text md:text-4xl">{localizedName(b, locale)}</h3>
                    <p className="mt-2 text-base text-muted">
                      {locale === 'ar' ? b.address_ar : b.address_en} — {b.city}
                    </p>
                    {b.phone && <p dir="ltr" className="mt-1 text-start text-sm text-faint">{b.phone}</p>}
                  </div>
                  {b.map_url && (
                    <a
                      href={b.map_url}
                      target="_blank"
                      rel="noreferrer"
                      className="focus-ring inline-flex min-h-[48px] shrink-0 items-center gap-2 rounded-lg border border-block-line px-5 text-sm font-semibold text-text transition-colors duration-200 hover:border-accent hover:text-accent"
                    >
                      <MapPin {...ICON_SM} /> {t('pub.branches.map')}
                    </a>
                  )}
                </div>
              </Reveal>
            ))}
          </div>
        </Band>
      )}

      {/* ══ TRAINERS — initials at display scale ══════════════════════════ */}
      {trainers.length > 0 && (
        <Band eyebrow={t('pub.trainers.eyebrow')} title={t('pub.trainers.title')}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {trainers.map((tr, i) => (
              <Reveal key={tr.id} delay={60 * i}>
                <div className="block-panel group h-full overflow-hidden">
                  <div className="flex h-40 items-center justify-center bg-block-2 transition-colors duration-200 group-hover:bg-accent">
                    <span className="font-display text-7xl leading-none text-accent transition-colors duration-200 group-hover:text-white">
                      {(locale === 'ar' ? tr.name_ar : tr.name_en).charAt(0)}
                    </span>
                  </div>
                  <div className="p-6">
                    <h3 className="font-display text-xl text-text">{locale === 'ar' ? tr.name_ar : tr.name_en}</h3>
                    <p className="mt-1 text-sm text-muted">{locale === 'ar' ? tr.specialty_ar : tr.specialty_en}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </Band>
      )}

      {/* ══ TESTIMONIALS — the one light band, full bleed ═════════════════ */}
      {testimonials.length > 0 && (
        <section className="bg-paper py-20 text-paper-ink md:py-28">
          <div className="mx-auto max-w-content px-5">
            <Reveal>
              <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-paper-muted">
                {t('pub.testimonials.eyebrow')}
              </p>
              <h2 className="font-display display-lg mb-12 text-paper-ink">{t('pub.testimonials.title')}</h2>
            </Reveal>
            <div className="grid gap-10 md:grid-cols-2">
              {testimonials.map((tm, i) => (
                <Reveal key={i} delay={70 * i}>
                  <figure>
                    <blockquote className="font-display text-2xl leading-snug text-paper-ink md:text-3xl">
                      {locale === 'ar' ? tm.text_ar : tm.text_en}
                    </blockquote>
                    <figcaption className="mt-5 text-sm font-bold text-accent">
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
                  <summary className="focus-ring flex min-h-[72px] cursor-pointer list-none items-center justify-between gap-4 text-xl text-text marker:hidden">
                    {locale === 'ar' ? item.q_ar : item.q_en}
                    <span className="font-display text-3xl text-accent transition-transform duration-200 group-open:rotate-45">
                      +
                    </span>
                  </summary>
                  <p className="pb-7 text-lg leading-relaxed text-muted">
                    {locale === 'ar' ? item.a_ar : item.a_en}
                  </p>
                </details>
              </Reveal>
            ))}
          </div>
        </Band>
      )}

      {/* ══ CLOSING — full-bleed accent, one action ═══════════════════════ */}
      <section id="contact" className="bg-accent py-20 text-white md:py-28">
        <div className="mx-auto max-w-content px-5">
          <Reveal>
            <div className="flex flex-col gap-10 md:flex-row md:items-end md:justify-between">
              <div>
                <h2 className="font-display display-lg max-w-[14ch]">{t('pub.cta.title')}</h2>
                <p className="mt-6 max-w-md text-lg leading-relaxed opacity-90">{t('pub.cta.body')}</p>
                <div className="mt-6 space-y-1 text-sm opacity-75">
                  {gym?.contact_phone && <p dir="ltr" className="text-start">{gym.contact_phone}</p>}
                  {gym?.contact_email && <p dir="ltr" className="text-start">{gym.contact_email}</p>}
                </div>
              </div>
              <Link
                to="/join"
                className="focus-ring inline-flex min-h-[60px] shrink-0 items-center rounded-lg bg-white px-10 text-lg font-bold text-paper-ink transition-transform duration-200 hover:scale-[1.03] active:scale-[0.98]"
              >
                {t('pub.hero.cta')}
              </Link>
            </div>
          </Reveal>
        </div>
      </section>
    </div>
  );
}

// A band of the page: heavy vertical rhythm, oversized section title.
function Band({
  id,
  eyebrow,
  title,
  children,
}: {
  id?: string;
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="mx-auto max-w-content px-5 py-20 md:py-28">
      <Reveal>
        <p className="eyebrow mb-3">{eyebrow}</p>
        <h2 className="font-display display-lg mb-12 max-w-2xl text-text">{title}</h2>
      </Reveal>
      {children}
    </section>
  );
}
