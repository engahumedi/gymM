import { createHashRouter, Navigate } from 'react-router-dom';
import { PublicLayout } from '@/layouts/PublicLayout';
import { DashboardLayout } from '@/layouts/DashboardLayout';
import { PortalLayout } from '@/layouts/PortalLayout';
import { RequireRole } from '@/auth/RequireRole';
import { LoginPage } from '@/pages/LoginPage';
import { HomePage } from '@/pages/public/HomePage';
import { PlansPage, BranchesPage, TrainersPage, ContactPage } from '@/pages/public/PublicPages';
import { JoinPage } from '@/pages/public/JoinPage';
import { NotFound } from '@/pages/NotFound';
import { Placeholder } from '@/pages/Placeholder';
import { DashboardHome } from '@/pages/dashboard/DashboardHome';
import { MembersList } from '@/pages/dashboard/members/MembersList';
import { MemberForm } from '@/pages/dashboard/members/MemberForm';
import { MemberProfile } from '@/pages/dashboard/members/MemberProfile';
import { PlansList } from '@/pages/dashboard/plans/PlansList';
import { CheckInScreen } from '@/pages/dashboard/CheckInScreen';
import { PaymentsList } from '@/pages/dashboard/payments/PaymentsList';
import { lazy, Suspense } from 'react';
import { FullPageSpinner } from '@/components/FullPageSpinner';

// Analytics pulls in Recharts (heavy) — load it only when the route is visited.
const Analytics = lazy(() =>
  import('@/pages/dashboard/analytics/Analytics').then((m) => ({ default: m.Analytics })),
);
import { ReceiptView } from '@/pages/ReceiptView';
import { PortalHome } from '@/pages/portal/PortalHome';
import { PortalPayments, PortalCheckins } from '@/pages/portal/PortalHistory';
import { RequireRole as Guard } from '@/auth/RequireRole';

// Hash routing: zero server config on GitHub Pages, never 404s on refresh.
export const router = createHashRouter([
  {
    element: <PublicLayout />,
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/plans', element: <PlansPage /> },
      { path: '/branches', element: <BranchesPage /> },
      { path: '/trainers', element: <TrainersPage /> },
      { path: '/contact', element: <ContactPage /> },
      { path: '/join', element: <JoinPage /> },
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
      {
        path: 'analytics',
        element: (
          <Guard allow={['super_admin']}>
            <Suspense fallback={<FullPageSpinner />}>
              <Analytics />
            </Suspense>
          </Guard>
        ),
      },
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
      { index: true, element: <PortalHome /> },
      { path: 'payments', element: <PortalPayments /> },
      { path: 'checkins', element: <PortalCheckins /> },
    ],
  },

  { path: '/404', element: <NotFound /> },
  { path: '*', element: <Navigate to="/404" replace /> },
]);
