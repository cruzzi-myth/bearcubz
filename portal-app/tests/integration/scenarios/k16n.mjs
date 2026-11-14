// Stage K1.6N — confirms, against the real dev project (not just by
// reading the code), that the existing request-upload-url retirement
// logic already handles "replace a failed/oversized asset" safely:
// no explicit delete needed, and a different asset_type on the same
// collaboration is never touched. This is exactly the real-world
// scenario that happened in production (the owner uploaded original,
// unoptimized masters that genuinely exceeded the scanner threshold,
// and needs to re-upload the correct optimized files under the same
// category).
import { check } from '../_harness.mjs';
import { callEdgeFunction, bearerFor } from '../_functions.mjs';
import { syntheticAudioBytes, syntheticPdfBytes } from '../fixtures.mjs';

function oversizedAudioBytes() {
  // A real WAV header followed by enough data bytes to exceed the
  // production/dev 2,900,000-byte Cloudmersive-only threshold —
  // genuinely oversized, not just declared as such.
  const header = syntheticAudioBytes();
  const padding = Buffer.alloc(3_500_000 - header.length, 0);
  return Buffer.concat([header, padding]);
}

export async function run(ctx) {
  const { clients, fixtures, supabaseUrl, anonKey } = ctx;

  // --- a correctly-sized proposal, standing in for Issey's real already-approved proposal ---
  const proposalReq = await callEdgeFunction(supabaseUrl, anonKey, 'portal-admin-request-upload-url', {
    authHeader: bearerFor(fixtures.adminIdentity),
    body: { collaborationId: fixtures.collab1Id, assetType: 'proposal_pdf', mimeType: 'application/pdf', fileSizeBytes: syntheticPdfBytes().length, displayLabel: 'K1.6N correct proposal (different category, must stay untouched)' },
  });
  await fetch(proposalReq.body.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'application/pdf' }, body: syntheticPdfBytes() });
  await callEdgeFunction(supabaseUrl, anonKey, 'portal-admin-confirm-upload', { authHeader: bearerFor(fixtures.adminIdentity), body: { assetId: proposalReq.body.assetId } });
  await callEdgeFunction(supabaseUrl, anonKey, 'portal-admin-review-asset', { authHeader: bearerFor(fixtures.adminIdentity), body: { assetId: proposalReq.body.assetId, decision: 'approve' } });

  // --- the mistake: an oversized audio_full upload, exactly like what happened in production ---
  const oversized = oversizedAudioBytes();
  const audioReq1 = await callEdgeFunction(supabaseUrl, anonKey, 'portal-admin-request-upload-url', {
    authHeader: bearerFor(fixtures.adminIdentity),
    body: { collaborationId: fixtures.collab1Id, assetType: 'audio_full', mimeType: 'audio/wav', fileSizeBytes: oversized.length, displayLabel: 'K1.6N oversized original (the mistake)' },
  });
  await fetch(audioReq1.body.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'audio/wav' }, body: oversized });
  await callEdgeFunction(supabaseUrl, anonKey, 'portal-admin-confirm-upload', { authHeader: bearerFor(fixtures.adminIdentity), body: { assetId: audioReq1.body.assetId } });

  await check('the oversized upload genuinely fails with EXCEEDS_SCANNER_SIZE_LIMIT (unsupported), not fabricated', async () => {
    const { data } = await clients.admin.from('collaboration_assets').select('security_status, upload_status, scan_evidence').eq('id', audioReq1.body.assetId).single();
    return data?.security_status === 'error' && data?.upload_status === 'verifying' && data?.scan_evidence?.errorCategory === 'EXCEEDS_SCANNER_SIZE_LIMIT' && data?.scan_evidence?.verdict === 'unsupported';
  });

  await check('that failed row is still active (not yet retired) until a retry is actually attempted', async () => {
    const { data } = await clients.admin.from('collaboration_assets').select('is_active').eq('id', audioReq1.body.assetId).single();
    return data?.is_active === true;
  });

  // --- the fix: re-upload the correct, properly-sized file under the SAME category ---
  const audioReq2 = await callEdgeFunction(supabaseUrl, anonKey, 'portal-admin-request-upload-url', {
    authHeader: bearerFor(fixtures.adminIdentity),
    body: { collaborationId: fixtures.collab1Id, assetType: 'audio_full', mimeType: 'audio/wav', fileSizeBytes: syntheticAudioBytes().length, displayLabel: 'K1.6N correct optimized replacement' },
  });

  await check('requesting a new upload for the same collaboration+category automatically retires the oversized attempt — no manual delete or Mark Inactive needed', async () => {
    const { data } = await clients.admin.from('collaboration_assets').select('is_active').eq('id', audioReq1.body.assetId).single();
    return data?.is_active === false;
  });

  await fetch(audioReq2.body.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'audio/wav' }, body: syntheticAudioBytes() });
  const confirmed2 = await callEdgeFunction(supabaseUrl, anonKey, 'portal-admin-confirm-upload', { authHeader: bearerFor(fixtures.adminIdentity), body: { assetId: audioReq2.body.assetId } });

  await check('the correctly-sized replacement genuinely scans clean', async () => {
    const { data } = await clients.admin.from('collaboration_assets').select('security_status').eq('id', audioReq2.body.assetId).single();
    return data?.security_status === 'clean';
  });
  await check('confirmUpload for the replacement itself never fabricates ready/approved', () => confirmed2.body.uploadStatus !== 'ready');

  await check('the already-approved, different-category proposal is completely untouched by any of this (different asset_type, never matched by the retirement query)', async () => {
    const { data } = await clients.admin.from('collaboration_assets').select('is_active, upload_status, security_status, security_review_status').eq('id', proposalReq.body.assetId).single();
    return data?.is_active === true && data?.upload_status === 'ready' && data?.security_status === 'clean' && data?.security_review_status === 'approved';
  });

  await check('the retired oversized row itself is never deleted — its audit trail survives (preserve genuine evidence, never fabricate)', async () => {
    const { data } = await clients.admin.from('collaboration_assets').select('id, scan_evidence').eq('id', audioReq1.body.assetId).maybeSingle();
    return data?.id === audioReq1.body.assetId && data?.scan_evidence?.errorCategory === 'EXCEEDS_SCANNER_SIZE_LIMIT';
  });

  await clients.admin.from('collaboration_assets').delete().in('id', [proposalReq.body.assetId, audioReq1.body.assetId, audioReq2.body.assetId]);
}
