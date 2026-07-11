import { Link, NavLink, Outlet } from 'react-router-dom';
import { useI18n } from '@/i18n/I18nProvider';
import { useAuth } from '@/auth/AuthProvider';
import { LangToggle } from '@/components/LangToggle';
import type { MessageKey } from '@/i18n/dictionary';
import type { UserRole } from '@/lib/database.types';

interface NavItem {
  to: string;
  key: MessageKey;
  roles: UserRole[];
}

// Reception sees the operational screens; super admin also sees analytics/settings.
const navItems: NavItem[] = [
  { to: '/dashboard', key: 'dashboard.title', roles: ['super_admin', 'reception'] },
  { to: '/dashboard/members', key: 'dashboard.members', roles: ['super_admin', 'reception'] },
  { to: '/dashboard/checkin', key: 'dashboard.checkin', roles: ['super_admin', 'reception'] },
  { to: '/dashboard/payments', key: 'dashboard.payments', roles: ['super_admin', 'reception'] },
  { to: '/dashboard/plans', key: 'dashboard.plans', roles: ['super_admin'] },
  { to: '/dashboard/analytics', key: 'dashboard.analytics', roles: ['super_admin'] },
  { to: '/dashboard/settings', key: 'dashboard.settings', roles: ['super_admin'] },
];

// Clean light admin dashboard.
export function DashboardLayout() {
  const { t } = useI18n();
  const { profile, signOut } = useAuth();
  const role = profile?.role;
  const items = navItems.filter((i) => (role ? i.roles.includes(role) : false));

  return (
    <div className="flex min-h-screen bg-slate-50 text-ink">
      <aside className="hidden w-60 shrink-0 flex-col border-e border-slate-200 bg-white md:flex">
        <div className="border-b border-slate-200 p-4">
          <span className="text-lg font-extrabold text-brand">{t('app.name')}</span>
          <p className="mt-1 text-xs text-slate-500">
            {role ? t(`role.${role}` as MessageKey) : ''}
          </p>
        </div>
        <nav className="flex flex-1 flex-col gap-1 p-3">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/dashboard'}
              className={({ isActive }) =>
                `rounded-md px-3 py-2 text-sm font-medium transition ${
                  isActive
                    ? 'bg-brand/10 text-brand'
                    : 'text-slate-600 hover:bg-slate-100'
                }`
              }
            >
              {t(item.key)}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
          <span className="font-semibold md:hidden">{t('app.name')}</span>
          <div className="flex items-center gap-3 ms-auto">
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
        </header>

        {/* Mobile nav */}
        <nav className="flex gap-1 overflow-x-auto border-b border-slate-200 bg-white px-2 py-2 md:hidden">
          {items.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="whitespace-nowrap rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
            >
              {t(item.key)}
            </Link>
          ))}
        </nav>

        <main className="flex-1 p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
