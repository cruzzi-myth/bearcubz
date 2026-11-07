import { useCallback, useEffect, useState } from 'react';
import { listFeedback, listCollaborations } from '../services/adminApi';
import { messageLooksLikeBackendUnavailable } from '../../../lib/supabaseErrors';
import type { AdminFeedbackMessage } from '../types/adminTypes';

export type FeedbackThread = { collaborationId: string; collaborationTitle: string; messages: AdminFeedbackMessage[] };
type State = { kind: 'loading' } | { kind: 'backend-unavailable' } | { kind: 'error'; message: string } | { kind: 'ready'; threads: FeedbackThread[] };

/** Groups every feedback message by collaboration so the inbox reads
 * as threads, not a flat list — one thread per collaboration, since
 * that's the actual scope feedback is authorized against. */
export function useAdminFeedback() {
  const [state, setState] = useState<State>({ kind: 'loading' });

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    const [feedback, collaborations] = await Promise.all([listFeedback(), listCollaborations()]);
    if (!feedback.ok) {
      setState(messageLooksLikeBackendUnavailable(feedback.error) ? { kind: 'backend-unavailable' } : { kind: 'error', message: feedback.error });
      return;
    }
    if (!collaborations.ok) {
      setState(messageLooksLikeBackendUnavailable(collaborations.error) ? { kind: 'backend-unavailable' } : { kind: 'error', message: collaborations.error });
      return;
    }

    const titleById = new Map(collaborations.data.map((c) => [c.id, c.title]));
    const byCollaboration = new Map<string, AdminFeedbackMessage[]>();
    for (const msg of feedback.data) {
      const list = byCollaboration.get(msg.collaborationId) ?? [];
      list.push(msg);
      byCollaboration.set(msg.collaborationId, list);
    }

    setState({
      kind: 'ready',
      threads: [...byCollaboration.entries()].map(([collaborationId, messages]) => ({
        collaborationId,
        collaborationTitle: titleById.get(collaborationId) ?? 'Unknown collaboration',
        messages,
      })),
    });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { state, reload: load };
}
