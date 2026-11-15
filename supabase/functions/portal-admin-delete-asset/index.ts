import { corsHeaders, json } from '../_shared/cors.ts';
import { requiredEnv, createAdminClient } from '../_shared/clients.ts';
import { requireAdmin } from '../_shared/requireAdmin.ts';

/**
 * Stage K1.6O — a genuine, permanent delete, distinct from
 * mark_asset_inactive (which only ever sets is_active = false and
 * keeps the row and the Storage object). This removes the private
 * Storage object(s) first; the collaboration_assets row is only ever
 * deleted once that step has genuinely succeeded (or the object was
 * already gone) — if Storage deletion itself fails, nothing here is
 * touched at all, so the admin can simply retry rather than being
 * left with a row pointing at bytes that may or may not exist, or a
 * deleted row whose bytes were never actually removed.
 *
 * The audit-log entries this asset's own history already produced
 * (request_upload_url, asset_scan_result, approve_asset_security_
 * release, ...) are never touched by this — portal_admin_audit_log
 * has no foreign key to collaboration_assets (confirmed in K1.6L),
 * so they survive this row's deletion intact. The details captured
 * in THIS function's own audit entry (below) are what let that
 * history keep making sense once the row itself is gone.
 */
Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);

  const env = requiredEnv();
  if (!env) return json({ error: 'SERVER_CONFIG' }, 500);

  const admin = await requireAdmin(env.supabaseUrl, request.headers.get('Authorization'));
  if (!admin) return json({ error: 'NOT_AUTHORIZED' }, 403);

  let body: { assetId?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'INVALID_INPUT' }, 400);
  }
  if (!body.assetId) return json({ error: 'INVALID_INPUT' }, 400);

  const adminClient = createAdminClient(env.supabaseUrl, env.serviceKey);

  const asset = await adminClient
    .from('collaboration_assets')
    .select('id, collaboration_id, asset_type, display_label, byte_size, is_active, storage_bucket, storage_path, thumbnail_storage_path')
    .eq('id', body.assetId)
    .maybeSingle();

  if (!asset.data) return json({ error: 'ASSET_NOT_FOUND' }, 404);
  const row = asset.data;

  const paths = [row.storage_path, row.thumbnail_storage_path].filter((p): p is string => typeof p === 'string' && p.length > 0);
  if (paths.length > 0) {
    const removed = await adminClient.storage.from(row.storage_bucket).remove(paths);
    // A path that was already gone is not a failure here (idempotent
    // delete) — remove() reports those within `data`, not `error`.
    // Only a genuine storage-layer error stops the delete, leaving
    // both the object(s) and the row exactly as they were.
    if (removed.error) {
      await adminClient.from('portal_admin_audit_log').insert({
        admin_id: admin.uid,
        action: 'delete_asset_storage_failed',
        target_table: 'collaboration_assets',
        target_id: row.id,
        details: { collaboration_id: row.collaboration_id, asset_type: row.asset_type, display_label: row.display_label, error: removed.error.message },
      });
      return json({ error: 'STORAGE_DELETE_FAILED', detail: removed.error.message }, 500);
    }
  }

  const deleted = await adminClient.from('collaboration_assets').delete().eq('id', row.id).select('id').maybeSingle();
  if (deleted.error || !deleted.data) return json({ error: 'DELETE_FAILED' }, 500);

  await adminClient.from('portal_admin_audit_log').insert({
    admin_id: admin.uid,
    action: 'delete_asset',
    target_table: 'collaboration_assets',
    target_id: row.id,
    details: {
      collaboration_id: row.collaboration_id,
      asset_type: row.asset_type,
      display_label: row.display_label,
      byte_size: row.byte_size,
      was_active: row.is_active,
      storage_bucket: row.storage_bucket,
      storage_path: row.storage_path,
    },
  });

  return json({ ok: true });
});
