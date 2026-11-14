import { corsHeaders, json } from '../_shared/cors.ts';
import { requiredEnv, createAdminClient, createUserClient } from '../_shared/clients.ts';

const SIGNED_URL_TTL_SECONDS = 5 * 60;

const FINAL_BUCKET = 'collaboration-attachments';

/**
 * Mirrors portal-signed-url, for the attachments table — with
 * explicit, function-body checks that are NOT safe to leave to RLS
 * alone, unlike portal-signed-url: Stage K1.6D added a policy letting
 * the UPLOADER read their OWN row regardless of status (so they can
 * see "pending review" / "rejected" after a refresh — see that
 * migration's own notes). That means an RLS-gated SELECT here can now
 * legitimately return a row whose real storage_bucket is still
 * QUARANTINE. Stage K1.6E section 8 requires this function to
 * independently re-verify every condition retrieval depends on, not
 * just `status`: malware clearance (security_status), administrator
 * approval (review_status), AND that the row's storage_bucket is
 * genuinely the final bucket — not merely trust that status='available'
 * implies all three (it does, via the DB's own
 * attachment_available_requires_clearance check constraint, but this
 * function checks explicitly anyway, matching this codebase's
 * established "don't rely on one layer alone" convention). A revoked
 * member's SELECT returns nothing either way, so there is nothing to
 * check status on for them.
 */
Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);

  const authHeader = request.headers.get('Authorization');
  if (!authHeader) return json({ error: 'NOT_AUTHENTICATED' }, 401);

  const env = requiredEnv();
  if (!env) return json({ error: 'SERVER_CONFIG' }, 500);

  let body: { attachmentId?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'INVALID_JSON' }, 400);
  }
  if (!body.attachmentId) return json({ error: 'INVALID_ATTACHMENT' }, 400);

  const userClient = createUserClient(env.supabaseUrl, authHeader);
  const attachment = await userClient
    .from('collaboration_feedback_attachments')
    .select('storage_bucket, storage_path, status, security_status, review_status')
    .eq('id', body.attachmentId)
    .maybeSingle();

  if (
    !attachment.data ||
    attachment.data.status !== 'available' ||
    attachment.data.security_status !== 'clean' ||
    attachment.data.review_status !== 'approved' ||
    attachment.data.storage_bucket !== FINAL_BUCKET
  ) {
    return json({ error: 'NOT_AUTHORIZED' }, 403);
  }

  const adminClient = createAdminClient(env.supabaseUrl, env.serviceKey);
  const signed = await adminClient.storage
    .from(attachment.data.storage_bucket)
    .createSignedUrl(attachment.data.storage_path, SIGNED_URL_TTL_SECONDS);

  if (signed.error || !signed.data) return json({ error: 'SIGN_FAILED' }, 500);

  // Documented limit (Stage K1.6E section 8): this check only governs
  // whether a NEW signed URL is minted. A URL already handed to a
  // client before a revocation/rejection remains valid against
  // Supabase Storage until its own short TTL (SIGNED_URL_TTL_SECONDS,
  // 5 minutes) expires — Storage itself has no mechanism to revoke an
  // already-issued signed URL early. The short TTL bounds this window;
  // it does not eliminate it.
  return json({ ok: true, url: signed.data.signedUrl });
});
