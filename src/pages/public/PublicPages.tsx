import { useI18n } from '@/i18n/I18nProvider';
import { usePublicData } from '@/lib/PublicData';
import { localizedName } from '@/lib/display';
import { formatCurrency } from '@/lib/format';
import { InlineLoading } from '@/components/ui/misc';
import { Section, PlanCard } from './components';

export function PlansPage() {
  const { t, locale } = useI18n();
  const { plans, loading } = usePublicData();
  if (loading) return <InlineLoading />;
  return (
    <div className="text-slate-100">
      <Section title={t('pub.plans.title')}>
        <div className="mb-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {plans.map((p) => <PlanCard key={p.id} plan={p} />)}
        </div>

        {/* Comparison table */}
        <h3 className="mb-4 text-center text-xl font-bold">{t('pub.plans.compare')}</h3>
        <div className="overflow-x-auto rounded-2xl border border-white/10">
          <table className="w-full text-start text-sm">
            <thead className="bg-slate-800 text-slate-300">
              <tr>
                <th className="px-4 py-3 text-start">{t('pub.plans.col.plan')}</th>
                <th className="px-4 py-3 text-start">{t('pub.plans.col.duration')}</th>
                <th className="px-4 py-3 text-start">{t('pub.plans.col.price')}</th>
                <th className="px-4 py-3 text-start">{t('pub.plans.col.freeze')}</th>
                <th className="px-4 py-3 text-start">{t('pub.plans.col.access')}</th>
              </tr>
            </thead>
            <tbody className="text-slate-200">
              {plans.map((p) => (
                <tr key={p.id} className="border-t border-white/5">
                  <td className="px-4 py-3 font-semibold">{localizedName(p, locale)}</td>
                  <td className="px-4 py-3">{p.duration_months} {p.duration_months === 1 ? t('pub.plans.month') : t('pub.plans.months')}</td>
                  <td className="px-4 py-3 text-brand">{formatCurrency(p.price, locale)}</td>
                  <td className="px-4 py-3">{p.freeze_allowance_days} {t('common.days')}</td>
                  <td className="px-4 py-3">{p.all_branches_access ? t('pub.plans.access_all') : t('pub.plans.access_single')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}

export function BranchesPage() {
  const { t, locale } = useI18n();
  const { branches, loading } = usePublicData();
  if (loading) return <InlineLoading />;
  return (
    <div className="text-slate-100">
      <Section title={t('pub.branches.title')}>
        <div className="grid gap-6 md:grid-cols-2">
          {branches.map((b) => (
            <div key={b.id} className="rounded-2xl border border-white/10 bg-slate-800/50 p-6">
              <h3 className="text-lg font-bold">{localizedName(b, locale)}</h3>
              <p className="mt-1 text-sm text-slate-400">{locale === 'ar' ? b.address_ar : b.address_en} — {b.city}</p>
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
    </div>
  );
}

export function TrainersPage() {
  const { t, locale } = useI18n();
  const { trainers, loading } = usePublicData();
  if (loading) return <InlineLoading />;
  return (
    <div className="text-slate-100">
      <Section title={t('pub.trainers.title')}>
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
    </div>
  );
}

export function ContactPage() {
  const { t } = useI18n();
  const { gym, loading } = usePublicData();
  if (loading) return <InlineLoading />;
  const socials = gym?.social_links ?? {};
  return (
    <div className="text-slate-100">
      <Section title={t('pub.contact.title')}>
        <div className="mx-auto max-w-md space-y-2 text-center text-slate-300">
          {gym?.contact_phone && <p dir="ltr">{t('pub.contact.phone')}: {gym.contact_phone}</p>}
          {gym?.contact_email && <p dir="ltr">{t('pub.contact.email')}: {gym.contact_email}</p>}
          <div className="flex justify-center gap-4 pt-4">
            {Object.entries(socials).map(([k, url]) => (
              <a key={k} href={String(url)} target="_blank" rel="noreferrer" className="text-brand hover:underline">
                {k}
              </a>
            ))}
          </div>
        </div>
      </Section>
    </div>
  );
}
