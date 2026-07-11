import { NavLink, Outlet } from 'react-router-dom';
import { useI18n } from '@/i18n/I18nProvider';
import { useAuth } from '@/auth/AuthProvider';
import { LangToggle } from '@/components/LangToggle';
import { ReferenceDataProvider } from '@/lib/ReferenceData';
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
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center gap-4 px-5 py-4">
          <div>
            <span className="font-display text-lg">{t('app.name')}</span>
            <p className="eyebrow mt-0.5">{t('portal.title')}</p>
          </div>
          <div className="flex items-center gap-4 ms-auto">
            <span className="hidden text-sm text-muted sm:inline">{profile?.full_name}</span>
            <LangToggle />
            <button onClick={signOut} className="text-muted transition-colors hover:text-text" aria-label="logout">
              <LogOut {...ICON} />
            </button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-3xl gap-6 px-5">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/portal'}
              className={({ isActive }) =>
                `-mb-px border-b-2 pb-2.5 text-sm transition-colors ${
                  isActive ? 'border-accent text-text' : 'border-transparent text-muted hover:text-text'
                }`
              }
            >
              {t(item.key)}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-8">
        <ReferenceDataProvider>
          <Outlet />
        </ReferenceDataProvider>
      </main>
    </div>
  );
}
