import { NavLink, Outlet } from 'react-router-dom';
import { useI18n } from '@/i18n/I18nProvider';
import { useAuth } from '@/auth/AuthProvider';
import { LangToggle } from '@/components/LangToggle';
import { ReferenceDataProvider } from '@/lib/ReferenceData';
import { BrandMark } from '@/components/BrandMark';
import {
  Users, CalendarClock, CreditCard, Layers, BarChart3, Settings, LayoutHome,
  LogOut, ICON,
} from '@/components/ui/dashicons';
import type { MessageKey } from '@/i18n/dictionary';
import type { UserRole } from '@/lib/database.types';
import type { LucideIcon } from 'lucide-react';

interface NavItem {
  to: string;
  key: MessageKey;
  roles: UserRole[];
  Icon: LucideIcon;
}

const navItems: NavItem[] = [
  { to: '/dashboard', key: 'dashboard.title', roles: ['super_admin', 'reception'], Icon: LayoutHome },
  { to: '/dashboard/members', key: 'dashboard.members', roles: ['super_admin', 'reception'], Icon: Users },
  { to: '/dashboard/checkin', key: 'dashboard.checkin', roles: ['super_admin', 'reception'], Icon: CalendarClock },
  { to: '/dashboard/payments', key: 'dashboard.payments', roles: ['super_admin', 'reception'], Icon: CreditCard },
  { to: '/dashboard/plans', key: 'dashboard.plans', roles: ['super_admin'], Icon: Layers },
  { to: '/dashboard/analytics', key: 'dashboard.analytics', roles: ['super_admin'], Icon: BarChart3 },
  { to: '/dashboard/settings', key: 'dashboard.settings', roles: ['super_admin'], Icon: Settings },
];

export function DashboardLayout() {
  const { t } = useI18n();
  const { profile, signOut } = useAuth();
  const role = profile?.role;
  const items = navItems.filter((i) => (role ? i.roles.includes(role) : false));

  return (
    <div className="flex min-h-screen bg-bg text-text">
      <aside className="hidden w-60 shrink-0 flex-col border-e border-border md:flex">
        <div className="px-5 py-6">
          <BrandMark className="text-xl" logoClass="h-8" />
          <p className="eyebrow mt-1">{role ? t(`role.${role}` as MessageKey) : ''}</p>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 px-3">
          {items.map(({ to, key, Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/dashboard'}
              className={({ isActive }) =>
                `flex items-center gap-3 border-s-2 px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? 'border-accent bg-surface text-text'
                    : 'border-transparent text-muted hover:text-text'
                }`
              }
            >
              <Icon {...ICON} />
              {t(key)}
            </NavLink>
          ))}
        </nav>
        <button
          onClick={signOut}
          className="m-3 flex items-center gap-3 px-3 py-2 text-sm text-muted transition-colors hover:text-text"
        >
          <LogOut {...ICON} />
          {t('nav.logout')}
        </button>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar + nav */}
        <header className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="md:hidden"><BrandMark className="text-lg" logoClass="h-7" /></span>
          <div className="flex items-center gap-4 ms-auto">
            <span className="hidden text-sm text-muted sm:inline">{profile?.full_name}</span>
            <LangToggle />
            <button onClick={signOut} className="text-muted transition-colors hover:text-text md:hidden" aria-label="logout">
              <LogOut {...ICON} />
            </button>
          </div>
        </header>
        <nav className="flex gap-1 overflow-x-auto border-b border-border px-2 py-2 md:hidden">
          {items.map(({ to, key, Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/dashboard'}
              className={({ isActive }) =>
                `flex items-center gap-1.5 whitespace-nowrap rounded px-3 py-1.5 text-sm ${
                  isActive ? 'bg-surface text-text' : 'text-muted'
                }`
              }
            >
              <Icon size={15} strokeWidth={1.5} />
              {t(key)}
            </NavLink>
          ))}
        </nav>

        <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-8">
          <ReferenceDataProvider>
            <Outlet />
          </ReferenceDataProvider>
        </main>
      </div>
    </div>
  );
}
