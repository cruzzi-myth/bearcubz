import { useCallback, useEffect, useState } from 'react';
import { requestAdminAssetPreviewUrl } from '../services/adminApi';

type State = { status: 'idle' } | { status: 'loading' } | { status: 'ready'; url: string } | { status: 'unavailable' };

/**
 * Admin-only counterpart to useSignedAssetUrl (hooks/useSignedAssetUrl.ts).
 * That hook calls portal-signed-url, which requires security_review_status
 * = 'approved' — so it can never preview an asset still awaiting the
 * admin's own review decision. This calls the separate
 * portal-admin-asset-signed-url function instead, which drops only
 * that one requirement.
 */
export function useAdminAssetPreview(assetId: string | null, variant: 'full' | 'thumbnail' = 'full') {
  const [state, setState] = useState<State>({ status: assetId ? 'loading' : 'idle' });

  const refresh = useCallback(() => {
    if (!assetId) {
      setState({ status: 'idle' });
      return;
    }
    setState({ status: 'loading' });
    requestAdminAssetPreviewUrl(assetId, variant).then((result) => {
      setState(result.ok ? { status: 'ready', url: result.data.url } : { status: 'unavailable' });
    });
  }, [assetId, variant]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { ...state, refresh };
}
