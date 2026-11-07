import { corsHeaders, json } from '../_shared/cors.ts';
import { requiredEnv, createAdminClient } from '../_shared/clients.ts';
import { requireAdmin } from '../_shared/requireAdmin.ts';

type Op =
  | 'create_collaboration'
  | 'update_collaboration'
  | 'add_member'
  | 'revoke_member'
  | 'update_asset'
  | 'mark_asset_inactive'
  | 'revoke_invitation';
const VALID_OPS: Op[] = [
  'create_collaboration',
  'update_collaboration',
  'add_member',
  'revoke_member',
  'update_asset',
  'mark_asset_inactive',
  'revoke_invitation',
];
const VALID_STATUSES = ['draft', 'invited', 'active', 'completed', 'archived'];
const VALID_APPROVAL_STATUSES = ['pending', 'approved', 'rejected'];

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);

  const env = requiredEnv();
  if (!env) return json({ error: 'SERVER_CONFIG' }, 500);

  const admin = await requireAdmin(env.supabaseUrl, request.headers.get('Authorization'));
  if (!admin) return json({ error: 'NOT_AUTHORIZED' }, 403);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'INVALID_JSON' }, 400);
  }

  const op = body.op as Op;
  if (!VALID_OPS.includes(op)) return json({ error: 'INVALID_OP' }, 400);

  const adminClient = createAdminClient(env.supabaseUrl, env.serviceKey);
  const audit = (action: string, targetTable: string, targetId: string | null, details: unknown) =>
    adminClient.from('portal_admin_audit_log').insert({
      admin_id: admin.uid,
      action,
      target_table: targetTable,
      target_id: targetId,
      details,
    });

  if (op === 'create_collaboration') {
    const title = String(body.title ?? '').trim();
    const artistDisplayName = String(body.artistDisplayName ?? '').trim();
    if (!title || !artistDisplayName) return json({ error: 'INVALID_INPUT' }, 400);

    const inserted = await adminClient
      .from('collaborations')
      .insert({
        title,
        artist_display_name: artistDisplayName,
        bpm: typeof body.bpm === 'number' ? body.bpm : null,
        musical_key: typeof body.musicalKey === 'string' ? body.musicalKey : null,
        genre_tags: Array.isArray(body.genreTags) ? body.genreTags : null,
        notes: typeof body.notes === 'string' ? body.notes : null,
        created_by: admin.uid,
      })
      .select('id')
      .single();

    if (inserted.error) return json({ error: 'CREATE_FAILED' }, 500);
    await audit('create_collaboration', 'collaborations', inserted.data.id, { title });
    return json({ ok: true, collaborationId: inserted.data.id });
  }

  if (op === 'update_collaboration') {
    const id = String(body.collaborationId ?? '');
    if (!id) return json({ error: 'INVALID_INPUT' }, 400);
    const status = body.status;
    if (status !== undefined && !VALID_STATUSES.includes(String(status))) {
      return json({ error: 'INVALID_STATUS' }, 400);
    }

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (status !== undefined) patch.status = status;
    if (typeof body.notes === 'string') patch.notes = body.notes;
    if (typeof body.bpm === 'number') patch.bpm = body.bpm;
    if (typeof body.musicalKey === 'string') patch.musical_key = body.musicalKey;

    const updated = await adminClient.from('collaborations').update(patch).eq('id', id);
    if (updated.error) return json({ error: 'UPDATE_FAILED' }, 500);
    await audit('update_collaboration', 'collaborations', id, patch);
    return json({ ok: true });
  }

  if (op === 'add_member') {
    const collaborationId = String(body.collaborationId ?? '');
    const userId = String(body.userId ?? '');
    if (!collaborationId || !userId) return json({ error: 'INVALID_INPUT' }, 400);

    const upserted = await adminClient
      .from('collaboration_members')
      .upsert(
        { collaboration_id: collaborationId, user_id: userId, added_by: admin.uid, status: 'active', revoked_at: null },
        { onConflict: 'collaboration_id,user_id' },
      );

    if (upserted.error) return json({ error: 'ADD_MEMBER_FAILED' }, 500);
    await audit('add_member', 'collaboration_members', collaborationId, { user_id: userId });
    return json({ ok: true });
  }

  if (op === 'update_asset') {
    // The ONLY path by which approval_status, is_primary_cover, or
    // display_label/description ever change after upload — RLS grants
    // `authenticated` select-only on collaboration_assets (unchanged
    // since Stage D), so no artist-facing code path can reach this
    // regardless of what a client might send.
    const assetId = String(body.assetId ?? '');
    if (!assetId) return json({ error: 'INVALID_INPUT' }, 400);
    if (body.approvalStatus !== undefined && !VALID_APPROVAL_STATUSES.includes(String(body.approvalStatus))) {
      return json({ error: 'INVALID_APPROVAL_STATUS' }, 400);
    }

    // Promoting to primary cover (switching which of two ALREADY-
    // ready images is primary, with no new upload involved) goes
    // through the same atomic SQL function the confirm-upload flow
    // uses — it refuses to run unless the target is upload_status =
    // 'ready', so this can never leave a collaboration with zero
    // primary covers either.
    if (body.isPrimaryCover === true) {
      // acting_admin_id is this function's own already-verified admin
      // uid — the SQL function independently re-checks
      // is_portal_admin() against it (Stage I1 hardening) rather than
      // trusting that only admin-checked code ever calls it.
      const promoted = await adminClient.rpc('promote_primary_cover', { target_asset_id: assetId, acting_admin_id: admin.uid });
      if (promoted.error) {
        const message = promoted.error.message;
        const code = message.includes('ASSET_NOT_READY')
          ? 'ASSET_NOT_READY'
          : message.includes('NOT_A_COVER_ELIGIBLE_TYPE')
            ? 'NOT_A_COVER_ELIGIBLE_TYPE'
            : message.includes('ASSET_REJECTED')
              ? 'ASSET_REJECTED'
              : message.includes('ASSET_INACTIVE')
                ? 'ASSET_INACTIVE'
                : 'PROMOTE_FAILED';
        return json({ error: code }, 409);
      }
    }

    const patch: Record<string, unknown> = {};
    if (body.approvalStatus !== undefined) patch.approval_status = body.approvalStatus;
    if (typeof body.description === 'string') patch.description = body.description;
    if (typeof body.displayLabel === 'string') patch.display_label = body.displayLabel;
    if (body.isPrimaryCover === false) patch.is_primary_cover = false;

    if (Object.keys(patch).length > 0) {
      const updated = await adminClient.from('collaboration_assets').update(patch).eq('id', assetId);
      if (updated.error) return json({ error: 'UPDATE_FAILED' }, 500);
    } else if (body.isPrimaryCover !== true) {
      return json({ error: 'INVALID_INPUT' }, 400);
    }

    await audit('update_asset', 'collaboration_assets', assetId, { ...patch, isPrimaryCover: body.isPrimaryCover });
    return json({ ok: true });
  }

  if (op === 'mark_asset_inactive') {
    const assetId = String(body.assetId ?? '');
    if (!assetId) return json({ error: 'INVALID_INPUT' }, 400);

    const updated = await adminClient
      .from('collaboration_assets')
      .update({ is_active: false, is_primary_cover: false })
      .eq('id', assetId);
    if (updated.error) return json({ error: 'UPDATE_FAILED' }, 500);
    await audit('mark_asset_inactive', 'collaboration_assets', assetId, {});
    return json({ ok: true });
  }

  if (op === 'revoke_invitation') {
    const invitationId = String(body.invitationId ?? '');
    if (!invitationId) return json({ error: 'INVALID_INPUT' }, 400);

    const updated = await adminClient
      .from('artist_invitations')
      .update({ status: 'revoked', revoked_at: new Date().toISOString(), revoked_reason: typeof body.reason === 'string' ? body.reason : null })
      .eq('id', invitationId)
      .eq('status', 'pending');
    if (updated.error) return json({ error: 'REVOKE_FAILED' }, 500);
    await audit('revoke_invitation', 'artist_invitations', invitationId, {});
    return json({ ok: true });
  }

  // op === 'revoke_member'
  const collaborationId = String(body.collaborationId ?? '');
  const userId = String(body.userId ?? '');
  if (!collaborationId || !userId) return json({ error: 'INVALID_INPUT' }, 400);

  const revoked = await adminClient
    .from('collaboration_members')
    .update({ status: 'revoked', revoked_at: new Date().toISOString() })
    .eq('collaboration_id', collaborationId)
    .eq('user_id', userId);

  if (revoked.error) return json({ error: 'REVOKE_FAILED' }, 500);
  await audit('revoke_member', 'collaboration_members', collaborationId, { user_id: userId });
  return json({ ok: true });
});
