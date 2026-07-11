import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthProvider';
import { roleHome } from './roleHome';
import type { UserRole } from '@/lib/database.types';
import { FullPageSpinner } from '@/components/FullPageSpinner';

// Route guard: requires a session AND that the user's role is in `allow`.
// - not signed in       → /login (remembering where they wanted to go)
// - signed in, wrong role → their own role home (no cross-role access)
export function RequireRole({
  allow,
  children,
}: {
  allow: UserRole[];
  children: React.ReactNode;
}) {
  const { session, profile, loading } = useAuth();
  const location = useLocation();

  if (loading) return <FullPageSpinner />;

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (!profile || !allow.includes(profile.role)) {
    return <Navigate to={roleHome(profile?.role)} replace />;
  }

  return <>{children}</>;
}
