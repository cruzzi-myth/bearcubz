import type { ReactNode } from 'react';
import { usePortalAuth } from './PortalAuthContext';
import { PortalEmptyState } from '../../components/PortalEmptyState';

/**
 * Gates every authenticated-area route. Renders nothing data-bearing
 * until the backend has confirmed an active membership (or admin
 * status) — a signed-in Supabase session by itself is never enough,
 * by design. Distinguishes the states Phase E4 requires rather than
 * collapsing them into one generic "not authorized" message.
 */
export function RequirePortalAuth({ children }: { children: ReactNode }) {
  const { status, authorization } = usePortalAuth();

  if (status === 'loading' || (status === 'signed-in' && authorization === 'checking')) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--sp-ink-soft)' }}>
        Establishing signal…
      </div>
    );
  }

  if (status === 'signed-out') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <PortalEmptyState message="This area requires authorized Signal Portal access. Request access from the entrance page." />
      </div>
    );
  }

  if (authorization === 'backend-unavailable') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <PortalEmptyState message="The Signal Portal backend isn't configured in this environment yet. This is not a reflection of your access — try again once it's set up." />
      </div>
    );
  }

  if (authorization === 'revoked') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <PortalEmptyState message="Your Signal Portal access has been revoked. Contact THE COLLECTIVE if you believe this is a mistake." />
      </div>
    );
  }

  if (authorization === 'not-authorized') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <PortalEmptyState message="This area requires authorized Signal Portal access. Request access from the entrance page." />
      </div>
    );
  }

  if (authorization === 'error') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <PortalEmptyState message="Couldn't verify your access right now. Please try again." />
      </div>
    );
  }

  return <>{children}</>;
}
