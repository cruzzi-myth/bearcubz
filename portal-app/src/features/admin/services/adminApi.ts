import { supabase } from '../../../services/supabaseClient';
import type {
  AdminArtistProfile,
  AdminAsset,
  AdminAuditEntry,
  AdminCollaboration,
  AdminFeedbackMessage,
  AdminInvitation,
  AdminMembership,
  ApprovalStatus,
  AssetType,
  CollaborationStatus,
} from '../types/adminTypes';

/**
 * The one place every administrator operation goes through — no
 * component anywhere in features/admin calls supabase.functions or
 * supabase.from() directly. Reads use the admin's own RLS-scoped
 * session (every table already has an "admin select all" policy from
 * Stage D, gated by is_portal_admin() — there is no second,
 * service-role-backed read path, and there doesn't need to be).
 * Writes go through the existing Stage D/F/H Edge Functions, which
 * independently re-verify admin status server-side on every call —
 * this file calling them is a convenience, never the authorization
 * boundary itself.
 */

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string };

function mapError(error: unknown): string {
  return error instanceof Error ? error.message : 'UNKNOWN_ERROR';
}

// ---------- reads ----------

export async function listArtists(): Promise<ApiResult<AdminArtistProfile[]>> {
  const { data, error } = await supabase.from('artist_profiles').select('user_id, display_name, email, created_at, updated_at');
  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    data: (data ?? []).map((r) => ({ userId: r.user_id, displayName: r.display_name, email: r.email, createdAt: r.created_at, updatedAt: r.updated_at })),
  };
}

export async function listMemberships(userId?: string): Promise<ApiResult<AdminMembership[]>> {
  let query = supabase.from('collaboration_members').select('collaboration_id, user_id, role, status, added_at, revoked_at');
  if (userId) query = query.eq('user_id', userId);
  const { data, error } = await query;
  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    data: (data ?? []).map((r) => ({ collaborationId: r.collaboration_id, userId: r.user_id, role: r.role, status: r.status, addedAt: r.added_at, revokedAt: r.revoked_at })),
  };
}

export async function listCollaborations(): Promise<ApiResult<AdminCollaboration[]>> {
  const [collabResult, assetCounts, primaryCovers] = await Promise.all([
    supabase.from('collaborations').select('id, title, artist_display_name, status, bpm, musical_key, genre_tags, notes, created_at, updated_at'),
    supabase.from('collaboration_assets').select('collaboration_id').eq('is_active', true),
    // Stage K1.4: same is_primary_cover column useDashboardData already
    // reads for the artist-facing card -- additive query, no schema
    // change, so the Asset Library/Collaborations briefing can show the
    // real cover thumbnail for admins too.
    supabase.from('collaboration_assets').select('id, collaboration_id').eq('is_primary_cover', true).eq('is_active', true),
  ]);
  if (collabResult.error) return { ok: false, error: collabResult.error.message };

  const counts = new Map<string, number>();
  for (const row of assetCounts.data ?? []) counts.set(row.collaboration_id, (counts.get(row.collaboration_id) ?? 0) + 1);

  const primaryCoverByCollaboration = new Map<string, string>();
  for (const row of primaryCovers.data ?? []) primaryCoverByCollaboration.set(row.collaboration_id, row.id);

  return {
    ok: true,
    data: (collabResult.data ?? []).map((r) => ({
      id: r.id,
      title: r.title,
      artistDisplayName: r.artist_display_name,
      status: r.status,
      bpm: r.bpm,
      musicalKey: r.musical_key,
      genreTags: r.genre_tags,
      notes: r.notes,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      assetCount: counts.get(r.id) ?? 0,
      primaryCoverAssetId: primaryCoverByCollaboration.get(r.id) ?? null,
    })),
  };
}

export async function listInvitations(): Promise<ApiResult<AdminInvitation[]>> {
  // artist_invitations grants nothing to `authenticated` at all
  // (Stage D, deliberately) — even an admin's own session cannot
  // select it directly. This is the one admin-visible table that
  // genuinely has no "admin select all" RLS policy, by design, since
  // its entire lifecycle was built to run through service-role
  // Edge Functions only. A read-only listing function is added here
  // for Stage H rather than weakening that table's RLS.
  const { data, error } = await supabase.functions.invoke<{ invitations: AdminInvitation[] }>('portal-admin-list-invitations', { body: {} });
  if (error) return { ok: false, error: mapError(error) };
  return { ok: true, data: data?.invitations ?? [] };
}

export async function listAssets(collaborationId?: string): Promise<ApiResult<AdminAsset[]>> {
  let query = supabase
    .from('collaboration_assets')
    .select(
      'id, collaboration_id, asset_type, display_label, description, version, approval_status, is_primary_cover, is_active, upload_status, mime_type, byte_size, uploaded_by, uploaded_at, verified_at',
    );
  if (collaborationId) query = query.eq('collaboration_id', collaborationId);
  const { data, error } = await query.order('uploaded_at', { ascending: false });
  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    data: (data ?? []).map((r) => ({
      id: r.id,
      collaborationId: r.collaboration_id,
      assetType: r.asset_type,
      displayLabel: r.display_label,
      description: r.description,
      version: r.version,
      approvalStatus: r.approval_status,
      isPrimaryCover: r.is_primary_cover,
      isActive: r.is_active,
      uploadStatus: r.upload_status,
      mimeType: r.mime_type,
      byteSize: r.byte_size,
      uploadedBy: r.uploaded_by,
      uploadedAt: r.uploaded_at,
      verifiedAt: r.verified_at,
    })),
  };
}

export async function listFeedback(collaborationId?: string): Promise<ApiResult<AdminFeedbackMessage[]>> {
  let query = supabase.from('collaboration_feedback').select('id, collaboration_id, author_id, is_admin_reply, kind, body, created_at');
  if (collaborationId) query = query.eq('collaboration_id', collaborationId);
  const { data, error } = await query.order('created_at', { ascending: true });
  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    data: (data ?? []).map((r) => ({ id: r.id, collaborationId: r.collaboration_id, authorId: r.author_id, isAdminReply: r.is_admin_reply, kind: r.kind, body: r.body, createdAt: r.created_at })),
  };
}

export async function listAuditLog(limit = 50, before?: string): Promise<ApiResult<AdminAuditEntry[]>> {
  let query = supabase.from('portal_admin_audit_log').select('id, admin_id, action, target_table, target_id, details, created_at').order('created_at', { ascending: false }).limit(limit);
  if (before) query = query.lt('created_at', before);
  const { data, error } = await query;
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (data ?? []).map((r) => ({ id: r.id, adminId: r.admin_id, action: r.action, targetTable: r.target_table, targetId: r.target_id, details: r.details, createdAt: r.created_at })) };
}

// ---------- writes (all via Edge Functions) ----------

async function invokeManage(body: Record<string, unknown>): Promise<ApiResult<{ ok: true } & Record<string, unknown>>> {
  const { data, error } = await supabase.functions.invoke('portal-admin-manage-collaboration', { body });
  if (error) return { ok: false, error: mapError(error) };
  if (data?.error) return { ok: false, error: data.error };
  return { ok: true, data };
}

export function createCollaboration(input: {
  title: string;
  artistDisplayName: string;
  bpm?: number;
  musicalKey?: string;
  genreTags?: string[];
  notes?: string;
}) {
  return invokeManage({ op: 'create_collaboration', ...input });
}

export function updateCollaboration(collaborationId: string, patch: { status?: CollaborationStatus; notes?: string; bpm?: number; musicalKey?: string }) {
  return invokeManage({ op: 'update_collaboration', collaborationId, ...patch });
}

export function addMember(collaborationId: string, userId: string) {
  return invokeManage({ op: 'add_member', collaborationId, userId });
}

export function revokeMember(collaborationId: string, userId: string) {
  return invokeManage({ op: 'revoke_member', collaborationId, userId });
}

export function updateAsset(assetId: string, patch: { approvalStatus?: ApprovalStatus; description?: string; displayLabel?: string; isPrimaryCover?: boolean }) {
  return invokeManage({ op: 'update_asset', assetId, ...patch });
}

export function markAssetInactive(assetId: string) {
  return invokeManage({ op: 'mark_asset_inactive', assetId });
}

export function revokeInvitation(invitationId: string, reason?: string) {
  return invokeManage({ op: 'revoke_invitation', invitationId, reason });
}

export async function createInvitation(input: { email: string; collaborationId?: string; expiresInDays?: number }): Promise<ApiResult<{ invitationId: string }>> {
  const { data, error } = await supabase.functions.invoke('portal-admin-create-invitation', { body: input });
  if (error) return { ok: false, error: mapError(error) };
  if (data?.error) return { ok: false, error: data.error };
  return { ok: true, data: { invitationId: data.invitationId } };
}

/** "Reissue" is the same operation as "create" — the Edge Function
 * already supersedes any existing pending invitation for the email. */
export const reissueInvitation = createInvitation;

export async function requestUploadUrl(input: {
  collaborationId: string;
  assetType: AssetType;
  mimeType: string;
  fileSizeBytes: number;
  displayLabel: string;
  description?: string;
  includeThumbnail?: boolean;
}): Promise<ApiResult<{ assetId: string; uploadUrl: string; path: string; thumbnailUploadUrl: string | null }>> {
  const { data, error } = await supabase.functions.invoke('portal-admin-request-upload-url', { body: input });
  if (error) return { ok: false, error: mapError(error) };
  if (data?.error) return { ok: false, error: data.error };
  return { ok: true, data };
}

export async function confirmUpload(assetId: string, promoteToPrimaryCover?: boolean): Promise<ApiResult<{ uploadStatus: string; primaryCoverResult?: string }>> {
  const { data, error } = await supabase.functions.invoke('portal-admin-confirm-upload', { body: { assetId, promoteToPrimaryCover } });
  if (error) return { ok: false, error: mapError(error) };
  if (data?.error) return { ok: false, error: data.error };
  return { ok: true, data };
}

export async function replyToFeedback(collaborationId: string, body: string, assetId?: string): Promise<ApiResult<{ ok: true }>> {
  const { data, error } = await supabase.functions.invoke('portal-admin-reply-feedback', { body: { collaborationId, body, assetId } });
  if (error) return { ok: false, error: mapError(error) };
  if (data?.error) return { ok: false, error: data.error };
  return { ok: true, data };
}
