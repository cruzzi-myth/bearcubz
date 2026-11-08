// Stage K1.4 — local-only verification dataset for the new Asset
// Library / Collaborations / Briefing Modal UI. Metadata (titles,
// artist names, BPM, key) matches the K1.4 brief's real reference
// projects exactly, so classification/deliverables resolve the same
// way they would against the real records. Files are the SAME
// synthetic placeholders fixtures.mjs already uses everywhere else in
// this suite — this repo's established principle (see fixtures.mjs's
// own top comment) is that disposable Supabase test data never holds
// real unreleased XYLØ/Issey Cross creative content, even in the
// isolated dev project. The full WAV master is deliberately never
// uploaded, matching the brief's own "not yet confirmed as uploaded"
// instruction for both reference projects.
import { writeFileSync } from 'node:fs';
import { assertSafeToRunIntegrationTests } from './_guard.mjs';
import { buildClients } from './_client.mjs';
import { createAndSignInTestUser } from './_client.mjs';
import { callEdgeFunction, bearerFor } from './_functions.mjs';
import { syntheticPdfBytes, syntheticPngBytes, testEmail } from './fixtures.mjs';

const TRACKING_FILE = new URL('.k14-demo-dataset.json', import.meta.url).pathname;
const PASSWORD = 'Signal-Portal-K14-Demo-1!';

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

const safe = assertSafeToRunIntegrationTests(process.env);
const clients = buildClients({ supabaseUrl: safe.supabaseUrl, anonKey: process.env.SUPABASE_ANON_KEY, serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY });
const ctx = { supabaseUrl: safe.supabaseUrl, anonKey: process.env.SUPABASE_ANON_KEY };

const admin = await createAndSignInTestUser(clients, testEmail('k14-admin'), PASSWORD);
await clients.admin.from('portal_admins').insert({ user_id: admin.uid, granted_by: null });

const paige = await createAndSignInTestUser(clients, testEmail('k14-paige-duddy'), PASSWORD);
await clients.admin.from('artist_profiles').insert({ user_id: paige.uid, display_name: 'Paige Duddy', email: paige.email });

const issey = await createAndSignInTestUser(clients, testEmail('k14-issey-cross'), PASSWORD);
await clients.admin.from('artist_profiles').insert({ user_id: issey.uid, display_name: 'Issey Cross', email: issey.email });

const projectA = await clients.admin
  .from('collaborations')
  .insert({
    title: 'THE GHOST IN THE SIGNAL',
    artist_display_name: 'Paige Duddy / XYLØ',
    status: 'active',
    bpm: 96,
    musical_key: 'A♭ minor',
    notes: 'A cybernetic signal-ghost narrative, built around a sparse, atmospheric verse and a wide, cinematic chorus.',
    genre_tags: ['synthwave', 'cinematic'],
    created_by: admin.uid,
  })
  .select('id')
  .single();

const projectB = await clients.admin
  .from('collaborations')
  .insert({
    title: 'LOST TRANSITION',
    artist_display_name: 'Issey Cross',
    status: 'active',
    bpm: 145,
    musical_key: 'A♭',
    notes: 'High-energy transition-driven production exploring motion and departure.',
    genre_tags: ['electronic', 'high-energy'],
    created_by: admin.uid,
  })
  .select('id')
  .single();

await clients.admin.from('collaboration_members').insert([
  { collaboration_id: projectA.data.id, user_id: paige.uid, added_by: admin.uid, status: 'active' },
  { collaboration_id: projectB.data.id, user_id: issey.uid, added_by: admin.uid, status: 'active' },
]);

const assetIds = [];
assetIds.push(
  await uploadAsset(ctx, {
    collaborationId: projectA.data.id,
    admin,
    assetType: 'track_cover',
    mimeType: 'image/png',
    bytes: syntheticPngBytes(),
    displayLabel: 'THE GHOST IN THE SIGNAL — Cover',
    approve: { promoteToPrimaryCover: true, approvalStatus: 'approved' },
  }),
);
assetIds.push(
  await uploadAsset(ctx, {
    collaborationId: projectA.data.id,
    admin,
    assetType: 'proposal_pdf',
    mimeType: 'application/pdf',
    bytes: syntheticPdfBytes(),
    displayLabel: 'THE GHOST IN THE SIGNAL — Proposal',
    approve: { approvalStatus: 'approved' },
  }),
);

assetIds.push(
  await uploadAsset(ctx, {
    collaborationId: projectB.data.id,
    admin,
    assetType: 'track_cover',
    mimeType: 'image/png',
    bytes: syntheticPngBytes(),
    displayLabel: 'LOST TRANSITION — Cover',
    approve: { promoteToPrimaryCover: true, approvalStatus: 'approved' },
  }),
);
assetIds.push(
  await uploadAsset(ctx, {
    collaborationId: projectB.data.id,
    admin,
    assetType: 'proposal_pdf',
    mimeType: 'application/pdf',
    bytes: syntheticPdfBytes(),
    displayLabel: 'LOST TRANSITION — Proposal',
    approve: { approvalStatus: 'approved' },
  }),
);

writeFileSync(
  TRACKING_FILE,
  JSON.stringify({ userUids: [admin.uid, paige.uid, issey.uid], collaborationIds: [projectA.data.id, projectB.data.id], assetIds }, null, 2),
);

console.log('K1.4 demo dataset created.');
console.log('Project A (THE GHOST IN THE SIGNAL):', projectA.data.id);
console.log('Project B (LOST TRANSITION):', projectB.data.id);
console.log('Admin:', admin.email);
console.log('Paige Duddy (XYLØ):', paige.email);
console.log('Issey Cross:', issey.email);
console.log('Password (all identities):', PASSWORD);
