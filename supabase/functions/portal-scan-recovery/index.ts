import { corsHeaders, json } from '../_shared/cors.ts';
import { requiredEnv, createAdminClient } from '../_shared/clients.ts';
import { requireAdminOrSystem } from '../_shared/requireAdminOrSystem.ts';
import { claimAndRunScan } from '../_shared/scanOrchestrator.ts';
import { MAX_AUTOMATIC_SCAN_ATTEMPTS, categorizeScanError, computeBackoffSeconds } from '../_shared/scanRetryPolicy.ts';

const QUARANTINE_BUCKET = 'collaboration-attachments-quarantine';
// Processed sequentially, never concurrently, in one invocation — the
// real Cloudmersive free tier advertises ~1 request/second, and
// running several scans in parallel would risk tripping that limit
// immediately (K1.6G section 13). A small per-run cap also keeps this
// well inside the Edge Function's own wall-clock budget.
const MAX_RETRIES_PER_RUN = 5;

/**
 * Stage K1.6G sections 2/3 — the scheduled recovery process for stale
 * scan leases and bounded automatic retries. Two independent passes,
 * both admin-or-system authorized (same dedicated, low-privilege
 * SIGNAL_PORTAL_CRON_SECRET model as portal-admin-cleanup-quarantine —
 * "use the existing dedicated system authorization model," not a new
 * one):
 *
 *   1. Reclaim stale leases: a row still at security_status='scanning'
 *      whose scan_lease_expires_at has passed means the Edge Function
 *      invocation that claimed it never wrote back a result (killed,
 *      crashed, or a genuine platform timeout). Reset it to 'error'
 *      with a real backoff-scheduled scan_next_retry_at. This can
 *      NEVER race with a late write-back from the original attempt:
 *      that attempt's own write-back is gated on scan_request_id
 *      still matching (scanOrchestrator.ts), and reclaim atomically
 *      clears that identifier while rechecking the expired lease.
 *      A completion after reclaim therefore matches no row. If the
 *      completion wins first, reclaim's scanning-state guard fails.
 *
 *   2. Run eligible automatic retries: security_status='error',
 *      never awaiting_scanner_capacity (section 3: "never retry files
 *      known to exceed the scanner's size limit"), never infected
 *      (excluded by construction — 'error' only), under the
 *      MAX_AUTOMATIC_SCAN_ATTEMPTS cap, and due per scan_next_retry_at.
 */
Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);

  const env = requiredEnv();
  if (!env) return json({ error: 'SERVER_CONFIG' }, 500);

  const caller = await requireAdminOrSystem(env.supabaseUrl, request.headers.get('Authorization'), request.headers.get('X-Signal-Portal-Cron-Secret'));
  if (!caller) return json({ error: 'NOT_AUTHORIZED' }, 403);

  const adminClient = createAdminClient(env.supabaseUrl, env.serviceKey);
  const nowIso = new Date().toISOString();
  const systemUid = Deno.env.get('SIGNAL_PORTAL_SYSTEM_UID');
  const attributedTo = caller.kind === 'admin' ? caller.uid : systemUid;

  // ---------- pass 1: reclaim stale leases ----------
  const stale = await adminClient
    .from('collaboration_feedback_attachments')
    .select('id, scan_attempt_count')
    .eq('security_status', 'scanning')
    .lt('scan_lease_expires_at', nowIso);

  let reclaimed = 0;
  for (const row of stale.data ?? []) {
    const category = categorizeScanError('LEASE_EXPIRED');
    const retryable = row.scan_attempt_count < MAX_AUTOMATIC_SCAN_ATTEMPTS;
    const nextRetryAt = retryable ? new Date(Date.now() + computeBackoffSeconds(row.scan_attempt_count, category) * 1000).toISOString() : null;

    // Only moves a row that is STILL 'scanning' with a lease that is
    // STILL expired at write time — a real (if narrow) TOCTOU window
    // between the SELECT above and this UPDATE, closed by re-checking
    // both conditions in the WHERE clause rather than trusting the
    // SELECT snapshot.
    // scan_request_id is explicitly cleared here — this IS the step
    // that invalidates the reclaimed attempt's identity. Without this,
    // a late write-back from the original (now-abandoned) attempt
    // would still match `.eq('scan_request_id', <the old id>)` after
    // reclaim and could silently overwrite this reclaim's own result
    // with a stale verdict. Found and fixed via this stage's own real
    // end-to-end verification, not assumed correct from the design
    // alone.
    const reclaim = await adminClient
      .from('collaboration_feedback_attachments')
      .update({ security_status: 'error', scan_last_error: 'LEASE_EXPIRED', scan_lease_expires_at: null, scan_next_retry_at: nextRetryAt, scan_request_id: null })
      .eq('id', row.id)
      .eq('security_status', 'scanning')
      .lt('scan_lease_expires_at', nowIso)
      .select('id')
      .maybeSingle();
    if (reclaim.data) {
      reclaimed += 1;
      if (attributedTo) {
        await adminClient.from('portal_admin_audit_log').insert({
          admin_id: attributedTo,
          action: 'scan_interrupted',
          target_table: 'collaboration_feedback_attachments',
          target_id: row.id,
          details: { attemptCount: row.scan_attempt_count, retryScheduled: retryable, nextRetryAt },
        });
      }
    }
  }

  // ---------- pass 2: bounded automatic retries ----------
  const eligible = await adminClient
    .from('collaboration_feedback_attachments')
    .select('id, storage_bucket, storage_path, mime_type')
    .eq('security_status', 'error')
    .eq('awaiting_scanner_capacity', false)
    .eq('is_active', true)
    .lt('scan_attempt_count', MAX_AUTOMATIC_SCAN_ATTEMPTS)
    .not('scan_next_retry_at', 'is', null)
    .lt('scan_next_retry_at', nowIso)
    .limit(MAX_RETRIES_PER_RUN);

  let retried = 0;
  let exhausted = 0;
  for (const row of eligible.data ?? []) {
    if (row.storage_bucket !== QUARANTINE_BUCKET) continue; // defensive — should be structurally impossible for an 'error' row
    const bytes = null; // Object scanner streams/hash-pins the stored bytes.
    const filename = row.storage_path.split('/').pop() ?? 'upload';

    const scan = await claimAndRunScan(adminClient, row.id, bytes, filename, row.mime_type, 'scheduler_retry');
    if (scan) {
      retried += 1;
      if (attributedTo) {
        await adminClient.from('portal_admin_audit_log').insert({
          admin_id: attributedTo,
          action: 'retry_scheduled',
          target_table: 'collaboration_feedback_attachments',
          target_id: row.id,
          details: { verdict: scan.verdict, provider: scan.provider },
        });
      }
      const after = await adminClient.from('collaboration_feedback_attachments').select('scan_attempt_count, security_status, scan_next_retry_at').eq('id', row.id).single();
      if (after.data?.security_status === 'error' && after.data.scan_attempt_count >= MAX_AUTOMATIC_SCAN_ATTEMPTS && !after.data.scan_next_retry_at) {
        exhausted += 1;
        if (attributedTo) {
          await adminClient.from('portal_admin_audit_log').insert({
            admin_id: attributedTo,
            action: 'retry_exhausted',
            target_table: 'collaboration_feedback_attachments',
            target_id: row.id,
            details: { attemptCount: after.data.scan_attempt_count },
          });
        }
      }
    }
  }

  return json({ ok: true, reclaimed, retried, exhausted });
});
