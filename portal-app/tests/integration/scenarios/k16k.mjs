// Stage K1.6K — portal-admin-asset-signed-url. The artist-facing
// portal-signed-url function refuses to sign anything until
// security_review_status = 'approved', which makes it unusable for
// an admin trying to preview an asset in order to decide whether to
// approve it. This exercises the separate admin-only function that
// drops only that one requirement.
import { check } from '../_harness.mjs';
import { callEdgeFunction, bearerFor } from '../_functions.mjs';
import { syntheticPngBytes } from '../fixtures.mjs';

async function uploadToClean(ctx, label) {
  const { fixtures, supabaseUrl, anonKey } = ctx;
  const requested = await callEdgeFunction(supabaseUrl, anonKey, 'portal-admin-request-upload-url', {
    authHeader: bearerFor(fixtures.adminIdentity),
    body: {
      collaborationId: fixtures.collab1Id,
      assetType: 'track_cover',
      mimeType: 'image/png',
      fileSizeBytes: syntheticPngBytes().length,
      displayLabel: label,
    },
  });
  await fetch(requested.body.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'image/png' }, body: syntheticPngBytes() });
  const confirmed = await callEdgeFunction(supabaseUrl, anonKey, 'portal-admin-confirm-upload', {
    authHeader: bearerFor(fixtures.adminIdentity),
    body: { assetId: requested.body.assetId },
  });
  return { assetId: requested.body.assetId, confirmed };
}

export async function run(ctx) {
  const { clients, fixtures, supabaseUrl, anonKey } = ctx;

  const { assetId: cleanUnapproved, confirmed } = await uploadToClean(ctx, 'K1.6K synthetic cover, clean but unreviewed');
  await check('confirm-upload triggers a real scan and the asset reaches security_status = clean', async () => {
    const { data } = await clients.admin.from('collaboration_assets').select('security_status, security_review_status').eq('id', cleanUnapproved).single();
    return data?.security_status === 'clean' && data?.security_review_status === 'pending';
  });
  await check('confirmUpload itself never flips upload_status to ready before review', () => confirmed.body.uploadStatus !== 'ready');

  const previewBeforeApproval = await callEdgeFunction(supabaseUrl, anonKey, 'portal-admin-asset-signed-url', {
    authHeader: bearerFor(fixtures.adminIdentity),
    body: { assetId: cleanUnapproved },
  });
  await check('admin CAN preview a clean-but-not-yet-approved asset (the whole point of this function)', () => previewBeforeApproval.status === 200 && typeof previewBeforeApproval.body.url === 'string');

  const artistPreviewAttempt = await callEdgeFunction(supabaseUrl, anonKey, 'portal-signed-url', {
    authHeader: bearerFor(fixtures.adminIdentity),
    body: { assetId: cleanUnapproved },
  });
  await check('the artist-facing portal-signed-url correctly still refuses the SAME asset before approval (unaffected by this change)', () => artistPreviewAttempt.status === 403);

  const nonAdminPreview = await callEdgeFunction(supabaseUrl, anonKey, 'portal-admin-asset-signed-url', {
    authHeader: bearerFor(fixtures.artistA),
    body: { assetId: cleanUnapproved },
  });
  await check('a non-admin caller is rejected with NOT_AUTHORIZED, never signed a URL', () => nonAdminPreview.status === 403 && nonAdminPreview.body.error === 'NOT_AUTHORIZED');

  // --- never-scanned (still pending) asset cannot be previewed ---
  const requestedOnly = await callEdgeFunction(supabaseUrl, anonKey, 'portal-admin-request-upload-url', {
    authHeader: bearerFor(fixtures.adminIdentity),
    body: { collaborationId: fixtures.collab1Id, assetType: 'proposal_pdf', mimeType: 'application/pdf', fileSizeBytes: 10, displayLabel: 'Never uploaded, never scanned' },
  });
  const previewNeverScanned = await callEdgeFunction(supabaseUrl, anonKey, 'portal-admin-asset-signed-url', {
    authHeader: bearerFor(fixtures.adminIdentity),
    body: { assetId: requestedOnly.body.assetId },
  });
  await check('an asset still security_status=pending (no genuine evidence yet) is refused, not signed', () => previewNeverScanned.status === 403 && previewNeverScanned.body.error === 'NOT_AUTHORIZED');

  // --- an inactive (retired) asset cannot be previewed even if it was clean ---
  await clients.admin.from('collaboration_assets').update({ is_active: false }).eq('id', cleanUnapproved);
  const previewInactive = await callEdgeFunction(supabaseUrl, anonKey, 'portal-admin-asset-signed-url', {
    authHeader: bearerFor(fixtures.adminIdentity),
    body: { assetId: cleanUnapproved },
  });
  await check('a retired (is_active = false) asset is refused even though its scan evidence was genuinely clean', () => previewInactive.status === 403);

  await clients.admin.from('collaboration_assets').delete().in('id', [cleanUnapproved, requestedOnly.body.assetId]);
}
