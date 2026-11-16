import { useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePortalAuth } from './PortalAuthContext';

/**
 * The ONE logout handler every Sign Out control uses (Dashboard, Command Center,
 * Artist Portal, and all four chambers). It ends the Supabase session (confirmed
 * ended inside PortalAuthContext.signOut — falling back to a local sign-out if the
 * server call fails), which also clears the provider's authorization state, and then
 * returns to the public entrance (router basename => /portal/). `replace` keeps the
 * protected page out of the back-button history. Re-entrant clicks are ignored.
 */
export function useSignOut() {
  const { signOut } = usePortalAuth();
  const navigate = useNavigate();
  const inFlight = useRef(false);

  return useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      await signOut();
    } finally {
      inFlight.current = false;
      navigate('/', { replace: true });
    }
  }, [signOut, navigate]);
}
