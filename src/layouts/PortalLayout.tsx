import { NavLink, Outlet } from 'react-router-dom';
import { useI18n } from '@/i18n/I18nProvider';
import { useAuth } from '@/auth/AuthProvider';
import { LangToggle } from '@/components/LangToggle';
import { ReferenceDataProvider } from '@/lib/ReferenceData';
import { BrandMark } from '@/components/BrandMark';
import { LogOut, ICON } from '@/components/ui/icons';
import type { MessageKey } from '@/i18n/dictionary';

const navItems: { to: string; key: MessageKey }[] = [
  { to: '/portal', key: 'portal.subscription' },
  { to: '/portal/payments', key: 'portal.payments' },
  { to: '/portal/checkins', key: 'portal.checkins' },
];

export function PortalLayout() {
  const { t } = useI18n();
  const { profile, signOut } = useAuth();

  return (
    <div className="flex min-h-screen flex-col bg-bg text-text">
      <header className="sticky top-0 z-30 border-b border-border bg-bg">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3 sm:px-5 sm:py-4">
          <div className="min-w-0">
            <BrandMark className="text-lg" logoClass="h-7" />
            <p className="eyebrow mt-0.5">{t('portal.title')}</p>
          </div>
          <div className="flex items-center gap-1 ms-auto sm:gap-4">
            <span className="hidden max-w-[14rem] truncate text-sm text-muted sm:inline">{profile?.full_name}</span>
            <LangToggle />
            <button
              onClick={signOut}
              className="focus-ring inline-flex h-11 w-11 shrink-0 items-center justify-center rounded text-muted transition-colors hover:text-text"
              aria-label={t('nav.logout')}
            >
              <LogOut {...ICON} />
            </button>
          </div>
        </div>
        {/* Three destinations fit on a 390px screen, so the portal keeps a tab
            row rather than a drawer — one tap instead of two. The rows are 48px
            tall so they are actually tappable, which they were not before. */}
        <nav
          className="mx-auto flex max-w-3xl gap-4 overflow-x-auto px-4 sm:gap-6 sm:px-5"
          aria-label={t('a11y.nav_main')}
        >
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/portal'}
              className={({ isActive }) =>
                `focus-ring -mb-px flex min-h-[48px] shrink-0 items-center whitespace-nowrap border-b-2 text-sm transition-colors ${
                  isActive ? 'border-accent text-text' : 'border-transparent text-muted hover:text-text'
                }`
              }
            >
              {t(item.key)}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-5 sm:py-8">
        <ReferenceDataProvider>
          <Outlet />
        </ReferenceDataProvider>
      </main>
    </div>
  );
}
