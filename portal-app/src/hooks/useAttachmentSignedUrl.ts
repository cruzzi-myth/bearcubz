import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../services/supabaseClient';

type State =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; url: string }
  | { status: 'unavailable' };

/**
 * Mirrors useSignedAssetUrl exactly, for the Stage K1.6C attachments
 * table via portal-attachment-signed-url instead of portal-signed-url.
 * RLS on collaboration_feedback_attachments only ever returns a row
 * once status = 'available' (and the caller is the message's own
 * author, an admin, or — for an admin reply — any active member) —
 * "unavailable" here covers both "still pending/rejected" and
 * "not authorized," indistinguishably, same as every other signed-URL
 * path in this app.
 */
export function useAttachmentSignedUrl(attachmentId: string | null) {
  const [state, setState] = useState<State>({ status: attachmentId ? 'loading' : 'idle' });

  const refresh = useCallback(() => {
    if (!attachmentId) {
      setState({ status: 'idle' });
      return;
    }
    setState({ status: 'loading' });
    supabase.functions
      .invoke<{ url: string }>('portal-attachment-signed-url', { body: { attachmentId } })
      .then(({ data, error }) => {
        setState(!error && data?.url ? { status: 'ready', url: data.url } : { status: 'unavailable' });
      });
  }, [attachmentId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { ...state, refresh };
}
