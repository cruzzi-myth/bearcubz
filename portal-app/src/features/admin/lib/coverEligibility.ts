import type { ApprovalStatus, AssetType, UploadStatus } from '../types/adminTypes';

export const COVER_ELIGIBLE_TYPES: AssetType[] = ['track_cover', 'alternate_cover', 'visual_image', 'visual_concept'];

export type CoverEligibilityInput = {
  assetType: AssetType;
  isActive: boolean;
  uploadStatus: UploadStatus;
  approvalStatus: ApprovalStatus | null;
};

/**
 * Mirrors promote_primary_cover()'s own eligibility rule exactly
 * (supabase/migrations/20261106170000_signal_portal_security_hardening.sql)
 * — this is a UI convenience for disabling an action that would
 * fail server-side anyway, NOT a second authorization boundary. The
 * real check lives in the database function and runs again
 * regardless of what this returns; if the two ever disagree, the
 * server's answer is the one that matters.
 */
export function isCoverEligible(asset: CoverEligibilityInput): boolean {
  return (
    COVER_ELIGIBLE_TYPES.includes(asset.assetType) &&
    asset.isActive &&
    asset.uploadStatus === 'ready' &&
    asset.approvalStatus !== 'rejected'
  );
}
