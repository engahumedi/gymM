import { Link, NavLink, Outlet } from 'react-router-dom';
import { useI18n } from '@/i18n/I18nProvider';
import { useAuth } from '@/auth/AuthProvider';
import { roleHome } from '@/auth/roleHome';
import { LangToggle } from '@/components/LangToggle';
import type { MessageKey } from '@/i18n/dictionary';

const navItems: { to: string; key: MessageKey }[] = [
  { to: '/', key: 'nav.home' },
  { to: '/plans', key: 'nav.plans' },
  { to: '/branches', key: 'nav.branches' },
  { to: '/trainers', key: 'nav.trainers' },
  { to: '/contact', key: 'nav.contact' },
];

// Dark athletic theme for the public marketing site.
export function PublicLayout() {
  const { t } = useI18n();
  const { session, profile } = useAuth();

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-slate-100">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-slate-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link to="/" className="text-lg font-extrabold tracking-tight">
            <span className="text-brand">{t('app.name')}</span>
          </Link>

          <nav className="hidden items-center gap-6 md:flex">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  `text-sm transition hover:text-brand ${
                    isActive ? 'text-brand' : 'text-slate-300'
                  }`
                }
              >
                {t(item.key)}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <LangToggle className="text-slate-200" />
            {session ? (
              <Link
                to={roleHome(profile?.role)}
                className="rounded-md bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-dark"
              >
                {t('dashboard.title')}
              </Link>
            ) : (
              <>
                <Link
                  to="/login"
                  className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-200 hover:text-white"
                >
                  {t('nav.login')}
                </Link>
                <Link
                  to="/join"
                  className="rounded-md bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-dark"
                >
                  {t('nav.join')}
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="border-t border-white/10 py-6 text-center text-sm text-slate-400">
        © {new Date().getFullYear()} {t('app.name')}
      </footer>
    </div>
  );
}
