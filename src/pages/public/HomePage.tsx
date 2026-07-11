import { Link } from 'react-router-dom';
import { useI18n } from '@/i18n/I18nProvider';

// Minimal hero for Phase 2. The full data-driven marketing site is Phase 7.
export function HomePage() {
  const { t } = useI18n();
  return (
    <section className="relative overflow-hidden">
      <div className="mx-auto max-w-6xl px-4 py-24 text-center">
        <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-brand">
          {t('app.tagline')}
        </p>
        <h1 className="mx-auto max-w-3xl text-4xl font-extrabold leading-tight md:text-6xl">
          {t('app.name')}
        </h1>
        <div className="mt-8 flex justify-center gap-3">
          <Link
            to="/join"
            className="rounded-lg bg-brand px-6 py-3 text-sm font-semibold text-white hover:bg-brand-dark"
          >
            {t('nav.join')}
          </Link>
          <Link
            to="/plans"
            className="rounded-lg border border-white/20 px-6 py-3 text-sm font-semibold text-slate-100 hover:bg-white/10"
          >
            {t('nav.plans')}
          </Link>
        </div>
      </div>
    </section>
  );
}
