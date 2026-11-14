import { corsHeaders, json } from '../_shared/cors.ts';
import { requiredEnv, createAdminClient, createUserClient } from '../_shared/clients.ts';
import { evaluateUploadVerification } from '../_shared/uploadLifecycle.ts';
import { verifyFileSignature } from '../_shared/attachmentSafety.ts';
import { claimAndRunScan } from '../_shared/scanOrchestrator.ts';
import { validateZipArchive } from '../_shared/zipValidation.ts';

const ZIP_MIME_TYPE = 'application/zip';

const QUARANTINE_BUCKET = 'collaboration-attachments-quarantine';

/**
 * Verifies the uploaded object actually exists (asking Storage, never
 * trusting the browser's claim) and checks its real byte size and
 * file signature — "upload validation," Stage K1.6E section 1's first
 * of three separate conditions. Once validation passes, this function
 * immediately hands the real bytes to the scan orchestrator
 * (malware clearance, the second condition) via claimAndRunScan. The
 * third condition, administrator approval, is a later, separate step
 * (portal-admin-review-attachment) that can only ever act once this
 * function's scan has independently recorded security_status='clean'.
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
  if (!body.attachmentId) return json({ error: 'INVALID_INPUT' }, 400);

  const userClient = createUserClient(env.supabaseUrl, authHeader);
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return json({ error: 'NOT_AUTHENTICATED' }, 401);

  const adminClient = createAdminClient(env.supabaseUrl, env.serviceKey);

  const attachment = await adminClient
    .from('collaboration_feedback_attachments')
    .select('id, storage_bucket, storage_path, byte_size, mime_type, status, uploaded_by')
    .eq('id', body.attachmentId)
    .maybeSingle();
  if (!attachment.data) return json({ error: 'ATTACHMENT_NOT_FOUND' }, 404);

  // Only the uploader themselves may confirm their own upload — an
  // admin reviews via portal-admin-review-attachment, a separate,
  // later step, not this one.
  if (attachment.data.uploaded_by !== userData.user.id) return json({ error: 'NOT_AUTHORIZED' }, 403);

  // Idempotent re-confirm: a duplicate call for an attachment already
  // past 'uploaded' is a no-op success, never a duplicate verification
  // attempt (Stage K1.6C test requirement: "Duplicate confirmation").
  if (attachment.data.status !== 'pending_upload') {
    return json({ ok: true, status: attachment.data.status });
  }

  async function objectExists(path: string): Promise<{ exists: boolean; size?: number }> {
    const slash = path.lastIndexOf('/');
    const listing = await adminClient.storage.from(QUARANTINE_BUCKET).list(path.slice(0, slash), { search: path.slice(slash + 1), limit: 1 });
    const match = listing.data?.find((entry) => entry.name === path.slice(slash + 1));
    return { exists: Boolean(match), size: match?.metadata?.size };
  }

  const found = await objectExists(attachment.data.storage_path);
  const verification = evaluateUploadVerification({
    primaryExists: found.exists,
    primarySize: found.size,
    expectedByteSize: attachment.data.byte_size,
    hasThumbnail: false,
    thumbnailExists: true,
  });

  if (!verification.ok) {
    await adminClient.from('collaboration_feedback_attachments').update({ status: 'failed' }).eq('id', body.attachmentId);
    await adminClient.from('portal_admin_audit_log').insert({
      admin_id: userData.user.id,
      action: 'confirm_attachment_upload_failed',
      target_table: 'collaboration_feedback_attachments',
      target_id: body.attachmentId,
      details: { reason: verification.reason },
    });
    return json({ error: 'VERIFICATION_FAILED', reason: verification.reason }, 422);
  }

  // Download the real bytes for signature + EICAR checks -- the ONLY
  // place this codebase reads attachment content server-side, scoped
  // to exactly this one quarantined object.
  const download = await adminClient.storage.from(QUARANTINE_BUCKET).download(attachment.data.storage_path);
  if (download.error || !download.data) {
    await adminClient.from('collaboration_feedback_attachments').update({ status: 'failed' }).eq('id', body.attachmentId);
    return json({ error: 'VERIFICATION_FAILED', reason: 'DOWNLOAD_FAILED' }, 422);
  }
  const bytes = new Uint8Array(await download.data.arrayBuffer());

  // "Do not mark an attachment clean merely because its filename,
  // extension, MIME type, or file signature appears valid" — this
  // signature check gates 'uploaded' vs 'failed' ONLY (a mismatched
  // signature is a verification failure, not a scan result); it never
  // by itself sets status to 'clean'.
  if (!verifyFileSignature(attachment.data.mime_type, bytes)) {
    await adminClient.from('collaboration_feedback_attachments').update({ status: 'failed' }).eq('id', body.attachmentId);
    await adminClient.from('portal_admin_audit_log').insert({
      admin_id: userData.user.id,
      action: 'confirm_attachment_upload_failed',
      target_table: 'collaboration_feedback_attachments',
      target_id: body.attachmentId,
      details: { reason: 'SIGNATURE_MISMATCH' },
    });
    return json({ error: 'VERIFICATION_FAILED', reason: 'SIGNATURE_MISMATCH' }, 422);
  }

  // Stage K1.6G section 7 — local ZIP archive-safety validation,
  // strictly a SUPPLEMENT to the real Cloudmersive Advanced scan
  // (never a substitute): structurally unsafe metadata (encrypted
  // entries, traversal paths, too many entries, excessive declared
  // expansion, an unsupported compression method, a nested archive or
  // executable/script by extension) is rejected here, as a real
  // validation failure (status='failed'), BEFORE the file is even
  // handed to the scanner — the same "upload validation" gate the
  // signature check above belongs to, not a scan result.
  if (attachment.data.mime_type === ZIP_MIME_TYPE) {
    const zipResult = validateZipArchive(bytes);
    if (!zipResult.ok) {
      await adminClient.from('collaboration_feedback_attachments').update({ status: 'failed' }).eq('id', body.attachmentId);
      await adminClient.from('portal_admin_audit_log').insert({
        admin_id: userData.user.id,
        action: 'confirm_attachment_upload_failed',
        target_table: 'collaboration_feedback_attachments',
        target_id: body.attachmentId,
        details: { reason: zipResult.reason },
      });
      return json({ error: 'VERIFICATION_FAILED', reason: zipResult.reason }, 422);
    }
  }

  // Upload validation has now passed. Mark the row 'awaiting_scan' —
  // literally true now, not a placeholder for "awaiting review" — and
  // immediately hand it to the scan orchestrator, which is the only
  // place security_status is ever written (see scanOrchestrator.ts
  // for the atomic claim/duplicate-request guard).
  await adminClient
    .from('collaboration_feedback_attachments')
    .update({ status: 'awaiting_scan', verified_at: new Date().toISOString() })
    .eq('id', body.attachmentId);

  const scan = await claimAndRunScan(adminClient, body.attachmentId, bytes, attachment.data.storage_path.split('/').pop() ?? 'upload', attachment.data.mime_type, 'auto');

  await adminClient.from('portal_admin_audit_log').insert({
    admin_id: userData.user.id,
    action: 'confirm_attachment_upload',
    target_table: 'collaboration_feedback_attachments',
    target_id: body.attachmentId,
    details: { scanVerdict: scan?.verdict ?? null, scanProvider: scan?.provider ?? null },
  });

  const finalRow = await adminClient.from('collaboration_feedback_attachments').select('status').eq('id', body.attachmentId).single();
  return json({ ok: true, status: finalRow.data?.status ?? 'awaiting_scan' });
});
