import { useEffect, useState } from 'react';
import { listArtists, listCollaborations, listAssets, listInvitations, listFeedback, listAuditLog } from '../services/adminApi';
import { messageLooksLikeBackendUnavailable } from '../../../lib/supabaseErrors';
import type { AdminAuditEntry } from '../types/adminTypes';

export type OverviewMetrics = {
  totalArtists: number;
  activeCollaborations: number;
  draftCollaborations: number;
  pendingInvitations: number;
  audioAssets: number;
  artworkAssets: number;
  proposalAssets: number;
  unansweredTransmissions: number;
};

type State = { kind: 'loading' } | { kind: 'backend-unavailable' } | { kind: 'error'; message: string } | { kind: 'ready'; metrics: OverviewMetrics; recentActivity: AdminAuditEntry[] };

const AUDIO_TYPES = new Set(['audio_short', 'audio_full']);
const ARTWORK_TYPES = new Set(['track_cover', 'alternate_cover', 'visual_image', 'visual_concept']);

/**
 * Every number here comes from an actual query — nothing is
 * hardcoded, and a genuinely empty backend reports zeros, not an
 * error. A real query failure (including "the Stage H migration
 * hasn't been applied yet") is its own distinct state, never
 * silently presented as "zero records."
 */
export function useAdminOverview() {
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [artists, collaborations, assets, invitations, feedback, audit] = await Promise.all([
        listArtists(),
        listCollaborations(),
        listAssets(),
        listInvitations(),
        listFeedback(),
        listAuditLog(10),
      ]);
      if (cancelled) return;

      const failures = [artists, collaborations, assets, invitations, feedback, audit].filter((r) => !r.ok) as { ok: false; error: string }[];
      if (failures.length > 0) {
        const backendUnavailable = failures.some((f) => messageLooksLikeBackendUnavailable(f.error));
        setState(backendUnavailable ? { kind: 'backend-unavailable' } : { kind: 'error', message: failures[0].error });
        return;
      }
      if (!artists.ok || !collaborations.ok || !assets.ok || !invitations.ok || !feedback.ok || !audit.ok) return;

      const unanswered = feedback.data.filter((m) => !m.isAdminReply).length - feedback.data.filter((m) => m.isAdminReply).length;

      setState({
        kind: 'ready',
        metrics: {
          totalArtists: artists.data.length,
          activeCollaborations: collaborations.data.filter((c) => c.status === 'active').length,
          draftCollaborations: collaborations.data.filter((c) => c.status === 'draft').length,
          pendingInvitations: invitations.data.filter((i) => i.status === 'pending').length,
          audioAssets: assets.data.filter((a) => AUDIO_TYPES.has(a.assetType) && a.isActive).length,
          artworkAssets: assets.data.filter((a) => ARTWORK_TYPES.has(a.assetType) && a.isActive).length,
          proposalAssets: assets.data.filter((a) => a.assetType === 'proposal_pdf' && a.isActive).length,
          unansweredTransmissions: Math.max(0, unanswered),
        },
        recentActivity: audit.data,
      });
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
