import { useAdminAssetPreview } from '../features/admin/hooks/useAdminAssetPreview';
import { CollaborationArtwork, type ArtworkVariant } from './CollaborationArtwork';

type Props = {
  assetId: string | null;
  collaborationId: string;
  title: string;
  size: number;
  variant?: ArtworkVariant;
};

/**
 * Stage K1.6T — the administrator-preview counterpart to
 * PrivateCoverArt. A real, found gap: the Asset Library's own
 * collaboration selector (AssetLibraryRow) previously used the
 * artist-facing signed-url hook even when rendered for an admin, so
 * a freshly-uploaded, genuinely-clean-but-not-yet-approved cover
 * showed the diamond placeholder in that one spot — even though the
 * admin-only portal-admin-asset-signed-url function (K1.6K) exists
 * specifically to let an administrator preview exactly that case.
 * This uses that function instead, so the collaboration selector's
 * thumbnail matches what the per-asset Preview button in the table
 * below it has always been able to show.
 */
export function AdminCollaborationArtwork({ assetId, collaborationId, title, size, variant = 'static' }: Props) {
  const signed = useAdminAssetPreview(assetId, 'thumbnail');
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
