import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../services/supabaseClient';

type State =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; url: string }
  | { status: 'unavailable' };

/**
 * Mints a short-lived (5-minute) signed URL via portal-signed-url —
 * the only Edge Function that can turn an authorized assetId into a
 * playable/viewable URL. Never exposes the underlying private
 * Storage path; the component using this only ever sees the signed
 * URL itself. `refresh()` is exposed explicitly for renewal — e.g.
 * the audio player calls it if playback fails partway through
 * because the URL's 5-minute window has passed, rather than this
 * hook guessing when to pre-emptively refresh.
 */
export function useSignedAssetUrl(assetId: string | null, variant: 'full' | 'thumbnail' = 'full') {
  const [state, setState] = useState<State>({ status: assetId ? 'loading' : 'idle' });

  const refresh = useCallback(() => {
    if (!assetId) {
      setState({ status: 'idle' });
      return;
    }
    setState({ status: 'loading' });
    supabase.functions
      .invoke<{ url: string }>('portal-signed-url', { body: { assetId, variant } })
      .then(({ data, error }) => {
        setState(!error && data?.url ? { status: 'ready', url: data.url } : { status: 'unavailable' });
      });
  }, [assetId, variant]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { ...state, refresh };
}
