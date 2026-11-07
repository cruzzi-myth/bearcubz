import { useCallback, useEffect, useState } from 'react';
import { listAuditLog } from '../services/adminApi';
import { messageLooksLikeBackendUnavailable } from '../../../lib/supabaseErrors';
import type { AdminAuditEntry } from '../types/adminTypes';

const PAGE_SIZE = 50;

type State = { kind: 'loading' } | { kind: 'backend-unavailable' } | { kind: 'error'; message: string } | { kind: 'ready'; entries: AdminAuditEntry[]; hasMore: boolean };

export function useAdminAuditLog() {
  const [state, setState] = useState<State>({ kind: 'loading' });

  const load = useCallback(async (before?: string) => {
    setState((prev) => (before && prev.kind === 'ready' ? prev : { kind: 'loading' }));
    const result = await listAuditLog(PAGE_SIZE, before);
    if (!result.ok) {
      setState(messageLooksLikeBackendUnavailable(result.error) ? { kind: 'backend-unavailable' } : { kind: 'error', message: result.error });
      return;
    }
    setState((prev) => ({
      kind: 'ready',
      entries: before && prev.kind === 'ready' ? [...prev.entries, ...result.data] : result.data,
      hasMore: result.data.length === PAGE_SIZE,
    }));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return {
    state,
    loadMore: () => {
      if (state.kind === 'ready' && state.entries.length > 0) load(state.entries[state.entries.length - 1].createdAt);
    },
  };
}
