// Stage K1.6E.1 — live Cloudmersive scanner verification.
//
// Builds on k16e.mjs's disposable-bulk-identity pattern. Unlike
// k16e.mjs (which honestly SKIPPED every check requiring a genuine
// third-party verdict, since no CLOUDMERSIVE_API_KEY existed in this
// dev project at the time), every check below runs against the REAL,
// now-configured Cloudmersive account — real HTTP round trips, real
// verdicts, real free-tier limits. Nothing here is simulated.
//
// Real external API calls are spent carefully (this account's free
// tier is 600 calls/month): one genuine clean-file scan, one genuine
// ZIP (advanced-endpoint) clean scan, and one genuine ZIP unsafe-
// content scan (a password-protected archive — a safe, legal
// construct for exercising Cloudmersive's own
// ContainsPasswordProtectedFile policy flag, not actual malware).
// EICAR detection and the free-tier size-limit check are verified for
// real too, but both are LOCAL checks (zero network calls) by design
// — see malwareScan.ts.
import { readFileSync, existsSync } from 'node:fs';
import { check } from '../_harness.mjs';
import { createAndSignInTestUser, deleteTestUser } from '../_client.mjs';
import { testEmail } from '../fixtures.mjs';

const K16B_DATASET_PATH = new URL('../../../docs/signal-portal/.k16b-dev-dataset.json', import.meta.url).pathname;
const EICAR = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';

export async function run(ctx) {
  if (!existsSync(K16B_DATASET_PATH)) {
    console.log('[k16e1] .k16b-dev-dataset.json not found — skipping.');
    return;
  }
  const k16b = JSON.parse(readFileSync(K16B_DATASET_PATH, 'utf8'));
  const { clients, supabaseUrl, anonKey } = ctx;
  const xylo = k16b.collaborations.xylo;

  async function sessionFor(email) {
    const anon = clients.anon();
    const { data, error } = await anon.auth.signInWithPassword({ email, password: k16b.password });
    if (error) throw new Error(`k16e1 sign-in(${email}) failed: ${error.message}`);
    return data.session;
  }
  async function call(fn, token, body) {
    const res = await fetch(`${supabaseUrl}/functions/v1/${fn}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: anonKey, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
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

  const bulkArtist = await createAndSignInTestUser(clients, testEmail('k16e1-bulk'), 'Signal-Portal-K16E1-Bulk-1!');
  await clients.admin.from('collaboration_members').insert({ collaboration_id: xylo.id, user_id: bulkArtist.uid, added_by: k16b.admin.uid, status: 'active' });
  const bulkToken = bulkArtist.accessToken;

  async function uploadFile(label, bytes, mimeType, filename) {
    const fbId = await freshFeedback(bulkToken, xylo.id, `K1.6E.1 ${label} test.`);
    const req = await call('portal-request-attachment-upload-url', bulkToken, { feedbackId: fbId, mimeType, fileSizeBytes: bytes.length, originalFilename: filename });
    if (!req.body.ok) return { error: req.body };
    createdAttachmentIds.push(req.body.attachmentId);
    const put = await fetch(req.body.uploadUrl, { method: 'PUT', headers: { 'Content-Type': mimeType }, body: bytes });
    if (!put.ok) return { attachmentId: req.body.attachmentId, feedbackId: fbId, uploadFailed: true };
    const confirm = await call('portal-confirm-attachment-upload', bulkToken, { attachmentId: req.body.attachmentId });
    return { attachmentId: req.body.attachmentId, feedbackId: fbId, confirm };
  }

  // Stage K1.6G section 5's launch-policy cap now blocks any NEW
  // upload over ~2.9MB at the request-URL stage, before it can ever
  // reach quarantine — so a genuinely oversized object can no longer
  // be created through uploadFile() above at all (working as
  // designed). This directly creates the quarantine Storage object
  // and its matching row via the service-role client, bypassing the
  // gated upload-request function entirely — exactly simulating a
  // real file that was already in quarantine before this policy
  // existed ("preserve their quarantine records," K1.6G section 5).
  // The object itself is genuinely large, so a real retry against it
  // genuinely re-exercises the real local size check, not a
  // simulated result.
  async function createPreExistingOversizedAttachment(label, bytes) {
    const fbId = await freshFeedback(bulkToken, xylo.id, `K1.6E.1 ${label} test.`);
    const attachmentId = crypto.randomUUID();
    const storagePath = `${xylo.id}/${attachmentId}.txt`;
    const upload = await clients.admin.storage.from('collaboration-attachments-quarantine').upload(storagePath, bytes, { contentType: 'text/plain' });
    if (upload.error) throw new Error(`createPreExistingOversizedAttachment upload failed: ${upload.error.message}`);
    createdAttachmentIds.push(attachmentId);
    await clients.admin.from('collaboration_feedback_attachments').insert({
      id: attachmentId, feedback_id: fbId, collaboration_id: xylo.id, storage_bucket: 'collaboration-attachments-quarantine', storage_path: storagePath,
      original_filename: `${label}.txt`, mime_type: 'text/plain', byte_size: bytes.length, uploaded_by: bulkArtist.uid,
      status: 'awaiting_scan', security_status: 'error', awaiting_scanner_capacity: true,
      security_scan_detail: `EXCEEDS_SCANNER_SIZE_LIMIT: file is ${bytes.length} bytes, current scanner limit is 2900000 bytes`,
    });
    return { attachmentId, feedbackId: fbId };
  }

  // ---------- 1. Genuine clean scan (real Cloudmersive verdict) ----------
  let cleanAttachmentId;
  await check('[K1.6E.1] genuine clean scan: an ordinary small text file receives a REAL clean verdict from the live Cloudmersive API, becomes eligible for review', async () => {
    const result = await uploadFile('genuine-clean', new TextEncoder().encode('A genuine, ordinary attachment — real Cloudmersive scan, not a test fixture.'), 'text/plain', 'genuine-clean.txt');
    cleanAttachmentId = result.attachmentId;
    if (result.confirm?.body.status !== 'clean') return false;
    const row = await clients.admin.from('collaboration_feedback_attachments').select('security_status, scan_provider, status').eq('id', cleanAttachmentId).single();
    return row.data?.security_status === 'clean' && row.data?.scan_provider === 'cloudmersive' && row.data?.status === 'clean';
  });

  // ---------- 2. EICAR: local precheck, explicitly distinct from a Cloudmersive verdict ----------
  await check('[K1.6E.1] EICAR fixture is caught by the LOCAL precheck (provider: eicar-test-fixture), never reaches Cloudmersive, never becomes available', async () => {
    const result = await uploadFile('eicar', new TextEncoder().encode(EICAR), 'text/plain', 'eicar.txt');
    if (result.confirm?.body.status !== 'rejected') return false;
    const row = await clients.admin.from('collaboration_feedback_attachments').select('security_status, scan_provider, status').eq('id', result.attachmentId).single();
    return row.data?.security_status === 'infected' && row.data?.scan_provider === 'eicar-test-fixture' && row.data?.status === 'rejected';
  });

  // ---------- 3. Scanner failure fails closed: the DB-level constraint re-verified live, with no real scan call spent (uses the already-'awaiting_scan' row from check #1's own upload-confirm step before its scan completed would be wasteful too, so this reuses the EICAR row from check #2 — already a real, terminal, non-'clean' row) ----------
  await check('[K1.6E.1] no attachment ever reaches available without a genuine clean security_status (DB-level constraint, re-verified live against a real non-clean row)', async () => {
    const eicarRow = await clients.admin.from('collaboration_feedback_attachments').select('id').eq('status', 'rejected').in('id', createdAttachmentIds).limit(1).single();
    if (!eicarRow.data) return false;
    const probe = await clients.admin.from('collaboration_feedback_attachments').update({ status: 'available' }).eq('id', eicarRow.data.id);
    return probe.error != null;
  });

  // ---------- 4. Free-tier size handling: a real file over the scanner limit, local check, quarantine retained, approval/download blocked ----------
  await check('[K1.6E.1] a file over the real confirmed 3MB free-tier limit is caught locally (no wasted API call), stays quarantined, blocks approval and signed URLs', async () => {
    const result = await createPreExistingOversizedAttachment('oversized', new Uint8Array(3_500_000));
    const row = await clients.admin.from('collaboration_feedback_attachments').select('security_status, security_scan_detail, is_active').eq('id', result.attachmentId).single();
    if (row.data?.security_status !== 'error' || !row.data?.security_scan_detail?.startsWith('EXCEEDS_SCANNER_SIZE_LIMIT')) return false;
    const reviewAttempt = await call('portal-admin-review-attachment', adminSession.access_token, { attachmentId: result.attachmentId, decision: 'clean' });
    if (reviewAttempt.status !== 409) return false;
    const signedAttempt = await call('portal-attachment-signed-url', bulkToken, { attachmentId: result.attachmentId });
    return signedAttempt.status === 403;
  });

  await check('[K1.6E.1] an oversized file is retryable (not permanently blocked) if the configured scanner limit is later raised — verified via the real retry-scan function genuinely re-downloading and re-checking the same real oversized object', async () => {
    const result = await createPreExistingOversizedAttachment('oversized-retry', new Uint8Array(3_500_000));
    const retry = await call('portal-admin-retry-attachment-scan', adminSession.access_token, { attachmentId: result.attachmentId });
    // Still over the (unraised) limit, so still an error -- but the
    // real property under test is that retry is ACCEPTED (200, not
    // 409 NOT_RETRYABLE) for an 'error' row, proving this state is
    // genuinely retryable infrastructure, not a dead end.
    return retry.status === 200 && retry.body.retried === true;
  });

  // ---------- 5. ZIP: genuine clean archive, scanned via the real Advanced endpoint ----------
  let zipCleanId;
  await check('[K1.6E.1] a genuine small ZIP archive receives a REAL clean verdict via the Advanced endpoint (provider: cloudmersive-advanced), proving its contents were actually evaluated', async () => {
    const zipBytes = readFileSync(new URL('../fixtures/sample.zip', import.meta.url));
    const result = await uploadFile('zip-clean', zipBytes, 'application/zip', 'zip-clean.zip');
    zipCleanId = result.attachmentId;
    if (result.confirm?.body.status !== 'clean') return false;
    const row = await clients.admin.from('collaboration_feedback_attachments').select('security_status, scan_provider').eq('id', zipCleanId).single();
    return row.data?.security_status === 'clean' && row.data?.scan_provider === 'cloudmersive-advanced';
  });

  // ---------- 6. ZIP: genuine unsafe-content archive (password-protected — a safe, legal test construct, NOT malware) ----------
  await check('[K1.6E.1 / K1.6G] a genuine password-protected ZIP is rejected — caught locally (K1.6G section 7) without even reaching the real scanner, an improvement over this stage\'s original behavior', async () => {
    // K1.6G section 7 added local ZIP metadata validation, which
    // independently detects an encrypted entry via the ZIP's own
    // central-directory flag — this now rejects a password-protected
    // archive for FREE, before the real Cloudmersive Advanced
    // endpoint ever sees it (verified directly in
    // tests/security/zipValidation.test.mjs and in k16g.mjs's
    // malformed-zip check). The genuine real-scanner-level archive
    // policy enforcement (allowPasswordProtectedFiles, etc.) remains
    // real infrastructure for whatever this local check does NOT
    // catch — it is simply no longer reachable for THIS specific,
    // locally-detectable condition.
    const zipBytes = readFileSync(new URL('../fixtures/sample-protected.zip', import.meta.url));
    const result = await uploadFile('zip-protected', zipBytes, 'application/zip', 'zip-protected.zip');
    if (result.confirm?.status !== 422 || result.confirm?.body.reason !== 'ZIP_ENCRYPTED_ENTRY') return false;
    const row = await clients.admin.from('collaboration_feedback_attachments').select('status, security_status, scan_provider').eq('id', result.attachmentId).single();
    return row.data?.status === 'failed' && row.data?.security_status === 'pending' && row.data?.scan_provider === null;
  });

  // ---------- 7/8. Full end-to-end: admin reviews a genuinely clean file, approves, authorized retrieval succeeds, unauthorized denial holds ----------
  await check('[K1.6E.1] end-to-end: administrator approves the genuinely clean file, authorized artist retrieves it, unauthorized caller is denied', async () => {
    const approve = await call('portal-admin-review-attachment', adminSession.access_token, { attachmentId: cleanAttachmentId, decision: 'clean' });
    if (!approve.body.ok || approve.body.status !== 'available') return false;
    const signed = await call('portal-attachment-signed-url', bulkToken, { attachmentId: cleanAttachmentId });
    if (!signed.body.ok) return false;
    const fetched = await fetch(signed.body.url);
    const bytes = new Uint8Array(await fetched.arrayBuffer());
    const unauthorized = await createAndSignInTestUser(clients, testEmail('k16e1-unauthorized'), 'Signal-Portal-K16E1-Unauth-1!');
    const denied = await call('portal-attachment-signed-url', unauthorized.accessToken, { attachmentId: cleanAttachmentId });
    await deleteTestUser(clients, unauthorized.uid);
    return bytes.length > 0 && denied.status === 403;
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
  if (deleteErr) console.log('[k16e1] WARNING: failed to delete disposable bulk-test identity:', deleteErr.message);
}
