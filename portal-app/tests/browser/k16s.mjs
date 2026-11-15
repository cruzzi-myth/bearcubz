// Stage K1.6S — Collaboration Artwork & Visual Concept Chamber.
// Verifies, against the real dev project with genuinely disposable
// fixtures (never production artist accounts): an approved cover
// renders in the Artist Portal card, the Listening Chamber, and the
// Visual Gallery; an unapproved one stays hidden everywhere; a
// non-member artist sees neither the asset nor the collaboration at
// all; audio/proposal playback are unaffected; an admin can preview
// both projects; mobile layout holds up.
import { chromium } from 'playwright';
import { expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { assertSafeToRunIntegrationTests } from '../integration/_guard.mjs';
import { loadBrowserDataset } from '../integration/browser-dataset.mjs';
import { signInForBrowser, seedSessionAndReload } from './_session.mjs';
import { callEdgeFunction } from '../integration/_functions.mjs';
import { testEmail, syntheticPngBytes, syntheticAudioBytes, syntheticPdfBytes } from '../integration/fixtures.mjs';
import { check, summary } from './_harness.mjs';

assertSafeToRunIntegrationTests();
if (!process.env.SUPABASE_URL.includes('gcbonlvbgyhsgfayvlvz')) throw new Error('Wrong development target');

const dataset = loadBrowserDataset();
if (!dataset) throw new Error('No browser dataset found — run create-browser-dataset.mjs first.');

const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const anon = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const adminSession = await signInForBrowser(anon, dataset.identities.admin.email, dataset.password);
const adminBearer = `Bearer ${adminSession.access_token}`;

const collabAId = crypto.randomUUID();
const collabBId = crypto.randomUUID();
let memberIdentity;
let approvedCoverId, unapprovedCoverId, audioId, proposalId;
const browser = await chromium.launch({ headless: true });

async function uploadAndScan(collaborationId, assetType, mimeType, bytes, label, includeThumbnail = false) {
  const req = await callEdgeFunction(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, 'portal-admin-request-upload-url', {
    authHeader: adminBearer,
    body: { collaborationId, assetType, mimeType, fileSizeBytes: bytes.length, displayLabel: label, includeThumbnail },
  });
  if (!req.body.uploadUrl) throw new Error(`request-upload-url failed: ${JSON.stringify(req.body)}`);
  await fetch(req.body.uploadUrl, { method: 'PUT', headers: { 'Content-Type': mimeType }, body: bytes });
  if (req.body.thumbnailUploadUrl) await fetch(req.body.thumbnailUploadUrl, { method: 'PUT', headers: { 'Content-Type': mimeType }, body: bytes });
  await callEdgeFunction(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, 'portal-admin-confirm-upload', { authHeader: adminBearer, body: { assetId: req.body.assetId } });
  return req.body.assetId;
}

async function freshPage(session, path) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await seedSessionAndReload(page, process.env.SUPABASE_URL, session, path ?? '/artist');
  await page.waitForTimeout(1500);
  return { context, page };
}

try {
  await admin.from('collaborations').insert([
    { id: collabAId, title: 'K1.6S Cover Test A', artist_display_name: 'Synthetic Artist A', created_by: adminSession.user.id, status: 'draft' },
    { id: collabBId, title: 'K1.6S Cover Test B', artist_display_name: 'Synthetic Artist B', created_by: adminSession.user.id, status: 'draft' },
  ]);

  const memberEmail = testEmail('k16s-member');
  const memberPassword = 'Signal-Portal-Test-Fixture-1!';
  const created = await admin.auth.admin.createUser({ email: memberEmail, password: memberPassword, email_confirm: true });
  if (created.error) throw created.error;
  const memberUid = created.data.user.id;
  const memberSession = await signInForBrowser(anon, memberEmail, memberPassword);
  memberIdentity = { uid: memberUid, session: memberSession };
  await admin.from('collaboration_members').insert({ collaboration_id: collabAId, user_id: memberUid, added_by: adminSession.user.id, status: 'active' });

  // --- the approved cover (the one real "visible" cover for this test) ---
  approvedCoverId = await uploadAndScan(collabAId, 'track_cover', 'image/png', syntheticPngBytes(), 'K1.6S approved cover', true);
  await admin.from('collaboration_assets').update({ is_primary_cover: true }).eq('id', approvedCoverId);
  await callEdgeFunction(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, 'portal-admin-review-asset', { authHeader: adminBearer, body: { assetId: approvedCoverId, decision: 'approve' } });
  await admin.from('collaboration_assets').update({ approval_status: 'approved' }).eq('id', approvedCoverId);

  // --- a second visual asset, genuinely scanned clean + security-released, but artistically still pending ---
  unapprovedCoverId = await uploadAndScan(collabAId, 'visual_image', 'image/png', syntheticPngBytes(), 'K1.6S unapproved visual');
  await callEdgeFunction(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, 'portal-admin-review-asset', { authHeader: adminBearer, body: { assetId: unapprovedCoverId, decision: 'approve' } });
  // approval_status stays 'pending' (the default for a new visual asset) — deliberately never touched.

  audioId = await uploadAndScan(collabAId, 'audio_full', 'audio/wav', syntheticAudioBytes(), 'K1.6S demo');
  await callEdgeFunction(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, 'portal-admin-review-asset', { authHeader: adminBearer, body: { assetId: audioId, decision: 'approve' } });

  proposalId = await uploadAndScan(collabAId, 'proposal_pdf', 'application/pdf', syntheticPdfBytes(), 'K1.6S proposal');
  await callEdgeFunction(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, 'portal-admin-review-asset', { authHeader: adminBearer, body: { assetId: proposalId, decision: 'approve' } });

  await check('setup sanity: the approved cover is genuinely ready/clean/approved (security) AND artistically approved', async () => {
    const { data } = await admin.from('collaboration_assets').select('upload_status, security_status, security_review_status, approval_status, is_primary_cover').eq('id', approvedCoverId).single();
    return data?.upload_status === 'ready' && data?.security_status === 'clean' && data?.security_review_status === 'approved' && data?.approval_status === 'approved' && data?.is_primary_cover === true;
  });

  await check('setup sanity: the second visual is genuinely security-released but still artistically pending', async () => {
    const { data } = await admin.from('collaboration_assets').select('security_review_status, approval_status').eq('id', unapprovedCoverId).single();
    return data?.security_review_status === 'approved' && data?.approval_status === 'pending';
  });

  await check('the real member artist sees the Artist Portal card for their OWN project, with the approved cover rendered as a real image', async () => {
    const { context, page } = await freshPage(memberIdentity.session, '/artist');
    await expect(page.getByRole('radio', { name: 'K1.6S Cover Test A', exact: true })).toBeVisible();
    await page.waitForTimeout(1000);
    const card = page.getByRole('radio', { name: 'K1.6S Cover Test A', exact: true });
    const hasImg = await card.locator('img').count();
    await context.close();
    return hasImg === 1;
  });

  await check('the real member artist never sees the OTHER collaboration (not a member) in the Artist Portal at all', async () => {
    const { context, page } = await freshPage(memberIdentity.session, '/artist');
    await expect(page.getByRole('radio', { name: 'K1.6S Cover Test A', exact: true })).toBeVisible();
    const count = await page.getByRole('radio', { name: 'K1.6S Cover Test B', exact: true }).count();
    await context.close();
    return count === 0;
  });

  await check('the Listening Chamber shows the same approved cover next to the player, and playback still works', async () => {
    const { context, page } = await freshPage(memberIdentity.session, `/collaboration/${collabAId}/listen`);
    const hasCoverImg = await page.locator('.sp-listen__cover img').count();
    const hasPlayer = await page.locator('.sp-player').count();
    await context.close();
    return hasCoverImg === 1 && hasPlayer === 1;
  });

  await check('the Proposal Chamber still lists the real proposal (unaffected by the cover work)', async () => {
    const { context, page } = await freshPage(memberIdentity.session, `/collaboration/${collabAId}/proposal`);
    const text = await page.locator('body').textContent();
    await context.close();
    return text.includes('K1.6S proposal');
  });

  await check('the Visual Gallery shows ONLY the approved cover (1 tile), never the artistically-pending second visual', async () => {
    const { context, page } = await freshPage(memberIdentity.session, `/collaboration/${collabAId}/visuals`);
    await page.waitForTimeout(1000);
    const tileCount = await page.locator('.sp-gallery__tile').count();
    const text = await page.locator('body').textContent();
    await context.close();
    return tileCount === 1 && text.includes('Primary Cover') && !text.includes('K1.6S unapproved visual');
  });

  await check('an administrator can preview BOTH test collaborations in the Artist Portal (RLS admin-select-all, not membership)', async () => {
    const { context, page } = await freshPage(adminSession, '/artist');
    await expect(page.getByRole('radio', { name: 'K1.6S Cover Test A', exact: true })).toBeVisible();
    const bothVisible = await Promise.all([
      page.getByRole('radio', { name: 'K1.6S Cover Test A', exact: true }).isVisible(),
      page.getByRole('radio', { name: 'K1.6S Cover Test B', exact: true }).isVisible(),
    ]);
    await context.close();
    return bothVisible.every(Boolean);
  });

  await check('mobile viewport (390x844): the Artist Portal project card renders correctly and remains tappable', async () => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await seedSessionAndReload(page, process.env.SUPABASE_URL, adminSession, '/artist');
    await page.waitForTimeout(1500);
    const card = page.getByRole('radio', { name: 'K1.6S Cover Test A', exact: true });
    const visible = await card.isVisible();
    const box = await card.boundingBox();
    await context.close();
    return visible && box !== null && box.width > 0 && box.height > 0;
  });
} finally {
  await browser.close();
  const assetIds = [approvedCoverId, unapprovedCoverId, audioId, proposalId].filter(Boolean);
  if (assetIds.length) await admin.from('collaboration_assets').delete().in('id', assetIds);
  await admin.from('collaboration_members').delete().in('collaboration_id', [collabAId, collabBId]);
  await admin.from('collaborations').delete().in('id', [collabAId, collabBId]);
  if (memberIdentity) await admin.auth.admin.deleteUser(memberIdentity.uid);
}

summary('Signal Portal browser suite (Stage K1.6S — Collaboration Artwork & Visual Concept Chamber)');
