import { VISUAL_ASSET_TYPES } from '../lib/visualAssetTypes';

export type CollaborationActionPath = 'listen' | 'proposal' | 'visuals' | 'respond';
export type CollaborationAction = { label: string; path: CollaborationActionPath; available: boolean };

/**
 * Pure — extracted from CollaborationCard so the Stage I2G regression
 * (a collaboration with only a track_cover must still enable Visuals)
 * can be asserted directly, without rendering React. `availableAssetTypes`
 * is exactly what useDashboardData already computes: asset types for
 * rows that are is_active AND upload_status='ready' — readiness and
 * authorization are enforced upstream of this function, not here.
 */
export function resolveCollaborationActions(availableAssetTypes: Set<string>): CollaborationAction[] {
  return [
    {
      label: 'Listen',
      path: 'listen',
      available: availableAssetTypes.has('audio_short') || availableAssetTypes.has('audio_full'),
    },
    { label: 'Proposal', path: 'proposal', available: availableAssetTypes.has('proposal_pdf') },
    // Matches the Visual Gallery's own eligibility set exactly (same
    // shared VISUAL_ASSET_TYPES constant) — a collaboration with only
    // a track_cover, alternate_cover, or visual_concept (not
    // literally 'visual_image') must still enable Visuals, since the
    // Gallery itself would show that asset.
    { label: 'Visuals', path: 'visuals', available: [...availableAssetTypes].some((t) => VISUAL_ASSET_TYPES.has(t)) },
    // Sending feedback never requires a pre-existing asset.
    { label: 'Respond', path: 'respond', available: true },
  ];
}
