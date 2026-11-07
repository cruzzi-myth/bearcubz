// ============================================================
// SYNTHETIC TEST-DATA SPECIFICATION (Stage I2A, Phase 7).
//
// Everything created here is disposable and safe to discard: no real
// BEλR CUBZ unreleased music, no real XYLØ/Issey Cross proposal
// content, no production credentials, no real collaborator email
// addresses. Every identity is created under the +signal-portal-test
// subaddress convention below so they are trivially distinguishable
// from anything real, and every file is a tiny synthetic placeholder
// generated in-memory, never read from disk.
//
// teardown() removes every row/user/object these fixtures create, in
// dependency order (children before parents, auth users last since
// deleting a user cascades collaboration_members via its FK but NOT
// collaborations/collaboration_assets, which are owned by the admin
// test user, not the artist).
// ============================================================
import { createAndSignInTestUser, deleteTestUser } from './_client.mjs';

const TEST_EMAIL_DOMAIN = 'signal-portal-test.invalid';
const TEST_PASSWORD = 'Signal-Portal-Test-Fixture-1!';

export function testEmail(label) {
  return `${label}+signal-portal-test@${TEST_EMAIL_DOMAIN}`;
}

/** A 44-byte valid WAV header (RIFF/WAVE, no audio data) — small
 * enough to upload instantly, real enough to pass MIME/size checks
 * without needing an actual recording. */
export function syntheticAudioBytes() {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(44100, 24);
  header.writeUInt32LE(44100, 28);
  header.writeUInt16LE(1, 32);
  header.writeUInt16LE(8, 34);
  header.write('data', 36);
  header.writeUInt32LE(0, 40);
  return header;
}

/** A minimal, structurally valid one-page PDF. */
export function syntheticPdfBytes() {
  const pdf = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj
xref
0 4
trailer<</Size 4/Root 1 0 R>>
%%EOF`;
  return Buffer.from(pdf, 'utf8');
}

/** A minimal valid 1x1 PNG, for placeholder artwork/covers. */
export function syntheticPngBytes() {
  return Buffer.from(
    '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000002000100ffff03000006000557bfabd40000000049454e44ae426082',
    'hex',
  );
}

/**
 * Creates the full synthetic data set described in the Stage I2A
 * brief Phase 7: two draft collaborations, memberships across them,
 * one pending/one revoked/one expired invitation, and returns every
 * identity/id a scenario file needs. Nothing here exercises RLS —
 * it uses the admin (service-role) client directly for setup, exactly
 * as a human admin's Edge-Function-backed actions would, so the
 * scenario files can focus on testing the actual security boundary
 * rather than the setup path.
 */
export async function createFixtureSet(clients) {
  const adminIdentity = await createAndSignInTestUser(clients, testEmail('admin'), TEST_PASSWORD);
  await clients.admin.from('portal_admins').insert({ user_id: adminIdentity.uid, granted_by: null });

  const artistA = await createAndSignInTestUser(clients, testEmail('artist-a'), TEST_PASSWORD);
  const artistB = await createAndSignInTestUser(clients, testEmail('artist-b'), TEST_PASSWORD);
  const artistC = await createAndSignInTestUser(clients, testEmail('artist-c'), TEST_PASSWORD);
  const unauthorizedUser = await createAndSignInTestUser(clients, testEmail('unauthorized'), TEST_PASSWORD);

  const collab1 = await clients.admin
    .from('collaborations')
    .insert({ title: 'Synthetic Collab One', artist_display_name: 'Test Artist A', status: 'active', created_by: adminIdentity.uid })
    .select('id')
    .single();
  const collab2 = await clients.admin
    .from('collaborations')
    .insert({ title: 'Synthetic Collab Two', artist_display_name: 'Test Artist B', status: 'active', created_by: adminIdentity.uid })
    .select('id')
    .single();

  await clients.admin.from('collaboration_members').insert([
    { collaboration_id: collab1.data.id, user_id: artistA.uid, added_by: adminIdentity.uid, status: 'active' },
    { collaboration_id: collab2.data.id, user_id: artistB.uid, added_by: adminIdentity.uid, status: 'active' },
    // Artist C joins Collab 1 too — the only deliberately-created
    // multi-member collaboration, needed to exercise feedback
    // recipient scoping (Security Audit finding A3).
    { collaboration_id: collab1.data.id, user_id: artistC.uid, added_by: adminIdentity.uid, status: 'active' },
  ]);

  const revokedArtist = await createAndSignInTestUser(clients, testEmail('revoked-artist'), TEST_PASSWORD);
  await clients.admin.from('collaboration_members').insert({
    collaboration_id: collab1.data.id,
    user_id: revokedArtist.uid,
    added_by: adminIdentity.uid,
    status: 'revoked',
    revoked_at: new Date().toISOString(),
  });

  return {
    adminIdentity,
    artistA,
    artistB,
    artistC,
    revokedArtist,
    unauthorizedUser,
    collab1Id: collab1.data.id,
    collab2Id: collab2.data.id,
    identities: [adminIdentity, artistA, artistB, artistC, revokedArtist, unauthorizedUser],
  };
}

const SIGNAL_PORTAL_BUCKETS = ['collaboration-audio', 'collaboration-proposals', 'collaboration-visuals'];

/** Storage objects are NOT covered by deleting collaboration_assets
 * rows — that only removes the metadata, never the actual uploaded
 * bytes. Found in Stage I2B: without this, every uploaded synthetic
 * file (one per collaboration_id-prefixed "folder" each run, since
 * collaboration_id is a fresh UUID every run) accumulated forever in
 * the dev project's buckets, invisible to a top-level bucket listing
 * once a run ends (Storage's list() only shows pseudo-folders at a
 * given prefix, not nested files, so a stale folder from a prior run
 * never resurfaces unless you list that exact prefix again). This
 * removes every object actually nested under each known collaboration
 * id, in every Signal Portal bucket.
 */
async function clearCollaborationStorage(clients, collaborationId) {
  for (const bucket of SIGNAL_PORTAL_BUCKETS) {
    const listing = await clients.admin.storage.from(bucket).list(collaborationId, { limit: 1000 });
    const paths = (listing.data ?? []).map((entry) => `${collaborationId}/${entry.name}`);
    if (paths.length > 0) {
      await clients.admin.storage.from(bucket).remove(paths);
    }
  }
}

export async function teardownFixtureSet(clients, fixtures) {
  await clearCollaborationStorage(clients, fixtures.collab1Id);
  await clearCollaborationStorage(clients, fixtures.collab2Id);
  await clients.admin.from('collaboration_feedback').delete().in('collaboration_id', [fixtures.collab1Id, fixtures.collab2Id]);
  await clients.admin.from('collaboration_assets').delete().in('collaboration_id', [fixtures.collab1Id, fixtures.collab2Id]);
  await clients.admin.from('collaboration_members').delete().in('collaboration_id', [fixtures.collab1Id, fixtures.collab2Id]);
  await clients.admin.from('collaborations').delete().in('id', [fixtures.collab1Id, fixtures.collab2Id]);
  await clients.admin.from('artist_invitations').delete().like('email', `%@${TEST_EMAIL_DOMAIN}`);
  await clients.admin.from('portal_admins').delete().eq('user_id', fixtures.adminIdentity.uid);
  // portal_admin_audit_log.admin_id references auth.users(id) with NO
  // on delete cascade — every admin Edge Function call across every
  // scenario file writes a row here with admin_id = the fixture
  // admin's uid, so deleting that auth user before clearing these
  // rows fails on the FK constraint. Found in Stage I2B: the prior
  // version of this function didn't clear this table at all, and
  // deleteTestUser silently swallowed the resulting error, leaving
  // the synthetic admin account stranded in the dev project.
  await clients.admin.from('portal_admin_audit_log').delete().eq('admin_id', fixtures.adminIdentity.uid);

  const deletionErrors = [];
  for (const identity of fixtures.identities) {
    const error = await deleteTestUser(clients, identity.uid);
    if (error) deletionErrors.push({ email: identity.email, uid: identity.uid, message: error.message });
  }
  if (deletionErrors.length > 0) {
    throw new Error(`teardownFixtureSet: failed to delete ${deletionErrors.length} synthetic user(s): ${JSON.stringify(deletionErrors)}`);
  }
}
