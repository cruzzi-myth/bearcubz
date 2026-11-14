import { corsHeaders, json } from '../_shared/cors.ts';
import { requiredEnv, createAdminClient } from '../_shared/clients.ts';
import { requireAdmin } from '../_shared/requireAdmin.ts';

const QUARANTINE_BUCKET = 'collaboration-attachments-quarantine';
const FINAL_BUCKET = 'collaboration-attachments';

/**
 * The manual-review half of K1.6C's malware-scanning design (no
 * automated scanner is configured yet — see the K1.6C report).
 * 'reject' is always safe and simple. 'clean' triggers promotion,
 * which this function treats as explicitly NON-atomic (Stage K1.6C
 * instruction: "Do not assume a cross-bucket move is atomic") —
 * download, then upload, then verify, then (only then) delete the
 * quarantine copy, each step checked, with the row left in a visibly
 * 'promoting' state plus a recorded promotion_error if any step fails
 * partway, rather than silently reverting or silently succeeding.
 * portal-admin-reconcile-attachment-promotion is the recovery path
 * for anything left stuck here.
 */
Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);

  const env = requiredEnv();
  if (!env) return json({ error: 'SERVER_CONFIG' }, 500);

  const admin = await requireAdmin(env.supabaseUrl, request.headers.get('Authorization'));
  if (!admin) return json({ error: 'NOT_AUTHORIZED' }, 403);

  let body: { attachmentId?: string; decision?: 'clean' | 'rejected'; reason?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'INVALID_JSON' }, 400);
  }
  if (!body.attachmentId || (body.decision !== 'clean' && body.decision !== 'rejected')) {
    return json({ error: 'INVALID_INPUT' }, 400);
  }
  const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) : null;

  const adminClient = createAdminClient(env.supabaseUrl, env.serviceKey);

  const attachment = await adminClient
    .from('collaboration_feedback_attachments')
    .select('id, storage_bucket, storage_path, mime_type, byte_size, status, rejection_reason, security_status')
    .eq('id', body.attachmentId)
    .maybeSingle();
  if (!attachment.data) return json({ error: 'ATTACHMENT_NOT_FOUND' }, 404);
  // Stable local binding — TS can't narrow `attachment.data` as
  // non-null across the whole function from the early return above
  // alone (it re-widens inside later closures), so every use below
  // reads from this const instead.
  const row = attachment.data;

  // Idempotent: already resolved -- report the real state, don't
  // re-run (re-running a 'clean'->promote on an already-'available'
  // row would try to re-download/re-upload an object that's no
  // longer in quarantine).
  if (row.status === 'available' || row.status === 'rejected') {
    return json({ ok: true, status: row.status, rejectionReason: row.rejection_reason });
  }
  // Stage K1.6E security gate, explicit and now structurally
  // stronger than K1.6D's: administrator review can ONLY ever act on
  // a row whose security_status is already 'clean' — a real malware-
  // scan verdict (or the EICAR fixture's own 'infected' verdict,
  // which never reaches this state at all), never administrator
  // approval substituting for it. status='clean' is only reachable
  // via claimAndRunScan (scanOrchestrator.ts), so this single check
  // is equivalent to also checking security_status='clean' directly,
  // but the redundant explicit check below is kept anyway — this
  // codebase's established "don't rely on one layer alone" pattern —
  // and because this function must NEVER be the thing that decides a
  // file is malware-free. Administrator approval records an
  // independent, separate decision (review_status), never the
  // security clearance itself (security_status).
  if (row.status !== 'clean' || row.security_status !== 'clean') {
    return json({ error: 'INVALID_STATE', status: row.status, securityStatus: row.security_status }, 409);
  }

  if (body.decision === 'rejected') {
    await adminClient
      .from('collaboration_feedback_attachments')
      .update({ status: 'rejected', review_status: 'rejected', rejection_reason: reason })
      .eq('id', body.attachmentId);
    await adminClient.from('portal_admin_audit_log').insert({
      admin_id: admin.uid,
      action: 'review_attachment_rejected',
      target_table: 'collaboration_feedback_attachments',
      target_id: body.attachmentId,
      details: { reason },
    });
    return json({ ok: true, status: 'rejected', rejectionReason: reason });
  }

  // decision === 'clean' -> administrator approval recorded first
  // (review_status='approved'), independently of the promotion
  // outcome below — if promotion fails partway, the approval decision
  // itself is not lost or ambiguous; the row is simply left in
  // 'promoting' with approval already on record, exactly like K1.6C's
  // existing promotion_error tracking.
  await adminClient
    .from('collaboration_feedback_attachments')
    .update({ status: 'promoting', review_status: 'approved', promotion_attempted_at: new Date().toISOString(), promotion_error: null })
    .eq('id', body.attachmentId);

  const download = await adminClient.storage.from(QUARANTINE_BUCKET).download(row.storage_path);
  if (download.error || !download.data) {
    await adminClient
      .from('collaboration_feedback_attachments')
      .update({ promotion_error: `DOWNLOAD_FAILED: ${download.error?.message ?? 'unknown'}` })
      .eq('id', body.attachmentId);
    return json({ error: 'PROMOTION_FAILED', reason: 'DOWNLOAD_FAILED' }, 500);
  }

  const upload = await adminClient.storage
    .from(FINAL_BUCKET)
    .upload(row.storage_path, download.data, { contentType: row.mime_type, upsert: false });
  if (upload.error) {
    await adminClient
      .from('collaboration_feedback_attachments')
      .update({ promotion_error: `UPLOAD_FAILED: ${upload.error.message}` })
      .eq('id', body.attachmentId);
    return json({ error: 'PROMOTION_FAILED', reason: 'UPLOAD_FAILED' }, 500);
  }

  const slash = row.storage_path.lastIndexOf('/');
  const listing = await adminClient.storage
    .from(FINAL_BUCKET)
    .list(row.storage_path.slice(0, slash), { search: row.storage_path.slice(slash + 1), limit: 1 });
  const landed = listing.data?.find((e) => e.name === row.storage_path.slice(slash + 1));
  const sizeMatches = landed?.metadata?.size == null || landed.metadata.size === row.byte_size;

  if (!landed || !sizeMatches) {
    // Left in 'promoting' with a recorded error -- NOT reverted to
    // 'clean' (which would imply it's safe to retry blindly without
    // knowing the final bucket's real state) and NOT marked
    // 'available' (which would be worse: claiming it's ready when it
    // isn't verified). The reconciliation function resolves this.
    await adminClient
      .from('collaboration_feedback_attachments')
      .update({ promotion_error: 'FINAL_VERIFICATION_FAILED' })
      .eq('id', body.attachmentId);
    return json({ error: 'PROMOTION_FAILED', reason: 'FINAL_VERIFICATION_FAILED' }, 500);
  }

  await adminClient
    .from('collaboration_feedback_attachments')
    .update({ status: 'available', storage_bucket: FINAL_BUCKET, verified_at: new Date().toISOString(), promotion_error: null })
    .eq('id', body.attachmentId);

  // Best-effort cleanup of the quarantine copy -- quarantine is no
  // longer the retrieval path once storage_bucket is FINAL_BUCKET, so
  // a failure here is a harmless leftover object, never a security
  // issue, and is intentionally not allowed to fail the response
  // after the row has already correctly reached 'available'.
  await adminClient.storage.from(QUARANTINE_BUCKET).remove([row.storage_path]).catch(() => {});

  await adminClient.from('portal_admin_audit_log').insert({
    admin_id: admin.uid,
    action: 'review_attachment_promoted',
    target_table: 'collaboration_feedback_attachments',
    target_id: body.attachmentId,
    details: {},
  });

  return json({ ok: true, status: 'available' });
});
