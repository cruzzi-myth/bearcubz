import { VISUAL_ASSET_TYPES } from './visualAssetTypes';

// The chamber route slugs (see routes/index.tsx: collaboration/:id/listen
// etc.) -- previously imported from the now-removed collaborationCardActions
// (Stage K1.4.1 replaced its only consumer, the old CollaborationCard grid).
export type CollaborationActionPath = 'listen' | 'proposal' | 'visuals' | 'respond';

/**
 * Stage K1.4 — "COLLABORATION MATERIALS" and "DELIVERABLES" sections of
 * the Collaboration Briefing Modal. Both are pure functions of the
 * same `availableAssetTypes` set every other page already derives from
 * a real collaboration_assets query (is_active + upload_status='ready'
 * only) — nothing here invents an asset, a status, or a download link.
 * In particular "the full WAV export is not yet confirmed as uploaded"
 * (K1.4 brief, Project A/B) falls out automatically: if 'audio_full'
 * isn't in the set, it is reported unavailable/pending, never complete.
 */

export type DeliverableItem = {
  key: 'demo' | 'fullMaster' | 'proposal' | 'artwork';
  label: string;
  status: 'completed' | 'pending';
};

export function buildDeliverables(availableAssetTypes: Set<string>): DeliverableItem[] {
  const hasVisual = [...availableAssetTypes].some((t) => VISUAL_ASSET_TYPES.has(t));
  return [
    { key: 'demo', label: 'Private Demo (Audio)', status: availableAssetTypes.has('audio_short') ? 'completed' : 'pending' },
    { key: 'fullMaster', label: 'Full WAV Master', status: availableAssetTypes.has('audio_full') ? 'completed' : 'pending' },
    { key: 'proposal', label: 'Proposal Document', status: availableAssetTypes.has('proposal_pdf') ? 'completed' : 'pending' },
    { key: 'artwork', label: 'Cover Artwork', status: hasVisual ? 'completed' : 'pending' },
  ];
}

export type MaterialItem = {
  key: 'listen' | 'proposal' | 'visuals';
  label: string;
  available: boolean;
  routePath: CollaborationActionPath;
};

export function buildMaterials(availableAssetTypes: Set<string>): MaterialItem[] {
  const hasVisual = [...availableAssetTypes].some((t) => VISUAL_ASSET_TYPES.has(t));
  return [
    {
      key: 'listen',
      label: 'Audio (Demo / Master)',
      available: availableAssetTypes.has('audio_short') || availableAssetTypes.has('audio_full'),
      routePath: 'listen',
    },
    { key: 'proposal', label: 'Proposal', available: availableAssetTypes.has('proposal_pdf'), routePath: 'proposal' },
    { key: 'visuals', label: 'Artwork / Visuals', available: hasVisual, routePath: 'visuals' },
  ];
}
