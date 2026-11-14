import { corsHeaders, json } from '../_shared/cors.ts';
import { requiredEnv, createAdminClient, createUserClient } from '../_shared/clients.ts';
import { getArtistUploadMaxBytes } from '../_shared/uploadPolicy.ts';

// Mirrors the approved K1.6C limits exactly.
const CATEGORY_RULES: Record<string, { maxBytes: number; mimeToExt: Record<string, string> }> = {
  document: {
    maxBytes: 25 * 1024 * 1024,
    mimeToExt: {
      'application/pdf': 'pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
      'text/plain': 'txt',
    },
  },
  image: {
    maxBytes: 15 * 1024 * 1024,
    mimeToExt: { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' },
  },
  audio: {
    maxBytes: 100 * 1024 * 1024,
    mimeToExt: { 'audio/x-wav': 'wav', 'audio/wav': 'wav', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a' },
  },
  // Stage K1.6E.1 — reuses the 'document' category's own 25MB limit
  // rather than a new, larger allowance ("subject to existing storage
  // limits"). Zipping an already-compressed audio file barely shrinks
  // it (MP3/WAV/M4A are not meaningfully zip-compressible), so this
  // deliberately does NOT get the 100MB audio allowance — a 25MB cap
  // is the right size for its real use case (bundling documents/
  // images), not a backdoor around the audio limit.
  zip: {
    maxBytes: 25 * 1024 * 1024,
    mimeToExt: { 'application/zip': 'zip' },
  },
};

function rulesForMime(mimeType: string) {
  for (const category of Object.values(CATEGORY_RULES)) {
    if (mimeType in category.mimeToExt) return category;
  }
  return null;
}

const QUARANTINE_BUCKET = 'collaboration-attachments-quarantine';

/**
 * Artist- or admin-authorized upload authorization for a feedback
 * attachment. The caller's own feedbackId is the ONLY identifier this
 * function trusts for authorization — collaborationId is NEVER
 * accepted as a request parameter, and is instead derived here by
 * reading the feedback row through the CALLER's own RLS-scoped
 * client, which simultaneously proves two things in one query: the
 * message exists, and the caller is either its author or an admin
 * (collaboration_feedback's own "member select own thread" /
 * "admin select all feedback" policies — the exact same two callers
 * K1.6C's security review requires). There is no path by which a
 * caller can attach to a message they didn't author, even one in a
 * collaboration they're genuinely an active member of.
 */
Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);

  const authHeader = request.headers.get('Authorization');
  if (!authHeader) return json({ error: 'NOT_AUTHENTICATED' }, 401);

  const env = requiredEnv();
  if (!env) return json({ error: 'SERVER_CONFIG' }, 500);

  let body: { feedbackId?: string; mimeType?: string; fileSizeBytes?: number; originalFilename?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'INVALID_JSON' }, 400);
  }

  if (!body.feedbackId) return json({ error: 'INVALID_INPUT' }, 400);
  if (!body.mimeType) return json({ error: 'INVALID_MIME_TYPE' }, 400);
  const rules = rulesForMime(body.mimeType);
  if (!rules) return json({ error: 'INVALID_MIME_TYPE' }, 400);
  const ext = rules.mimeToExt[body.mimeType];

  if (!Number.isFinite(body.fileSizeBytes) || body.fileSizeBytes! <= 0 || body.fileSizeBytes! > rules.maxBytes) {
    return json({ error: 'FILE_TOO_LARGE' }, 400);
  }

  // Stage K1.6G section 5 — the launch-time policy: NEW uploads are
  // blocked here, before any quarantine row or signed URL is ever
  // created, if they exceed what the current (free-tier) scanner can
  // genuinely process. This is deliberately separate from, and
  // layered on top of, the category limit just checked above — that
  // limit (document 25MB, image 15MB, audio 100MB, zip 25MB) is left
  // completely unchanged in the data model, ready for a future paid
  // plan the moment the launch policy is relaxed. This check has no
  // effect on any attachment already in quarantine from before this
  // policy existed — those keep following the existing
  // awaiting_scanner_capacity / 30-day-retention path (section 4),
  // never retroactively touched. The effective limit is read fresh
  // on every call (getArtistUploadMaxBytes()), never a second,
  // independently-hardcoded number.
  const launchPolicyMaxBytes = getArtistUploadMaxBytes();
  if (body.fileSizeBytes! > launchPolicyMaxBytes) {
    return json({ error: 'EXCEEDS_LAUNCH_POLICY_LIMIT', maxBytes: launchPolicyMaxBytes }, 400);
  }

  const originalFilename = (body.originalFilename ?? 'attachment').slice(0, 255);

  const userClient = createUserClient(env.supabaseUrl, authHeader);
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return json({ error: 'NOT_AUTHENTICATED' }, 401);

  // RLS-gated lookup first (existence + "caller can at least SEE this
  // message" — "message doesn't exist" and "caller can't see it" stay
  // indistinguishable, same pattern as every other check here).
  //
  // That alone is NOT sufficient authorization to ATTACH, though:
  // collaboration_feedback's own SELECT policy also makes every admin
  // reply visible to the ordinary member it's addressed to
  // (author_id = auth.uid() OR is_admin_reply) — an artist who can
  // merely SEE an admin's reply must not be able to attach a file to
  // it. Attaching requires AUTHORSHIP specifically: the caller must be
  // the message's own author_id. For an admin attaching to their own
  // reply, author_id is already their own uid (portal-admin-reply-feedback
  // sets author_id: admin.uid) — so this single rule covers both the
  // artist and admin cases with no separate admin bypass needed.
  const feedback = await userClient
    .from('collaboration_feedback')
    .select('id, collaboration_id, author_id')
    .eq('id', body.feedbackId)
    .maybeSingle();
  if (!feedback.data || feedback.data.author_id !== userData.user.id) {
    return json({ error: 'NOT_AUTHORIZED' }, 403);
  }

  const adminClient = createAdminClient(env.supabaseUrl, env.serviceKey);

  // 5-per-message limit: a best-effort pre-check for a fast, clear
  // error message. The REAL, atomic enforcement is the database
  // trigger (attachment_count_limit) on the insert below — this
  // check existing or not, the trigger is what a concurrent-request
  // race can never get past.
  const existingCount = await adminClient
    .from('collaboration_feedback_attachments')
    .select('id', { count: 'exact', head: true })
    .eq('feedback_id', body.feedbackId)
    .eq('is_active', true);
  if ((existingCount.count ?? 0) >= 5) return json({ error: 'TOO_MANY_ATTACHMENTS' }, 409);

  const attachmentId = crypto.randomUUID();
  const storagePath = `${feedback.data.collaboration_id}/${attachmentId}.${ext}`;

  const signed = await adminClient.storage.from(QUARANTINE_BUCKET).createSignedUploadUrl(storagePath);
  if (signed.error || !signed.data) return json({ error: 'SIGN_FAILED' }, 500);

  const inserted = await adminClient
    .from('collaboration_feedback_attachments')
    .insert({
      id: attachmentId,
      feedback_id: body.feedbackId,
      collaboration_id: feedback.data.collaboration_id,
      storage_bucket: QUARANTINE_BUCKET,
      storage_path: storagePath,
      original_filename: originalFilename,
      mime_type: body.mimeType,
      byte_size: body.fileSizeBytes,
      uploaded_by: userData.user.id,
    })
    .select('id')
    .single();

  if (inserted.error) {
    const code = inserted.error.message?.includes('TOO_MANY_ATTACHMENTS') ? 'TOO_MANY_ATTACHMENTS' : 'METADATA_FAILED';
    return json({ error: code }, code === 'TOO_MANY_ATTACHMENTS' ? 409 : 500);
  }

  await adminClient.from('portal_admin_audit_log').insert({
    admin_id: userData.user.id,
    action: 'request_attachment_upload_url',
    target_table: 'collaboration_feedback_attachments',
    target_id: attachmentId,
    details: { feedback_id: body.feedbackId, mime_type: body.mimeType },
  });

  return json({ ok: true, attachmentId, uploadUrl: signed.data.signedUrl, path: signed.data.path });
});
