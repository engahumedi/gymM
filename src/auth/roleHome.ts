import type { UserRole } from '@/lib/database.types';

// Single source of truth for where each role lands after login.
export function roleHome(role: UserRole | undefined): string {
  switch (role) {
    case 'super_admin':
    case 'reception':
      return '/dashboard';
    case 'member':
      return '/portal';
    default:
      return '/';
  }
}
