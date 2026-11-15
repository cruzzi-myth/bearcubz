import { useEffect, useState } from 'react';
import { supabase } from '../services/supabaseClient';
import { usePortalAuth } from '../features/auth/PortalAuthContext';

type State = 'checking' | 'real-member' | 'unverified';

/**
 * Stage K1.6P — administrator preview is never artist impersonation:
 * an admin viewing a chamber gets there entirely through the
 * existing "admin select all" RLS policies (see
 * useAuthorizedCollaboration.ts), never through a real
 * collaboration_members row. This answers the honest question the
 * brief asks for directly — "does a real artist membership exist
 * for this admin on this project" — so the UI can say exactly that,
 * rather than imply artist-account access has been tested when it
 * has not.
 */
export function useAdminPreviewMembership(collaborationId: string | undefined, isAdmin: boolean): State {
  const { session } = usePortalAuth();
  const [state, setState] = useState<State>('checking');

  useEffect(() => {
    let cancelled = false;
    if (!isAdmin || !collaborationId || !session?.user?.id) {
      setState('unverified');
      return;
    }
    setState('checking');
    supabase
      .from('collaboration_members')
      .select('user_id')
      .eq('collaboration_id', collaborationId)
      .eq('user_id', session.user.id)
      .eq('status', 'active')
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setState(data ? 'real-member' : 'unverified');
      });
    return () => {
      cancelled = true;
    };
  }, [collaborationId, isAdmin, session?.user?.id]);

  return state;
}
