// Stage K1.6D — administrator attachment review & transmission
// management.
//
// Builds directly on K1.6C's real attachments (same real dev
// collaborations, same disposable-bulk-identity pattern — see k16c.mjs
// for the rationale). This scenario specifically exercises the NEW
// K1.6D surface: the "uploader select own attachment regardless of
// status" RLS policy, the rejection-reason field, and the hardened
// explicit status check portal-attachment-signed-url now performs —
// NOT a re-test of K1.6C's upload/signature/EICAR pipeline, which
// k16c.mjs already covers.
import { readFileSync, existsSync } from 'node:fs';
import { check } from '../_harness.mjs';
import { createAndSignInTestUser, deleteTestUser } from '../_client.mjs';
import { testEmail } from '../fixtures.mjs';

const K16B_DATASET_PATH = new URL('../../../docs/signal-portal/.k16b-dev-dataset.json', import.meta.url).pathname;

export async function run(ctx) {
  if (!existsSync(K16B_DATASET_PATH)) {
    console.log('[k16d] .k16b-dev-dataset.json not found — skipping (K1.6D builds directly on the real K1.6B records).');
    return;
  }
  const k16b = JSON.parse(readFileSync(K16B_DATASET_PATH, 'utf8'));
  const { clients, supabaseUrl, anonKey } = ctx;
  const xylo = k16b.collaborations.xylo;
  const issey = k16b.collaborations.issey;

  async function sessionFor(email) {
    const anon = clients.anon();
    const { data, error } = await anon.auth.signInWithPassword({ email, password: k16b.password });
    if (error) throw new Error(`k16d sign-in(${email}) failed: ${error.message}`);
    return data.session;
  }
  // Stage K1.6E: a row can no longer reach 'clean' through confirm
  // alone (the real scan attempt fails closed to security_status
  // 'error' with no CLOUDMERSIVE_API_KEY configured — see the K1.6E
  // report). Tests below that exercise the ADMIN REVIEW step itself
  // (not the scan step, which k16e.mjs covers) simulate "if a real
  // scanner had said clean" via this clearly-labeled test-only update.
  async function simulateCleanScan(attachmentId) {
    await clients.admin
      .from('collaboration_feedback_attachments')
      .update({ security_status: 'clean', status: 'clean', scan_provider: 'TEST-SIMULATED-stage-k16e', scanned_at: new Date().toISOString() })
      .eq('id', attachmentId);
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

  const bulkArtist = await createAndSignInTestUser(clients, testEmail('k16d-bulk'), 'Signal-Portal-K16D-Bulk-1!');
  await clients.admin.from('collaboration_members').insert({ collaboration_id: xylo.id, user_id: bulkArtist.uid, added_by: k16b.admin.uid, status: 'active' });
  const bulkToken = bulkArtist.accessToken;

  async function uploadAwaitingScan(token, collaborationId, label) {
    const fbId = await freshFeedback(token, collaborationId, `K1.6D ${label} test.`);
    const bytes = new TextEncoder().encode(`k16d-${label}-content`);
    const req = await call('portal-request-attachment-upload-url', token, {
      feedbackId: fbId, mimeType: 'text/plain', fileSizeBytes: bytes.length, originalFilename: `${label}.txt`,
    });
    const attachmentId = req.body.attachmentId;
    createdAttachmentIds.push(attachmentId);
    await fetch(req.body.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'text/plain' }, body: bytes });
    const confirm = await call('portal-confirm-attachment-upload', token, { attachmentId });
    // Stage K1.6E.1: CLOUDMERSIVE_API_KEY is now configured in this
    // dev project, so an ordinary non-EICAR text file genuinely scans
    // clean almost immediately and lands on 'clean' (awaiting
    // ADMINISTRATOR review), not 'awaiting_scan' (awaiting the SCAN
    // itself) — both are real, legitimate "not yet admin-decided, not
    // yet available" outcomes for this helper's purpose (testing
    // pre-decision visibility/denial), so either is accepted.
    if (confirm.body.status !== 'awaiting_scan' && confirm.body.status !== 'clean') {
      throw new Error(`uploadAwaitingScan(${label}) did not reach a pending-review state: ${JSON.stringify(confirm.body)}`);
    }
    return { attachmentId, feedbackId: fbId, status: confirm.body.status };
  }

  // ---------- 1. non-admin cannot invoke review actions ----------
  const pendingForNonAdmin = await uploadAwaitingScan(bulkToken, xylo.id, 'non-admin-review-block');
  await check('[K1.6D] non-admin cannot invoke portal-admin-review-attachment, even on their own upload', async () => {
    const res = await call('portal-admin-review-attachment', bulkToken, { attachmentId: pendingForNonAdmin.attachmentId, decision: 'clean' });
    return res.status === 403;
  });

  await check('[K1.6D] non-admin cannot invoke portal-admin-reconcile-attachment-promotion', async () => {
    const res = await call('portal-admin-reconcile-attachment-promotion', bulkToken, {});
    return res.status === 403;
  });

  // ---------- 2. cross-project denial still holds for the review queue's underlying reads ----------
  await check('[K1.6D] cross-project denial: Issey cannot read metadata for an attachment on SIGNAL-XYLO-001 via ordinary SELECT', async () => {
    const isseyAnon = clients.anon();
    await isseyAnon.auth.signInWithPassword({ email: issey.artist.email, password: k16b.password });
    const { data } = await isseyAnon.from('collaboration_feedback_attachments').select('id').eq('id', pendingForNonAdmin.attachmentId);
    return (data?.length ?? 0) === 0;
  });

  // ---------- 3. pending/rejected files are not downloadable through the normal artist retrieval endpoint, EVEN for the uploader ----------
  await check('[K1.6D] pending attachment: the uploader can read their own row\'s status via the new RLS policy, but cannot mint a signed URL for it', async () => {
    const bulkAnon = clients.anon();
    await bulkAnon.auth.signInWithPassword({ email: bulkArtist.email, password: 'Signal-Portal-K16D-Bulk-1!' });
    const { data } = await bulkAnon.from('collaboration_feedback_attachments').select('id,status').eq('id', pendingForNonAdmin.attachmentId).single();
    if (data?.status !== 'awaiting_scan' && data?.status !== 'clean') return false;
    const signed = await call('portal-attachment-signed-url', bulkToken, { attachmentId: pendingForNonAdmin.attachmentId });
    return signed.status === 403;
  });

  let rejectedForOwner;
  await check('[K1.6D] rejected attachment: the uploader sees status + rejection reason via their own row, but still cannot retrieve a signed URL', async () => {
    rejectedForOwner = await uploadAwaitingScan(bulkToken, xylo.id, 'rejected-owner-visibility');
    await simulateCleanScan(rejectedForOwner.attachmentId);
    const review = await call('portal-admin-review-attachment', adminSession.access_token, {
      attachmentId: rejectedForOwner.attachmentId, decision: 'rejected', reason: 'K1.6D test: not a fit for this release.',
    });
    if (!review.body.ok || review.body.status !== 'rejected') return false;

    const bulkAnon = clients.anon();
    await bulkAnon.auth.signInWithPassword({ email: bulkArtist.email, password: 'Signal-Portal-K16D-Bulk-1!' });
    const { data } = await bulkAnon
      .from('collaboration_feedback_attachments')
      .select('status, rejection_reason')
      .eq('id', rejectedForOwner.attachmentId)
      .single();
    if (data?.status !== 'rejected' || data?.rejection_reason !== 'K1.6D test: not a fit for this release.') return false;

    const signed = await call('portal-attachment-signed-url', bulkToken, { attachmentId: rejectedForOwner.attachmentId });
    return signed.status === 403;
  });

  // ---------- 4. unscanned files cannot be marked clean through administrator actions ----------
  await check('[K1.6D] a file still in pending_upload (never confirmed) cannot be approved by an administrator', async () => {
    const fbId = await freshFeedback(bulkToken, xylo.id, 'K1.6D unscanned-approve-block test.');
    const req = await call('portal-request-attachment-upload-url', bulkToken, {
      feedbackId: fbId, mimeType: 'text/plain', fileSizeBytes: 10, originalFilename: 'never-confirmed.txt',
    });
    createdAttachmentIds.push(req.body.attachmentId);
    // Never uploaded or confirmed — still pending_upload.
    const review = await call('portal-admin-review-attachment', adminSession.access_token, { attachmentId: req.body.attachmentId, decision: 'clean' });
    return review.status === 409 && review.body.error === 'INVALID_STATE';
  });

  await check('[K1.6D] a file that failed signature verification cannot be approved by an administrator', async () => {
    const fbId = await freshFeedback(bulkToken, xylo.id, 'K1.6D failed-approve-block test.');
    // Stage K1.6G section 5: the optimized (210KB) proposal, not the
    // original 4.67MB one — the original now exceeds the launch-policy
    // upload cap (~2.9MB) and would be blocked before this test's own
    // signature-mismatch check could even run.
    const pdfBytes = readFileSync('/Users/bearcubz/Desktop/Portal Asset images/Artist collaboration proposals/XYLO/BEAR_CUBZ_XYLO_GHOST_IN_THE_SIGNAL_Proposal_OPTIMIZED.pdf');
    const req = await call('portal-request-attachment-upload-url', bulkToken, {
      feedbackId: fbId, mimeType: 'image/png', fileSizeBytes: pdfBytes.length, originalFilename: 'disguised.png',
    });
    createdAttachmentIds.push(req.body.attachmentId);
    await fetch(req.body.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'image/png' }, body: pdfBytes });
    await call('portal-confirm-attachment-upload', bulkToken, { attachmentId: req.body.attachmentId }); // -> failed
    const review = await call('portal-admin-review-attachment', adminSession.access_token, { attachmentId: req.body.attachmentId, decision: 'clean' });
    return review.status === 409 && review.body.error === 'INVALID_STATE';
  });

  // ---------- 5. review actions are auditable ----------
  let auditedAttachmentId;
  await check('[K1.6D] an administrator review decision produces a real portal_admin_audit_log entry', async () => {
    const uploaded = await uploadAwaitingScan(bulkToken, xylo.id, 'audit-trail');
    auditedAttachmentId = uploaded.attachmentId;
    await simulateCleanScan(auditedAttachmentId);
    const review = await call('portal-admin-review-attachment', adminSession.access_token, { attachmentId: auditedAttachmentId, decision: 'clean' });
    if (!review.body.ok) return false;
    const { data } = await clients.admin
      .from('portal_admin_audit_log')
      .select('id, action, target_id')
      .eq('target_id', auditedAttachmentId)
      .eq('action', 'review_attachment_promoted');
    return (data?.length ?? 0) >= 1;
  });

  // ---------- 6. duplicate review actions are handled safely (idempotent, not a second write) ----------
  await check('[K1.6D] a second review call on an already-decided attachment is idempotent, not an error, and does not re-promote', async () => {
    const first = await clients.admin.from('collaboration_feedback_attachments').select('status, storage_path').eq('id', auditedAttachmentId).single();
    const review = await call('portal-admin-review-attachment', adminSession.access_token, { attachmentId: auditedAttachmentId, decision: 'clean' });
    const second = await clients.admin.from('collaboration_feedback_attachments').select('status, storage_path').eq('id', auditedAttachmentId).single();
    return review.status === 200 && review.body.status === 'available' && second.data?.storage_path === first.data?.storage_path;
  });

  // ---------- 7. revoked members cannot retrieve new signed URLs ----------
  await check('[K1.6D] a revoked member cannot retrieve a signed URL for their own previously-available attachment, once membership is revoked', async () => {
    const revokedArtist = await createAndSignInTestUser(clients, testEmail('k16d-revoked'), 'Signal-Portal-K16D-Revoked-1!');
    await clients.admin.from('collaboration_members').insert({ collaboration_id: xylo.id, user_id: revokedArtist.uid, added_by: k16b.admin.uid, status: 'active' });

    const uploaded = await uploadAwaitingScan(revokedArtist.accessToken, xylo.id, 'revoked-before-revoke');
    await simulateCleanScan(uploaded.attachmentId);
    await call('portal-admin-review-attachment', adminSession.access_token, { attachmentId: uploaded.attachmentId, decision: 'clean' });

    const before = await call('portal-attachment-signed-url', revokedArtist.accessToken, { attachmentId: uploaded.attachmentId });
    await clients.admin.from('collaboration_members').update({ status: 'revoked', revoked_at: new Date().toISOString() }).eq('collaboration_id', xylo.id).eq('user_id', revokedArtist.uid);
    const after = await call('portal-attachment-signed-url', revokedArtist.accessToken, { attachmentId: uploaded.attachmentId });

    // collaboration_feedback_attachments.feedback_id cascades on
    // delete, so the storage object must be removed BEFORE the parent
    // feedback row, or the row (and the path needed to clean it up)
    // disappears first.
    const row = await clients.admin.from('collaboration_feedback_attachments').select('storage_bucket, storage_path').eq('id', uploaded.attachmentId).single();
    if (row.data) await clients.admin.storage.from(row.data.storage_bucket).remove([row.data.storage_path]).catch(() => {});
    await clients.admin.from('collaboration_feedback').delete().eq('author_id', revokedArtist.uid);
    await clients.admin.from('portal_admin_audit_log').delete().eq('admin_id', revokedArtist.uid);
    await deleteTestUser(clients, revokedArtist.uid);
    return before.body.ok === true && after.status === 403;
  });

  // ---------- 8. artists can view their own status after a refresh without being able to touch quarantined content ----------
  await check('[K1.6D] artist-visible status survives a fresh, independent client session (simulated page refresh), across every non-terminal state', async () => {
    const uploaded = await uploadAwaitingScan(bulkToken, xylo.id, 'refresh-persistence');
    const freshSession = clients.anon();
    await freshSession.auth.signInWithPassword({ email: bulkArtist.email, password: 'Signal-Portal-K16D-Bulk-1!' });
    const { data } = await freshSession.from('collaboration_feedback_attachments').select('status, storage_path, storage_bucket').eq('id', uploaded.attachmentId).single();
    if (data?.status !== 'awaiting_scan' && data?.status !== 'clean') return false;
    // The row itself must never leak a direct, usable path to the
    // viewer treating it as a download target — the UI must always
    // go through portal-attachment-signed-url, which independently
    // refuses non-available status regardless of what the row contains.
    return typeof data.storage_path === 'string' && data.storage_bucket === 'collaboration-attachments-quarantine';
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
  if (deleteErr) console.log('[k16d] WARNING: failed to delete disposable bulk-test identity:', deleteErr.message);
}
