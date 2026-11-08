import { useEffect, useState } from 'react';
import { supabase } from '../services/supabaseClient';
import { isBackendUnavailableError } from '../lib/supabaseErrors';
import { usePortalAuth } from '../features/auth/PortalAuthContext';
import type { StorableClassification } from '../lib/collaborationClassification';

export type DashboardCollaboration = {
  id: string;
  title: string;
  artistDisplayName: string;
  status: string;
  bpm: number | null;
  musicalKey: string | null;
  genreTags: string[] | null;
  notes: string | null;
  classification: StorableClassification | null;
  updatedAt: string;
  availableAssetTypes: Set<string>;
  primaryCoverAssetId: string | null;
};

export type ActivityItem = {
  id: string;
  label: string;
  collaborationTitle: string;
  at: string;
};

export type DashboardData =
  | { kind: 'loading' }
  | { kind: 'backend-unavailable' }
  | { kind: 'error' }
  | { kind: 'ready'; displayName: string | null; collaborations: DashboardCollaboration[]; activity: ActivityItem[] };

const RECENT_ACTIVITY_LIMIT = 5;

/**
 * Every read here is RLS-scoped to the signed-in artist — there is no
 * service-role key anywhere in this file, and none of these queries
 * can return another artist's rows regardless of what's asked for.
 * "No authorized collaborations" and "couldn't reach the backend" are
 * kept as distinct outcomes throughout (see lib/supabaseErrors) —
 * neither is ever inferred from the other.
 */
export function useDashboardData(): DashboardData {
  // Stage K1.5B: an administrator has no collaboration_members row of
  // their own (that's a real membership, not an admin flag) -- so the
  // membership-scoped query below would always return zero rows for
  // them, leaving the dashboard permanently empty even though they're
  // fully authorized. For an admin, source the id list from the same
  // "admin select all collaborations" RLS policy the Command Center
  // already relies on (not a new grant) instead of the membership
  // table. Ordinary artists are completely unaffected — this branch
  // never runs for them, and their own query is byte-for-byte what it
  // was before this stage.
  const { isAdmin } = usePortalAuth();
  const [data, setData] = useState<DashboardData>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setData({ kind: 'loading' });

      const profileResult = await supabase.from('artist_profiles').select('display_name').maybeSingle();
      if (cancelled) return;
      if (isBackendUnavailableError(profileResult.error)) {
        setData({ kind: 'backend-unavailable' });
        return;
      }

      let activeIds: string[];
      if (isAdmin) {
        const allCollabs = await supabase.from('collaborations').select('id');
        if (cancelled) return;
        if (isBackendUnavailableError(allCollabs.error)) {
          setData({ kind: 'backend-unavailable' });
          return;
        }
        if (allCollabs.error) {
          setData({ kind: 'error' });
          return;
        }
        activeIds = (allCollabs.data ?? []).map((row) => row.id);
      } else {
        const memberships = await supabase
          .from('collaboration_members')
          .select('collaboration_id')
          .eq('status', 'active');
        if (cancelled) return;
        if (isBackendUnavailableError(memberships.error)) {
          setData({ kind: 'backend-unavailable' });
          return;
        }
        if (memberships.error) {
          setData({ kind: 'error' });
          return;
        }
        activeIds = (memberships.data ?? []).map((row) => row.collaboration_id);
      }

      if (activeIds.length === 0) {
        setData({ kind: 'ready', displayName: profileResult.data?.display_name ?? null, collaborations: [], activity: [] });
        return;
      }

      const [collabResult, assetResult, feedbackResult] = await Promise.all([
        supabase
          .from('collaborations')
          .select('id, title, artist_display_name, status, bpm, musical_key, genre_tags, notes, classification, updated_at')
          .in('id', activeIds),
        supabase
          .from('collaboration_assets')
          .select('id, collaboration_id, asset_type, uploaded_at, is_primary_cover')
          .in('collaboration_id', activeIds)
          .eq('is_active', true)
          // RLS already enforces this for an artist's own read — this
          // is explicit defense in depth, not the real boundary.
          .eq('upload_status', 'ready'),
        supabase
          .from('collaboration_feedback')
          .select('collaboration_id, is_admin_reply, created_at')
          .in('collaboration_id', activeIds)
          .eq('is_admin_reply', true),
      ]);
      if (cancelled) return;

      if (
        isBackendUnavailableError(collabResult.error) ||
        isBackendUnavailableError(assetResult.error) ||
        isBackendUnavailableError(feedbackResult.error)
      ) {
        setData({ kind: 'backend-unavailable' });
        return;
      }
      if (collabResult.error || assetResult.error || feedbackResult.error) {
        setData({ kind: 'error' });
        return;
      }

      const titleById = new Map((collabResult.data ?? []).map((row) => [row.id, row.title]));

      const assetsByCollaboration = new Map<string, Set<string>>();
      const primaryCoverByCollaboration = new Map<string, string>();
      for (const asset of assetResult.data ?? []) {
        const set = assetsByCollaboration.get(asset.collaboration_id) ?? new Set<string>();
        set.add(asset.asset_type);
        assetsByCollaboration.set(asset.collaboration_id, set);
        if (asset.is_primary_cover) primaryCoverByCollaboration.set(asset.collaboration_id, asset.id);
      }

      const collaborations: DashboardCollaboration[] = (collabResult.data ?? []).map((row) => ({
        id: row.id,
        title: row.title,
        artistDisplayName: row.artist_display_name,
        status: row.status,
        bpm: row.bpm,
        musicalKey: row.musical_key,
        genreTags: row.genre_tags,
        notes: row.notes,
        classification: row.classification,
        updatedAt: row.updated_at,
        availableAssetTypes: assetsByCollaboration.get(row.id) ?? new Set<string>(),
        primaryCoverAssetId: primaryCoverByCollaboration.get(row.id) ?? null,
      }));

      // Real activity only — derived from actual asset-upload and
      // admin-reply timestamps, nothing fabricated. Empty today
      // because nothing has been seeded in any environment yet.
      const activity: ActivityItem[] = [
        ...(assetResult.data ?? []).map((row) => ({
          id: `asset-${row.collaboration_id}-${row.uploaded_at}`,
          label: 'New authorized asset uploaded',
          collaborationTitle: titleById.get(row.collaboration_id) ?? 'Unknown collaboration',
          at: row.uploaded_at,
        })),
        ...(feedbackResult.data ?? []).map((row, index) => ({
          id: `feedback-${row.collaboration_id}-${index}`,
          label: 'Feedback received from THE COLLECTIVE',
          collaborationTitle: titleById.get(row.collaboration_id) ?? 'Unknown collaboration',
          at: row.created_at,
        })),
      ]
        .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
        .slice(0, RECENT_ACTIVITY_LIMIT);

      setData({ kind: 'ready', displayName: profileResult.data?.display_name ?? null, collaborations, activity });
    }

    load();
    return () => {
      cancelled = true;
    };
    // isAdmin starts false and may flip true once PortalAuthContext's
    // own check resolves (never the reverse, same guarantee every
    // other isAdmin-gated control in this app already relies on) --
    // re-running this effect when it does is what lets an admin who
    // loads the page before that check resolves still end up with the
    // admin-wide (not empty) collaboration list, rather than loading
    // once as "not admin yet" and never re-fetching.
  }, [isAdmin]);

  return data;
}
