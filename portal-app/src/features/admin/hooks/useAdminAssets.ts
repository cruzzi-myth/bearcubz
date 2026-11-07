import { useCallback, useEffect, useState } from 'react';
import { listAssets } from '../services/adminApi';
import { messageLooksLikeBackendUnavailable } from '../../../lib/supabaseErrors';
import type { AdminAsset } from '../types/adminTypes';

type State = { kind: 'loading' } | { kind: 'backend-unavailable' } | { kind: 'error'; message: string } | { kind: 'ready'; assets: AdminAsset[] };

export function useAdminAssets(collaborationId?: string) {
  const [state, setState] = useState<State>({ kind: 'loading' });

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    const result = await listAssets(collaborationId);
    if (!result.ok) {
      setState(messageLooksLikeBackendUnavailable(result.error) ? { kind: 'backend-unavailable' } : { kind: 'error', message: result.error });
      return;
    }
    setState({ kind: 'ready', assets: result.data });
  }, [collaborationId]);

  useEffect(() => {
    load();
  }, [load]);

  return { state, reload: load };
}
