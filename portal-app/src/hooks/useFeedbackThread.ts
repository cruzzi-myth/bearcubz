import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../services/supabaseClient';
import { isBackendUnavailableError } from '../lib/supabaseErrors';

export type FeedbackMessage = {
  id: string;
  body: string;
  isAdminReply: boolean;
  createdAt: string;
};

type State =
  | { status: 'loading' }
  | { status: 'backend-unavailable' }
  | { status: 'error' }
  | { status: 'ready'; messages: FeedbackMessage[] };

/**
 * RLS on collaboration_feedback (Stage D) already scopes this to the
 * caller's own submissions plus any admin reply on the same
 * collaboration — no other artist's thread is reachable regardless
 * of what collaborationId is passed, since a non-member's membership
 * check inside that policy simply returns no rows.
 */
export function useFeedbackThread(collaborationId: string | undefined) {
  const [state, setState] = useState<State>({ status: 'loading' });

  const load = useCallback(() => {
    if (!collaborationId) return;
    setState({ status: 'loading' });
    supabase
      .from('collaboration_feedback')
      .select('id, body, is_admin_reply, created_at')
      .eq('collaboration_id', collaborationId)
      .order('created_at', { ascending: true })
      .then(({ data, error }) => {
        if (isBackendUnavailableError(error)) {
          setState({ status: 'backend-unavailable' });
          return;
        }
        if (error) {
          setState({ status: 'error' });
          return;
        }
        setState({
          status: 'ready',
          messages: (data ?? []).map((row) => ({
            id: row.id,
            body: row.body,
            isAdminReply: row.is_admin_reply,
            createdAt: row.created_at,
          })),
        });
      });
  }, [collaborationId]);

  useEffect(() => {
    load();
  }, [load]);

  return { ...state, reload: load };
}
