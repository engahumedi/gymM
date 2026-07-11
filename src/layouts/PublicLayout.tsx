import { Link, NavLink, Outlet } from 'react-router-dom';
import { useI18n } from '@/i18n/I18nProvider';
import { useAuth } from '@/auth/AuthProvider';
import { roleHome } from '@/auth/roleHome';
import { LangToggle } from '@/components/LangToggle';
import { PublicDataProvider } from '@/lib/PublicData';
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

  return (
    <div className="flex min-h-screen flex-col bg-bg text-text">
      <header className="sticky top-0 z-20 border-b border-border bg-bg/85 backdrop-blur">
        <div className="mx-auto flex max-w-content items-center gap-8 px-5 py-4">
          <Link to="/" className="font-display text-xl tracking-tight">
            {t('app.name')}
          </Link>

          <nav className="hidden items-center gap-7 md:flex">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `text-sm transition-colors hover:text-text ${isActive ? 'text-text' : 'text-muted'}`
                }
              >
                {t(item.key)}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-5 ms-auto">
            <LangToggle />
            {session ? (
              <Link to={roleHome(profile?.role)} className="text-sm font-semibold text-text hover:text-accent">
                {t('dashboard.title')}
              </Link>
            ) : (
              <>
                <Link to="/login" className="text-sm text-muted hover:text-text">
                  {t('nav.login')}
                </Link>
                <Link to="/join" className="rounded bg-accent px-4 py-2 text-sm font-semibold text-white hover:brightness-110">
                  {t('nav.join')}
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1">
        <PublicDataProvider>
          <Outlet />
        </PublicDataProvider>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-content flex-col gap-1 px-5 py-8 text-sm text-muted">
          <span className="font-display text-base text-text">{t('app.name')}</span>
          <span>© {new Date().getFullYear()}</span>
        </div>
      </footer>
    </div>
  );
}
