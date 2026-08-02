import { Link } from 'react-router-dom';
import { useI18n } from '@/i18n/I18nProvider';
import { usePublicData } from '@/lib/PublicData';
import { localizedName } from '@/lib/display';
import { formatPrice } from '@/lib/format';
import { Reveal } from '@/components/Reveal';
import { InlineLoading } from '@/components/ui/misc';
import { Phone, Mail, ArrowUpRight, ICON_SM } from '@/components/ui/icons';
import { Band, PageHead, PlanGrid, BranchRow, TrainerTile } from './components';

// The inner pages of the marketing site. Same language as the home page:
// true black, oversized display type, one accent, blocks instead of hairlines.

export function PlansPage() {
  const { t, locale } = useI18n();
  const { plans, loading } = usePublicData();
  const featuredId = plans.reduce((a, b) => (b.duration_months > (a?.duration_months ?? 0) ? b : a), plans[0])?.id;

  return (
    <div className="bg-ground">
      <PageHead eyebrow={t('pub.plans.eyebrow')} title={t('pub.plans.title')} lead={t('pub.plans.subtitle')} />

      <Band>
        {loading && plans.length === 0 ? <InlineLoading /> : <PlanGrid plans={plans} featuredId={featuredId} />}

        {plans.length > 0 && (
          <>
            <h2 className="eyebrow mb-5 mt-20">{t('pub.plans.compare')}</h2>

            {/* Desktop: a comparison table. It scrolls inside its own box so the
                page itself never scrolls sideways. */}
            <div className="hidden overflow-x-auto rounded-lg border border-block-line md:block">
              <table className="w-full min-w-[38rem] text-start text-sm">
                <thead>
                  <tr className="border-b border-block-line bg-block text-muted">
                    <Th>{t('pub.plans.col.plan')}</Th>
                    <Th>{t('pub.plans.col.duration')}</Th>
                    <Th>{t('pub.plans.col.price')}</Th>
                    <Th>{t('pub.plans.col.freeze')}</Th>
                    <Th>{t('pub.plans.col.access')}</Th>
                  </tr>
                </thead>
                <tbody>
                  {plans.map((p) => (
                    <tr key={p.id} className="border-b border-block-line last:border-0">
                      <Td className="font-display text-base text-text">{localizedName(p, locale)}</Td>
                      <Td>
                        {p.duration_months} {p.duration_months === 1 ? t('pub.plans.month') : t('pub.plans.months')}
                      </Td>
                      <Td className="whitespace-nowrap text-text">{formatPrice(p.price, locale)}</Td>
                      <Td>
                        {p.freeze_allowance_days} {t('common.days')}
                      </Td>
                      <Td>{p.all_branches_access ? t('pub.plans.access_all') : t('pub.plans.access_single')}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Phone: the same comparison as stacked rows — a 5-column table on a
                390px screen is unreadable however it scrolls. */}
            <div className="space-y-3 md:hidden">
              {plans.map((p) => (
                <div key={p.id} className="block-panel p-5">
                  <div className="flex items-baseline justify-between gap-4">
                    <h3 className="font-display text-lg text-text">{localizedName(p, locale)}</h3>
                    <span className="whitespace-nowrap font-display text-xl text-text">
                      {formatPrice(p.price, locale)}
                    </span>
                  </div>
                  <dl className="mt-4 space-y-2 text-sm">
                    <Row label={t('pub.plans.col.duration')}>
                      {p.duration_months} {p.duration_months === 1 ? t('pub.plans.month') : t('pub.plans.months')}
                    </Row>
                    <Row label={t('pub.plans.col.freeze')}>
                      {p.freeze_allowance_days} {t('common.days')}
                    </Row>
                    <Row label={t('pub.plans.col.access')}>
                      {p.all_branches_access ? t('pub.plans.access_all') : t('pub.plans.access_single')}
                    </Row>
                  </dl>
                </div>
              ))}
            </div>
          </>
        )}
      </Band>

      <ClosingCta />
    </div>
  );
}

export function BranchesPage() {
  const { t, locale } = useI18n();
  const { branches, loading } = usePublicData();

  return (
    <div className="bg-ground">
      <PageHead eyebrow={t('pub.branches.eyebrow')} title={t('pub.branches.title')} />
      <Band>
        {loading && branches.length === 0 ? (
          <InlineLoading />
        ) : (
          <div>
            {branches.map((b, i) => (
              <Reveal key={b.id} delay={60 * i}>
                <BranchRow branch={b} index={i} locale={locale} />
              </Reveal>
            ))}
          </div>
        )}
      </Band>
      <ClosingCta />
    </div>
  );
}

export function TrainersPage() {
  const { t, locale } = useI18n();
  const { trainers, loading } = usePublicData();

  return (
    <div className="bg-ground">
      <PageHead eyebrow={t('pub.trainers.eyebrow')} title={t('pub.trainers.title')} />
      <Band>
        {loading && trainers.length === 0 ? (
          <InlineLoading />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {trainers.map((tr, i) => (
              <Reveal key={tr.id} delay={50 * i}>
                <TrainerTile trainer={tr} locale={locale} />
              </Reveal>
            ))}
          </div>
        )}
      </Band>
      <ClosingCta />
    </div>
  );
}

export function ContactPage() {
  const { t } = useI18n();
  const { gym, loading } = usePublicData();
  const socials = gym?.social_links ?? {};

  return (
    <div className="bg-ground">
      <PageHead eyebrow={t('pub.contact.eyebrow')} title={t('pub.contact.title')} />
      <Band>
        {loading && !gym ? (
          <InlineLoading />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {gym?.contact_phone && (
              <Reveal>
                <a
                  href={`tel:${gym.contact_phone}`}
                  className="block-panel focus-ring flex min-h-[96px] items-center gap-5 p-6"
                >
                  <Phone {...ICON_SM} className="shrink-0 text-accent" />
                  <span>
                    <span className="block text-sm text-faint">{t('pub.contact.phone')}</span>
                    <span dir="ltr" className="block text-start font-display text-xl text-text">
                      {gym.contact_phone}
                    </span>
                  </span>
                </a>
              </Reveal>
            )}
            {gym?.contact_email && (
              <Reveal delay={60}>
                <a
                  href={`mailto:${gym.contact_email}`}
                  className="block-panel focus-ring flex min-h-[96px] items-center gap-5 p-6"
                >
                  <Mail {...ICON_SM} className="shrink-0 text-accent" />
                  <span className="min-w-0">
                    <span className="block text-sm text-faint">{t('pub.contact.email')}</span>
                    <span dir="ltr" className="block truncate text-start font-display text-xl text-text">
                      {gym.contact_email}
                    </span>
                  </span>
                </a>
              </Reveal>
            )}
          </div>
        )}

        {Object.keys(socials).length > 0 && (
          <Reveal delay={120}>
            <div className="mt-4 flex flex-wrap gap-3">
              {Object.entries(socials).map(([k, url]) => (
                <a
                  key={k}
                  href={String(url)}
                  target="_blank"
                  rel="noreferrer"
                  className="focus-ring inline-flex min-h-[48px] items-center gap-2 rounded-lg border border-block-line px-5 text-sm font-semibold text-text transition-colors duration-200 hover:border-accent hover:text-accent"
                >
                  {k} <ArrowUpRight {...ICON_SM} />
                </a>
              ))}
            </div>
          </Reveal>
        )}
      </Band>
      <ClosingCta />
    </div>
  );
}

// The same closing band the home page ends on, so every route offers the one
// action the site exists for.
export function ClosingCta() {
  const { t } = useI18n();
  return (
    <section className="bg-accent py-16 text-accent-on md:py-24">
      <div className="mx-auto max-w-content px-5">
        <Reveal>
          <div className="flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="font-display display-lg max-w-[14ch]">{t('pub.cta.title')}</h2>
              <p className="mt-5 max-w-md text-lg leading-relaxed opacity-90">{t('pub.cta.body')}</p>
            </div>
            <Link
              to="/join"
              className="focus-ring inline-flex min-h-[56px] shrink-0 items-center justify-center rounded-lg bg-accent-on px-10 text-lg font-bold text-accent transition-transform duration-200 hover:scale-[1.03] active:scale-[0.98]"
            >
              {t('pub.hero.cta')}
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-3 text-start text-xs font-semibold tracking-wide">{children}</th>;
}

function Td({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3.5 text-muted ${className}`}>{children}</td>;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-t border-block-line pt-2">
      <dt className="text-faint">{label}</dt>
      <dd className="text-text">{children}</dd>
    </div>
  );
}
