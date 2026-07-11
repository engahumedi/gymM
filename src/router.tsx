import { createHashRouter, Navigate } from 'react-router-dom';
import { PublicLayout } from '@/layouts/PublicLayout';
import { DashboardLayout } from '@/layouts/DashboardLayout';
import { PortalLayout } from '@/layouts/PortalLayout';
import { RequireRole } from '@/auth/RequireRole';
import { LoginPage } from '@/pages/LoginPage';
import { HomePage } from '@/pages/public/HomePage';
import { NotFound } from '@/pages/NotFound';
import { Placeholder } from '@/pages/Placeholder';
import { DashboardHome } from '@/pages/dashboard/DashboardHome';
import { MembersList } from '@/pages/dashboard/members/MembersList';
import { MemberForm } from '@/pages/dashboard/members/MemberForm';
import { MemberProfile } from '@/pages/dashboard/members/MemberProfile';
import { PlansList } from '@/pages/dashboard/plans/PlansList';
import { CheckInScreen } from '@/pages/dashboard/CheckInScreen';
import { PaymentsList } from '@/pages/dashboard/payments/PaymentsList';
import { ReceiptView } from '@/pages/ReceiptView';
import { RequireRole as Guard } from '@/auth/RequireRole';

// Hash routing: zero server config on GitHub Pages, never 404s on refresh.
export const router = createHashRouter([
  {
    element: <PublicLayout />,
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/plans', element: <Placeholder titleKey="nav.plans" /> },
      { path: '/branches', element: <Placeholder titleKey="nav.branches" /> },
      { path: '/trainers', element: <Placeholder titleKey="nav.trainers" /> },
      { path: '/contact', element: <Placeholder titleKey="nav.contact" /> },
      { path: '/join', element: <Placeholder titleKey="nav.join" /> },
    ],
  },

  { path: '/login', element: <LoginPage /> },

  {
    path: '/receipt/:id',
    element: (
      <Guard allow={['super_admin', 'reception']}>
        <ReceiptView />
      </Guard>
    ),
  },

  {
    path: '/dashboard',
    element: (
      <RequireRole allow={['super_admin', 'reception']}>
        <DashboardLayout />
      </RequireRole>
    ),
    children: [
      { index: true, element: <DashboardHome /> },
      { path: 'members', element: <MembersList /> },
      { path: 'members/new', element: <MemberForm /> },
      { path: 'members/:id', element: <MemberProfile /> },
      { path: 'members/:id/edit', element: <MemberForm /> },
      { path: 'checkin', element: <CheckInScreen /> },
      { path: 'payments', element: <PaymentsList /> },
      {
        path: 'plans',
        element: (
          <Guard allow={['super_admin']}>
            <PlansList />
          </Guard>
        ),
      },
      { path: 'analytics', element: <Placeholder titleKey="dashboard.analytics" /> },
      { path: 'settings', element: <Placeholder titleKey="dashboard.settings" /> },
    ],
  },

  {
    path: '/portal',
    element: (
      <RequireRole allow={['member']}>
        <PortalLayout />
      </RequireRole>
    ),
    children: [
      { index: true, element: <Placeholder titleKey="portal.subscription" /> },
      { path: 'payments', element: <Placeholder titleKey="portal.payments" /> },
      { path: 'checkins', element: <Placeholder titleKey="portal.checkins" /> },
    ],
  },

  { path: '/404', element: <NotFound /> },
  { path: '*', element: <Navigate to="/404" replace /> },
]);
