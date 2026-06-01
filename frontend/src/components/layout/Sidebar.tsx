import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Users, CreditCard, UserCheck, BarChart2,
  Dumbbell, Building2, Bell, Settings, ChevronRight, ChevronLeft, Menu
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const allNavItems = [
  { href: '/', label: 'لوحة التحكم', icon: LayoutDashboard, adminOnly: true },
  { href: '/members', label: 'الأعضاء', icon: Users, adminOnly: false },
  { href: '/subscriptions', label: 'الاشتراكات', icon: CreditCard, adminOnly: false },
  { href: '/check-in', label: 'تسجيل الحضور', icon: UserCheck, adminOnly: false },
  { href: '/plans', label: 'الخطط', icon: Dumbbell, adminOnly: true },
  { href: '/branches', label: 'الفروع', icon: Building2, adminOnly: true },
  { href: '/reports', label: 'التقارير', icon: BarChart2, adminOnly: true },
  { href: '/notifications', label: 'الإشعارات', icon: Bell, adminOnly: false },
  { href: '/settings', label: 'الإعدادات', icon: Settings, adminOnly: true },
];

export function Sidebar() {
  const { user } = useAuth();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(() => {
    return localStorage.getItem('sidebar-collapsed') === 'true';
  });

  useEffect(() => {
    localStorage.setItem('sidebar-collapsed', String(collapsed));
  }, [collapsed]);

  const navItems = allNavItems.filter(item => !item.adminOnly || user?.role === 'admin');

  return (
    <TooltipProvider delayDuration={0}>
      <aside className={cn(
        'flex flex-col h-screen bg-[#0D1117] border-e border-border transition-all duration-300 relative',
        collapsed ? 'w-16' : 'w-64'
      )}>
        {/* Logo */}
        <div className={cn('flex items-center gap-3 p-4 border-b border-border', collapsed && 'justify-center')}>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary">
            <Dumbbell className="h-5 w-5 text-white" />
          </div>
          {!collapsed && (
            <div className="overflow-hidden">
              <p className="font-bold text-sm truncate">الصالة الرياضية</p>
              <p className="text-xs text-muted-foreground truncate">
                {user?.role === 'admin' ? 'مدير عام' : 'موظف استقبال'}
              </p>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const active = location.pathname === item.href ||
              (item.href !== '/' && location.pathname.startsWith(item.href));
            const Icon = item.icon;

            return collapsed ? (
              <Tooltip key={item.href}>
                <TooltipTrigger asChild>
                  <Link
                    to={item.href}
                    className={cn(
                      'flex items-center justify-center rounded-lg p-2.5 transition-colors',
                      active
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                    )}
                  >
                    <Icon className="h-5 w-5" />
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="left">{item.label}</TooltipContent>
              </Tooltip>
            ) : (
              <Link
                key={item.href}
                to={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                  active
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                )}
              >
                <Icon className="h-5 w-5 shrink-0" />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Collapse button */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="absolute -start-3 top-20 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-card text-muted-foreground hover:text-foreground transition-colors"
        >
          {collapsed ? <ChevronLeft className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        </button>
      </aside>
    </TooltipProvider>
  );
}
