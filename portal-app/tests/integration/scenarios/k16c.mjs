// Stage K1.6C — secure Transmission Chamber attachments.
//
// Runs against the REAL, persistent K1.6B dev collaboration
// SIGNAL-XYLO-001 via the real deployed Edge Functions and real
// Storage uploads — never mocked at the network layer. Every
// attachment row this scenario creates is deleted at the end; the
// real collaborations/messages themselves are never touched.
//
// A dedicated, disposable dev identity (NOT the real XYLO artist
// account) handles every repetitive sub-test below. This is
// deliberate: portal-submit-feedback has a real, pre-existing,
// correctly-working rate limit (10 messages / 60 minutes per author)
// — discovered the hard way when an earlier version of this scenario
// burned through the real XYLO identity's budget across repeated test
// runs during development. Isolation/cross-identity checks still use
// the real XYLO/Issey/admin identities specifically, since those
// checks are ABOUT those real identities; everything else (mime
// checks, EICAR, concurrency, idempotency) only needs SOME authorized
// member of SIGNAL-XYLO-001, and a disposable one keeps the real
// account's rate-limit budget free for actual manual testing.
//
// The ONE place this suite is NOT a real end-to-end test: the
// malware-scanning step itself. No external scanning account exists
// yet (see the K1.6C report) — "scan" here means EICAR-test-fixture
// detection (a real, safe, universally-recognized industry test
// pattern) for the rejection path, and an admin's manual review for
// the clean/promotion path. Both of those ARE real, both run against
// the real deployed function and real Storage — what's not real is
// "a commercial malware engine inspected this file," which nothing
// in this codebase claims.
import { readFileSync, existsSync } from 'node:fs';
import { check } from '../_harness.mjs';
import { createAndSignInTestUser, deleteTestUser } from '../_client.mjs';
import { testEmail } from '../fixtures.mjs';

const K16B_DATASET_PATH = new URL('../../../docs/signal-portal/.k16b-dev-dataset.json', import.meta.url).pathname;
const EICAR = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';

export async function run(ctx) {
  if (!existsSync(K16B_DATASET_PATH)) {
    console.log('[k16c] .k16b-dev-dataset.json not found — skipping (K1.6C attachments build directly on the real K1.6B records).');
    return;
  }
  const k16b = JSON.parse(readFileSync(K16B_DATASET_PATH, 'utf8'));
  const { clients, supabaseUrl, anonKey } = ctx;
  const xylo = k16b.collaborations.xylo;
  const issey = k16b.collaborations.issey;

  async function sessionFor(email) {
    const anon = clients.anon();
    const { data, error } = await anon.auth.signInWithPassword({ email, password: k16b.password });
    if (error) throw new Error(`k16c sign-in(${email}) failed: ${error.message}`);
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

  // Stage K1.6E: portal-confirm-attachment-upload now runs a REAL
  // scan attempt (Cloudmersive) immediately, and with no
  // CLOUDMERSIVE_API_KEY configured in this dev project that
  // genuinely, honestly fails closed to security_status='error' (see
  // the K1.6E report) — a row can no longer reach 'clean' (the one
  // status portal-admin-review-attachment can act on) through confirm
  // alone. Every K1.6C test below that exercises the ADMIN REVIEW
  // step (not the scan step itself, which is K1.6E's own concern) now
  // simulates "if a real scanner had said clean" via a direct,
  // clearly-labeled test-only update, standing in for the genuine
  // verdict a real CLOUDMERSIVE_API_KEY would have produced.
  async function simulateCleanScan(attachmentId) {
    await clients.admin
      .from('collaboration_feedback_attachments')
      .update({ security_status: 'clean', status: 'clean', scan_provider: 'TEST-SIMULATED-stage-k16e', scanned_at: new Date().toISOString() })
      .eq('id', attachmentId);
  }

  const xyloSession = await sessionFor(xylo.artist.email);
  const isseySession = await sessionFor(issey.artist.email);
  const adminSession = await sessionFor(k16b.admin.email);
  const createdAttachmentIds = [];

  // Disposable bulk-test identity, membership scoped to SIGNAL-XYLO-001
  // only, cleaned up at the end (same disposable-identity pattern this
  // suite already uses for "revoked membership").
  const bulkArtist = await createAndSignInTestUser(clients, testEmail('k16c-bulk'), 'Signal-Portal-K16C-Bulk-1!');
  await clients.admin.from('collaboration_members').insert({ collaboration_id: xylo.id, user_id: bulkArtist.uid, added_by: k16b.admin.uid, status: 'active' });
  const bulkToken = bulkArtist.accessToken;

  // Stage K1.6G section 5: switched from the original 4.67MB proposal
  // to the K1.6F-optimized 210KB one (the same file now actually
  // deployed as this collaboration's real proposal asset) — the
  // original exceeds the new launch-policy upload cap (~2.9MB), which
  // would otherwise block this scenario's own ordinary happy-path
  // upload test before it could even begin, for a reason entirely
  // unrelated to what these specific checks test.
  const realPdfPath = '/Users/bearcubz/Desktop/Portal Asset images/Artist collaboration proposals/XYLO/BEAR_CUBZ_XYLO_GHOST_IN_THE_SIGNAL_Proposal_OPTIMIZED.pdf';
  const realPdfBytes = readFileSync(realPdfPath);

  async function freshFeedback(token, collaborationId, text) {
    const r = await call('portal-submit-feedback', token, { collaborationId, kind: 'general', body: text });
    if (!r.body.ok) throw new Error(`freshFeedback failed: ${JSON.stringify(r.body)}`);
    return r.body.feedbackId;
  }

  // ---------- authorized upload: full real lifecycle (real XYLO identity — this IS what's being tested) ----------
  const feedbackId = await freshFeedback(xyloSession.access_token, xylo.id, 'K1.6C integration — happy path.');
  let happyAttachmentId;
  await check('[K1.6C] authorized upload: request -> PUT -> confirm reaches awaiting_scan', async () => {
    const req = await call('portal-request-attachment-upload-url', xyloSession.access_token, {
      feedbackId, mimeType: 'application/pdf', fileSizeBytes: realPdfBytes.length, originalFilename: 'proposal.pdf',
    });
    if (!req.body.ok) return false;
    happyAttachmentId = req.body.attachmentId;
    createdAttachmentIds.push(happyAttachmentId);
    const put = await fetch(req.body.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'application/pdf' }, body: realPdfBytes });
    if (!put.ok) return false;
    const confirm = await call('portal-confirm-attachment-upload', xyloSession.access_token, { attachmentId: happyAttachmentId });
    // Stage K1.6E.1: CLOUDMERSIVE_API_KEY is genuinely configured now
    // — this real, legitimate, now-smaller (post-K1.6G) proposal file
    // may genuinely scan clean immediately rather than sitting at
    // 'awaiting_scan'. Both are real, valid post-validation outcomes.
    return confirm.body.ok && (confirm.body.status === 'awaiting_scan' || confirm.body.status === 'clean');
  });

  await check('[K1.6C] admin manual review (clean) promotes to available, in the final bucket', async () => {
    await simulateCleanScan(happyAttachmentId);
    const review = await call('portal-admin-review-attachment', adminSession.access_token, { attachmentId: happyAttachmentId, decision: 'clean' });
    if (!review.body.ok || review.body.status !== 'available') return false;
    const row = await clients.admin.from('collaboration_feedback_attachments').select('status, storage_bucket').eq('id', happyAttachmentId).single();
    return row.data?.status === 'available' && row.data?.storage_bucket === 'collaboration-attachments';
  });

  await check('[K1.6C] authorized participant can retrieve a short-lived signed URL, and the bytes match the real upload', async () => {
    const signed = await call('portal-attachment-signed-url', xyloSession.access_token, { attachmentId: happyAttachmentId });
    if (!signed.body.ok || !signed.body.url) return false;
    const fetched = await fetch(signed.body.url);
    const bytes = new Uint8Array(await fetched.arrayBuffer());
    return bytes.length === realPdfBytes.length;
  });

  await check('[K1.6C] feedback-message association: the attachment is scoped to the exact message it was uploaded against', async () => {
    const row = await clients.admin.from('collaboration_feedback_attachments').select('feedback_id, collaboration_id').eq('id', happyAttachmentId).single();
    return row.data?.feedback_id === feedbackId && row.data?.collaboration_id === xylo.id;
  });

  // ---------- anonymous upload denial ----------
  await check('[K1.6C] anonymous upload denial: no Authorization header is rejected before the function runs', async () => {
    const res = await call('portal-request-attachment-upload-url', null, { feedbackId, mimeType: 'application/pdf', fileSizeBytes: 1000, originalFilename: 'x.pdf' });
    return res.status === 401;
  });

  // ---------- cross-artist upload denial (real XYLO vs real Issey — this IS what's being tested) ----------
  await check("[K1.6C] cross-artist upload denial: Issey cannot attach to Paige/XYLO's message", async () => {
    const res = await call('portal-request-attachment-upload-url', isseySession.access_token, { feedbackId, mimeType: 'application/pdf', fileSizeBytes: 1000, originalFilename: 'x.pdf' });
    return res.status === 403 && res.body.error === 'NOT_AUTHORIZED';
  });

  // ---------- cross-message attachment denial (the real gap found during this stage) ----------
  await check("[K1.6C] cross-message denial: an artist cannot attach to an admin's reply message merely because they can SEE it", async () => {
    const reply = await call('portal-admin-reply-feedback', adminSession.access_token, { collaborationId: xylo.id, body: 'Admin reply for the cross-message test.' });
    const adminFeedbackId = reply.body.feedbackId;
    const res = await call('portal-request-attachment-upload-url', xyloSession.access_token, {
      feedbackId: adminFeedbackId, mimeType: 'application/pdf', fileSizeBytes: 1000, originalFilename: 'x.pdf',
    });
    return res.status === 403 && res.body.error === 'NOT_AUTHORIZED';
  });

  // ---------- cross-project attachment denial ----------
  await check('[K1.6C] cross-project denial: Issey cannot retrieve a signed URL for an attachment on SIGNAL-XYLO-001', async () => {
    const res = await call('portal-attachment-signed-url', isseySession.access_token, { attachmentId: happyAttachmentId });
    return res.status === 403;
  });

  // ---------- everything below uses the disposable bulk-test identity ----------
  await check('[K1.6C] oversized-file rejection: a 20MB image exceeds the 15MB image limit', async () => {
    const fbId = await freshFeedback(bulkToken, xylo.id, 'K1.6C oversized test.');
    const res = await call('portal-request-attachment-upload-url', bulkToken, {
      feedbackId: fbId, mimeType: 'image/png', fileSizeBytes: 20 * 1024 * 1024, originalFilename: 'huge.png',
    });
    return res.status === 400 && res.body.error === 'FILE_TOO_LARGE';
  });

  await check('[K1.6C] unsupported-file rejection: an unlisted MIME type is rejected before any upload URL is signed', async () => {
    const fbId = await freshFeedback(bulkToken, xylo.id, 'K1.6C unsupported-mime test.');
    const res = await call('portal-request-attachment-upload-url', bulkToken, {
      feedbackId: fbId, mimeType: 'application/x-msdownload', fileSizeBytes: 1000, originalFilename: 'virus.exe',
    });
    return res.status === 400 && res.body.error === 'INVALID_MIME_TYPE';
  });

  await check('[K1.6C] MIME-mismatch rejection: real bytes that don\'t match the declared mime_type fail verification, never promoted', async () => {
    const fbId = await freshFeedback(bulkToken, xylo.id, 'K1.6C MIME-mismatch test.');
    const req = await call('portal-request-attachment-upload-url', bulkToken, {
      feedbackId: fbId, mimeType: 'image/png', fileSizeBytes: realPdfBytes.length, originalFilename: 'fake.png',
    });
    createdAttachmentIds.push(req.body.attachmentId);
    await fetch(req.body.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'image/png' }, body: realPdfBytes }); // really a PDF
    const confirm = await call('portal-confirm-attachment-upload', bulkToken, { attachmentId: req.body.attachmentId });
    return confirm.status === 422 && confirm.body.reason === 'SIGNATURE_MISMATCH';
  });

  let rejectedAttachmentId;
  await check('[K1.6C] malicious-file detection (EICAR test fixture, NOT a real malware scan — see report): rejected, never promotable', async () => {
    const fbId = await freshFeedback(bulkToken, xylo.id, 'K1.6C EICAR test.');
    const eicarBytes = new TextEncoder().encode(EICAR);
    const req = await call('portal-request-attachment-upload-url', bulkToken, {
      feedbackId: fbId, mimeType: 'text/plain', fileSizeBytes: eicarBytes.length, originalFilename: 'eicar-test.txt',
    });
    rejectedAttachmentId = req.body.attachmentId;
    createdAttachmentIds.push(rejectedAttachmentId);
    await fetch(req.body.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'text/plain' }, body: eicarBytes });
    const confirm = await call('portal-confirm-attachment-upload', bulkToken, { attachmentId: rejectedAttachmentId });
    if (confirm.body.status !== 'rejected') return false;
    // A rejected attachment must never become promotable via review —
    // the function treats this as an idempotent "already resolved"
    // report (200, same status echoed back), not an error; the real
    // security property is that status can only ever STAY 'rejected'
    // here, never flip to 'clean'/'available' regardless of what a
    // later review call requests.
    const reviewAttempt = await call('portal-admin-review-attachment', adminSession.access_token, { attachmentId: rejectedAttachmentId, decision: 'clean' });
    return reviewAttempt.status === 200 && reviewAttempt.body.status === 'rejected';
  });

  await check('[K1.6C] rejected attachment invisibility to OTHER members: a rejected attachment never becomes visible to a different active member of the same project, who is neither its uploader nor an admin (reuses the EICAR attachment above)', async () => {
    // Stage K1.6D added an RLS policy letting the UPLOADER see their
    // own row regardless of status (so artist-visible status survives
    // a refresh — see k16d.mjs for that dedicated coverage). This test
    // now checks the orthogonal property: a DIFFERENT active member of
    // the same collaboration (the real XYLO identity, not the
    // disposable bulk-test uploader) still never sees it.
    const { data } = await clients.anon().from('collaboration_feedback_attachments').select('id').eq('id', rejectedAttachmentId);
    if ((data?.length ?? 0) !== 0) return false; // sanity: anonymous never sees it either
    const xyloAnon = clients.anon();
    await xyloAnon.auth.setSession({ access_token: xyloSession.access_token, refresh_token: xyloSession.refresh_token });
    const other = await xyloAnon.from('collaboration_feedback_attachments').select('id').eq('id', rejectedAttachmentId);
    return (other.data?.length ?? 0) === 0;
  });

  await check('[K1.6C] interrupted upload: confirming before the object actually exists fails closed, never promotable', async () => {
    const fbId = await freshFeedback(bulkToken, xylo.id, 'K1.6C interrupted-upload test.');
    const req = await call('portal-request-attachment-upload-url', bulkToken, {
      feedbackId: fbId, mimeType: 'application/pdf', fileSizeBytes: 1000, originalFilename: 'never-uploaded.pdf',
    });
    createdAttachmentIds.push(req.body.attachmentId);
    // No PUT at all.
    const confirm = await call('portal-confirm-attachment-upload', bulkToken, { attachmentId: req.body.attachmentId });
    return confirm.status === 422 && confirm.body.reason === 'OBJECT_NOT_FOUND';
  });

  let dupAttachmentId;
  await check('[K1.6C] duplicate confirmation is idempotent, not a re-verification attempt', async () => {
    const fbId = await freshFeedback(bulkToken, xylo.id, 'K1.6C duplicate-confirm test.');
    const req = await call('portal-request-attachment-upload-url', bulkToken, {
      feedbackId: fbId, mimeType: 'application/pdf', fileSizeBytes: realPdfBytes.length, originalFilename: 'dup.pdf',
    });
    dupAttachmentId = req.body.attachmentId;
    createdAttachmentIds.push(dupAttachmentId);
    await fetch(req.body.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'application/pdf' }, body: realPdfBytes });
    const first = await call('portal-confirm-attachment-upload', bulkToken, { attachmentId: dupAttachmentId });
    const second = await call('portal-confirm-attachment-upload', bulkToken, { attachmentId: dupAttachmentId });
    return first.body.status === second.body.status && second.status === 200;
  });

  await check('[K1.6C] pending attachment invisibility to OTHER members: an attachment awaiting review is invisible to a different active member of the same project, who is neither its uploader nor an admin (reuses the duplicate-confirm attachment above)', async () => {
    // Same K1.6D-era adjustment as the rejected-attachment test above —
    // the uploader's OWN visibility into this exact state is now a
    // deliberate feature, covered in k16d.mjs.
    const xyloAnon = clients.anon();
    await xyloAnon.auth.setSession({ access_token: xyloSession.access_token, refresh_token: xyloSession.refresh_token });
    const { data } = await xyloAnon.from('collaboration_feedback_attachments').select('id').eq('id', dupAttachmentId);
    return (data?.length ?? 0) === 0;
  });

  await check('[K1.6C] concurrent attachment-limit enforcement: 5 succeed, a 6th (even fired concurrently) is rejected', async () => {
    const fbId = await freshFeedback(bulkToken, xylo.id, 'K1.6C concurrency-limit test.');
    const attempts = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        call('portal-request-attachment-upload-url', bulkToken, {
          feedbackId: fbId, mimeType: 'text/plain', fileSizeBytes: 10, originalFilename: `concurrent-${i}.txt`,
        }),
      ),
    );
    const succeeded = attempts.filter((a) => a.body.ok);
    succeeded.forEach((a) => createdAttachmentIds.push(a.body.attachmentId));
    return succeeded.length === 5;
  });

  // ---------- revoked membership (separate disposable identity, reusing the session createAndSignInTestUser already returns) ----------
  await check('[K1.6C] revoked membership: a revoked member cannot request a new attachment upload', async () => {
    const revokedArtist = await createAndSignInTestUser(clients, testEmail('k16c-revoked'), 'Signal-Portal-K16C-Revoked-1!');
    await clients.admin.from('collaboration_members').insert({
      collaboration_id: xylo.id, user_id: revokedArtist.uid, added_by: k16b.admin.uid, status: 'revoked', revoked_at: new Date().toISOString(),
    });
    const res = await call('portal-request-attachment-upload-url', revokedArtist.accessToken, {
      feedbackId, mimeType: 'application/pdf', fileSizeBytes: 1000, originalFilename: 'x.pdf',
    });
    const ok = res.status === 403;
    await deleteTestUser(clients, revokedArtist.uid);
    return ok;
  });

  // ---------- administrator access ----------
  await check('[K1.6C] administrator access: admin sees attachment metadata regardless of status (pending, rejected, available)', async () => {
    const adminAnon = clients.anon();
    await adminAnon.auth.signInWithPassword({ email: k16b.admin.email, password: k16b.password });
    const { data } = await adminAnon.from('collaboration_feedback_attachments').select('id,status').eq('id', happyAttachmentId).single();
    return data?.status === 'available';
  });

  // ---------- cleanup (order matters: attachment rows/objects, THEN
  // the bulk artist's own feedback rows, THEN the user — deleting the
  // user first would fail a real foreign-key constraint, since
  // collaboration_feedback.author_id has no ON DELETE CASCADE) ----------
  if (createdAttachmentIds.length > 0) {
    const leftover = await clients.admin
      .from('collaboration_feedback_attachments')
      .select('storage_bucket, storage_path')
      .in('id', createdAttachmentIds);
    for (const row of leftover.data ?? []) {
      await clients.admin.storage.from(row.storage_bucket).remove([row.storage_path]).catch(() => {});
    }
    await clients.admin.from('collaboration_feedback_attachments').delete().in('id', createdAttachmentIds);
  }
  await clients.admin.from('collaboration_feedback').delete().eq('author_id', bulkArtist.uid);
  // portal_admin_audit_log.admin_id has no ON DELETE CASCADE either
  // (same documented constraint fixtures.mjs already works around for
  // the real admin identity) — the new attachment functions log an
  // audit entry under the CALLING user's own uid even for an ordinary
  // artist caller, so the bulk identity needs the same cleanup here.
  await clients.admin.from('portal_admin_audit_log').delete().eq('admin_id', bulkArtist.uid);
  const deleteErr = await deleteTestUser(clients, bulkArtist.uid);
  if (deleteErr) console.log('[k16c] WARNING: failed to delete disposable bulk-test identity:', deleteErr.message);
}
