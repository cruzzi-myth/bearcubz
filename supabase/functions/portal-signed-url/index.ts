import { corsHeaders, json } from '../_shared/cors.ts';
import { requiredEnv, createAdminClient, createUserClient } from '../_shared/clients.ts';
import { resolveSignedUrlPath } from '../_shared/signedUrlRequest.ts';

const SIGNED_URL_TTL_SECONDS = 5 * 60;

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);

  const authHeader = request.headers.get('Authorization');
  if (!authHeader) return json({ error: 'NOT_AUTHENTICATED' }, 401);

  const env = requiredEnv();
  if (!env) return json({ error: 'SERVER_CONFIG' }, 500);

  let body: { assetId?: string; variant?: 'full' | 'thumbnail' };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'INVALID_JSON' }, 400);
  }
  if (!body.assetId) return json({ error: 'INVALID_ASSET' }, 400);

  // The authorization decision is made by asking Postgres, as the
  // calling user, not by re-implementing the membership check here.
  // RLS on collaboration_assets already requires an active
  // membership row — if this returns nothing, the caller is either
  // not authorized or the asset doesn't exist, and those two cases
  // are deliberately indistinguishable in the response. Selecting
  // thumbnail_storage_path here (not just storage_path) means a
  // thumbnail request is authorized by the exact same RLS check as
  // the full asset — there is no separate, weaker path for
  // thumbnails.
  const userClient = createUserClient(env.supabaseUrl, authHeader);
  const asset = await userClient
    .from('collaboration_assets')
    .select('storage_bucket, storage_path, thumbnail_storage_path, security_required, security_status, security_review_status, file_sha256, scan_evidence')
    .eq('id', body.assetId)
    .eq('is_active', true)
    // RLS already enforces this for a non-admin caller — explicit
    // here too so a pending/failed asset can never be signed even if
    // this function is ever called by something with broader access.
    .eq('upload_status', 'ready')
    .maybeSingle();

  if (asset.data?.security_status === 'infected') return json({ error: 'NOT_AUTHORIZED' }, 403);
  if (asset.data?.security_required && (asset.data.security_status !== 'clean' || asset.data.security_review_status !== 'approved' || !asset.data.scan_evidence?.complete || !asset.data.file_sha256)) return json({ error: 'NOT_AUTHORIZED' }, 403);
  if (!asset.data) return json({ error: 'NOT_AUTHORIZED' }, 403);

  // Fall back to the full image if a thumbnail was requested but
  // none exists yet — a missing thumbnail is never treated as a
  // missing (or unauthorized) asset.
  const path = resolveSignedUrlPath({
    variant: body.variant,
    storagePath: asset.data.storage_path,
    thumbnailStoragePath: asset.data.thumbnail_storage_path,
  });

  // Minting a signed URL for a private bucket needs elevated storage
  // access the user-scoped client doesn't have — but by this point
  // the authorization decision above has already been made.
  const adminClient = createAdminClient(env.supabaseUrl, env.serviceKey);
  const signed = await adminClient.storage.from(asset.data.storage_bucket).createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

  if (signed.error || !signed.data) return json({ error: 'SIGN_FAILED' }, 500);

  return json({
    url: signed.data.signedUrl,
    expiresInSeconds: SIGNED_URL_TTL_SECONDS,
  });
});
