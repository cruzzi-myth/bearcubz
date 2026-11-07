import { useCallback, useEffect, useState } from 'react';
import { listCollaborations } from '../services/adminApi';
import { messageLooksLikeBackendUnavailable } from '../../../lib/supabaseErrors';
import type { AdminCollaboration } from '../types/adminTypes';

type State = { kind: 'loading' } | { kind: 'backend-unavailable' } | { kind: 'error'; message: string } | { kind: 'ready'; collaborations: AdminCollaboration[] };

export function useAdminCollaborations() {
  const [state, setState] = useState<State>({ kind: 'loading' });

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    const result = await listCollaborations();
    if (!result.ok) {
      setState(messageLooksLikeBackendUnavailable(result.error) ? { kind: 'backend-unavailable' } : { kind: 'error', message: result.error });
      return;
    }
    setState({ kind: 'ready', collaborations: result.data });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { state, reload: load };
}
