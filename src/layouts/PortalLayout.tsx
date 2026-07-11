import { NavLink, Outlet } from 'react-router-dom';
import { useI18n } from '@/i18n/I18nProvider';
import { useAuth } from '@/auth/AuthProvider';
import { LangToggle } from '@/components/LangToggle';
import { ReferenceDataProvider } from '@/lib/ReferenceData';
import type { MessageKey } from '@/i18n/dictionary';

const navItems: { to: string; key: MessageKey }[] = [
  { to: '/portal', key: 'portal.subscription' },
  { to: '/portal/payments', key: 'portal.payments' },
  { to: '/portal/checkins', key: 'portal.checkins' },
];

// Member personal portal.
export function PortalLayout() {
  const { t } = useI18n();
  const { profile, signOut } = useAuth();

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-ink">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <div>
            <span className="text-lg font-extrabold text-brand">{t('app.name')}</span>
            <p className="text-xs text-slate-500">{t('portal.title')}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-slate-500 sm:inline">
              {profile?.full_name}
            </span>
            <LangToggle />
            <button
              type="button"
              onClick={signOut}
              className="rounded-md border border-slate-200 px-3 py-1 text-sm hover:bg-slate-100"
            >
              {t('nav.logout')}
            </button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-3xl gap-1 px-2 pb-2">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/portal'}
              className={({ isActive }) =>
                `rounded-md px-3 py-1.5 text-sm font-medium transition ${
                  isActive ? 'bg-brand/10 text-brand' : 'text-slate-600 hover:bg-slate-100'
                }`
              }
            >
              {t(item.key)}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 p-4">
        <ReferenceDataProvider>
          <Outlet />
        </ReferenceDataProvider>
      </main>
    </div>
  );
}
