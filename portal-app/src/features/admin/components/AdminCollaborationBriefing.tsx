import { useMemo } from 'react';
import { useAdminAssets } from '../hooks/useAdminAssets';
import { CollaborationBriefingModal } from '../../../components/CollaborationBriefingModal';
import type { AdminCollaboration } from '../types/adminTypes';

type Props = { collaboration: AdminCollaboration; onClose: () => void };

/**
 * Stage K1.4 — thin admin-side adapter over the shared briefing modal.
 * `useAdminAssets` returns every asset (including pending/inactive, for
 * management elsewhere in the Command Center); this filters down to
 * is_active + upload_status='ready' before building the type Set, the
 * same "really available" definition useDashboardData already applies
 * for the artist-facing card — so an admin and an artist looking at
 * the same collaboration see identical Deliverables/Materials status.
 */
export function AdminCollaborationBriefing({ collaboration, onClose }: Props) {
  const { state } = useAdminAssets(collaboration.id);

  const availableAssetTypes = useMemo(() => {
    if (state.kind !== 'ready') return new Set<string>();
    return new Set(state.assets.filter((a) => a.isActive && a.uploadStatus === 'ready').map((a) => a.assetType));
  }, [state]);

  return <CollaborationBriefingModal collaboration={collaboration} availableAssetTypes={availableAssetTypes} onClose={onClose} />;
}
