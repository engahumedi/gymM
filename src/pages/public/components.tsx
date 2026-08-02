import { Link } from 'react-router-dom';
import { useI18n } from '@/i18n/I18nProvider';
import { localizedName } from '@/lib/display';
import { formatPrice } from '@/lib/format';
import { Reveal } from '@/components/Reveal';
import { Check, ArrowUpRight, MapPin, ICON_SM } from '@/components/ui/icons';
import type { Branch, Plan, Trainer } from '@/lib/database.types';
import type { Locale } from '@/i18n/dictionary';

// Shared building blocks for the public site, so every page speaks the same
// language: true black ground, oversized display type, one accent.

// Localized field lookup from a site_content JSON record (e.g. title_ar/title_en).
export function pick(content: Record<string, unknown> | undefined, base: string, locale: string): string {
  if (!content) return '';
  const v = content[`${base}_${locale}`];
  return typeof v === 'string' ? v : '';
}

// A page's opening statement — the inner pages' equivalent of the home hero.
export function PageHead({ eyebrow, title, lead }: { eyebrow: string; title: string; lead?: string }) {
  return (
    <header className="mx-auto max-w-content px-5 pt-14 pb-10 md:pt-20 md:pb-14">
      <Reveal>
        <p className="eyebrow mb-4">{eyebrow}</p>
        <h1 className="font-display display-lg max-w-[18ch] text-balance text-text">{title}</h1>
        {lead && <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted md:text-xl">{lead}</p>}
      </Reveal>
    </header>
  );
}

// A band of a page: heavy vertical rhythm, oversized section title.
export function Band({
  id,
  eyebrow,
  title,
  children,
}: {
  id?: string;
  eyebrow?: string;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="mx-auto max-w-content px-5 py-14 md:py-24">
      {title && (
        <Reveal>
          {eyebrow && <p className="eyebrow mb-3">{eyebrow}</p>}
          <h2 className="font-display display-lg mb-10 max-w-2xl text-text md:mb-12">{title}</h2>
        </Reveal>
      )}
      {children}
    </section>
  );
}

// Auto-fitting plan grid — balanced whether a gym sells 2 plans or 6.
export function PlanGrid({ plans, featuredId }: { plans: Plan[]; featuredId?: string }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:[grid-template-columns:repeat(auto-fit,minmax(15rem,1fr))]">
      {plans.map((p, i) => (
        <Reveal key={p.id} delay={60 * i}>
          <PlanBlock plan={p} featured={p.id === featuredId} />
        </Reveal>
      ))}
    </div>
  );
}

// The featured plan is a solid accent panel; the contrast does the recommending.
// Text on the accent uses --accent-on, computed from the saved brand colour, so
// a pale brand stays readable.
export function PlanBlock({ plan, featured }: { plan: Plan; featured?: boolean }) {
  const { t, locale } = useI18n();
  const months = `${plan.duration_months} ${plan.duration_months === 1 ? t('pub.plans.month') : t('pub.plans.months')}`;

  if (featured) {
    return (
      <article className="flex h-full flex-col justify-between rounded-lg bg-accent p-7 text-accent-on md:p-8">
        <div>
          <span className="inline-flex rounded border border-current px-3 py-1 text-xs font-bold">
            {t('pub.plans.featured')}
          </span>
          <h3 className="mt-6 text-base font-semibold opacity-80">{localizedName(plan, locale)}</h3>
          <p className="font-display mt-2 whitespace-nowrap leading-none [font-size:clamp(2rem,3.4vw,3.25rem)]">
            {formatPrice(plan.price, locale)}
          </p>
          <p className="mt-2 text-sm opacity-75">/ {months}</p>
          <ul className="mt-7 space-y-3 text-base">
            <li className="flex items-center gap-2.5">
              <Check {...ICON_SM} />
              {plan.all_branches_access ? t('pub.plans.access_all') : t('pub.plans.access_single')}
            </li>
            <li className="flex items-center gap-2.5">
              <Check {...ICON_SM} />
              {plan.freeze_allowance_days} {t('pub.plans.freeze')}
            </li>
          </ul>
        </div>
        <Link
          to={`/join?plan=${plan.id}`}
          className="focus-ring mt-8 inline-flex min-h-[52px] items-center justify-center rounded-lg bg-accent-on px-6 text-base font-bold text-accent transition-transform duration-200 hover:scale-[1.02] active:scale-[0.98]"
        >
          {t('pub.plans.choose')}
        </Link>
      </article>
    );
  }

  return (
    <article className="block-panel flex h-full flex-col justify-between p-6 md:p-7">
      <div>
        <h3 className="text-sm font-semibold text-muted">{localizedName(plan, locale)}</h3>
        <p className="font-display mt-2 whitespace-nowrap leading-none text-text [font-size:clamp(1.75rem,2.8vw,2.75rem)]">
          {formatPrice(plan.price, locale)}
        </p>
        <p className="mt-1.5 text-sm text-faint">/ {months}</p>
        <p className="mt-6 text-sm text-text/70">
          {plan.all_branches_access ? t('pub.plans.access_all') : t('pub.plans.access_single')} ·{' '}
          {plan.freeze_allowance_days} {t('pub.plans.freeze')}
        </p>
      </div>
      <Link
        to={`/join?plan=${plan.id}`}
        className="focus-ring mt-7 inline-flex min-h-[44px] items-center gap-1.5 text-base font-bold text-text transition-all duration-200 hover:gap-3 hover:text-accent"
      >
        {t('pub.plans.choose')} <ArrowUpRight {...ICON_SM} />
      </Link>
    </article>
  );
}

// A branch as a numbered row — the numeral is the graphic.
export function BranchRow({ branch, index, locale }: { branch: Branch; index: number; locale: Locale }) {
  const { t } = useI18n();
  return (
    <div className="group flex flex-col gap-4 border-t border-block-line py-7 md:flex-row md:items-center md:gap-10 md:py-8">
      <span className="font-display text-4xl leading-none text-block-2 transition-colors duration-200 group-hover:text-accent md:text-7xl">
        {String(index + 1).padStart(2, '0')}
      </span>
      <div className="flex-1">
        <h3 className="font-display text-2xl text-text md:text-4xl">{localizedName(branch, locale)}</h3>
        <p className="mt-2 text-base text-muted">
          {locale === 'ar' ? branch.address_ar : branch.address_en} — {branch.city}
        </p>
        {branch.phone && (
          <a
            href={`tel:${branch.phone}`}
            dir="ltr"
            className="focus-ring mt-1 inline-flex min-h-[44px] items-center text-start text-sm text-faint transition-colors hover:text-text"
          >
            {branch.phone}
          </a>
        )}
      </div>
      {branch.map_url && (
        <a
          href={branch.map_url}
          target="_blank"
          rel="noreferrer"
          className="focus-ring inline-flex min-h-[48px] shrink-0 items-center gap-2 self-start rounded-lg border border-block-line px-5 text-sm font-semibold text-text transition-colors duration-200 hover:border-accent hover:text-accent md:self-auto"
        >
          <MapPin {...ICON_SM} /> {t('pub.branches.map')}
        </a>
      )}
    </div>
  );
}

// A trainer tile: the initial at display scale, filling with accent on hover.
export function TrainerTile({ trainer, locale }: { trainer: Trainer; locale: Locale }) {
  const name = locale === 'ar' ? trainer.name_ar : trainer.name_en;
  return (
    <div className="block-panel group h-full overflow-hidden">
      <div className="flex h-32 items-center justify-center bg-block-2 transition-colors duration-200 group-hover:bg-accent md:h-40">
        <span className="font-display text-6xl leading-none text-accent transition-colors duration-200 group-hover:text-accent-on md:text-7xl">
          {name.charAt(0)}
        </span>
      </div>
      <div className="p-5 md:p-6">
        <h3 className="font-display text-lg text-text md:text-xl">{name}</h3>
        <p className="mt-1 text-sm text-muted">
          {locale === 'ar' ? trainer.specialty_ar : trainer.specialty_en}
        </p>
      </div>
    </div>
  );
}
