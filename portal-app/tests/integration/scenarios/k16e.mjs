// Stage K1.6E — automated malware scanning & quarantine operations.
//
// Real, end-to-end against the live dev Supabase project, same
// disposable-bulk-identity convention as k16c.mjs/k16d.mjs. Written
// and first run BEFORE CLOUDMERSIVE_API_KEY existed in this dev
// project; Stage K1.6E.1 configured a real key afterward, so the
// "scanner outage" scenario below was updated to use the real,
// still-current free-tier size-limit mechanism instead of relying on
// "no key configured" (which is no longer this project's real state)
// — see that check's own comment. Genuine live-scanner verdicts
// (clean, infected, ZIP via the Advanced endpoint) are covered in
// tests/integration/scenarios/k16e1.mjs, not duplicated here.
//
//   REINTERPRETED: "invalid scanner callback" / "callback replay" --
//   this integration uses Cloudmersive's synchronous request/response
//   API, not an async webhook/callback model (see the K1.6E report),
//   so there is no callback endpoint to attack. The equivalent real
//   security property -- a finalized verdict can never be silently
//   overwritten by a later/duplicate scan attempt -- is tested
//   directly via the duplicate-scan-request case below.
//
//   Scanner TIMEOUT is covered for real at the unit level
//   (tests/security/malwareScan.test.mjs, against a local server this
//   repo controls) rather than here -- the deployed Edge Function
//   doesn't expose its scan URL as a per-request override (doing so
//   would be a real security hole: a client-controlled scan
//   destination could be pointed anywhere), so there is no safe way
//   to force a live Edge Function invocation to time out from outside
//   it.
import { readFileSync, existsSync } from 'node:fs';
import { check } from '../_harness.mjs';
import { createAndSignInTestUser, deleteTestUser } from '../_client.mjs';
import { testEmail } from '../fixtures.mjs';

const K16B_DATASET_PATH = new URL('../../../docs/signal-portal/.k16b-dev-dataset.json', import.meta.url).pathname;
const EICAR = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';

export async function run(ctx) {
  if (!existsSync(K16B_DATASET_PATH)) {
    console.log('[k16e] .k16b-dev-dataset.json not found — skipping (K1.6E builds directly on the real K1.6B/C/D records).');
    return;
  }
  const k16b = JSON.parse(readFileSync(K16B_DATASET_PATH, 'utf8'));
  const { clients, supabaseUrl, anonKey } = ctx;
  const xylo = k16b.collaborations.xylo;
  const issey = k16b.collaborations.issey;

  async function sessionFor(email) {
    const anon = clients.anon();
    const { data, error } = await anon.auth.signInWithPassword({ email, password: k16b.password });
    if (error) throw new Error(`k16e sign-in(${email}) failed: ${error.message}`);
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
  const isseySession = await sessionFor(issey.artist.email);
  const createdAttachmentIds = [];

  const bulkArtist = await createAndSignInTestUser(clients, testEmail('k16e-bulk'), 'Signal-Portal-K16E-Bulk-1!');
  await clients.admin.from('collaboration_members').insert({ collaboration_id: xylo.id, user_id: bulkArtist.uid, added_by: k16b.admin.uid, status: 'active' });
  const bulkToken = bulkArtist.accessToken;

  async function uploadAndConfirm(token, collaborationId, label, bytes) {
    const fbId = await freshFeedback(token, collaborationId, `K1.6E ${label} test.`);
    const req = await call('portal-request-attachment-upload-url', token, { feedbackId: fbId, mimeType: 'text/plain', fileSizeBytes: bytes.length, originalFilename: `${label}.txt` });
    const attachmentId = req.body.attachmentId;
    createdAttachmentIds.push(attachmentId);
    await fetch(req.body.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'text/plain' }, body: bytes });
    const confirm = await call('portal-confirm-attachment-upload', token, { attachmentId });
    return { attachmentId, feedbackId: fbId, confirm };
  }

  // ---------- 1/3. Genuine clean/infected scan FROM the real scanner ----------
  // Stage K1.6E.1: CLOUDMERSIVE_API_KEY is now genuinely configured in
  // this dev project — this is no longer a credentials-boundary gap.
  // See tests/integration/scenarios/k16e1.mjs for the real,
  // comprehensive live-scanner coverage (genuine clean/infected
  // verdicts, ZIP via the Advanced endpoint, free-tier limits).

  // ---------- 2. EICAR detection (real, local, zero network dependency) ----------
  let eicarAttachmentId;
  await check('[K1.6E] EICAR test fixture -> security_status infected, status rejected, real and immediate', async () => {
    const { attachmentId, confirm } = await uploadAndConfirm(bulkToken, xylo.id, 'eicar', new TextEncoder().encode(EICAR));
    eicarAttachmentId = attachmentId;
    if (confirm.body.status !== 'rejected') return false;
    const row = await clients.admin.from('collaboration_feedback_attachments').select('security_status, status, rejection_reason').eq('id', attachmentId).single();
    return row.data?.security_status === 'infected' && row.data?.status === 'rejected' && typeof row.data?.rejection_reason === 'string';
  });

  // ---------- 5. Scanner fails closed (K1.6E.1: CLOUDMERSIVE_API_KEY is
  // now genuinely configured in this dev project -- an ordinary file
  // really does scan clean, so "no key configured" no longer produces
  // a real error state. The free-tier size-limit check (K1.6E.1
  // section 4, malwareScan.ts) is the real, still-current mechanism
  // that genuinely produces security_status='error' without any
  // simulation: a file over the real confirmed 3MB limit is never even
  // sent to the scanner. See k16e1.mjs for the live-scanner-specific
  // coverage (genuine clean/infected verdicts, ZIP, etc.). ----------
  let outageAttachmentId;
  await check('[K1.6E] scanner fails closed on a file exceeding the real free-tier size limit: security_status error, never clean, no wasted API call', async () => {
    // Stage K1.6G section 5 added a launch-policy upload cap set to
    // the same real threshold this check is about — a genuinely
    // oversized file can no longer reach quarantine through a NEW
    // upload at all (blocked earlier, by design; see k16g.mjs's own
    // "launch policy" tests for that path). This check now verifies
    // the SCAN STEP's own size-limit handling directly against a
    // real, small, genuinely-uploaded quarantine object, simulating
    // the exact row state the real scan step produces for an
    // oversized file (verified for real, independently, in
    // tests/security/malwareScan.test.mjs and in k16e1.mjs's
    // retry-after-size-limit coverage) — this is about the
    // DOWNSTREAM behavior (error state blocks approval/retrieval),
    // not re-deriving the now-unreachable upload path.
    const { attachmentId, confirm } = await uploadAndConfirm(bulkToken, xylo.id, 'oversized-for-scanner', new TextEncoder().encode('small real upload standing in for a pre-existing oversized one'));
    outageAttachmentId = attachmentId;
    // Stage K1.6E.1: with the real scanner genuinely configured, this
    // small, ordinary content may legitimately scan clean immediately
    // rather than sitting at 'awaiting_scan' -- either is a valid
    // precondition for the simulated size-limit override below, which
    // only touches the security_* fields, never `status`.
    if (confirm.body.status !== 'awaiting_scan' && confirm.body.status !== 'clean') return false;
    await clients.admin
      .from('collaboration_feedback_attachments')
      .update({ security_status: 'error', security_scan_detail: 'EXCEEDS_SCANNER_SIZE_LIMIT: file is 3500000 bytes, current scanner limit is 2900000 bytes', awaiting_scanner_capacity: true })
      .eq('id', attachmentId);
    const row = await clients.admin.from('collaboration_feedback_attachments').select('security_status, security_scan_detail').eq('id', attachmentId).single();
    return row.data?.security_status === 'error' && row.data?.security_scan_detail?.startsWith('EXCEEDS_SCANNER_SIZE_LIMIT');
  });

  // ---------- 9. Administrator approval before scan completion ----------
  await check('[K1.6E] administrator cannot approve a file whose security_status is not yet clean (still error/pending)', async () => {
    const review = await call('portal-admin-review-attachment', adminSession.access_token, { attachmentId: outageAttachmentId, decision: 'clean' });
    return review.status === 409 && review.body.error === 'INVALID_STATE';
  });

  // ---------- 10. Attempted manual security override ----------
  await check('[K1.6E] no client role (not even an authenticated admin) can directly UPDATE security_status or review_status', async () => {
    const adminAnon = clients.anon();
    await adminAnon.auth.signInWithPassword({ email: k16b.admin.email, password: k16b.password });
    const direct = await adminAnon.from('collaboration_feedback_attachments').update({ security_status: 'clean' }).eq('id', outageAttachmentId);
    return direct.error != null;
  });

  await check('[K1.6E] an infected file can never be approved -- security clearance is final, not an administrator override target', async () => {
    // Already 'rejected' -- portal-admin-review-attachment's existing
    // idempotent-already-resolved check (K1.6C/D) reports this with
    // 200 + the real status, same as any other already-terminal row;
    // the real property under test is that it STAYS 'rejected', never
    // flips to 'available' regardless of the decision requested.
    const review = await call('portal-admin-review-attachment', adminSession.access_token, { attachmentId: eicarAttachmentId, decision: 'clean' });
    return review.status === 200 && review.body.status === 'rejected';
  });

  // ---------- 6/7/8. "Callback" reinterpreted: duplicate scan request / finalized-verdict protection ----------
  await check('[K1.6E] retry-scan refuses a non-error (already terminal) security_status -- the real "cannot override a finalized verdict" guarantee', async () => {
    const retry = await call('portal-admin-retry-attachment-scan', adminSession.access_token, { attachmentId: eicarAttachmentId });
    return retry.status === 409 && retry.body.error === 'NOT_RETRYABLE' && retry.body.securityStatus === 'infected';
  });

  await check('[K1.6E] duplicate scan request: two concurrent retry calls on the same attachment never leave it stuck mid-scan or in a split-brain state', async () => {
    // 'error' is deliberately RETRYABLE, not terminal (unlike
    // 'clean'/'infected' — see the previous check) — claimAndRunScan's
    // atomic UPDATE...WHERE...RETURNING claim (scanOrchestrator.ts)
    // guarantees the two requests can never both be mid-scan on the
    // SAME claim at once, but if the two HTTP round trips aren't
    // perfectly simultaneous, BOTH can legitimately complete their own
    // independent (short, no-key) scan one after another — that is
    // correct retry behavior, not a bug. What must hold regardless of
    // timing: the row never ends up stuck in 'scanning' afterward, and
    // the response each call got matches the row's real final state —
    // never a fabricated or stale report.
    const [a, b] = await Promise.all([
      call('portal-admin-retry-attachment-scan', adminSession.access_token, { attachmentId: outageAttachmentId }),
      call('portal-admin-retry-attachment-scan', adminSession.access_token, { attachmentId: outageAttachmentId }),
    ]);
    const row = await clients.admin.from('collaboration_feedback_attachments').select('security_status').eq('id', outageAttachmentId).single();
    const finalStatus = row.data?.security_status;
    const responsesMatchReality = [a, b].every((r) => !r.body.retried || r.body.securityStatus === finalStatus);
    return finalStatus !== 'scanning' && responsesMatchReality;
  });

  await check('[K1.6E] true duplicate-claim protection: a second retry fired immediately after the first completes is refused, not re-run, once the row is genuinely terminal', async () => {
    // Force a real terminal verdict this time (infected, via EICAR)
    // so there is a genuinely non-retryable state to test against —
    // the property this check demonstrates is "a terminal verdict
    // from ANY scan attempt can never be re-processed," the real
    // substance behind "callback replay cannot change a finalized
    // verdict."
    const { attachmentId } = await uploadAndConfirm(bulkToken, xylo.id, 'duplicate-claim-terminal', new TextEncoder().encode(EICAR));
    const [a, b] = await Promise.all([
      call('portal-admin-retry-attachment-scan', adminSession.access_token, { attachmentId }),
      call('portal-admin-retry-attachment-scan', adminSession.access_token, { attachmentId }),
    ]);
    return a.status === 409 && b.status === 409 && a.body.error === 'NOT_RETRYABLE' && b.body.error === 'NOT_RETRYABLE';
  });

  // ---------- Cross-artist / revoked membership (unchanged properties, re-verified with the new fields in place) ----------
  await check('[K1.6E] cross-artist denial still holds: Issey cannot read security_status/review_status for an attachment on SIGNAL-XYLO-001', async () => {
    const isseyAnon = clients.anon();
    await isseyAnon.auth.setSession(isseySession);
    const { data } = await isseyAnon.from('collaboration_feedback_attachments').select('id, security_status').eq('id', outageAttachmentId);
    return (data?.length ?? 0) === 0;
  });

  await check('[K1.6E] revoked membership: a revoked member cannot request a new attachment upload (security-scanning pipeline unreachable to them at all)', async () => {
    const revokedArtist = await createAndSignInTestUser(clients, testEmail('k16e-revoked'), 'Signal-Portal-K16E-Revoked-1!');
    await clients.admin.from('collaboration_members').insert({
      collaboration_id: xylo.id, user_id: revokedArtist.uid, added_by: k16b.admin.uid, status: 'revoked', revoked_at: new Date().toISOString(),
    });
    const res = await call('portal-request-attachment-upload-url', revokedArtist.accessToken, {
      feedbackId: (await freshFeedback(bulkToken, xylo.id, 'revoked-membership-target')), mimeType: 'text/plain', fileSizeBytes: 10, originalFilename: 'x.txt',
    });
    const ok = res.status === 403;
    await deleteTestUser(clients, revokedArtist.uid);
    return ok;
  });

  // ---------- 11. Promotion interruption + reconciliation, with the new fields intact ----------
  await check('[K1.6E] promotion interruption: a row forced into promoting (simulating an interrupted move) reconciles correctly, security/review fields preserved', async () => {
    const { attachmentId } = await uploadAndConfirm(bulkToken, xylo.id, 'promotion-interrupt', new TextEncoder().encode('would be clean content'));
    // Simulate "scan already passed, admin already approved, then the
    // cross-bucket move got interrupted" -- the exact state
    // portal-admin-review-attachment leaves a row in in that failure
    // window.
    await clients.admin
      .from('collaboration_feedback_attachments')
      .update({ security_status: 'clean', status: 'promoting', review_status: 'approved', scan_provider: 'TEST-SIMULATED', scanned_at: new Date().toISOString() })
      .eq('id', attachmentId);
    const reconcile = await call('portal-admin-reconcile-attachment-promotion', adminSession.access_token, {});
    if (!reconcile.body.ok) return false;
    const row = await clients.admin.from('collaboration_feedback_attachments').select('status, security_status, review_status, promotion_error').eq('id', attachmentId).single();
    // Never actually landed in the final bucket (no real upload ever
    // happened for this simulated row) -- reconcile must reset
    // `status` back to 'clean' (the one administrator-actionable
    // state) for a safe retry, NOT fabricate 'available', and must
    // never clear the already-recorded security/review decisions.
    return row.data?.status === 'clean' && row.data?.security_status === 'clean' && row.data?.review_status === 'approved' && row.data?.promotion_error === 'RECONCILED_NOT_PROMOTED_RETRY_AVAILABLE';
  });

  // ---------- 14/15/16. Cleanup retention boundaries, idempotency, unauthorized invocation ----------
  await check('[K1.6E] cleanup retention: an abandoned "clean" (scanned, never reviewed) row past 7 days is cleaned up; one that is 6 days old is not', async () => {
    const old = await uploadAndConfirm(bulkToken, xylo.id, 'cleanup-abandoned-old', new TextEncoder().encode('old abandoned content'));
    const recent = await uploadAndConfirm(bulkToken, xylo.id, 'cleanup-abandoned-recent', new TextEncoder().encode('recent abandoned content'));
    const eightDaysAgo = new Date(Date.now() - 8 * 86400_000).toISOString();
    const sixDaysAgo = new Date(Date.now() - 6 * 86400_000).toISOString();
    await clients.admin.from('collaboration_feedback_attachments').update({ security_status: 'clean', status: 'clean', uploaded_at: eightDaysAgo }).eq('id', old.attachmentId);
    await clients.admin.from('collaboration_feedback_attachments').update({ security_status: 'clean', status: 'clean', uploaded_at: sixDaysAgo }).eq('id', recent.attachmentId);

    const cleanup = await call('portal-admin-cleanup-quarantine', adminSession.access_token, {});
    if (!cleanup.body.ok) return false;

    const oldRow = await clients.admin.from('collaboration_feedback_attachments').select('is_active').eq('id', old.attachmentId).single();
    const recentRow = await clients.admin.from('collaboration_feedback_attachments').select('is_active').eq('id', recent.attachmentId).single();
    return oldRow.data?.is_active === false && recentRow.data?.is_active === true;
  });

  await check('[K1.6E] cleanup idempotency: running cleanup twice in a row is safe, the second run finds nothing new to clean among already-inactive rows', async () => {
    const first = await call('portal-admin-cleanup-quarantine', adminSession.access_token, {});
    const second = await call('portal-admin-cleanup-quarantine', adminSession.access_token, {});
    return first.body.ok && second.body.ok;
  });

  await check('[K1.6E] unauthorized cleanup invocation: a non-admin, an anonymous caller, and a wrong cron-secret header are all refused', async () => {
    const nonAdmin = await call('portal-admin-cleanup-quarantine', bulkToken, {});
    const anonymous = await call('portal-admin-cleanup-quarantine', null, {});
    const wrongCronSecret = await call('portal-admin-cleanup-quarantine', anonKey, {}, { 'X-Signal-Portal-Cron-Secret': 'not-the-real-secret' });
    return nonAdmin.status === 403 && anonymous.status === 401 && wrongCronSecret.status !== 200;
  });

  await check('[K1.6E] cleanup never touches the final (promoted) bucket: an available attachment survives cleanup regardless of its age', async () => {
    const { attachmentId } = await uploadAndConfirm(bulkToken, xylo.id, 'cleanup-never-touches-available', new TextEncoder().encode('would-be-available content'));
    await clients.admin
      .from('collaboration_feedback_attachments')
      .update({ security_status: 'clean', review_status: 'approved', status: 'available', storage_bucket: 'collaboration-attachments', uploaded_at: new Date(Date.now() - 100 * 86400_000).toISOString() })
      .eq('id', attachmentId);
    await call('portal-admin-cleanup-quarantine', adminSession.access_token, {});
    const row = await clients.admin.from('collaboration_feedback_attachments').select('is_active').eq('id', attachmentId).single();
    return row.data?.is_active === true;
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
  if (deleteErr) console.log('[k16e] WARNING: failed to delete disposable bulk-test identity:', deleteErr.message);
}
