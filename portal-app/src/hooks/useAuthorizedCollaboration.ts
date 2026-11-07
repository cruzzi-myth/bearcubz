import { useEffect, useState } from 'react';
import { supabase } from '../services/supabaseClient';
import { isBackendUnavailableError } from '../lib/supabaseErrors';

export type CollaborationAsset = {
  id: string;
  assetType: string;
  displayLabel: string;
  description: string | null;
  version: number;
  approvalStatus: string | null;
  isPrimaryCover: boolean;
  mimeType: string;
  byteSize: number | null;
  uploadedAt: string;
  hasThumbnail: boolean;
};

export type CollaborationDetail = {
  id: string;
  title: string;
  artistDisplayName: string;
  status: string;
  bpm: number | null;
  musicalKey: string | null;
  genreTags: string[] | null;
};

type Result =
  | { status: 'loading' }
  | { status: 'backend-unavailable' }
  | { status: 'error' }
  | { status: 'not-authorized' }
  | { status: 'authorized'; collaboration: CollaborationDetail; assets: CollaborationAsset[] };

/**
 * RequirePortalAuth only confirms the visitor has SOME active
 * membership, somewhere — it deliberately doesn't know which
 * collaboration the URL is asking for. This is the per-:id check all
 * four chambers depend on: it queries `collaborations` filtered to
 * this exact id, and RLS (active membership required) means a
 * non-member gets zero rows back, not an error — "not a member" and
 * "doesn't exist" stay indistinguishable on purpose, same as the
 * Edge Functions. "Backend not configured" and "truly not
 * authorized" are kept distinct, same reasoning as PortalAuthContext
 * and useDashboardData — a missing table must never read as a denial.
 */
export function useAuthorizedCollaboration(id: string | undefined): Result {
  const [result, setResult] = useState<Result>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    if (!id) {
      setResult({ status: 'not-authorized' });
      return;
    }

    setResult({ status: 'loading' });

    async function load() {
      const collabResult = await supabase
        .from('collaborations')
        .select('id, title, artist_display_name, status, bpm, musical_key, genre_tags')
        .eq('id', id)
        .maybeSingle();
      if (cancelled) return;

      if (isBackendUnavailableError(collabResult.error)) {
        setResult({ status: 'backend-unavailable' });
        return;
      }
      if (collabResult.error) {
        setResult({ status: 'error' });
        return;
      }
      if (!collabResult.data) {
        setResult({ status: 'not-authorized' });
        return;
      }

      const assetsResult = await supabase
        .from('collaboration_assets')
        .select('id, asset_type, display_label, description, version, approval_status, is_primary_cover, mime_type, byte_size, uploaded_at, thumbnail_storage_path')
        .eq('collaboration_id', id)
        .eq('is_active', true)
        // RLS already enforces this for an artist's own read — this
        // is explicit defense in depth, not the real boundary.
        .eq('upload_status', 'ready');
      if (cancelled) return;

      if (isBackendUnavailableError(assetsResult.error)) {
        setResult({ status: 'backend-unavailable' });
        return;
      }
      if (assetsResult.error) {
        setResult({ status: 'error' });
        return;
      }

      const row = collabResult.data;
      setResult({
        status: 'authorized',
        collaboration: {
          id: row.id,
          title: row.title,
          artistDisplayName: row.artist_display_name,
          status: row.status,
          bpm: row.bpm,
          musicalKey: row.musical_key,
          genreTags: row.genre_tags,
        },
        assets: (assetsResult.data ?? []).map((a) => ({
          id: a.id,
          assetType: a.asset_type,
          displayLabel: a.display_label,
          description: a.description,
          version: a.version,
          approvalStatus: a.approval_status,
          isPrimaryCover: a.is_primary_cover,
          mimeType: a.mime_type,
          byteSize: a.byte_size,
          uploadedAt: a.uploaded_at,
          hasThumbnail: Boolean(a.thumbnail_storage_path),
        })),
      });
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  return result;
}
