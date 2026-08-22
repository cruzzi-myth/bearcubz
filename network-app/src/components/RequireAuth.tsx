import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthContext';
import { LoadingState } from './LoadingState';
import { ErrorState } from './ErrorState';

/**
 * Gates a persistence-requiring route (Dashboard, Avatar, Onboarding,
 * the in-Network Passport view) behind a real Supabase session.
 * Guest Mode stays free to browse everything else (Galaxy, Worlds,
 * Canon, Transmissions) — this component is only used on the routes
 * that would otherwise have to fake persistent progress.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const navigate = useNavigate();

  if (status === 'loading') {
    return <LoadingState message="ESTABLISHING SIGNAL…" />;
  }

  if (status === 'signed-out') {
    return (
      <ErrorState
        tone="info"
        title="PASSPORT REQUIRED"
        body="Create a Moon Racer Passport to preserve this discovery."
        action={{ label: 'Sign In / Create Passport →', onClick: () => navigate('/login') }}
      />
    );
  }

  return <>{children}</>;
}
