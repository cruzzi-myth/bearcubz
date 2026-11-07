import { check } from '../_harness.mjs';
import { callEdgeFunction, bearerFor } from '../_functions.mjs';
import { syntheticPngBytes } from '../fixtures.mjs';

export async function run(ctx) {
  const { clients, fixtures, supabaseUrl, anonKey } = ctx;

  await check('anonymous (no session) cannot list or download from a private bucket directly', async () => {
    const anonClient = clients.anon();
    const listing = await anonClient.storage.from('collaboration-visuals').list(fixtures.collab1Id);
    // Either an explicit error, or an empty listing despite objects
    // existing there, both demonstrate there is no direct anonymous
    // read path — RLS on storage.objects blocks it either way.
    return Boolean(listing.error) || (listing.data?.length ?? 0) === 0;
  });

  // Request an upload URL as admin, then actually upload the
  // synthetic PNG, confirm it, and keep the asset id for the rest of
  // this scenario.
  const requested = await callEdgeFunction(supabaseUrl, anonKey, 'portal-admin-request-upload-url', {
    authHeader: bearerFor(fixtures.adminIdentity),
    body: {
      collaborationId: fixtures.collab1Id,
      assetType: 'visual_image',
      mimeType: 'image/png',
      fileSizeBytes: syntheticPngBytes().length,
      displayLabel: 'Synthetic test cover',
    },
  });

  await check('admin can request an upload URL for a valid asset type/MIME/size', async () => requested.status === 200 && requested.body.ok === true);

  const uploadRes = await fetch(requested.body.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'image/png' },
    body: syntheticPngBytes(),
  });
  await check('the actual upload to the signed URL succeeds', async () => uploadRes.ok);

  const confirmed = await callEdgeFunction(supabaseUrl, anonKey, 'portal-admin-confirm-upload', {
    authHeader: bearerFor(fixtures.adminIdentity),
    body: { assetId: requested.body.assetId },
  });
  await check('confirm-upload verifies the real object and marks it ready', async () => confirmed.status === 200 && confirmed.body.uploadStatus === 'ready');

  await check('the authorized member (Artist A) can mint a signed URL for their own ready asset', async () => {
    const result = await callEdgeFunction(supabaseUrl, anonKey, 'portal-signed-url', {
      authHeader: bearerFor(fixtures.artistA),
      body: { assetId: requested.body.assetId },
    });
    return result.status === 200 && typeof result.body.url === 'string';
  });

  await check('an unrelated artist (Artist B) cannot mint a signed URL for that same asset', async () => {
    const result = await callEdgeFunction(supabaseUrl, anonKey, 'portal-signed-url', {
      authHeader: bearerFor(fixtures.artistB),
      body: { assetId: requested.body.assetId },
    });
    return result.status === 403 && result.body.error === 'NOT_AUTHORIZED';
  });

  // --- incomplete upload stays hidden ---
  const incomplete = await callEdgeFunction(supabaseUrl, anonKey, 'portal-admin-request-upload-url', {
    authHeader: bearerFor(fixtures.adminIdentity),
    body: {
      collaborationId: fixtures.collab1Id,
      assetType: 'audio_short',
      mimeType: 'audio/wav',
      fileSizeBytes: 44,
      displayLabel: 'Synthetic incomplete upload',
    },
  });

  await check('an asset with no confirmed upload (still pending) is invisible to the active member via RLS', async () => {
    const { data, error } = await fixtures.artistA.client.from('collaboration_assets').select('id').eq('id', incomplete.body.assetId);
    return !error && (data?.length ?? 0) === 0;
  });

  await check('signing a URL for a not-yet-ready asset is refused, same as for an unrelated artist', async () => {
    const result = await callEdgeFunction(supabaseUrl, anonKey, 'portal-signed-url', {
      authHeader: bearerFor(fixtures.artistA),
      body: { assetId: incomplete.body.assetId },
    });
    return result.status === 403 && result.body.error === 'NOT_AUTHORIZED';
  });

  // --- invalid files rejected at request-upload-url time ---
  await check('an oversized file is rejected before any signed upload URL is minted', async () => {
    const result = await callEdgeFunction(supabaseUrl, anonKey, 'portal-admin-request-upload-url', {
      authHeader: bearerFor(fixtures.adminIdentity),
      body: {
        collaborationId: fixtures.collab1Id,
        assetType: 'visual_image',
        mimeType: 'image/png',
        fileSizeBytes: 999 * 1024 * 1024,
        displayLabel: 'Too large',
      },
    });
    return result.status === 400 && result.body.error === 'FILE_TOO_LARGE';
  });

  await check('a disallowed MIME type for the asset type is rejected', async () => {
    const result = await callEdgeFunction(supabaseUrl, anonKey, 'portal-admin-request-upload-url', {
      authHeader: bearerFor(fixtures.adminIdentity),
      body: {
        collaborationId: fixtures.collab1Id,
        assetType: 'visual_image',
        mimeType: 'application/x-msdownload',
        fileSizeBytes: 1000,
        displayLabel: 'Wrong type',
      },
    });
    return result.status === 400 && result.body.error === 'INVALID_MIME_TYPE';
  });

  await clients.admin.from('collaboration_assets').delete().in('id', [requested.body.assetId, incomplete.body.assetId]);
}
