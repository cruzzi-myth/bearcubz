import { VISUAL_ASSET_TYPES } from './visualAssetTypes';

export type ArtistVisibilityInput = { assetType: string; approvalStatus: string | null };

/**
 * Stage K1.6L: the one gate deciding whether an artist-facing view
 * (Listening Chamber backdrop, Visual Gallery) may render a visual
 * asset at all. Membership + upload_status = 'ready' (RLS, plus the
 * explicit filter in useAuthorizedCollaboration.ts) only proves the
 * artist is authorized to see THIS COLLABORATION's ready assets —
 * it says nothing about whether an administrator has actually
 * approved the artwork's content yet. Audio and proposal assets have
 * no approval_status at all (always null) and are never gated here;
 * only the four visual types require approved before an artist can
 * see them.
 */
export function isArtistVisibleAsset(asset: ArtistVisibilityInput): boolean {
  return !VISUAL_ASSET_TYPES.has(asset.assetType) || asset.approvalStatus === 'approved';
}
