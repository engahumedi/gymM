import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { AuthProvider } from '@/context/AuthContext';
import { BranchProvider } from '@/context/BranchContext';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { Layout } from '@/components/layout/Layout';
import { Login } from '@/pages/Login';
import { Dashboard } from '@/pages/Dashboard';
import { Members } from '@/pages/Members';
import { MemberProfile } from '@/pages/MemberProfile';
import { Plans } from '@/pages/Plans';
import { Subscriptions } from '@/pages/Subscriptions';
import { CheckIn } from '@/pages/CheckIn';
import { Reports } from '@/pages/Reports';
import { Notifications } from '@/pages/Notifications';
import { Branches } from '@/pages/Branches';
import { Settings } from '@/pages/Settings';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30000,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BranchProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<Login />} />

              {/* All authenticated routes */}
              <Route element={<ProtectedRoute />}>
                <Route element={<Layout />}>
                  {/* Shared routes (admin + receptionist) */}
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/members" element={<Members />} />
                  <Route path="/members/:id" element={<MemberProfile />} />
                  <Route path="/subscriptions" element={<Subscriptions />} />
                  <Route path="/check-in" element={<CheckIn />} />
                  <Route path="/notifications" element={<Notifications />} />

                  {/* Admin-only routes */}
                  <Route element={<ProtectedRoute requireAdmin />}>
                    <Route path="/plans" element={<Plans />} />
                    <Route path="/reports" element={<Reports />} />
                    <Route path="/branches" element={<Branches />} />
                    <Route path="/settings" element={<Settings />} />
                  </Route>

                  <Route path="*" element={<Navigate to="/" replace />} />
                </Route>
              </Route>
            </Routes>
          </BrowserRouter>
          <Toaster position="top-center" richColors />
        </BranchProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
