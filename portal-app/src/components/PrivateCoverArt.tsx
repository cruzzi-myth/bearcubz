import { useSignedAssetUrl } from '../hooks/useSignedAssetUrl';

type Props = {
  assetId: string | null;
  variant?: 'full' | 'thumbnail';
  className: string;
  alt?: string;
};

/**
 * Stage K1.6S — extracted from CollaborationBriefingModal's own
 * local CoverArt (same fetch + fallback behavior, now shared with
 * the Listening Chamber and the Artist Portal project cards instead
 * of being duplicated a third time). `assetId` is expected to
 * already be approval-gated by the caller (useDashboardData /
 * useAuthorizedCollaboration both already only ever return an
 * approved primaryCoverAssetId/asset — see isArtistVisibleAsset) —
 * this component itself adds no new authorization logic; it only
 * ever mints a signed URL for whatever id it's given, exactly like
 * every other private-asset viewer in this app.
 */
export function PrivateCoverArt({ assetId, variant = 'thumbnail', className, alt = '' }: Props) {
  const signed = useSignedAssetUrl(assetId, variant);

  if (!assetId || signed.status === 'unavailable') {
    return (
      <div className={`${className} ${className}--placeholder`} aria-hidden="true">
        <span>◈</span>
      </div>
    );
  }
  if (signed.status !== 'ready') {
    return <div className={`${className} ${className}--loading`} aria-hidden="true" />;
  }
  return (
    <div className={className}>
      <img src={signed.url} alt={alt} />
    </div>
  );
}
