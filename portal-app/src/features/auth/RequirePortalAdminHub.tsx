import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { usePortalAuth } from './PortalAuthContext';

/**
 * /dashboard is the administrator hub. Rendered inside RequirePortalAuth, so
 * authorization has already resolved. An authorized non-administrator (an
 * artist) is redirected to their own Artist Portal. isAdmin comes from the
 * server-side is_portal_admin() check; the data boundary itself remains RLS.
 */
export function RequirePortalAdminHub({ children }: { children: ReactNode }) {
  const { isAdmin } = usePortalAuth();
  if (!isAdmin) return <Navigate to="/artist" replace />;
  return <>{children}</>;
}
