// Stage I2C — persistent disposable dataset for human browser review.
// Unlike fixtures.mjs (which tears down immediately after each
// automated run), this creates data that stays in signal-portal-dev
// until cleanupBrowserDataset() is run explicitly. Every created
// record/object id is written to .browser-dataset.json (gitignored)
// so cleanup can target exactly those rows/files and nothing else.
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { createAndSignInTestUser, deleteTestUser } from './_client.mjs';
import { callEdgeFunction, bearerFor } from './_functions.mjs';
import { syntheticAudioBytes, syntheticPdfBytes, syntheticPngBytes, testEmail } from './fixtures.mjs';

const TRACKING_FILE = new URL('.browser-dataset.json', import.meta.url).pathname;
const PASSWORD = 'Signal-Portal-Browser-Review-1!';

async function uploadAsset(ctx, { collaborationId, admin, assetType, mimeType, bytes, displayLabel, approve }) {
  const requested = await callEdgeFunction(ctx.supabaseUrl, ctx.anonKey, 'portal-admin-request-upload-url', {
    authHeader: bearerFor(admin),
    body: { collaborationId, assetType, mimeType, fileSizeBytes: bytes.length, displayLabel },
  });
  if (!requested.body.ok) throw new Error(`request-upload-url failed for ${displayLabel}: ${JSON.stringify(requested.body)}`);

  const put = await fetch(requested.body.uploadUrl, { method: 'PUT', headers: { 'Content-Type': mimeType }, body: bytes });
  if (!put.ok) throw new Error(`upload PUT failed for ${displayLabel}: ${put.status}`);

  const confirmed = await callEdgeFunction(ctx.supabaseUrl, ctx.anonKey, 'portal-admin-confirm-upload', {
    authHeader: bearerFor(admin),
    body: { assetId: requested.body.assetId, promoteToPrimaryCover: Boolean(approve?.promoteToPrimaryCover) },
  });
  if (!confirmed.body.ok) throw new Error(`confirm-upload failed for ${displayLabel}: ${JSON.stringify(confirmed.body)}`);

  if (approve?.approvalStatus) {
    await callEdgeFunction(ctx.supabaseUrl, ctx.anonKey, 'portal-admin-manage-collaboration', {
      authHeader: bearerFor(admin),
      body: { op: 'update_asset', assetId: requested.body.assetId, approvalStatus: approve.approvalStatus },
    });
  }

  return requested.body.assetId;
}

export async function createBrowserDataset(clients, ctx) {
  const adminIdentity = await createAndSignInTestUser(clients, testEmail('browser-admin'), PASSWORD);
  await clients.admin.from('portal_admins').insert({ user_id: adminIdentity.uid, granted_by: null });

  const artistA = await createAndSignInTestUser(clients, testEmail('browser-artist-a'), PASSWORD);
  const artistB = await createAndSignInTestUser(clients, testEmail('browser-artist-b'), PASSWORD);
  const artistC = await createAndSignInTestUser(clients, testEmail('browser-artist-c'), PASSWORD);
  const revokedArtist = await createAndSignInTestUser(clients, testEmail('browser-revoked'), PASSWORD);
  const unauthorizedUser = await createAndSignInTestUser(clients, testEmail('browser-unauthorized'), PASSWORD);

  // These identities are created directly (service-role createUser),
  // not through accept_artist_invitation() — which is the only path
  // that normally inserts an artist_profiles row. Without this, the
  // dashboard correctly (and honestly) shows a nameless "Welcome."
  // rather than fabricating one; adding real profile rows here just
  // makes the review dataset look like a genuine onboarded artist.
  await clients.admin.from('artist_profiles').insert([
    { user_id: artistA.uid, display_name: 'Artist A (Review)', email: artistA.email },
    { user_id: artistB.uid, display_name: 'Artist B (Review)', email: artistB.email },
    { user_id: artistC.uid, display_name: 'Artist C (Review)', email: artistC.email },
    { user_id: revokedArtist.uid, display_name: 'Revoked Artist (Review)', email: revokedArtist.email },
  ]);

  const projectA = await clients.admin
    .from('collaborations')
    .insert({ title: 'Ghost Signal (Review Project A)', artist_display_name: 'Artist A (Review)', status: 'active', bpm: 128, musical_key: 'A minor', classification: 'track', created_by: adminIdentity.uid })
    .select('id')
    .single();
  const projectB = await clients.admin
    .from('collaborations')
    .insert({ title: 'Static Bloom (Review Project B)', artist_display_name: 'Artist B (Review)', status: 'active', bpm: 96, musical_key: 'D major', classification: 'track', created_by: adminIdentity.uid })
    .select('id')
    .single();
  const projectC = await clients.admin
    .from('collaborations')
    .insert({ title: 'Parallel Transmission (Review Project C — multi-artist)', artist_display_name: 'Artist A & Artist C (Review)', status: 'active', created_by: adminIdentity.uid })
    .select('id')
    .single();

  await clients.admin.from('collaboration_members').insert([
    { collaboration_id: projectA.data.id, user_id: artistA.uid, added_by: adminIdentity.uid, status: 'active' },
    { collaboration_id: projectA.data.id, user_id: revokedArtist.uid, added_by: adminIdentity.uid, status: 'revoked', revoked_at: new Date().toISOString() },
    { collaboration_id: projectB.data.id, user_id: artistB.uid, added_by: adminIdentity.uid, status: 'active' },
    { collaboration_id: projectC.data.id, user_id: artistA.uid, added_by: adminIdentity.uid, status: 'active' },
    { collaboration_id: projectC.data.id, user_id: artistC.uid, added_by: adminIdentity.uid, status: 'active' },
  ]);

  const assetIds = [];

  // Project A — full asset set.
  assetIds.push(await uploadAsset(ctx, { collaborationId: projectA.data.id, admin: adminIdentity, assetType: 'audio_short', mimeType: 'audio/wav', bytes: syntheticAudioBytes(), displayLabel: 'Ghost Signal — Demo Snippet' }));
  assetIds.push(await uploadAsset(ctx, { collaborationId: projectA.data.id, admin: adminIdentity, assetType: 'proposal_pdf', mimeType: 'application/pdf', bytes: syntheticPdfBytes(), displayLabel: 'Ghost Signal — Creative Proposal' }));
  assetIds.push(
    await uploadAsset(ctx, {
      collaborationId: projectA.data.id,
      admin: adminIdentity,
      assetType: 'track_cover',
      mimeType: 'image/png',
      bytes: syntheticPngBytes(),
      displayLabel: 'Ghost Signal — Primary Cover',
      approve: { promoteToPrimaryCover: true, approvalStatus: 'approved' },
    }),
  );
  assetIds.push(
    await uploadAsset(ctx, {
      collaborationId: projectA.data.id,
      admin: adminIdentity,
      assetType: 'visual_concept',
      mimeType: 'image/png',
      bytes: syntheticPngBytes(),
      displayLabel: 'Ghost Signal — Gallery Concept 1',
      approve: { approvalStatus: 'approved' },
    }),
  );

  // Project B — separate, smaller asset set (isolation check material).
  assetIds.push(await uploadAsset(ctx, { collaborationId: projectB.data.id, admin: adminIdentity, assetType: 'audio_short', mimeType: 'audio/wav', bytes: syntheticAudioBytes(), displayLabel: 'Static Bloom — Demo Snippet' }));
  assetIds.push(
    await uploadAsset(ctx, {
      collaborationId: projectB.data.id,
      admin: adminIdentity,
      assetType: 'track_cover',
      mimeType: 'image/png',
      bytes: syntheticPngBytes(),
      displayLabel: 'Static Bloom — Primary Cover',
      approve: { promoteToPrimaryCover: true, approvalStatus: 'approved' },
    }),
  );

  // Project C feedback, for recipient-scoped privacy review.
  await callEdgeFunction(ctx.supabaseUrl, ctx.anonKey, 'portal-submit-feedback', {
    authHeader: bearerFor(artistA),
    body: { collaborationId: projectC.data.id, kind: 'general', body: 'Review note from Artist A on Project C.' },
  });
  await callEdgeFunction(ctx.supabaseUrl, ctx.anonKey, 'portal-submit-feedback', {
    authHeader: bearerFor(artistC),
    body: { collaborationId: projectC.data.id, kind: 'general', body: 'Review note from Artist C on Project C.' },
  });
  await callEdgeFunction(ctx.supabaseUrl, ctx.anonKey, 'portal-admin-reply-feedback', {
    authHeader: bearerFor(adminIdentity),
    body: { collaborationId: projectC.data.id, body: 'Admin reply, scoped to Artist A only.', recipientUserId: artistA.uid },
  });

  const dataset = {
    createdAt: new Date().toISOString(),
    password: PASSWORD,
    identities: {
      admin: { email: adminIdentity.email, uid: adminIdentity.uid },
      artistA: { email: artistA.email, uid: artistA.uid },
      artistB: { email: artistB.email, uid: artistB.uid },
      artistC: { email: artistC.email, uid: artistC.uid },
      revokedArtist: { email: revokedArtist.email, uid: revokedArtist.uid },
      unauthorizedUser: { email: unauthorizedUser.email, uid: unauthorizedUser.uid },
    },
    collaborations: { projectA: projectA.data.id, projectB: projectB.data.id, projectC: projectC.data.id },
    assetIds,
  };
  writeFileSync(TRACKING_FILE, JSON.stringify(dataset, null, 2));
  return dataset;
}

export function loadBrowserDataset() {
  if (!existsSync(TRACKING_FILE)) return null;
  return JSON.parse(readFileSync(TRACKING_FILE, 'utf8'));
}

export async function cleanupBrowserDataset(clients) {
  const dataset = loadBrowserDataset();
  if (!dataset) {
    console.log('No tracked browser dataset found — nothing to clean up.');
    return;
  }
  const collabIds = Object.values(dataset.collaborations);
  const SIGNAL_PORTAL_BUCKETS = ['collaboration-audio', 'collaboration-proposals', 'collaboration-visuals'];

  for (const collaborationId of collabIds) {
    for (const bucket of SIGNAL_PORTAL_BUCKETS) {
      const listing = await clients.admin.storage.from(bucket).list(collaborationId, { limit: 1000 });
      const paths = (listing.data ?? []).map((entry) => `${collaborationId}/${entry.name}`);
      if (paths.length > 0) await clients.admin.storage.from(bucket).remove(paths);
    }
  }

  await clients.admin.from('collaboration_feedback').delete().in('collaboration_id', collabIds);
  await clients.admin.from('collaboration_assets').delete().in('collaboration_id', collabIds);
  await clients.admin.from('collaboration_members').delete().in('collaboration_id', collabIds);
  await clients.admin.from('collaborations').delete().in('id', collabIds);
  await clients.admin.from('portal_admin_audit_log').delete().eq('admin_id', dataset.identities.admin.uid);
  await clients.admin.from('portal_admins').delete().eq('user_id', dataset.identities.admin.uid);

  const errors = [];
  for (const identity of Object.values(dataset.identities)) {
    const error = await deleteTestUser(clients, identity.uid);
    if (error) errors.push({ email: identity.email, message: error.message });
  }

  if (errors.length > 0) {
    console.log('Cleanup completed with errors:', JSON.stringify(errors));
    process.exitCode = 1;
  } else {
    console.log('Browser dataset fully cleaned up:', collabIds.length, 'collaborations,', Object.keys(dataset.identities).length, 'identities.');
  }
}
