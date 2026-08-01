import { Link } from 'react-router-dom';
import { useI18n } from '@/i18n/I18nProvider';
import { usePublicData } from '@/lib/PublicData';
import { localizedName } from '@/lib/display';
import { formatCurrency } from '@/lib/format';
import { Reveal } from '@/components/Reveal';
import { InlineLoading } from '@/components/ui/misc';
import { ArrowUpRight, MapPin, LogIn, Check, ICON_SM } from '@/components/ui/icons';
import { pick } from './components';

// Block-based redesign of the marketing home page.
//
// Direction from the ui-ux-pro-max database: for a Fitness/Gym product it
// recommends "Vibrant & Block-based + Dark Mode (OLED)" with a Feature-Rich
// Showcase landing pattern — large sections, type at 32px+, bold hover shifts
// at 200-300ms, CTA above the fold. Two of its suggestions are deliberately NOT
// taken: its neon palette (the accent here is white-label, read at runtime from
// the gyms row) and parallax storytelling (the same database rates it poor for
// performance and accessibility, which outrank style in its own priority table).

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
  const featured = plans.reduce((a, b) => (b.duration_months > (a?.duration_months ?? 0) ? b : a), plans[0]);

  const stats = [
    { value: branches.length, label: t('pub.stat.branches') },
    { value: trainers.length, label: t('pub.stat.trainers') },
    { value: plans.length, label: t('pub.stat.plans') },
  ].filter((s) => s.value > 0);

  return (
    <div className="bg-ground">
      {/* ── Hero ────────────────────────────────────────────────────────────
          Oversized title, one primary action above the fold, and the numbers
          pinned beside it as proof rather than as a separate band. */}
      <section className="mx-auto max-w-content px-5 pt-16 pb-20 md:pt-24 md:pb-28">
        <Reveal>
          <p className="eyebrow mb-6">{t('pub.hero.eyebrow')}</p>
          <h1 className="font-display max-w-5xl text-balance leading-[0.95] text-text [font-size:clamp(2.75rem,9vw,7rem)]">
            {heroTitle}
          </h1>
        </Reveal>

        <Reveal delay={80}>
          <div className="mt-12 grid gap-10 border-t border-block-line pt-10 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <p className="max-w-lg text-lg leading-relaxed text-muted md:text-xl">{heroSub}</p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link
                  to="/join"
                  className="focus-ring inline-flex min-h-[48px] items-center rounded-lg bg-accent px-7 text-base font-semibold text-white transition-all duration-200 hover:brightness-110 active:scale-[0.98]"
                >
                  {t('pub.hero.cta')}
                </Link>
                <Link
                  to="/plans"
                  className="focus-ring inline-flex min-h-[48px] items-center gap-2 rounded-lg border border-block-line px-6 text-base font-semibold text-text transition-colors duration-200 hover:border-border-strong hover:bg-block"
                >
                  {t('pub.hero.plans')} <ArrowUpRight {...ICON_SM} />
                </Link>
                <Link
                  to="/login"
                  className="focus-ring inline-flex min-h-[48px] items-center gap-2 rounded-lg px-4 text-sm text-muted transition-colors duration-200 hover:text-text"
                >
                  <LogIn {...ICON_SM} /> {t('nav.login')}
                </Link>
              </div>
            </div>

            {stats.length > 0 && (
              <div className="flex gap-10">
                {stats.map((s) => (
                  <div key={s.label}>
                    <p className="font-display text-4xl leading-none text-text md:text-5xl">{s.value}</p>
                    <p className="mt-2 text-sm text-faint">{s.label}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Reveal>
      </section>

      {loading && plans.length === 0 && <InlineLoading />}

      {/* ── Plans — the featured plan owns a taller block ─────────────────── */}
      {plans.length > 0 && (
        <Block id="plans" eyebrow={t('pub.plans.eyebrow')} title={t('pub.plans.title')}>
          {/* auto-fit: stays balanced whether a gym has 2 plans or 6 */}
          <div className="grid gap-5 sm:grid-cols-2 lg:[grid-template-columns:repeat(auto-fit,minmax(15rem,1fr))]">
            {featured && (
              <Reveal>
                <article className="block-panel flex h-full flex-col justify-between border-accent/50 bg-block-2 p-7">
                  <div>
                    <span className="inline-flex rounded bg-accent/15 px-2.5 py-1 text-xs font-semibold text-accent">
                      {t('pub.plans.featured')}
                    </span>
                    <h3 className="mt-5 text-base font-semibold text-muted">{localizedName(featured, locale)}</h3>
                    <p className="font-display mt-2 text-5xl leading-none text-text">
                      {formatCurrency(featured.price, locale)}
                    </p>
                    <p className="mt-2 text-sm text-faint">
                      / {featured.duration_months}{' '}
                      {featured.duration_months === 1 ? t('pub.plans.month') : t('pub.plans.months')}
                    </p>
                    <ul className="mt-6 space-y-3 text-sm text-text/85">
                      <li className="flex items-center gap-2.5">
                        <Check {...ICON_SM} className="text-accent" />
                        {featured.all_branches_access ? t('pub.plans.access_all') : t('pub.plans.access_single')}
                      </li>
                      <li className="flex items-center gap-2.5">
                        <Check {...ICON_SM} className="text-accent" />
                        {featured.freeze_allowance_days} {t('pub.plans.freeze')}
                      </li>
                    </ul>
                  </div>
                  <Link
                    to={`/join?plan=${featured.id}`}
                    className="focus-ring mt-7 inline-flex min-h-[48px] items-center justify-center rounded-lg bg-accent px-6 text-base font-semibold text-white transition-all duration-200 hover:brightness-110 active:scale-[0.98]"
                  >
                    {t('pub.plans.choose')}
                  </Link>
                </article>
              </Reveal>
            )}

            {plans
              .filter((p) => p.id !== featured?.id)
              .map((p, i) => (
                <Reveal key={p.id} delay={60 * (i + 1)}>
                  <article className="block-panel flex h-full flex-col justify-between p-6">
                    <div>
                      <h3 className="text-sm font-semibold text-muted">{localizedName(p, locale)}</h3>
                      <p className="font-display mt-2 text-4xl leading-none text-text">
                        {formatCurrency(p.price, locale)}
                      </p>
                      <p className="mt-1.5 text-sm text-faint">
                        / {p.duration_months} {p.duration_months === 1 ? t('pub.plans.month') : t('pub.plans.months')}
                      </p>
                      <p className="mt-5 text-sm text-text/70">
                        {p.all_branches_access ? t('pub.plans.access_all') : t('pub.plans.access_single')} ·{' '}
                        {p.freeze_allowance_days} {t('pub.plans.freeze')}
                      </p>
                    </div>
                    <Link
                      to={`/join?plan=${p.id}`}
                      className="focus-ring mt-6 inline-flex min-h-[44px] items-center gap-1.5 text-sm font-semibold text-text transition-all duration-200 hover:gap-3 hover:text-accent"
                    >
                      {t('pub.plans.choose')} <ArrowUpRight {...ICON_SM} />
                    </Link>
                  </article>
                </Reveal>
              ))}
          </div>
        </Block>
      )}

      {/* ── Branches ─────────────────────────────────────────────────────── */}
      {branches.length > 0 && (
        <Block id="branches" eyebrow={t('pub.branches.eyebrow')} title={t('pub.branches.title')}>
          <div className="grid gap-5 md:grid-cols-2">
            {branches.map((b, i) => (
              <Reveal key={b.id} delay={60 * i}>
                <div className="block-panel flex h-full items-start justify-between gap-5 p-6">
                  <div>
                    <h3 className="font-display text-2xl text-text">{localizedName(b, locale)}</h3>
                    <p className="mt-2 text-sm text-muted">
                      {locale === 'ar' ? b.address_ar : b.address_en} — {b.city}
                    </p>
                    {b.phone && <p dir="ltr" className="mt-1 text-start text-sm text-faint">{b.phone}</p>}
                  </div>
                  {b.map_url && (
                    <a
                      href={b.map_url}
                      target="_blank"
                      rel="noreferrer"
                      className="focus-ring inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm text-accent transition-all duration-200 hover:gap-2.5"
                    >
                      <MapPin {...ICON_SM} /> {t('pub.branches.map')}
                    </a>
                  )}
                </div>
              </Reveal>
            ))}
          </div>
        </Block>
      )}

      {/* ── Trainers ─────────────────────────────────────────────────────── */}
      {trainers.length > 0 && (
        <Block eyebrow={t('pub.trainers.eyebrow')} title={t('pub.trainers.title')}>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {trainers.map((tr, i) => (
              <Reveal key={tr.id} delay={50 * i}>
                <div className="block-panel h-full p-6">
                  <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-lg bg-block-2 font-display text-2xl text-accent">
                    {(locale === 'ar' ? tr.name_ar : tr.name_en).charAt(0)}
                  </div>
                  <h3 className="font-display text-lg text-text">{locale === 'ar' ? tr.name_ar : tr.name_en}</h3>
                  <p className="mt-1 text-sm text-muted">{locale === 'ar' ? tr.specialty_ar : tr.specialty_en}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </Block>
      )}

      {/* ── Facilities — numbered blocks ─────────────────────────────────── */}
      {facilities.length > 0 && (
        <Block eyebrow={t('pub.facilities.eyebrow')} title={t('pub.facilities.title')}>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {facilities.map((f, i) => (
              <Reveal key={i} delay={50 * i}>
                <div className="block-panel h-full p-6">
                  <span className="font-display text-sm text-accent">{String(i + 1).padStart(2, '0')}</span>
                  <p className="mt-3 text-lg leading-snug text-text">{locale === 'ar' ? f.ar : f.en}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </Block>
      )}

      {/* ── Testimonials ─────────────────────────────────────────────────── */}
      {testimonials.length > 0 && (
        <Block eyebrow={t('pub.testimonials.eyebrow')} title={t('pub.testimonials.title')}>
          <div className="grid gap-5 md:grid-cols-2">
            {testimonials.map((tm, i) => (
              <Reveal key={i} delay={60 * i}>
                <figure className="block-panel h-full p-7">
                  <blockquote className="font-display text-xl leading-snug text-text md:text-2xl">
                    {locale === 'ar' ? tm.text_ar : tm.text_en}
                  </blockquote>
                  <figcaption className="mt-5 text-sm text-accent">
                    {locale === 'ar' ? tm.name_ar : tm.name_en}
                  </figcaption>
                </figure>
              </Reveal>
            ))}
          </div>
        </Block>
      )}

      {/* ── FAQ ──────────────────────────────────────────────────────────── */}
      {faq.length > 0 && (
        <Block eyebrow={t('pub.faq.eyebrow')} title={t('pub.faq.title')}>
          <div className="mx-auto max-w-3xl space-y-3">
            {faq.map((item, i) => (
              <Reveal key={i} delay={40 * i}>
                <details className="block-panel group px-6 py-1">
                  <summary className="focus-ring flex min-h-[56px] cursor-pointer list-none items-center justify-between gap-4 text-lg text-text marker:hidden">
                    {locale === 'ar' ? item.q_ar : item.q_en}
                    <span className="text-accent transition-transform duration-200 group-open:rotate-45">+</span>
                  </summary>
                  <p className="pb-5 text-muted">{locale === 'ar' ? item.a_ar : item.a_en}</p>
                </details>
              </Reveal>
            ))}
          </div>
        </Block>
      )}

      {/* ── Closing CTA — one accent band, the last thing they read ──────── */}
      <section id="contact" className="mx-auto max-w-content px-5 pb-24 pt-4">
        <Reveal>
          <div className="rounded-lg border border-accent/30 bg-accent/[0.07] p-8 md:p-12">
            <div className="flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
              <div>
                <h2 className="font-display text-3xl leading-tight text-text md:text-5xl">{t('pub.cta.title')}</h2>
                <p className="mt-4 max-w-md text-base leading-relaxed text-muted md:text-lg">{t('pub.cta.body')}</p>
                <div className="mt-6 space-y-1 text-sm text-faint">
                  {gym?.contact_phone && <p dir="ltr" className="text-start">{gym.contact_phone}</p>}
                  {gym?.contact_email && <p dir="ltr" className="text-start">{gym.contact_email}</p>}
                </div>
              </div>
              <Link
                to="/join"
                className="focus-ring inline-flex min-h-[52px] shrink-0 items-center rounded-lg bg-accent px-8 text-base font-semibold text-white transition-all duration-200 hover:brightness-110 active:scale-[0.98]"
              >
                {t('pub.hero.cta')}
              </Link>
            </div>
          </div>
        </Reveal>
      </section>
    </div>
  );
}

// A section of the block layout: generous vertical rhythm (the style guidance
// asks for large sections), an editorial eyebrow/title, then the blocks.
function Block({
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
    <section id={id} className="mx-auto max-w-content px-5 py-14 md:py-20">
      <Reveal>
        <div className="mb-8 max-w-2xl md:mb-10">
          <p className="eyebrow mb-3">{eyebrow}</p>
          <h2 className="font-display text-3xl leading-tight text-text md:text-5xl">{title}</h2>
        </div>
      </Reveal>
      {children}
    </section>
  );
}
