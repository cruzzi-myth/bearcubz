import { check } from '../_harness.mjs';
import { callEdgeFunction, callEdgeFunctionWithNoAuthHeader, bearerFor } from '../_functions.mjs';

export async function run(ctx) {
  const { fixtures, supabaseUrl, anonKey } = ctx;

  await check("Artist A cannot see Collab 2 (Artist B's project)", async () => {
    const { data, error } = await fixtures.artistA.client.from('collaborations').select('id').eq('id', fixtures.collab2Id);
    return !error && (data?.length ?? 0) === 0;
  });

  await check("Artist B cannot see Collab 1 (Artist A's project)", async () => {
    const { data, error } = await fixtures.artistB.client.from('collaborations').select('id').eq('id', fixtures.collab1Id);
    return !error && (data?.length ?? 0) === 0;
  });

  await check("Artist A cannot read Collab 2's assets", async () => {
    const { data, error } = await fixtures.artistA.client.from('collaboration_assets').select('id').eq('collaboration_id', fixtures.collab2Id);
    return !error && (data?.length ?? 0) === 0;
  });

  await check("Artist A cannot read Collab 2's membership roster", async () => {
    const { data, error } = await fixtures.artistA.client.from('collaboration_members').select('user_id').eq('collaboration_id', fixtures.collab2Id);
    return !error && (data?.length ?? 0) === 0;
  });

  await check("Artist A cannot read Collab 2's feedback thread", async () => {
    const { data, error } = await fixtures.artistA.client.from('collaboration_feedback').select('id').eq('collaboration_id', fixtures.collab2Id);
    return !error && (data?.length ?? 0) === 0;
  });

  await check('revoked member cannot read any asset in the collaboration they were revoked from', async () => {
    const { data, error } = await fixtures.revokedArtist.client.from('collaboration_assets').select('id').eq('collaboration_id', fixtures.collab1Id);
    return !error && (data?.length ?? 0) === 0;
  });

  await check('revoked member CAN still see their own (now-revoked) membership row', async () => {
    const { data, error } = await fixtures.revokedArtist.client.from('collaboration_members').select('status').eq('collaboration_id', fixtures.collab1Id);
    return !error && data?.length === 1 && data[0].status === 'revoked';
  });

  await check('an authenticated but never-invited user sees zero collaborations anywhere', async () => {
    const { data, error } = await fixtures.unauthorizedUser.client.from('collaborations').select('id');
    return !error && (data?.length ?? 0) === 0;
  });

  const adminOnlyOps = [
    { fn: 'portal-admin-manage-collaboration', body: { op: 'update_collaboration', collaborationId: fixtures.collab1Id, status: 'active' } },
    { fn: 'portal-admin-create-invitation', body: { email: 'should-not-be-created@signal-portal-test.invalid' } },
    { fn: 'portal-admin-list-invitations', body: {} },
    { fn: 'portal-admin-reply-feedback', body: { collaborationId: fixtures.collab1Id, body: 'should not be allowed' } },
    { fn: 'portal-admin-request-upload-url', body: { collaborationId: fixtures.collab1Id, assetType: 'visual_image', mimeType: 'image/png', fileSizeBytes: 100, displayLabel: 'x' } },
    { fn: 'portal-admin-confirm-upload', body: { assetId: '00000000-0000-0000-0000-000000000000' } },
  ];

  for (const { fn, body } of adminOnlyOps) {
    await check(`non-admin (Artist A) calling ${fn} is rejected with 403, never performs the operation`, async () => {
      const result = await callEdgeFunction(supabaseUrl, anonKey, fn, { authHeader: bearerFor(fixtures.artistA), body });
      return result.status === 403 && result.body.error === 'NOT_AUTHORIZED';
    });
  }

  await check(
    'a logged-out caller (anon key only, no real user session — what a real browser actually sends) is rejected by the app\'s own NOT_AUTHORIZED check',
    async () => {
      const result = await callEdgeFunction(supabaseUrl, anonKey, 'portal-admin-manage-collaboration', {
        body: { op: 'update_collaboration', collaborationId: fixtures.collab1Id },
      });
      return result.status === 403 && result.body.error === 'NOT_AUTHORIZED';
    },
  );

  await check(
    'a request with NO Authorization header at all is rejected at the platform gateway (verify_jwt), a distinct, earlier layer than the app\'s own check',
    async () => {
      const result = await callEdgeFunctionWithNoAuthHeader(supabaseUrl, anonKey, 'portal-admin-manage-collaboration', {
        op: 'update_collaboration',
        collaborationId: fixtures.collab1Id,
      });
      return result.status === 401 && result.body.code === 'UNAUTHORIZED_NO_AUTH_HEADER';
    },
  );
}
