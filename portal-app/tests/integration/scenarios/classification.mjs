// Stage K1.5B — authoritative project classification. Every write
// here goes through the real portal-admin-manage-collaboration Edge
// Function (deployed to the isolated dev project), exercising the
// exact same requireAdmin()-gated path the frontend uses — nothing
// here uses the service-role client to bypass it. Only
// clients.admin (service-role) is used for independent verification
// of what actually ended up in the database, never to perform the
// write itself.
import { check } from '../_harness.mjs';
import { callEdgeFunction, bearerFor } from '../_functions.mjs';

export async function run(ctx) {
  const { clients, fixtures, supabaseUrl, anonKey } = ctx;

  let trackId, musicVideoId, artworkId;

  await check('admin can create a TRACK project with an explicit classification', async () => {
    const result = await callEdgeFunction(supabaseUrl, anonKey, 'portal-admin-manage-collaboration', {
      authHeader: bearerFor(fixtures.adminIdentity),
      body: { op: 'create_collaboration', title: 'K1.5B Track', artistDisplayName: 'Classification Test', classification: 'track' },
    });
    trackId = result.body.collaborationId;
    return result.status === 200 && result.body.ok === true && Boolean(trackId);
  });

  await check('admin can create a MUSIC_VIDEO project', async () => {
    const result = await callEdgeFunction(supabaseUrl, anonKey, 'portal-admin-manage-collaboration', {
      authHeader: bearerFor(fixtures.adminIdentity),
      body: { op: 'create_collaboration', title: 'K1.5B Music Video', artistDisplayName: 'Classification Test', classification: 'music_video' },
    });
    musicVideoId = result.body.collaborationId;
    return result.status === 200 && result.body.ok === true && Boolean(musicVideoId);
  });

  await check('admin can create an ARTWORK project', async () => {
    const result = await callEdgeFunction(supabaseUrl, anonKey, 'portal-admin-manage-collaboration', {
      authHeader: bearerFor(fixtures.adminIdentity),
      body: { op: 'create_collaboration', title: 'K1.5B Artwork', artistDisplayName: 'Classification Test', classification: 'artwork' },
    });
    artworkId = result.body.collaborationId;
    return result.status === 200 && result.body.ok === true && Boolean(artworkId);
  });

  await check('a collaboration created with no classification at all stores NULL, not a fabricated default', async () => {
    const result = await callEdgeFunction(supabaseUrl, anonKey, 'portal-admin-manage-collaboration', {
      authHeader: bearerFor(fixtures.adminIdentity),
      body: { op: 'create_collaboration', title: 'K1.5B Unclassified', artistDisplayName: 'Classification Test' },
    });
    const { data } = await clients.admin.from('collaborations').select('classification').eq('id', result.body.collaborationId).single();
    await clients.admin.from('collaborations').delete().eq('id', result.body.collaborationId);
    return result.body.ok === true && data.classification === null;
  });

  await check('the three created rows read back exactly the classification they were created with', async () => {
    const { data } = await clients.admin
      .from('collaborations')
      .select('id, classification')
      .in('id', [trackId, musicVideoId, artworkId]);
    const byId = Object.fromEntries(data.map((r) => [r.id, r.classification]));
    return byId[trackId] === 'track' && byId[musicVideoId] === 'music_video' && byId[artworkId] === 'artwork';
  });

  await check('admin can update an existing classification', async () => {
    const result = await callEdgeFunction(supabaseUrl, anonKey, 'portal-admin-manage-collaboration', {
      authHeader: bearerFor(fixtures.adminIdentity),
      body: { op: 'update_collaboration', collaborationId: artworkId, classification: 'music_video' },
    });
    const { data } = await clients.admin.from('collaborations').select('classification').eq('id', artworkId).single();
    return result.body.ok === true && data.classification === 'music_video';
  });

  await check('admin can explicitly clear a classification back to NULL/UNCLASSIFIED', async () => {
    const result = await callEdgeFunction(supabaseUrl, anonKey, 'portal-admin-manage-collaboration', {
      authHeader: bearerFor(fixtures.adminIdentity),
      body: { op: 'update_collaboration', collaborationId: trackId, classification: null },
    });
    const { data } = await clients.admin.from('collaborations').select('classification').eq('id', trackId).single();
    return result.body.ok === true && data.classification === null;
  });

  await check('an invalid classification value is rejected with INVALID_CLASSIFICATION on update, and the row is never touched', async () => {
    const before = await clients.admin.from('collaborations').select('classification, updated_at').eq('id', musicVideoId).single();
    const result = await callEdgeFunction(supabaseUrl, anonKey, 'portal-admin-manage-collaboration', {
      authHeader: bearerFor(fixtures.adminIdentity),
      body: { op: 'update_collaboration', collaborationId: musicVideoId, classification: 'short_film' },
    });
    const after = await clients.admin.from('collaborations').select('classification, updated_at').eq('id', musicVideoId).single();
    return (
      result.status === 400 &&
      result.body.error === 'INVALID_CLASSIFICATION' &&
      after.data.classification === before.data.classification &&
      after.data.updated_at === before.data.updated_at
    );
  });

  await check('an invalid classification value is rejected on create, and no row is inserted', async () => {
    const result = await callEdgeFunction(supabaseUrl, anonKey, 'portal-admin-manage-collaboration', {
      authHeader: bearerFor(fixtures.adminIdentity),
      body: { op: 'create_collaboration', title: 'K1.5B Should Not Exist', artistDisplayName: 'x', classification: 'short_film' },
    });
    const { data } = await clients.admin.from('collaborations').select('id').eq('title', 'K1.5B Should Not Exist');
    return result.status === 400 && result.body.error === 'INVALID_CLASSIFICATION' && (data?.length ?? 0) === 0;
  });

  await check('non-admin (Artist A) attempting a classification update is rejected with 403, and the value is never changed', async () => {
    const before = await clients.admin.from('collaborations').select('classification').eq('id', musicVideoId).single();
    const result = await callEdgeFunction(supabaseUrl, anonKey, 'portal-admin-manage-collaboration', {
      authHeader: bearerFor(fixtures.artistA),
      body: { op: 'update_collaboration', collaborationId: musicVideoId, classification: 'track' },
    });
    const after = await clients.admin.from('collaborations').select('classification').eq('id', musicVideoId).single();
    return result.status === 403 && result.body.error === 'NOT_AUTHORIZED' && after.data.classification === before.data.classification;
  });

  await check('an anonymous caller (anon key only, no session) attempting a classification update is rejected with 403', async () => {
    const result = await callEdgeFunction(supabaseUrl, anonKey, 'portal-admin-manage-collaboration', {
      body: { op: 'update_collaboration', collaborationId: musicVideoId, classification: 'track' },
    });
    return result.status === 403 && result.body.error === 'NOT_AUTHORIZED';
  });

  await check("Artist A can read Collab 1's own classification (whatever it already is) through the ordinary authorized query", async () => {
    const { data, error } = await fixtures.artistA.client.from('collaborations').select('classification').eq('id', fixtures.collab1Id).single();
    return !error && 'classification' in data;
  });

  await check("Artist B cannot read Collab 1's classification — the row itself is invisible, same isolation as every other column", async () => {
    const { data, error } = await fixtures.artistB.client.from('collaborations').select('classification').eq('id', fixtures.collab1Id);
    return !error && (data?.length ?? 0) === 0;
  });

  await check('a classification update records a real before/after audit entry distinguishable from an unrelated field update', async () => {
    await callEdgeFunction(supabaseUrl, anonKey, 'portal-admin-manage-collaboration', {
      authHeader: bearerFor(fixtures.adminIdentity),
      body: { op: 'update_collaboration', collaborationId: artworkId, classification: 'artwork' },
    });
    const { data } = await clients.admin
      .from('portal_admin_audit_log')
      .select('details')
      .eq('target_id', artworkId)
      .eq('action', 'update_collaboration')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    return data.details.previousClassification === 'music_video' && data.details.newClassification === 'artwork';
  });

  await check('an unrelated field update (status only) does NOT add previousClassification/newClassification to its audit entry', async () => {
    await callEdgeFunction(supabaseUrl, anonKey, 'portal-admin-manage-collaboration', {
      authHeader: bearerFor(fixtures.adminIdentity),
      body: { op: 'update_collaboration', collaborationId: artworkId, status: 'active' },
    });
    const { data } = await clients.admin
      .from('portal_admin_audit_log')
      .select('details')
      .eq('target_id', artworkId)
      .eq('action', 'update_collaboration')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    return !('previousClassification' in data.details) && !('newClassification' in data.details);
  });

  await check("a classification update preserves the collaboration's membership roster exactly", async () => {
    const before = await clients.admin.from('collaboration_members').select('user_id, status').eq('collaboration_id', fixtures.collab1Id);
    await callEdgeFunction(supabaseUrl, anonKey, 'portal-admin-manage-collaboration', {
      authHeader: bearerFor(fixtures.adminIdentity),
      body: { op: 'update_collaboration', collaborationId: fixtures.collab1Id, classification: 'track' },
    });
    const after = await clients.admin.from('collaboration_members').select('user_id, status').eq('collaboration_id', fixtures.collab1Id);
    return JSON.stringify(before.data) === JSON.stringify(after.data);
  });

  await check("a classification update preserves existing asset approval/active state exactly", async () => {
    const before = await clients.admin.from('collaboration_assets').select('id, approval_status, is_active').eq('collaboration_id', fixtures.collab1Id);
    await callEdgeFunction(supabaseUrl, anonKey, 'portal-admin-manage-collaboration', {
      authHeader: bearerFor(fixtures.adminIdentity),
      body: { op: 'update_collaboration', collaborationId: fixtures.collab1Id, classification: null },
    });
    const after = await clients.admin.from('collaboration_assets').select('id, approval_status, is_active').eq('collaboration_id', fixtures.collab1Id);
    return JSON.stringify(before.data) === JSON.stringify(after.data);
  });

  await check('administrator preview: the admin account itself still has zero real collaboration_members rows (no artificial membership was ever created)', async () => {
    const { data, error } = await clients.admin.from('collaboration_members').select('collaboration_id').eq('user_id', fixtures.adminIdentity.uid);
    return !error && (data?.length ?? 0) === 0;
  });

  // Cleanup — this scenario's own synthetic rows only.
  await clients.admin.from('collaborations').delete().in('id', [trackId, musicVideoId, artworkId]);
}
