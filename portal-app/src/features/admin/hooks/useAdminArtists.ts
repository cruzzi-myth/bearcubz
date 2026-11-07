import { useCallback, useEffect, useState } from 'react';
import { listArtists, listMemberships } from '../services/adminApi';
import { messageLooksLikeBackendUnavailable } from '../../../lib/supabaseErrors';
import type { AdminArtistProfile, AdminMembership } from '../types/adminTypes';

export type ArtistWithMemberships = AdminArtistProfile & { memberships: AdminMembership[] };
type State = { kind: 'loading' } | { kind: 'backend-unavailable' } | { kind: 'error'; message: string } | { kind: 'ready'; artists: ArtistWithMemberships[] };

export function useAdminArtists() {
  const [state, setState] = useState<State>({ kind: 'loading' });

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    const [artists, memberships] = await Promise.all([listArtists(), listMemberships()]);
    if (!artists.ok) {
      setState(messageLooksLikeBackendUnavailable(artists.error) ? { kind: 'backend-unavailable' } : { kind: 'error', message: artists.error });
      return;
    }
    if (!memberships.ok) {
      setState(messageLooksLikeBackendUnavailable(memberships.error) ? { kind: 'backend-unavailable' } : { kind: 'error', message: memberships.error });
      return;
    }
    setState({
      kind: 'ready',
      artists: artists.data.map((a) => ({ ...a, memberships: memberships.data.filter((m) => m.userId === a.userId) })),
    });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { state, reload: load };
}
