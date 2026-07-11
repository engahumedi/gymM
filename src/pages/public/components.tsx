import { Link } from 'react-router-dom';
import { useI18n } from '@/i18n/I18nProvider';
import { localizedName } from '@/lib/display';
import { formatCurrency } from '@/lib/format';
import { Check, ArrowUpRight, ICON_SM } from '@/components/ui/icons';
import type { Plan } from '@/lib/database.types';

// A section separated by whitespace + a hairline rule, with an editorial
// eyebrow/title on the start side — not a centred heading.
export function Section({
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
    <section id={id} className="border-t border-border">
      <div className="mx-auto max-w-content px-5 py-20">
        {title && (
          <div className="mb-12 max-w-2xl">
            {eyebrow && <p className="eyebrow mb-3">{eyebrow}</p>}
            <h2 className="font-display text-3xl leading-tight md:text-5xl">{title}</h2>
          </div>
        )}
        {children}
      </div>
    </section>
  );
}

export function PlanCard({ plan, featured }: { plan: Plan; featured?: boolean }) {
  const { t, locale } = useI18n();
  const feats = [
    plan.all_branches_access ? t('pub.plans.access_all') : t('pub.plans.access_single'),
    `${plan.freeze_allowance_days} ${t('pub.plans.freeze')}`,
  ];
  return (
    <div className={`flex flex-col py-6 ${featured ? 'border-t-2 border-accent' : 'border-t border-border'}`}>
      <h3 className="text-sm font-semibold tracking-wide text-muted">{localizedName(plan, locale)}</h3>
      <p className="font-display mt-3 text-4xl text-text">{formatCurrency(plan.price, locale)}</p>
      <p className="mt-1 text-sm text-faint">
        / {plan.duration_months} {plan.duration_months === 1 ? t('pub.plans.month') : t('pub.plans.months')}
      </p>
      <ul className="mt-6 flex-1 space-y-2.5 text-sm text-text/80">
        {feats.map((f, i) => (
          <li key={i} className="flex items-center gap-2">
            <Check {...ICON_SM} className={featured ? 'text-accent' : 'text-muted'} />
            {f}
          </li>
        ))}
      </ul>
      <Link
        to={`/join?plan=${plan.id}`}
        className={`mt-6 inline-flex items-center gap-1.5 text-sm font-semibold ${featured ? 'text-accent' : 'text-text'} hover:gap-2.5 transition-all`}
      >
        {t('pub.plans.choose')} <ArrowUpRight {...ICON_SM} />
      </Link>
    </div>
  );
}

// Localized field lookup from a site_content JSON record (e.g. title_ar/title_en).
export function pick(content: Record<string, unknown> | undefined, base: string, locale: string): string {
  if (!content) return '';
  const v = content[`${base}_${locale}`];
  return typeof v === 'string' ? v : '';
}
