// Stage K1.6E — the one place security_status is ever written to a
// terminal/scanning value. Stage K1.6G rebuilt this as a real lease:
// claim (atomic, via a Postgres function so the attempt-count
// increment is part of the same statement), run the scan, write back
// ONLY if the lease's scan_request_id still matches what was claimed.
//
// The write-back guard is the actual fix for K1.6F's stuck-'scanning'
// gap: if this function's own process gets killed mid-scan, nothing
// ever writes a terminal result for that attempt, and the row sits at
// security_status='scanning' with a real scan_lease_expires_at. The
// scheduled recovery job (portal-scan-recovery) is the only other
// thing that ever touches scan_request_id (by reclaiming the row back
// to 'error' once the lease has genuinely expired) — so if THIS
// attempt's scan call eventually does return (a late response after
// the platform already killed and restarted the function, or a slow
// network path), its write-back's `scan_request_id` match fails
// (reclaim already issued a new, different id, or the row moved on to
// a different attempt entirely) and the stale write is silently
// discarded. A late response can never overwrite a newer result.
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { type ScanOptions } from './malwareScan.ts';
import { cloudmersiveScanner, sha256, type ScanEvidence } from './scannerProvider.ts';
import { scanStoredObject } from './objectScanner.ts';
import { MAX_AUTOMATIC_SCAN_ATTEMPTS, SCAN_LEASE_SECONDS, categorizeScanError, computeBackoffSeconds, isAutoRetryable } from './scanRetryPolicy.ts';

export type ClaimSource = 'auto' | 'manual_admin_retry' | 'scheduler_retry';

/**
 * Atomically claims the row for a fresh scan attempt via the
 * claim_attachment_for_scan() Postgres function (security_status IN
 * ('pending','error') -> 'scanning', attempt_count incremented, a
 * fresh scan_request_id issued, lease set). Runs the real scan, then
 * writes back the verdict ONLY if scan_request_id still matches.
 *
 * `source` only affects whether MAX_AUTOMATIC_SCAN_ATTEMPTS is
 * enforced as a hard pre-check: an administrator's own explicit,
 * already-authenticated-and-audited manual retry (portal-admin-retry-
 * attachment-scan) is allowed to exceed it — per section 8, a manual
 * retry "must not exceed configured retry restrictions WITHOUT an
 * explicit, audited recovery policy," and the admin-auth + audit-log
 * path IS that explicit, audited policy. The automatic scheduler
 * (source:'scheduler_retry') and the client-triggered first attempt
 * (source:'auto') both respect the hard cap.
 *
 * Returns the ScanResult actually recorded, or null if this call lost
 * the claim race / the row wasn't eligible (already scanning, already
 * terminal, or — for an automatic source — attempts exhausted).
 */
export async function claimAndRunScan(
  adminClient: SupabaseClient,
  attachmentId: string,
  bytes: Uint8Array | null,
  filename: string,
  mimeType: string,
  source: ClaimSource = 'auto',
  scanOptions: ScanOptions = {},
): Promise<ScanEvidence | null> {
  if (source !== 'manual_admin_retry') {
    const current = await adminClient.from('collaboration_feedback_attachments').select('scan_attempt_count').eq('id', attachmentId).maybeSingle();
    if ((current.data?.scan_attempt_count ?? 0) >= MAX_AUTOMATIC_SCAN_ATTEMPTS) return null;
  }

  const requestId = crypto.randomUUID();
  const claim = await adminClient.rpc(source === 'manual_admin_retry' ? 'claim_attachment_for_manual_scan' : 'claim_attachment_for_scan', {
    p_attachment_id: attachmentId,
    p_request_id: requestId,
    p_lease_seconds: SCAN_LEASE_SECONDS,
  });
  const claimedRow = claim.data?.[0];
  if (claim.error || !claimedRow) return null;

  const row = await adminClient.from('collaboration_feedback_attachments').select('*').eq('id', attachmentId).eq('scan_request_id', requestId).single();
  if (!row.data) return null;
  const result = bytes
    ? await cloudmersiveScanner(bytes, scanOptions).scan({ attemptId: requestId, fileSha256: await sha256(bytes), fileSize: bytes.length, filename, mimeType })
    : await scanStoredObject(adminClient, 'attachment', row.data, requestId);
  await adminClient.from('portal_scanner_usage').upsert({ attempt_id: requestId, provider: result.provider, verdict: result.verdict, file_size: result.fileSize }, { onConflict: 'attempt_id,provider' });
  const scannedAt = new Date().toISOString();

  // Verified write-back: every branch below's `.eq('scan_request_id',
  // requestId)` is the real defense against a stale/late response. If
  // the lease was reclaimed by the scheduler in the meantime,
  // scan_request_id no longer matches and the update silently matches
  // zero rows.
  if (result.verdict === 'clean' && result.complete && result.withinLimits) {
    await adminClient
      .from('collaboration_feedback_attachments')
      .update({
        security_status: 'clean',
        status: 'clean', // the existing (previously-dead) lifecycle value -- "scan passed, awaiting administrator review"
        scan_provider: result.provider,
        file_sha256: result.fileSha256 || null,
        scan_evidence: result,
        security_scan_detail: result.detail,
        scanned_at: scannedAt,
        scan_completed_at: scannedAt,
        scan_lease_expires_at: null,
        scan_last_error: null,
        awaiting_scanner_capacity: false,
      })
      .eq('id', attachmentId)
      .eq('scan_request_id', requestId);
  } else if (result.verdict === 'infected') {
    await adminClient
      .from('collaboration_feedback_attachments')
      .update({
        security_status: 'infected',
        status: 'rejected',
        scan_provider: result.provider,
        file_sha256: result.fileSha256 || null,
        scan_evidence: result,
        security_scan_detail: result.detail,
        scanned_at: scannedAt,
        scan_completed_at: scannedAt,
        scan_lease_expires_at: null,
        scan_next_retry_at: null, // infected is final -- never automatically retried
        rejection_reason: 'Automated malware scan flagged this file. It was never released and cannot be recovered through this workflow.',
      })
      .eq('id', attachmentId)
      .eq('scan_request_id', requestId);
  } else {
    // 'error' -- status stays 'awaiting_scan'. The next automatic
    // retry (if any) is scheduled with real exponential backoff +
    // jitter; an oversized file is flagged awaiting_scanner_capacity
    // and gets NO automatic next_retry_at at all (section 4: never
    // auto-retried, only an administrator-initiated rescan clears it).
    const category = categorizeScanError(result.detail);
    const isSizeLimit = category === 'unsupported_file_size' || result.verdict === 'unsupported';
    const retryable = isAutoRetryable(result.detail) && claimedRow.attempt_count < MAX_AUTOMATIC_SCAN_ATTEMPTS;
    const nextRetryAt = retryable ? new Date(Date.now() + computeBackoffSeconds(claimedRow.attempt_count, category) * 1000).toISOString() : null;

    await adminClient
      .from('collaboration_feedback_attachments')
      .update({
        security_status: 'error',
        scan_provider: result.provider,
        file_sha256: result.fileSha256 || null,
        scan_evidence: result,
        security_scan_detail: result.detail,
        scanned_at: scannedAt,
        scan_completed_at: scannedAt,
        scan_lease_expires_at: null,
        scan_last_error: result.detail,
        scan_next_retry_at: nextRetryAt,
        awaiting_scanner_capacity: isSizeLimit,
        scan_waiting_since: isSizeLimit ? scannedAt : null,
        scan_retention_expires_at: isSizeLimit ? new Date(Date.now() + 30 * 86400_000).toISOString() : null,
      })
      .eq('id', attachmentId)
      .eq('scan_request_id', requestId);
  }

  return result;
}
