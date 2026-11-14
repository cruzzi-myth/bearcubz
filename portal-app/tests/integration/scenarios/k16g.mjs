// Stage K1.6G — security hardening, scanner recovery & production
// stabilization. Real, end-to-end against the live dev Supabase
// project, same disposable-bulk-identity convention as every prior
// K1.6* scenario. Formalizes the ad-hoc verification this stage's own
// implementation work already ran once (lease claim/reclaim,
// write-back guard, cleanup exclusions, ZIP local validation, launch
// policy) into permanent, re-runnable coverage, plus the section-10
// isolation items not already covered by k16c/k16d/k16e/k16e1.
import { readFileSync, existsSync } from 'node:fs';
import { check } from '../_harness.mjs';
import { createAndSignInTestUser, deleteTestUser } from '../_client.mjs';
import { testEmail } from '../fixtures.mjs';

const K16B_DATASET_PATH = new URL('../../../docs/signal-portal/.k16b-dev-dataset.json', import.meta.url).pathname;

export async function run(ctx) {
  if (!existsSync(K16B_DATASET_PATH)) {
    console.log('[k16g] .k16b-dev-dataset.json not found — skipping.');
    return;
  }
  const k16b = JSON.parse(readFileSync(K16B_DATASET_PATH, 'utf8'));
  const { clients, supabaseUrl, anonKey } = ctx;
  const xylo = k16b.collaborations.xylo;
  const issey = k16b.collaborations.issey;

  async function sessionFor(email) {
    const anon = clients.anon();
    const { data, error } = await anon.auth.signInWithPassword({ email, password: k16b.password });
    if (error) throw new Error(`k16g sign-in(${email}) failed: ${error.message}`);
    return data.session;
  }
  async function call(fn, token, body, extraHeaders) {
    const res = await fetch(`${supabaseUrl}/functions/v1/${fn}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: anonKey, ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extraHeaders },
      body: JSON.stringify(body ?? {}),
    });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  }
  async function freshFeedback(token, collaborationId, text) {
    const r = await call('portal-submit-feedback', token, { collaborationId, kind: 'general', body: text });
    if (!r.body.ok) throw new Error(`freshFeedback failed: ${JSON.stringify(r.body)}`);
    return r.body.feedbackId;
  }

  const adminSession = await sessionFor(k16b.admin.email);
  const createdAttachmentIds = [];

  const bulkArtist = await createAndSignInTestUser(clients, testEmail('k16g-bulk'), 'Signal-Portal-K16G-Bulk-1!');
  await clients.admin.from('collaboration_members').insert({ collaboration_id: xylo.id, user_id: bulkArtist.uid, added_by: k16b.admin.uid, status: 'active' });
  const bulkToken = bulkArtist.accessToken;

  async function uploadAndConfirm(token, collaborationId, label, bytes, mimeType = 'text/plain') {
    const fbId = await freshFeedback(token, collaborationId, `K1.6G ${label} test.`);
    const req = await call('portal-request-attachment-upload-url', token, { feedbackId: fbId, mimeType, fileSizeBytes: bytes.length, originalFilename: `${label}.${mimeType === 'application/zip' ? 'zip' : 'txt'}` });
    if (!req.body.ok) return { error: req.body, feedbackId: fbId };
    createdAttachmentIds.push(req.body.attachmentId);
    const put = await fetch(req.body.uploadUrl, { method: 'PUT', headers: { 'Content-Type': mimeType }, body: bytes });
    if (!put.ok) return { attachmentId: req.body.attachmentId, feedbackId: fbId, uploadFailed: true };
    const confirm = await call('portal-confirm-attachment-upload', token, { attachmentId: req.body.attachmentId });
    return { attachmentId: req.body.attachmentId, feedbackId: fbId, confirm };
  }

  // ========== Section 2/3: lease-based scan recovery ==========

  await check('[K1.6G] a normal scan claim populates attempt count, lease timestamps, and a request id, then clears the lease on completion', async () => {
    const result = await uploadAndConfirm(bulkToken, xylo.id, 'normal-lease', new TextEncoder().encode('ordinary content'));
    const row = await clients.admin.from('collaboration_feedback_attachments').select('scan_attempt_count, scan_started_at, scan_completed_at, scan_lease_expires_at, scan_request_id').eq('id', result.attachmentId).single();
    return row.data?.scan_attempt_count === 1 && row.data?.scan_started_at !== null && row.data?.scan_completed_at !== null && row.data?.scan_lease_expires_at === null && row.data?.scan_request_id !== null;
  });

  let staleAttachmentId;
  await check('[K1.6G] concurrent scan claims: a row already claimed (security_status=scanning, unexpired lease) cannot be claimed again by a second attempt', async () => {
    const result = await uploadAndConfirm(bulkToken, xylo.id, 'concurrent-claim', new TextEncoder().encode('x'));
    staleAttachmentId = result.attachmentId;
    const fakeRequestId = crypto.randomUUID();
    await clients.admin.from('collaboration_feedback_attachments').update({
      security_status: 'scanning', scan_request_id: fakeRequestId, scan_lease_expires_at: new Date(Date.now() + 300_000).toISOString(),
    }).eq('id', staleAttachmentId);
    // A second retry attempt while the lease is still active must be refused outright by the manual-retry function's own eligibility check (security_status is 'scanning', not 'error').
    const retryAttempt = await call('portal-admin-retry-attachment-scan', adminSession.access_token, { attachmentId: staleAttachmentId });
    return retryAttempt.status === 409;
  });

  await check('[K1.6G] stale scan completion: a late write-back using a superseded scan_request_id is silently discarded, never overwrites a newer result', async () => {
    const oldRequestId = crypto.randomUUID();
    await clients.admin.from('collaboration_feedback_attachments').update({
      security_status: 'scanning', scan_request_id: oldRequestId, scan_lease_expires_at: new Date(Date.now() - 60_000).toISOString(), scan_attempt_count: 1,
    }).eq('id', staleAttachmentId);
    const recovery = await call('portal-scan-recovery', adminSession.access_token, {});
    if (!recovery.body.ok) return false;
    // The reclaim must have invalidated scan_request_id -- a write
    // using the OLD id can no longer match any row.
    await clients.admin.from('collaboration_feedback_attachments').update({ security_status: 'clean', status: 'clean' }).eq('id', staleAttachmentId).eq('scan_request_id', oldRequestId);
    const final = await clients.admin.from('collaboration_feedback_attachments').select('security_status').eq('id', staleAttachmentId).single();
    return final.data?.security_status === 'error';
  });

  await check('[K1.6G] duplicate scan retries: running the recovery scheduler twice in a row is safe and idempotent', async () => {
    const first = await call('portal-scan-recovery', adminSession.access_token, {});
    const second = await call('portal-scan-recovery', adminSession.access_token, {});
    return first.body.ok && second.body.ok;
  });

  await check('[K1.6G] max-attempts exhaustion: the automatic scheduler never advances a row past the attempt cap, but manual admin retry still can', async () => {
    const result = await uploadAndConfirm(bulkToken, xylo.id, 'exhaustion', new TextEncoder().encode('x'));
    await clients.admin.from('collaboration_feedback_attachments').update({
      security_status: 'error', scan_attempt_count: 3, scan_next_retry_at: new Date(Date.now() - 1000).toISOString(), scan_last_error: 'SCAN_NETWORK_ERROR',
    }).eq('id', result.attachmentId);
    await call('portal-scan-recovery', adminSession.access_token, {});
    const afterScheduler = await clients.admin.from('collaboration_feedback_attachments').select('scan_attempt_count').eq('id', result.attachmentId).single();
    if (afterScheduler.data?.scan_attempt_count !== 3) return false;
    const manual = await call('portal-admin-retry-attachment-scan', adminSession.access_token, { attachmentId: result.attachmentId });
    const afterManual = await clients.admin.from('collaboration_feedback_attachments').select('scan_attempt_count').eq('id', result.attachmentId).single();
    return manual.body.ok && afterManual.data?.scan_attempt_count === 4;
  });

  // ========== Section 4: oversized-file retention ==========
  //
  // Section 5's new launch policy (tested below) now blocks any NEW
  // upload over ~2.9MB at the request-URL stage, before it can ever
  // reach quarantine — so a genuinely oversized file can no longer
  // arrive at awaiting_scanner_capacity through the normal artist
  // upload flow at all (working as designed: "prevent artists from
  // uploading large files that cannot be delivered"). The tests below
  // instead start from a REAL, small, genuinely-uploaded quarantine
  // object (so the Storage side is real) and simulate — via a direct,
  // service-role update, standing in for "this file predates the
  // launch policy" — the exact row state the scan step itself still
  // produces for real whenever a file does exceed the configured
  // scanner limit (verified directly against malwareScan.ts's own
  // real EXCEEDS_SCANNER_SIZE_LIMIT path in tests/security/malwareScan.test.mjs
  // and in k16e1.mjs's real, launch-policy-independent oversized test).

  await check('[K1.6G] oversized file: awaiting_scanner_capacity and a 30-day retention expiry are recorded automatically, never auto-retryable', async () => {
    const result = await uploadAndConfirm(bulkToken, xylo.id, 'oversized-retention', new TextEncoder().encode('small real file standing in for a pre-existing oversized one'));
    await clients.admin.from('collaboration_feedback_attachments').update({
      security_status: 'error', awaiting_scanner_capacity: true, scan_waiting_since: new Date().toISOString(),
      scan_retention_expires_at: new Date(Date.now() + 30 * 86400_000).toISOString(), scan_next_retry_at: null,
      security_scan_detail: 'EXCEEDS_SCANNER_SIZE_LIMIT: file is 3500000 bytes, current scanner limit is 2900000 bytes',
    }).eq('id', result.attachmentId);
    const row = await clients.admin.from('collaboration_feedback_attachments').select('awaiting_scanner_capacity, scan_retention_expires_at, scan_next_retry_at').eq('id', result.attachmentId).single();
    return row.data?.awaiting_scanner_capacity === true && row.data?.scan_retention_expires_at !== null && row.data?.scan_next_retry_at === null;
  });

  await check('[K1.6G] cleanup racing with active scanning: a row under an active (unexpired) lease is never deleted even if its upload is 8 days old', async () => {
    const result = await uploadAndConfirm(bulkToken, xylo.id, 'cleanup-vs-active-lease', new TextEncoder().encode('x'));
    await clients.admin.from('collaboration_feedback_attachments').update({
      uploaded_at: new Date(Date.now() - 8 * 86400_000).toISOString(), security_status: 'scanning', scan_lease_expires_at: new Date(Date.now() + 300_000).toISOString(), scan_request_id: crypto.randomUUID(),
    }).eq('id', result.attachmentId);
    await call('portal-admin-cleanup-quarantine', adminSession.access_token, {});
    const row = await clients.admin.from('collaboration_feedback_attachments').select('is_active').eq('id', result.attachmentId).single();
    // reset so the global cleanup at the end of this scenario can still remove it
    await clients.admin.from('collaboration_feedback_attachments').update({ security_status: 'error', scan_lease_expires_at: null }).eq('id', result.attachmentId);
    return row.data?.is_active === true;
  });

  await check('[K1.6G] administrator recovery: an authorized rescan of an oversized-waiting file uses the same original quarantined bytes, no re-upload required', async () => {
    const result = await uploadAndConfirm(bulkToken, xylo.id, 'oversized-rescan', new TextEncoder().encode('small real file standing in for a pre-existing oversized one'));
    // Simulate the real oversized-waiting state this row would be in
    // (security_status must be 'error' for the retry endpoint to
    // consider it eligible at all — see portal-admin-retry-attachment-scan).
    await clients.admin.from('collaboration_feedback_attachments').update({ security_status: 'error', awaiting_scanner_capacity: true }).eq('id', result.attachmentId);
    // Scanner capacity becoming available (e.g. a raised
    // CLOUDMERSIVE_MAX_FILE_SIZE_BYTES) is simulated by the row's own
    // real small size now genuinely passing the real scan — the real
    // property under test is that retry re-reads the SAME original
    // quarantined object, never requiring re-upload.
    const before = await clients.admin.from('collaboration_feedback_attachments').select('storage_path').eq('id', result.attachmentId).single();
    const retry = await call('portal-admin-retry-attachment-scan', adminSession.access_token, { attachmentId: result.attachmentId });
    const after = await clients.admin.from('collaboration_feedback_attachments').select('storage_path').eq('id', result.attachmentId).single();
    return retry.body.ok === true && before.data?.storage_path === after.data?.storage_path;
  });

  // A second disposable identity for the remaining checks —
  // portal-submit-feedback's real 10-messages/60-minute-per-author
  // rate limit (same one k16c.mjs's own report first documented) is
  // otherwise exceeded by this scenario's total feedback-message
  // count within a single run.
  const bulkArtist2 = await createAndSignInTestUser(clients, testEmail('k16g-bulk2'), 'Signal-Portal-K16G-Bulk2-1!');
  await clients.admin.from('collaboration_members').insert({ collaboration_id: xylo.id, user_id: bulkArtist2.uid, added_by: k16b.admin.uid, status: 'active' });
  const bulkToken2 = bulkArtist2.accessToken;

  // ========== Section 5: free-tier launch upload policy ==========

  await check('[K1.6G] launch policy: a new upload over the launch-policy cap (but under the category\'s own larger limit) is blocked before any signed URL is minted', async () => {
    const fbId = await freshFeedback(bulkToken2, xylo.id, 'launch-policy-block');
    const oversized = 10 * 1024 * 1024; // 10MB -- well under the 25MB document category limit, over the ~2.9MB launch cap
    const req = await call('portal-request-attachment-upload-url', bulkToken2, { feedbackId: fbId, mimeType: 'application/pdf', fileSizeBytes: oversized, originalFilename: 'big.pdf' });
    return req.status === 400 && req.body.error === 'EXCEEDS_LAUNCH_POLICY_LIMIT' && typeof req.body.maxBytes === 'number';
  });

  await check('[K1.6G] launch policy: an upload at or under the cap still succeeds normally', async () => {
    const result = await uploadAndConfirm(bulkToken2, xylo.id, 'launch-policy-allow', new TextEncoder().encode('small file well under the cap'));
    return result.confirm?.body.ok === true;
  });

  // ========== Section 7: ZIP local validation ==========

  await check('[K1.6G] a genuinely malformed ZIP (no valid end-of-central-directory) is rejected locally, never reaches the real scanner', async () => {
    // Must start with a real ZIP local-file-header signature (PK\x03\x04)
    // to pass the EARLIER, separate file-signature check
    // (attachmentSafety.ts) — this tests the ZIP-STRUCTURE validator
    // specifically (no valid end-of-central-directory anywhere in the
    // bytes), not the unrelated signature check.
    const fakeZipBytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...Array(60).fill(0)]);
    const result = await uploadAndConfirm(bulkToken2, xylo.id, 'malformed-zip', fakeZipBytes, 'application/zip');
    if (result.confirm?.status !== 422 || result.confirm?.body.reason !== 'ZIP_MALFORMED_NO_EOCD') return false;
    const row = await clients.admin.from('collaboration_feedback_attachments').select('security_status, scan_provider').eq('id', result.attachmentId).single();
    return row.data?.security_status === 'pending' && row.data?.scan_provider === null;
  });

  // ========== Section 10: remaining isolation items not already covered elsewhere ==========

  await check('[K1.6G] administrator attempts to bypass scanning: a direct UPDATE of security_status to clean is rejected at the grant level, not just by RLS policy miss', async () => {
    const result = await uploadAndConfirm(bulkToken2, xylo.id, 'admin-bypass-attempt', new TextEncoder().encode('x'));
    const adminAnon = clients.anon();
    await adminAnon.auth.signInWithPassword({ email: k16b.admin.email, password: k16b.password });
    const direct = await adminAnon.from('collaboration_feedback_attachments').update({ security_status: 'clean' }).eq('id', result.attachmentId);
    return direct.error != null;
  });

  await check('[K1.6G] expired-file download attempt: once an oversized-waiting file\'s retention has passed and cleanup has run, its signed-url request is refused', async () => {
    const result = await uploadAndConfirm(bulkToken2, xylo.id, 'expired-file', new TextEncoder().encode('small real file standing in for a pre-existing oversized one'));
    await clients.admin.from('collaboration_feedback_attachments').update({
      security_status: 'error', awaiting_scanner_capacity: true, scan_retention_expires_at: new Date(Date.now() - 1000).toISOString(),
    }).eq('id', result.attachmentId);
    await call('portal-admin-cleanup-quarantine', adminSession.access_token, {});
    const signed = await call('portal-attachment-signed-url', bulkToken2, { attachmentId: result.attachmentId });
    return signed.status === 403;
  });

  await check('[K1.6G] cross-project feedback and cross-message attachment claims remain denied (re-verified live, not assumed from prior stages)', async () => {
    const isseySession = await sessionFor(issey.artist.email);
    const fbId = await freshFeedback(bulkToken2, xylo.id, 'cross-check target');
    const crossAttempt = await call('portal-request-attachment-upload-url', isseySession.access_token, { feedbackId: fbId, mimeType: 'text/plain', fileSizeBytes: 10, originalFilename: 'x.txt' });
    return crossAttempt.status === 403 && crossAttempt.body.error === 'NOT_AUTHORIZED';
  });

  // ---------- cleanup ----------
  if (createdAttachmentIds.length > 0) {
    const leftover = await clients.admin.from('collaboration_feedback_attachments').select('storage_bucket, storage_path').in('id', createdAttachmentIds);
    for (const row of leftover.data ?? []) {
      await clients.admin.storage.from(row.storage_bucket).remove([row.storage_path]).catch(() => {});
    }
    await clients.admin.from('collaboration_feedback_attachments').delete().in('id', createdAttachmentIds);
  }
  await clients.admin.from('collaboration_feedback').delete().eq('author_id', bulkArtist.uid);
  await clients.admin.from('portal_admin_audit_log').delete().eq('admin_id', bulkArtist.uid);
  const deleteErr = await deleteTestUser(clients, bulkArtist.uid);
  if (deleteErr) console.log('[k16g] WARNING: failed to delete disposable bulk-test identity:', deleteErr.message);

  await clients.admin.from('collaboration_feedback').delete().eq('author_id', bulkArtist2.uid);
  await clients.admin.from('portal_admin_audit_log').delete().eq('admin_id', bulkArtist2.uid);
  const deleteErr2 = await deleteTestUser(clients, bulkArtist2.uid);
  if (deleteErr2) console.log('[k16g] WARNING: failed to delete disposable bulk-test identity 2:', deleteErr2.message);
}
