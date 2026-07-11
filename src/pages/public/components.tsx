import { Link } from 'react-router-dom';
import { useI18n } from '@/i18n/I18nProvider';
import { localizedName } from '@/lib/display';
import { formatCurrency } from '@/lib/format';
import type { Plan } from '@/lib/database.types';

export function Section({
  id,
  title,
  children,
  dark,
}: {
  id?: string;
  title?: string;
  children: React.ReactNode;
  dark?: boolean;
}) {
  return (
    <section id={id} className={`py-16 ${dark ? 'bg-slate-900' : 'bg-slate-950'}`}>
      <div className="mx-auto max-w-6xl px-4">
        {title && <h2 className="mb-8 text-center text-2xl font-extrabold text-white md:text-3xl">{title}</h2>}
        {children}
      </div>
    </section>
  );
}

export function PlanCard({ plan }: { plan: Plan }) {
  const { t, locale } = useI18n();
  return (
    <div className="flex flex-col rounded-2xl border border-white/10 bg-slate-800/60 p-6 text-slate-100">
      <h3 className="text-lg font-bold">{localizedName(plan, locale)}</h3>
      <p className="mt-2 text-3xl font-extrabold text-brand">
        {formatCurrency(plan.price, locale)}
      </p>
      <p className="text-sm text-slate-400">
        / {plan.duration_months} {plan.duration_months === 1 ? t('pub.plans.month') : t('pub.plans.months')}
      </p>
      <ul className="mt-4 flex-1 space-y-2 text-sm text-slate-300">
        <li>• {plan.all_branches_access ? t('pub.plans.access_all') : t('pub.plans.access_single')}</li>
        <li>• {plan.freeze_allowance_days} {t('pub.plans.freeze')}</li>
        {plan.sessions_count != null && <li>• {plan.sessions_count} {t('sub.field.days')}</li>}
      </ul>
      <Link
        to={`/join?plan=${plan.id}`}
        className="mt-6 rounded-lg bg-brand px-4 py-2 text-center text-sm font-semibold text-white hover:bg-brand-dark"
      >
        {t('pub.plans.choose')}
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
