import { useEffect, useState } from 'react';
import { listMemberships } from '../services/adminApi';
import { messageLooksLikeBackendUnavailable } from '../../../lib/supabaseErrors';
import type { AdminMembership } from '../types/adminTypes';

type State = { kind: 'loading' } | { kind: 'backend-unavailable' } | { kind: 'error'; message: string } | { kind: 'ready'; members: AdminMembership[] };

/** Stage K1.6L — memberships scoped to a single collaboration, for
 * the readiness checklist's "artist permissions configured" check. */
export function useAdminCollaborationMembers(collaborationId: string) {
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: 'loading' });
    listMemberships(undefined, collaborationId).then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setState(messageLooksLikeBackendUnavailable(result.error) ? { kind: 'backend-unavailable' } : { kind: 'error', message: result.error });
        return;
      }
      setState({ kind: 'ready', members: result.data });
    });
    return () => {
      cancelled = true;
    };
  }, [collaborationId]);

  return state;
}
