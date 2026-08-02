import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useI18n } from '@/i18n/I18nProvider';
import { useAuth } from '@/auth/AuthProvider';
import { roleHome } from '@/auth/roleHome';
import { LangToggle } from '@/components/LangToggle';
import { PublicDataProvider } from '@/lib/PublicData';
import { BrandMark } from '@/components/BrandMark';
import { Menu, X, ICON } from '@/components/ui/icons';
import type { MessageKey } from '@/i18n/dictionary';

const navItems: { to: string; key: MessageKey }[] = [
  { to: '/plans', key: 'nav.plans' },
  { to: '/branches', key: 'nav.branches' },
  { to: '/trainers', key: 'nav.trainers' },
  { to: '/contact', key: 'nav.contact' },
];

export function PublicLayout() {
  const { t } = useI18n();
  const { session, profile } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname } = useLocation();
  const mainRef = useRef<HTMLElement>(null);

  // Close the menu on navigation, and never leave the page scroll-locked.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  return (
    <div className="flex min-h-screen flex-col bg-ground text-text">
      {/* Keyboard users land here first and can jump past the nav. This moves
          focus directly rather than linking to #main: the app is hash-routed, so
          an href of "#main" is read as a route and lands on the 404 page. */}
      <button
        type="button"
        onClick={() => {
          mainRef.current?.focus();
          mainRef.current?.scrollIntoView({ block: 'start' });
        }}
        className="focus-ring sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-3 focus:inline-flex focus:min-h-[44px] focus:items-center focus:rounded-lg focus:bg-block focus:px-4 focus:text-sm focus:text-text"
      >
        {t('a11y.skip')}
      </button>

      <header className="sticky top-0 z-30 border-b border-block-line bg-ground/90 backdrop-blur">
        <div className="mx-auto flex max-w-content items-center gap-6 px-5 py-3.5">
          <Link
            to="/"
            className="focus-ring inline-flex min-h-[44px] items-center rounded-lg tracking-tight"
            aria-label={t('app.name')}
          >
            <BrandMark className="text-xl" logoClass="h-8" />
          </Link>

          <nav className="hidden items-center gap-1 md:flex" aria-label={t('a11y.nav_main')}>
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `focus-ring inline-flex min-h-[44px] items-center rounded-lg px-3 text-sm transition-colors duration-200 hover:text-text ${
                    isActive ? 'text-text' : 'text-muted'
                  }`
                }
              >
                {t(item.key)}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-2 ms-auto">
            <LangToggle />
            {session ? (
              <Link
                to={roleHome(profile?.role)}
                className="focus-ring inline-flex min-h-[44px] items-center rounded-lg px-3 text-sm font-semibold text-text transition-colors hover:text-accent"
              >
                {t('dashboard.title')}
              </Link>
            ) : (
              <>
                <Link
                  to="/login"
                  className="focus-ring hidden min-h-[44px] items-center rounded-lg px-3 text-sm text-muted transition-colors hover:text-text sm:inline-flex"
                >
                  {t('nav.login')}
                </Link>
                <Link
                  to="/join"
                  className="focus-ring inline-flex min-h-[44px] items-center rounded-lg bg-accent px-4 text-sm font-bold text-accent-on transition-all duration-200 hover:brightness-110 active:scale-[0.98]"
                >
                  {t('nav.join')}
                </Link>
              </>
            )}

            {/* On a phone the nav used to be hidden with no way to open it, so
                every inner page was unreachable from the header. */}
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-expanded={menuOpen}
              aria-controls="mobile-nav"
              aria-label={t(menuOpen ? 'common.close' : 'a11y.menu')}
              className="focus-ring inline-flex h-11 w-11 items-center justify-center rounded-lg text-text transition-colors hover:bg-block md:hidden"
            >
              {menuOpen ? <X {...ICON} /> : <Menu {...ICON} />}
            </button>
          </div>
        </div>

        {menuOpen && (
          <nav id="mobile-nav" className="border-t border-block-line bg-ground px-5 pb-5 pt-2 md:hidden">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `focus-ring flex min-h-[56px] items-center border-b border-block-line text-lg transition-colors ${
                    isActive ? 'text-accent' : 'text-text'
                  }`
                }
              >
                {t(item.key)}
              </NavLink>
            ))}
            {!session && (
              <Link to="/login" className="focus-ring flex min-h-[56px] items-center text-lg text-muted">
                {t('nav.login')}
              </Link>
            )}
          </nav>
        )}
      </header>

      <main id="main" ref={mainRef} tabIndex={-1} className="flex-1 outline-none">
        <PublicDataProvider>
          <Outlet />
        </PublicDataProvider>
      </main>

      <footer className="border-t border-block-line bg-ground">
        <div className="mx-auto max-w-content px-5 py-12">
          <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
            <div>
              <Link to="/" className="focus-ring inline-flex min-h-[44px] items-center rounded-lg">
                <BrandMark className="font-display text-xl" logoClass="h-8" />
              </Link>
              <p className="mt-2 text-sm text-faint">© {new Date().getFullYear()}</p>
            </div>
            <nav className="grid grid-cols-2 gap-x-10 gap-y-1 sm:flex sm:gap-8" aria-label={t('a11y.nav_footer')}>
              {navItems.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className="focus-ring inline-flex min-h-[44px] items-center rounded text-sm text-muted transition-colors hover:text-text"
                >
                  {t(item.key)}
                </Link>
              ))}
            </nav>
          </div>
        </div>
      </footer>
    </div>
  );
}
