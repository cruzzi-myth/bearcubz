import type { ReactNode } from 'react';
import { usePortalAuth } from './PortalAuthContext';
import { PortalEmptyState } from '../../components/PortalEmptyState';

/**
 * Gates /portal/admin specifically. isAdmin comes from is_portal_admin(),
 * a server-side check — there is no client-settable admin flag
 * anywhere in this app for this to trust instead.
 */
export function RequirePortalAdmin({ children }: { children: ReactNode }) {
  const { status, authorization, isAdmin } = usePortalAuth();

  if (status === 'loading' || (status === 'signed-in' && authorization === 'checking')) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--sp-ink-soft)' }}>
        Establishing signal…
      </div>
    );
  }

  if (authorization === 'backend-unavailable') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <PortalEmptyState message="The Signal Portal backend isn't configured in this environment yet." showReturnLink={false} />
      </div>
    );
  }

  if (authorization === 'error') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <PortalEmptyState message="Couldn't verify administrator access right now. Please try again." showReturnLink={false} />
      </div>
    );
  }

  if (status === 'signed-out' || !isAdmin) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <PortalEmptyState message="Administrator access is required for this area." showReturnLink={false} />
      </div>
    );
  }

  return <>{children}</>;
}
