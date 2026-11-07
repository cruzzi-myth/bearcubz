import { check } from '../_harness.mjs';
import { callEdgeFunction, bearerFor } from '../_functions.mjs';

export async function run(ctx) {
  const { clients, fixtures, supabaseUrl, anonKey } = ctx;

  const artistASubmission = await callEdgeFunction(supabaseUrl, anonKey, 'portal-submit-feedback', {
    authHeader: bearerFor(fixtures.artistA),
    body: { collaborationId: fixtures.collab1Id, kind: 'general', body: 'Synthetic feedback from Artist A.' },
  });
  await check('Artist A can submit feedback on their own collaboration', async () => artistASubmission.status === 200 && artistASubmission.body.ok === true);

  const artistBSubmission = await callEdgeFunction(supabaseUrl, anonKey, 'portal-submit-feedback', {
    authHeader: bearerFor(fixtures.artistB),
    body: { collaborationId: fixtures.collab2Id, kind: 'general', body: 'Synthetic feedback from Artist B.' },
  });
  await check('Artist B can submit feedback on their own (different) collaboration', async () => artistBSubmission.status === 200);

  await check("Artist A cannot read Artist B's private feedback thread (different collaboration entirely)", async () => {
    const { data, error } = await fixtures.artistA.client.from('collaboration_feedback').select('id').eq('collaboration_id', fixtures.collab2Id);
    return !error && (data?.length ?? 0) === 0;
  });

  await check('Artist B cannot submit feedback into a collaboration they are not a member of', async () => {
    const result = await callEdgeFunction(supabaseUrl, anonKey, 'portal-submit-feedback', {
      authHeader: bearerFor(fixtures.artistB),
      body: { collaborationId: fixtures.collab1Id, kind: 'general', body: 'Should be rejected.' },
    });
    return result.status === 403 && result.body.error === 'NOT_AUTHORIZED';
  });

  // --- Stage I3M: cross-collaboration assetId references ---
  const collab2AssetRequest = await callEdgeFunction(supabaseUrl, anonKey, 'portal-admin-request-upload-url', {
    authHeader: bearerFor(fixtures.adminIdentity),
    body: {
      collaborationId: fixtures.collab2Id,
      assetType: 'visual_concept',
      mimeType: 'image/png',
      fileSizeBytes: 1024,
      displayLabel: 'Synthetic cross-collab asset (Collab 2)',
    },
  });
  const collab2AssetId = collab2AssetRequest.body?.assetId;

  await check('an asset belonging to a DIFFERENT collaboration is rejected, not silently accepted', async () => {
    const result = await callEdgeFunction(supabaseUrl, anonKey, 'portal-submit-feedback', {
      authHeader: bearerFor(fixtures.artistA),
      body: {
        collaborationId: fixtures.collab1Id,
        assetId: collab2AssetId,
        kind: 'general',
        body: 'Should be rejected -- assetId belongs to Collab 2, not Collab 1.',
      },
    });
    return result.status === 403 && result.body.error === 'NOT_AUTHORIZED';
  });

  await check('the rejected cross-collaboration attempt did not insert a feedback row', async () => {
    const { data, error } = await fixtures.artistA.client
      .from('collaboration_feedback')
      .select('id')
      .eq('collaboration_id', fixtures.collab1Id)
      .eq('asset_id', collab2AssetId);
    return !error && (data?.length ?? 0) === 0;
  });

  await check('a nonexistent assetId is rejected with the SAME error as a cross-collaboration one (no existence leak)', async () => {
    const result = await callEdgeFunction(supabaseUrl, anonKey, 'portal-submit-feedback', {
      authHeader: bearerFor(fixtures.artistA),
      body: {
        collaborationId: fixtures.collab1Id,
        assetId: '00000000-0000-0000-0000-000000000000',
        kind: 'general',
        body: 'Should be rejected -- assetId does not exist at all.',
      },
    });
    return result.status === 403 && result.body.error === 'NOT_AUTHORIZED';
  });

  const collab1AssetRequest = await callEdgeFunction(supabaseUrl, anonKey, 'portal-admin-request-upload-url', {
    authHeader: bearerFor(fixtures.adminIdentity),
    body: {
      collaborationId: fixtures.collab1Id,
      assetType: 'visual_concept',
      mimeType: 'image/png',
      fileSizeBytes: 1024,
      displayLabel: 'Synthetic cross-collab asset (Collab 1)',
    },
  });
  const collab1AssetId = collab1AssetRequest.body?.assetId;

  await check("Artist B (a Collab 2 member) also cannot reference Collab 1's assets from Collab 2", async () => {
    const result = await callEdgeFunction(supabaseUrl, anonKey, 'portal-submit-feedback', {
      authHeader: bearerFor(fixtures.artistB),
      body: {
        collaborationId: fixtures.collab2Id,
        assetId: collab1AssetId,
        kind: 'general',
        body: 'Should be rejected -- assetId belongs to Collab 1, not Collab 2.',
      },
    });
    return result.status === 403 && result.body.error === 'NOT_AUTHORIZED';
  });

  // --- recipient-scoped admin reply, within the one deliberately
  // multi-member collaboration (Collab 1: Artist A + Artist C) ---
  const scopedReply = await callEdgeFunction(supabaseUrl, anonKey, 'portal-admin-reply-feedback', {
    authHeader: bearerFor(fixtures.adminIdentity),
    body: { collaborationId: fixtures.collab1Id, body: 'Synthetic admin reply, for Artist A only.', recipientUserId: fixtures.artistA.uid },
  });
  await check('admin can post a reply scoped to one specific member', async () => scopedReply.status === 200 && scopedReply.body.ok === true);

  await check('the intended recipient (Artist A) can see the scoped reply', async () => {
    const { data, error } = await fixtures.artistA.client
      .from('collaboration_feedback')
      .select('id')
      .eq('collaboration_id', fixtures.collab1Id)
      .eq('is_admin_reply', true)
      .eq('recipient_user_id', fixtures.artistA.uid);
    return !error && (data?.length ?? 0) >= 1;
  });

  await check('the OTHER active member of the same collaboration (Artist C) cannot see the scoped reply', async () => {
    const { data, error } = await fixtures.artistC.client
      .from('collaboration_feedback')
      .select('id')
      .eq('collaboration_id', fixtures.collab1Id)
      .eq('recipient_user_id', fixtures.artistA.uid);
    return !error && (data?.length ?? 0) === 0;
  });

  await check('Artist C still sees their OWN submitted feedback (privacy scoping does not hide self-authored rows)', async () => {
    await callEdgeFunction(supabaseUrl, anonKey, 'portal-submit-feedback', {
      authHeader: bearerFor(fixtures.artistC),
      body: { collaborationId: fixtures.collab1Id, kind: 'general', body: 'Synthetic feedback from Artist C.' },
    });
    const { data, error } = await fixtures.artistC.client.from('collaboration_feedback').select('id').eq('author_id', fixtures.artistC.uid);
    return !error && (data?.length ?? 0) >= 1;
  });

  await check('an unscoped admin reply (no recipientUserId, NULL) remains visible to every active member', async () => {
    const unscoped = await callEdgeFunction(supabaseUrl, anonKey, 'portal-admin-reply-feedback', {
      authHeader: bearerFor(fixtures.adminIdentity),
      body: { collaborationId: fixtures.collab1Id, body: 'Synthetic unscoped admin reply, visible to the whole collaboration.' },
    });
    if (unscoped.status !== 200) return false;
    const [asA, asC] = await Promise.all([
      fixtures.artistA.client.from('collaboration_feedback').select('id').eq('collaboration_id', fixtures.collab1Id).eq('is_admin_reply', true).is('recipient_user_id', null),
      fixtures.artistC.client.from('collaboration_feedback').select('id').eq('collaboration_id', fixtures.collab1Id).eq('is_admin_reply', true).is('recipient_user_id', null),
    ]);
    return (asA.data?.length ?? 0) >= 1 && (asC.data?.length ?? 0) >= 1;
  });
}
