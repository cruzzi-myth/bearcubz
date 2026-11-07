import { useCallback, useEffect, useState } from 'react';
import { listInvitations, listCollaborations } from '../services/adminApi';
import { messageLooksLikeBackendUnavailable } from '../../../lib/supabaseErrors';
import type { AdminInvitation } from '../types/adminTypes';

export type InvitationWithProject = AdminInvitation & { collaborationTitle: string | null };
type State = { kind: 'loading' } | { kind: 'backend-unavailable' } | { kind: 'error'; message: string } | { kind: 'ready'; invitations: InvitationWithProject[] };

export function useAdminInvitations() {
  const [state, setState] = useState<State>({ kind: 'loading' });

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    const [invitations, collaborations] = await Promise.all([listInvitations(), listCollaborations()]);
    if (!invitations.ok) {
      setState(messageLooksLikeBackendUnavailable(invitations.error) ? { kind: 'backend-unavailable' } : { kind: 'error', message: invitations.error });
      return;
    }
    if (!collaborations.ok) {
      setState(messageLooksLikeBackendUnavailable(collaborations.error) ? { kind: 'backend-unavailable' } : { kind: 'error', message: collaborations.error });
      return;
    }
    const titleById = new Map(collaborations.data.map((c) => [c.id, c.title]));
    setState({
      kind: 'ready',
      invitations: invitations.data.map((i) => ({ ...i, collaborationTitle: i.collaborationId ? (titleById.get(i.collaborationId) ?? null) : null })),
    });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { state, reload: load };
}
