import { corsHeaders, json } from '../_shared/cors.ts';
import { requiredEnv, createAdminClient } from '../_shared/clients.ts';
import { requireAdmin } from '../_shared/requireAdmin.ts';
import { scanAsset } from '../_shared/assetScanner.ts';
import { evaluateUploadVerification, guardConfirmUpload } from '../_shared/uploadLifecycle.ts';

// Stage I1 hardening: Supabase Storage's reported object size is an
// exact byte count, not an approximation — there is no legitimate
// reason for it to differ from what the browser declared before
// uploading. An earlier 64-byte tolerance here was reviewed and
// removed; it existed defensively but was never actually required,
// and silently widened the window for a truncated/substituted file
// to pass as a match. Exact comparison is strictly safer and no more
// likely to produce a false rejection — enforced now inside
// evaluateUploadVerification (uploadLifecycle.ts).

/**
 * The missing half of the Stage D/F upload flow: a metadata row
 * existing has never been proof that Storage actually holds the
 * object. This verifies the object server-side — by asking Storage,
 * not by trusting whatever the browser claims happened — before an
 * asset can ever become visible to an artist (RLS itself also now
 * requires upload_status = 'ready', so even skipping this call
 * entirely leaves the asset invisible, not just "not recommended to
 * skip").
 */
Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);

  const env = requiredEnv();
  if (!env) return json({ error: 'SERVER_CONFIG' }, 500);

  const admin = await requireAdmin(env.supabaseUrl, request.headers.get('Authorization'));
  if (!admin) return json({ error: 'NOT_AUTHORIZED' }, 403);

  let body: { assetId?: string; promoteToPrimaryCover?: boolean; revalidate?: boolean };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'INVALID_JSON' }, 400);
  }
  if (!body.assetId) return json({ error: 'INVALID_INPUT' }, 400);

  const adminClient = createAdminClient(env.supabaseUrl, env.serviceKey);

  // There is no client-supplied collaborationId anywhere in this
  // call — the only input is the assetId, and every path checked
  // below (bucket, storage_path, expected size) comes from the row
  // this server already wrote at request-upload-url time. There is
  // nothing here for a client to substitute.
  const asset = await adminClient
    .from('collaboration_assets')
    .select('collaboration_id, storage_bucket, storage_path, thumbnail_storage_path, byte_size, asset_type, upload_status, security_required, security_status')
    .eq('id', body.assetId)
    .maybeSingle();

  if (!asset.data) return json({ error: 'ASSET_NOT_FOUND' }, 404);
  const guard = guardConfirmUpload(asset.data.upload_status);
  if (guard.action === 'already-ready' && !body.revalidate) return json({ ok: true, uploadStatus: 'ready' });
  if (guard.action === 'reject' && !body.revalidate && asset.data.security_status !== 'error') return json({ error: guard.error }, 409);

  const legacy = !asset.data.security_required;
  if (!legacy) await adminClient.from('collaboration_assets').update({ upload_status: 'verifying' }).eq('id', body.assetId);
  if (asset.data.security_status === 'clean') return json({ ok: true, uploadStatus: legacy ? asset.data.upload_status : 'verifying', reviewRequired: true });

  async function objectExists(bucket: string, path: string): Promise<{ exists: boolean; size?: number }> {
    const slash = path.lastIndexOf('/');
    const prefix = path.slice(0, slash);
    const filename = path.slice(slash + 1);
    const listing = await adminClient.storage.from(bucket).list(prefix, { search: filename, limit: 1 });
    const match = listing.data?.find((entry) => entry.name === filename);
    return { exists: Boolean(match), size: match?.metadata?.size };
  }

  const primary = await objectExists(asset.data.storage_bucket, asset.data.storage_path);

  const hasThumbnail = Boolean(asset.data.thumbnail_storage_path);
  const thumb = hasThumbnail
    ? await objectExists(asset.data.storage_bucket, asset.data.thumbnail_storage_path)
    : { exists: true };

  const verification = evaluateUploadVerification({
    primaryExists: primary.exists,
    primarySize: primary.size,
    expectedByteSize: asset.data.byte_size,
    hasThumbnail,
    thumbnailExists: thumb.exists,
  });

  if (!verification.ok) {
    if (!legacy) await adminClient.from('collaboration_assets').update({ upload_status: 'failed' }).eq('id', body.assetId);
    await adminClient.from('portal_admin_audit_log').insert({
      admin_id: admin.uid,
      action: 'confirm_upload_failed',
      target_table: 'collaboration_assets',
      target_id: body.assetId,
      details: { reason: verification.reason },
    });
    return json({ error: 'VERIFICATION_FAILED' }, 422);
  }

  const scanned = await scanAsset(adminClient, body.assetId, admin.uid);
  if (!scanned.ok) return json({ error: scanned.error ?? 'SCAN_NOT_RECORDED' },409);
  return json({ ...scanned, uploadStatus: legacy ? asset.data.upload_status : 'verifying', primaryCoverResult: 'skipped' });
});
