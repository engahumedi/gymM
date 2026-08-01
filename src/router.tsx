import { lazy, Suspense, type ReactNode } from 'react';
import { createHashRouter, Navigate } from 'react-router-dom';
import { PublicLayout } from '@/layouts/PublicLayout';
import { RequireRole } from '@/auth/RequireRole';
import { LoginPage } from '@/pages/LoginPage';
import { HomePage } from '@/pages/public/HomePage';
import { PlansPage, BranchesPage, TrainersPage, ContactPage } from '@/pages/public/PublicPages';
import { JoinPage } from '@/pages/public/JoinPage';
import { StaffSignupPage } from '@/pages/StaffSignupPage';
import { ForgotPasswordPage } from '@/pages/ForgotPasswordPage';
import { NotFound } from '@/pages/NotFound';
import { FullPageSpinner } from '@/components/FullPageSpinner';
import { RouteErrorBoundary } from '@/components/ErrorBoundary';

// ---------------------------------------------------------------------------
// Code splitting. The marketing site, the login/join/reset screens and the 404
// stay in the entry chunk — they are the first paint for a visitor who has no
// account. Everything behind a login (dashboard tree, portal tree, settings,
// receipt, membership card, analytics) is fetched only when its route opens,
// so a visitor never downloads the admin app.
// ---------------------------------------------------------------------------
const DashboardLayout = lazy(() =>
  import('@/layouts/DashboardLayout').then((m) => ({ default: m.DashboardLayout })),
);
const DashboardHome = lazy(() =>
  import('@/pages/dashboard/DashboardHome').then((m) => ({ default: m.DashboardHome })),
);
const MembersList = lazy(() =>
  import('@/pages/dashboard/members/MembersList').then((m) => ({ default: m.MembersList })),
);
const MemberForm = lazy(() =>
  import('@/pages/dashboard/members/MemberForm').then((m) => ({ default: m.MemberForm })),
);
const MemberImport = lazy(() =>
  import('@/pages/dashboard/members/MemberImport').then((m) => ({ default: m.MemberImport })),
);
const MemberProfile = lazy(() =>
  import('@/pages/dashboard/members/MemberProfile').then((m) => ({ default: m.MemberProfile })),
);
const PlansList = lazy(() =>
  import('@/pages/dashboard/plans/PlansList').then((m) => ({ default: m.PlansList })),
);
const CheckInScreen = lazy(() =>
  import('@/pages/dashboard/CheckInScreen').then((m) => ({ default: m.CheckInScreen })),
);
const PaymentsList = lazy(() =>
  import('@/pages/dashboard/payments/PaymentsList').then((m) => ({ default: m.PaymentsList })),
);
// Analytics also pulls in Recharts (heavy) — its own chunk on top of that.
const Analytics = lazy(() =>
  import('@/pages/dashboard/analytics/Analytics').then((m) => ({ default: m.Analytics })),
);
const SettingsPage = lazy(() =>
  import('@/pages/dashboard/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })),
);

const PortalLayout = lazy(() =>
  import('@/layouts/PortalLayout').then((m) => ({ default: m.PortalLayout })),
);
const PortalHome = lazy(() =>
  import('@/pages/portal/PortalHome').then((m) => ({ default: m.PortalHome })),
);
const PortalPayments = lazy(() =>
  import('@/pages/portal/PortalHistory').then((m) => ({ default: m.PortalPayments })),
);
const PortalCheckins = lazy(() =>
  import('@/pages/portal/PortalHistory').then((m) => ({ default: m.PortalCheckins })),
);

const ReceiptView = lazy(() =>
  import('@/pages/ReceiptView').then((m) => ({ default: m.ReceiptView })),
);
// Membership card pulls in the QR renderer.
const MembershipCard = lazy(() =>
  import('@/pages/MembershipCard').then((m) => ({ default: m.MembershipCard })),
);

// Every lazy route element waits behind the same calm full-page spinner.
const deferred = (node: ReactNode) => <Suspense fallback={<FullPageSpinner />}>{node}</Suspense>;

// Thrown route/loader errors render our localized error screen instead of
// react-router's developer-facing default page.
const errorElement = <RouteErrorBoundary />;

// Hash routing: zero server config on GitHub Pages, never 404s on refresh.
export const router = createHashRouter([
  {
    element: <PublicLayout />,
    errorElement,
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/plans', element: <PlansPage /> },
      { path: '/branches', element: <BranchesPage /> },
      { path: '/trainers', element: <TrainersPage /> },
      { path: '/contact', element: <ContactPage /> },
      { path: '/join', element: <JoinPage /> },
    ],
  },

  { path: '/login', element: <LoginPage />, errorElement },
  { path: '/staff-signup', element: <StaffSignupPage />, errorElement },
  { path: '/forgot-password', element: <ForgotPasswordPage />, errorElement },

  {
    path: '/receipt/:id',
    errorElement,
    element: (
      <RequireRole allow={['super_admin', 'reception']}>{deferred(<ReceiptView />)}</RequireRole>
    ),
  },

  {
    path: '/card/:id',
    errorElement,
    element: (
      <RequireRole allow={['super_admin', 'reception', 'member']}>
        {deferred(<MembershipCard />)}
      </RequireRole>
    ),
  },

  {
    path: '/dashboard',
    errorElement,
    element: (
      <RequireRole allow={['super_admin', 'reception']}>{deferred(<DashboardLayout />)}</RequireRole>
    ),
    children: [
      { index: true, element: deferred(<DashboardHome />) },
      { path: 'members', element: deferred(<MembersList />) },
      { path: 'members/import', element: deferred(<MemberImport />) },
      { path: 'members/new', element: deferred(<MemberForm />) },
      { path: 'members/:id', element: deferred(<MemberProfile />) },
      { path: 'members/:id/edit', element: deferred(<MemberForm />) },
      { path: 'checkin', element: deferred(<CheckInScreen />) },
      { path: 'payments', element: deferred(<PaymentsList />) },
      {
        path: 'plans',
        element: <RequireRole allow={['super_admin']}>{deferred(<PlansList />)}</RequireRole>,
      },
      {
        path: 'analytics',
        element: <RequireRole allow={['super_admin']}>{deferred(<Analytics />)}</RequireRole>,
      },
      {
        path: 'settings',
        element: <RequireRole allow={['super_admin']}>{deferred(<SettingsPage />)}</RequireRole>,
      },
    ],
  },

  {
    path: '/portal',
    errorElement,
    element: <RequireRole allow={['member']}>{deferred(<PortalLayout />)}</RequireRole>,
    children: [
      { index: true, element: deferred(<PortalHome />) },
      { path: 'payments', element: deferred(<PortalPayments />) },
      { path: 'checkins', element: deferred(<PortalCheckins />) },
    ],
  },

  { path: '/404', element: <NotFound />, errorElement },
  { path: '*', element: <Navigate to="/404" replace /> },
]);
