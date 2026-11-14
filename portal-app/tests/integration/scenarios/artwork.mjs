import { check } from '../_harness.mjs';
import { callEdgeFunction, bearerFor } from '../_functions.mjs';
import { syntheticPngBytes, syntheticAudioBytes } from '../fixtures.mjs';

async function uploadReadyCover(ctx, label) {
  const { clients, fixtures, supabaseUrl, anonKey } = ctx;
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
  await callEdgeFunction(supabaseUrl, anonKey, 'portal-admin-confirm-upload', {
    authHeader: bearerFor(fixtures.adminIdentity),
    body: { assetId: requested.body.assetId },
  });
  const released = await callEdgeFunction(supabaseUrl, anonKey, 'portal-admin-review-asset', { authHeader: bearerFor(fixtures.adminIdentity), body: { assetId: requested.body.assetId, decision: 'approve' } });
  if (released.status !== 200) throw new Error('Synthetic cover security release was not cleared');
  return requested.body.assetId;
}

export async function run(ctx) {
  const { clients, fixtures, supabaseUrl, anonKey } = ctx;

  const coverOne = await uploadReadyCover(ctx, 'Synthetic cover one');
  const coverTwo = await uploadReadyCover(ctx, 'Synthetic cover two');

  const promoteOne = await callEdgeFunction(supabaseUrl, anonKey, 'portal-admin-manage-collaboration', {
    authHeader: bearerFor(fixtures.adminIdentity),
    body: { op: 'update_asset', assetId: coverOne, isPrimaryCover: true },
  });
  await check('promoting the first ready cover succeeds', async () => promoteOne.status === 200 && promoteOne.body.ok === true);

  await check('exactly one asset is primary cover after the first promotion', async () => {
    const { data } = await clients.admin.from('collaboration_assets').select('id').eq('collaboration_id', fixtures.collab1Id).eq('is_primary_cover', true);
    return data?.length === 1 && data[0].id === coverOne;
  });

  const promoteTwo = await callEdgeFunction(supabaseUrl, anonKey, 'portal-admin-manage-collaboration', {
    authHeader: bearerFor(fixtures.adminIdentity),
    body: { op: 'update_asset', assetId: coverTwo, isPrimaryCover: true },
  });
  await check('atomic replacement: promoting the second cover succeeds', async () => promoteTwo.status === 200 && promoteTwo.body.ok === true);

  await check('atomic replacement: still exactly one primary cover, now the second one, never zero or two', async () => {
    const { data } = await clients.admin.from('collaboration_assets').select('id').eq('collaboration_id', fixtures.collab1Id).eq('is_primary_cover', true);
    return data?.length === 1 && data[0].id === coverTwo;
  });

  // --- failed promotion preserves the original ---
  const notReady = await callEdgeFunction(supabaseUrl, anonKey, 'portal-admin-request-upload-url', {
    authHeader: bearerFor(fixtures.adminIdentity),
    body: { collaborationId: fixtures.collab1Id, assetType: 'track_cover', mimeType: 'image/png', fileSizeBytes: 10, displayLabel: 'Never uploaded' },
  });
  const failedPromote = await callEdgeFunction(supabaseUrl, anonKey, 'portal-admin-manage-collaboration', {
    authHeader: bearerFor(fixtures.adminIdentity),
    body: { op: 'update_asset', assetId: notReady.body.assetId, isPrimaryCover: true },
  });
  await check('promoting a not-ready asset is rejected with ASSET_NOT_READY, not a silent success', async () => failedPromote.status === 409 && failedPromote.body.error === 'ASSET_NOT_READY');

  await check('after a failed promotion attempt, the real primary cover (coverTwo) is unchanged', async () => {
    const { data } = await clients.admin.from('collaboration_assets').select('id').eq('collaboration_id', fixtures.collab1Id).eq('is_primary_cover', true);
    return data?.length === 1 && data[0].id === coverTwo;
  });

  // --- rejected-approval asset cannot be promoted ---
  const rejectedCover = await uploadReadyCover(ctx, 'Synthetic rejected cover');
  await callEdgeFunction(supabaseUrl, anonKey, 'portal-admin-manage-collaboration', {
    authHeader: bearerFor(fixtures.adminIdentity),
    body: { op: 'update_asset', assetId: rejectedCover, approvalStatus: 'rejected' },
  });
  const rejectPromote = await callEdgeFunction(supabaseUrl, anonKey, 'portal-admin-manage-collaboration', {
    authHeader: bearerFor(fixtures.adminIdentity),
    body: { op: 'update_asset', assetId: rejectedCover, isPrimaryCover: true },
  });
  await check('promoting a rejected-approval asset is refused with ASSET_REJECTED', async () => rejectPromote.status === 409 && rejectPromote.body.error === 'ASSET_REJECTED');

  // --- concurrent promotion maintains uniqueness ---
  const coverThree = await uploadReadyCover(ctx, 'Synthetic cover three');
  await check('concurrent promotion of two different ready covers in the same collaboration still yields exactly one primary', async () => {
    await Promise.allSettled([
      callEdgeFunction(supabaseUrl, anonKey, 'portal-admin-manage-collaboration', {
        authHeader: bearerFor(fixtures.adminIdentity),
        body: { op: 'update_asset', assetId: coverOne, isPrimaryCover: true },
      }),
      callEdgeFunction(supabaseUrl, anonKey, 'portal-admin-manage-collaboration', {
        authHeader: bearerFor(fixtures.adminIdentity),
        body: { op: 'update_asset', assetId: coverThree, isPrimaryCover: true },
      }),
    ]);
    const { data } = await clients.admin.from('collaboration_assets').select('id').eq('collaboration_id', fixtures.collab1Id).eq('is_primary_cover', true);
    return data?.length === 1;
  });

  const { data: primaryBeforeGaps } = await clients.admin
    .from('collaboration_assets')
    .select('id')
    .eq('collaboration_id', fixtures.collab1Id)
    .eq('is_primary_cover', true);
  const primaryBeforeGapsId = primaryBeforeGaps?.[0]?.id;

  // --- Stage I2C: inactive asset is rejected ---
  const inactiveCover = await uploadReadyCover(ctx, 'Synthetic inactive cover');
  await callEdgeFunction(supabaseUrl, anonKey, 'portal-admin-manage-collaboration', {
    authHeader: bearerFor(fixtures.adminIdentity),
    body: { op: 'mark_asset_inactive', assetId: inactiveCover },
  });
  const inactivePromote = await callEdgeFunction(supabaseUrl, anonKey, 'portal-admin-manage-collaboration', {
    authHeader: bearerFor(fixtures.adminIdentity),
    body: { op: 'update_asset', assetId: inactiveCover, isPrimaryCover: true },
  });
  await check('promoting an inactive asset is DENIED with ASSET_INACTIVE', async () => inactivePromote.status === 409 && inactivePromote.body.error === 'ASSET_INACTIVE');
  await check('after the inactive-asset attempt, the real primary cover is unchanged', async () => {
    const { data } = await clients.admin.from('collaboration_assets').select('id').eq('collaboration_id', fixtures.collab1Id).eq('is_primary_cover', true);
    return data?.length === 1 && data[0].id === primaryBeforeGapsId;
  });

  // --- Stage I2C: non-visual asset type is rejected ---
  const requestedAudio = await callEdgeFunction(supabaseUrl, anonKey, 'portal-admin-request-upload-url', {
    authHeader: bearerFor(fixtures.adminIdentity),
    body: { collaborationId: fixtures.collab1Id, assetType: 'audio_short', mimeType: 'audio/wav', fileSizeBytes: syntheticAudioBytes().length, displayLabel: 'Synthetic audio, not a cover' },
  });
  await fetch(requestedAudio.body.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'audio/wav' }, body: syntheticAudioBytes() });
  await callEdgeFunction(supabaseUrl, anonKey, 'portal-admin-confirm-upload', {
    authHeader: bearerFor(fixtures.adminIdentity),
    body: { assetId: requestedAudio.body.assetId },
  });
  await callEdgeFunction(supabaseUrl, anonKey, 'portal-admin-review-asset', { authHeader: bearerFor(fixtures.adminIdentity), body: { assetId: requestedAudio.body.assetId, decision: 'approve' } });
  const audioPromote = await callEdgeFunction(supabaseUrl, anonKey, 'portal-admin-manage-collaboration', {
    authHeader: bearerFor(fixtures.adminIdentity),
    body: { op: 'update_asset', assetId: requestedAudio.body.assetId, isPrimaryCover: true },
  });
  await check('promoting a non-visual (audio) asset type is DENIED with NOT_A_COVER_ELIGIBLE_TYPE', async () => audioPromote.status === 409 && audioPromote.body.error === 'NOT_A_COVER_ELIGIBLE_TYPE');
  await check('after the non-visual-type attempt, the real primary cover is still unchanged', async () => {
    const { data } = await clients.admin.from('collaboration_assets').select('id').eq('collaboration_id', fixtures.collab1Id).eq('is_primary_cover', true);
    return data?.length === 1 && data[0].id === primaryBeforeGapsId;
  });

  await clients.admin
    .from('collaboration_assets')
    .delete()
    .in('id', [coverOne, coverTwo, coverThree, notReady.body.assetId, rejectedCover, inactiveCover, requestedAudio.body.assetId]);
}
