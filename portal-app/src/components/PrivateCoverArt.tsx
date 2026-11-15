import { useSignedAssetUrl } from '../hooks/useSignedAssetUrl';
import { CollaborationArtwork, type ArtworkVariant } from './CollaborationArtwork';

type Props = {
  assetId: string | null;
  collaborationId: string;
  title: string;
  size: number;
  variant?: ArtworkVariant;
  urlVariant?: 'full' | 'thumbnail';
};

/**
 * Stage K1.6S/K1.6T — the artist-facing cover-art fetch wrapper:
 * mints a signed URL via the same approval-gated portal-signed-url
 * function every other artist-facing asset view already uses (an
 * approved cover is all this ever receives — see
 * useAuthorizedCollaboration.ts/useDashboardData.ts's own
 * isArtistVisibleAsset gate), then hands the result to the one
 * shared rendering component. The hook lives here, not in the
 * caller, because a hook cannot be called once per row inside a
 * .map() — this is the per-row isolation boundary that makes that
 * safe.
 */
export function PrivateCoverArt({ assetId, collaborationId, title, size, variant = 'static', urlVariant = 'thumbnail' }: Props) {
  const signed = useSignedAssetUrl(assetId, urlVariant);
  return (
    <CollaborationArtwork
      collaborationId={collaborationId}
      title={title}
      size={size}
      variant={variant}
      loading={Boolean(assetId) && (signed.status === 'loading' || signed.status === 'idle')}
      artworkUrl={signed.status === 'ready' ? signed.url : null}
    />
  );
}
