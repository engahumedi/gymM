import { useI18n } from '@/i18n/I18nProvider';
import { usePublicData } from '@/lib/PublicData';
import { localizedName } from '@/lib/display';
import { formatCurrency } from '@/lib/format';
import { InlineLoading } from '@/components/ui/misc';
import { MapPin, ICON_SM } from '@/components/ui/icons';
import { Section, PlanCard } from './components';

export function PlansPage() {
  const { t, locale } = useI18n();
  const { plans, loading } = usePublicData();
  if (loading) return <InlineLoading />;
  const featuredId = plans.reduce((a, b) => (b.duration_months > (a?.duration_months ?? 0) ? b : a), plans[0])?.id;
  return (
    <Section eyebrow={t('pub.plans.eyebrow')} title={t('pub.plans.title')}>
      <div className="mb-16 grid gap-x-8 sm:grid-cols-2 lg:grid-cols-4">
        {plans.map((p) => <PlanCard key={p.id} plan={p} featured={p.id === featuredId} />)}
      </div>

      <h3 className="eyebrow mb-4">{t('pub.plans.compare')}</h3>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[32rem] text-start text-sm">
          <thead>
            <tr className="border-y border-border text-muted">
              <Th>{t('pub.plans.col.plan')}</Th><Th>{t('pub.plans.col.duration')}</Th>
              <Th>{t('pub.plans.col.price')}</Th><Th>{t('pub.plans.col.freeze')}</Th><Th>{t('pub.plans.col.access')}</Th>
            </tr>
          </thead>
          <tbody>
            {plans.map((p) => (
              <tr key={p.id} className="border-b border-border">
                <Td className="font-display text-base text-text">{localizedName(p, locale)}</Td>
                <Td>{p.duration_months} {p.duration_months === 1 ? t('pub.plans.month') : t('pub.plans.months')}</Td>
                <Td className="text-text">{formatCurrency(p.price, locale)}</Td>
                <Td>{p.freeze_allowance_days} {t('common.days')}</Td>
                <Td>{p.all_branches_access ? t('pub.plans.access_all') : t('pub.plans.access_single')}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

export function BranchesPage() {
  const { t, locale } = useI18n();
  const { branches, loading } = usePublicData();
  if (loading) return <InlineLoading />;
  return (
    <Section eyebrow={t('pub.branches.eyebrow')} title={t('pub.branches.title')}>
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
  );
}

export function TrainersPage() {
  const { t, locale } = useI18n();
  const { trainers, loading } = usePublicData();
  if (loading) return <InlineLoading />;
  return (
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
  );
}

export function ContactPage() {
  const { t } = useI18n();
  const { gym, loading } = usePublicData();
  if (loading) return <InlineLoading />;
  const socials = gym?.social_links ?? {};
  return (
    <Section eyebrow={t('pub.contact.eyebrow')} title={t('pub.contact.title')}>
      <div className="max-w-md space-y-2 text-muted">
        {gym?.contact_phone && <p dir="ltr" className="text-start"><span className="text-faint">{t('pub.contact.phone')} · </span>{gym.contact_phone}</p>}
        {gym?.contact_email && <p dir="ltr" className="text-start"><span className="text-faint">{t('pub.contact.email')} · </span>{gym.contact_email}</p>}
        <div className="flex gap-5 pt-4">
          {Object.entries(socials).map(([k, url]) => (
            <a key={k} href={String(url)} target="_blank" rel="noreferrer" className="text-sm text-text hover:text-accent">{k}</a>
          ))}
        </div>
      </div>
    </Section>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-2.5 text-start text-xs font-medium tracking-wide">{children}</th>;
}
function Td({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-3 text-muted ${className}`}>{children}</td>;
}
