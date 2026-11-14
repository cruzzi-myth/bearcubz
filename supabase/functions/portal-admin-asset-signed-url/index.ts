import { corsHeaders, json } from '../_shared/cors.ts';
import { requiredEnv, createAdminClient } from '../_shared/clients.ts';
import { requireAdmin } from '../_shared/requireAdmin.ts';

const SIGNED_URL_TTL_SECONDS = 5 * 60;
const SCAN_POLICY_VERSION = 'signal-portal-k16h2-v1';

/**
 * portal-signed-url (the artist-facing function) deliberately refuses
 * to sign anything until security_review_status = 'approved' — but
 * that is exactly the decision an admin is reviewing an asset in
 * order to make, so that function can never be reused here. This is
 * a separate, admin-only path: it still requires genuine, complete,
 * matching scan evidence (the same fields valid_portal_scan_evidence
 * checks in the database), and still refuses anything flagged
 * infected — it only drops the "already approved" requirement.
 * Legacy assets (security_required = false) are unaffected: they
 * still need upload_status = 'ready', exactly as before.
 */
Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);

  const env = requiredEnv();
  if (!env) return json({ error: 'SERVER_CONFIG' }, 500);

  const admin = await requireAdmin(env.supabaseUrl, request.headers.get('Authorization'));
  if (!admin) return json({ error: 'NOT_AUTHORIZED' }, 403);

  let body: { assetId?: string; variant?: 'full' | 'thumbnail' };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'INVALID_JSON' }, 400);
  }
  if (!body.assetId) return json({ error: 'INVALID_ASSET' }, 400);

  const adminClient = createAdminClient(env.supabaseUrl, env.serviceKey);

  const asset = await adminClient
    .from('collaboration_assets')
    .select(
      'storage_bucket, storage_path, thumbnail_storage_path, upload_status, is_active, security_required, security_status, scan_evidence, file_sha256, byte_size, scan_request_id',
    )
    .eq('id', body.assetId)
    .maybeSingle();

  if (!asset.data || !asset.data.is_active) return json({ error: 'NOT_AUTHORIZED' }, 403);
  if (asset.data.security_status === 'infected') return json({ error: 'NOT_AUTHORIZED' }, 403);

  if (asset.data.security_required) {
    const e = asset.data.scan_evidence as Record<string, unknown> | null;
    const genuinelyClean =
      asset.data.security_status === 'clean' &&
      !!asset.data.file_sha256 &&
      /^[a-f0-9]{64}$/.test(asset.data.file_sha256) &&
      e?.verdict === 'clean' &&
      e?.complete === true &&
      e?.withinLimits === true &&
      typeof e?.provider === 'string' &&
      ['cloudmersive', 'cloudmersive-advanced', 'clamav'].includes(e.provider as string) &&
      e?.fileSha256 === asset.data.file_sha256 &&
      String(e?.fileSize) === String(asset.data.byte_size) &&
      e?.attemptId === asset.data.scan_request_id &&
      e?.policyVersion === SCAN_POLICY_VERSION;
    if (!genuinelyClean) return json({ error: 'NOT_AUTHORIZED' }, 403);
  } else if (asset.data.upload_status !== 'ready') {
    return json({ error: 'NOT_AUTHORIZED' }, 403);
  }

  const storagePath =
    body.variant === 'thumbnail' && asset.data.thumbnail_storage_path ? asset.data.thumbnail_storage_path : asset.data.storage_path;

  const signed = await adminClient.storage.from(asset.data.storage_bucket).createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
  if (signed.error || !signed.data) return json({ error: 'SIGN_FAILED' }, 500);

  await adminClient.from('portal_admin_audit_log').insert({
    admin_id: admin.uid,
    action: 'admin_preview_asset',
    target_table: 'collaboration_assets',
    target_id: body.assetId,
    details: { variant: body.variant ?? 'full' },
  });

  return json({ url: signed.data.signedUrl, expiresInSeconds: SIGNED_URL_TTL_SECONDS });
});
