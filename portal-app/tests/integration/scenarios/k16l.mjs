// Stage K1.6L — update_collaboration gained title/artistDisplayName/
// genreTags editing (previously create-only, a real gap: a typo in
// either meant starting a brand-new collaboration). Also re-verifies,
// against real data, that an artist member genuinely cannot see a
// not-yet-approved visual asset once they're authorized to see the
// collaboration at all — the real root condition
// useAuthorizedCollaboration's new filter (src/lib/assetVisibility.ts)
// exists to close. RLS alone does NOT hide this row (by design — an
// admin-select-all and a member-select-active policy both exist), so
// this scenario proves the row really is reachable via RLS and would
// have been shown before this stage's frontend fix.
import { check } from '../_harness.mjs';
import { callEdgeFunction, bearerFor } from '../_functions.mjs';
import { createAndSignInTestUser, deleteTestUser } from '../_client.mjs';
import { testEmail } from '../fixtures.mjs';

// The real, persistent XYLØ dev collaboration (not part of the
// throwaway fixture set) — its actual track_cover row genuinely has
// security_required = false, upload_status = 'ready', approval_status
// = 'pending' (see k16j-collaboration-inventory.md). A trigger
// (enforce_portal_asset_security, NEW_ASSET_REQUIRES_SECURITY) now
// rejects any FRESH insert with security_required = false, so this
// exact shape can only be exercised against a row that already
// predates that trigger — this is the only one available. Nothing
// about the asset or collaboration itself is touched; only a
// temporary, disposable membership is added and then removed.
const XYLO_DEV_COLLAB_ID = 'e94ff20c-c332-4dcc-bffb-596a0df265cc';
const XYLO_DEV_PENDING_COVER_ID = '8fc21191-88ff-4e97-a10e-e932118c905f';

export async function run(ctx) {
  const { clients, fixtures, supabaseUrl, anonKey } = ctx;

  // --- update_collaboration: title/artistDisplayName/genreTags ---
  const renamed = await callEdgeFunction(supabaseUrl, anonKey, 'portal-admin-manage-collaboration', {
    authHeader: bearerFor(fixtures.adminIdentity),
    body: { op: 'update_collaboration', collaborationId: fixtures.collab1Id, title: 'Renamed Synthetic Collab', artistDisplayName: 'Renamed Test Artist', genreTags: ['ambient', 'test'] },
  });
  await check('update_collaboration accepts title/artistDisplayName/genreTags and returns ok', () => renamed.status === 200 && renamed.body.ok === true);

  await check('the renamed fields are actually persisted', async () => {
    const { data } = await clients.admin.from('collaborations').select('title, artist_display_name, genre_tags').eq('id', fixtures.collab1Id).single();
    return data?.title === 'Renamed Synthetic Collab' && data?.artist_display_name === 'Renamed Test Artist' && JSON.stringify(data?.genre_tags) === JSON.stringify(['ambient', 'test']);
  });

  const blankTitle = await callEdgeFunction(supabaseUrl, anonKey, 'portal-admin-manage-collaboration', {
    authHeader: bearerFor(fixtures.adminIdentity),
    body: { op: 'update_collaboration', collaborationId: fixtures.collab1Id, title: '   ' },
  });
  await check('a whitespace-only title is rejected with INVALID_INPUT, never blanking the title', () => blankTitle.status === 400 && blankTitle.body.error === 'INVALID_INPUT');

  const blankArtist = await callEdgeFunction(supabaseUrl, anonKey, 'portal-admin-manage-collaboration', {
    authHeader: bearerFor(fixtures.adminIdentity),
    body: { op: 'update_collaboration', collaborationId: fixtures.collab1Id, artistDisplayName: '' },
  });
  await check('a blank artistDisplayName is rejected with INVALID_INPUT', () => blankArtist.status === 400 && blankArtist.body.error === 'INVALID_INPUT');

  const nonAdminEdit = await callEdgeFunction(supabaseUrl, anonKey, 'portal-admin-manage-collaboration', {
    authHeader: bearerFor(fixtures.artistA),
    body: { op: 'update_collaboration', collaborationId: fixtures.collab1Id, title: 'Should never apply' },
  });
  await check('a non-admin cannot rename a collaboration', () => nonAdminEdit.status === 403);

  // --- confirm the real condition useAuthorizedCollaboration's new filter (src/lib/assetVisibility.ts) exists to close ---
  const confirmRow = await clients.admin.from('collaboration_assets').select('id, approval_status, security_required, upload_status').eq('id', XYLO_DEV_PENDING_COVER_ID).single();
  await check('the real XYLØ dev track_cover is genuinely still legacy/ready/pending (sanity check before trusting this fixture)', () => confirmRow.data?.approval_status === 'pending' && confirmRow.data?.security_required === false && confirmRow.data?.upload_status === 'ready');

  const disposableMember = await createAndSignInTestUser(clients, testEmail('k16l-xylo-member'), 'Signal-Portal-Test-Fixture-1!');
  await clients.admin.from('collaboration_members').insert({ collaboration_id: XYLO_DEV_COLLAB_ID, user_id: disposableMember.uid, added_by: fixtures.adminIdentity.uid, status: 'active' });

  await check('this pending, legacy-shaped cover IS reachable via RLS for an active member — RLS alone never hid it; only the frontend filter does', async () => {
    const { data } = await disposableMember.client.from('collaboration_assets').select('id, approval_status').eq('id', XYLO_DEV_PENDING_COVER_ID).maybeSingle();
    return data?.id === XYLO_DEV_PENDING_COVER_ID && data?.approval_status === 'pending';
  });

  await check('a non-member (artistB) still cannot see it at all, unaffected by this stage', async () => {
    const { data } = await fixtures.artistB.client.from('collaboration_assets').select('id').eq('id', XYLO_DEV_PENDING_COVER_ID).maybeSingle();
    return data === null;
  });

  // Cleanup: remove ONLY the disposable membership and test user —
  // the real XYLØ asset/collaboration rows are never touched.
  await clients.admin.from('collaboration_members').delete().eq('collaboration_id', XYLO_DEV_COLLAB_ID).eq('user_id', disposableMember.uid);
  const deleteErr = await deleteTestUser(clients, disposableMember.uid);
  await check('the disposable membership test user was cleanly removed', () => !deleteErr);

  await clients.admin.from('collaborations').update({ title: 'Synthetic Collab One', artist_display_name: 'Test Artist A', genre_tags: null }).eq('id', fixtures.collab1Id);
}
