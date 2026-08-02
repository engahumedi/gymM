import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useI18n } from '@/i18n/I18nProvider';
import { useAuth } from '@/auth/AuthProvider';
import { LangToggle } from '@/components/LangToggle';
import { ReferenceDataProvider } from '@/lib/ReferenceData';
import { BrandMark } from '@/components/BrandMark';
import {
  Users, CalendarClock, CreditCard, Layers, BarChart3, Settings, LayoutHome,
  LogOut, ICON,
} from '@/components/ui/dashicons';
import { Menu, X } from '@/components/ui/icons';
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
  const { pathname } = useLocation();
  const [navOpen, setNavOpen] = useState(false);
  const role = profile?.role;
  const items = navItems.filter((i) => (role ? i.roles.includes(role) : false));

  // Navigating always dismisses the drawer — otherwise it covers the screen the
  // user just asked for.
  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  // While the drawer is open: Escape closes it and the page behind it does not
  // scroll. Both are torn down on close, so the body is never left frozen.
  useEffect(() => {
    if (!navOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setNavOpen(false);
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [navOpen]);

  return (
    <div className="flex min-h-screen bg-bg text-text">
      {/* Desktop sidebar — unchanged. */}
      <aside className="hidden w-60 shrink-0 flex-col border-e border-border md:flex">
        <div className="px-5 py-6">
          <BrandMark className="text-xl" logoClass="h-8" />
          <p className="eyebrow mt-1">{role ? t(`role.${role}` as MessageKey) : ''}</p>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 px-3" aria-label={t('a11y.nav_main')}>
          {items.map(({ to, key, Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/dashboard'}
              className={({ isActive }) =>
                // 44px rows: `md` starts at 768px, which is a tablet in
                // reception's hands, not a mouse-driven desktop.
                `focus-ring flex min-h-[44px] items-center gap-3 border-s-2 px-3 py-2 text-sm transition-colors ${
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
          className="focus-ring m-3 flex min-h-[44px] items-center gap-3 px-3 py-2 text-sm text-muted transition-colors hover:text-text"
        >
          <LogOut {...ICON} />
          {t('nav.logout')}
        </button>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Compact bar on a phone (sticky, so the menu is always one tap away);
            the desktop bar it replaces is untouched at md+. No backdrop-blur
            here: a filter would make the fixed drawer below position against
            this header instead of the viewport. */}
        <header className="sticky top-0 z-30 flex items-center gap-1 border-b border-border bg-bg px-3 py-1.5 md:static md:px-4 md:py-3">
          {/* Stays a hamburger even when expanded: while the drawer is open it
              covers this button with its own close control (positioned on the
              same edge), so an X here would be an unreachable lie.
              aria-expanded is what carries the state for assistive tech. */}
          <button
            type="button"
            onClick={() => setNavOpen((v) => !v)}
            aria-expanded={navOpen}
            aria-controls="dashboard-nav"
            aria-label={t('a11y.menu')}
            className="focus-ring inline-flex h-11 w-11 shrink-0 items-center justify-center rounded text-text transition-colors hover:bg-surface md:hidden"
          >
            <Menu {...ICON} />
          </button>
          <span className="min-w-0 truncate md:hidden">
            <BrandMark className="text-lg" logoClass="h-7" />
          </span>

          {/* Drawer lives right after its toggle so Tab moves straight into it. */}
          <div className={`fixed inset-0 z-40 md:hidden ${navOpen ? '' : 'hidden'}`}>
            <div
              className="absolute inset-0 bg-black/60"
              onClick={() => setNavOpen(false)}
              aria-hidden="true"
            />
            <nav
              id="dashboard-nav"
              aria-label={t('a11y.nav_main')}
              className="absolute inset-y-0 start-0 flex w-[17rem] max-w-[85vw] flex-col overflow-y-auto border-e border-border bg-surface"
            >
              {/* Close sits on the drawer's start edge — the same spot the
                  hamburger occupies underneath — so tapping "the menu button"
                  again dismisses, which is what a toggle is expected to do. */}
              <div className="flex items-start gap-2 px-3 py-1.5">
                <button
                  type="button"
                  onClick={() => setNavOpen(false)}
                  aria-label={t('common.close')}
                  className="focus-ring inline-flex h-11 w-11 shrink-0 items-center justify-center rounded text-muted transition-colors hover:text-text"
                >
                  <X {...ICON} />
                </button>
                <div className="min-w-0 pt-1">
                  <BrandMark className="text-lg" logoClass="h-7" />
                  <p className="eyebrow mt-0.5">{role ? t(`role.${role}` as MessageKey) : ''}</p>
                </div>
              </div>

              <div className="flex-1 border-t border-border pt-1">
                {items.map(({ to, key, Icon }) => (
                  <NavLink
                    key={to}
                    to={to}
                    end={to === '/dashboard'}
                    className={({ isActive }) =>
                      `focus-ring flex min-h-[52px] items-center gap-3 border-s-2 border-b border-b-border px-4 text-base transition-colors ${
                        isActive
                          ? 'border-s-accent bg-surface-2 text-text'
                          : 'border-s-transparent text-muted'
                      }`
                    }
                  >
                    <Icon {...ICON} />
                    {t(key)}
                  </NavLink>
                ))}
              </div>

              <div className="border-t border-border px-4 py-3">
                {profile?.full_name && (
                  <p className="mb-1 truncate text-sm text-muted">{profile.full_name}</p>
                )}
                <button
                  onClick={signOut}
                  className="focus-ring flex min-h-[48px] w-full items-center gap-3 rounded text-sm text-muted transition-colors hover:text-text"
                >
                  <LogOut {...ICON} />
                  {t('nav.logout')}
                </button>
              </div>
            </nav>
          </div>

          <div className="flex items-center gap-1 ms-auto sm:gap-2">
            <span className="hidden max-w-[16rem] truncate text-sm text-muted sm:inline">{profile?.full_name}</span>
            <LangToggle />
            <button
              onClick={signOut}
              className="focus-ring inline-flex h-11 w-11 shrink-0 items-center justify-center rounded text-muted transition-colors hover:text-text md:hidden"
              aria-label={t('nav.logout')}
            >
              <LogOut {...ICON} />
            </button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 md:px-5 md:py-8">
          <ReferenceDataProvider>
            <Outlet />
          </ReferenceDataProvider>
        </main>
      </div>
    </div>
  );
}
