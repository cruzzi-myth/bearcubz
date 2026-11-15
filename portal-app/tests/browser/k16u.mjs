// Stage K1.6 — END-TO-END VALIDATION / ARTIST ACCESS ACCEPTANCE TESTS
// (the two-way isolation + NYX ARDENT + extra-viewport portions).
// Against the real dev project with two disposable fixtures named
// after the real collaborations they stand in for — XYLØ-TEST-ACCOUNT
// and ISSEY-CROSS-TEST-ACCOUNT — never the real XYLØ/Issey Cross
// identities or production media. Confirms, in a real browser: each
// test artist sees ONLY their own project (ALLOW), never the other's
// (DENY) — both in the rendered list AND via direct URL navigation to
// the other's collaboration id; NYX ARDENT's quick actions stay
// scoped to the signed-in artist's own collaboration; the Artist
// Portal holds up at four additional viewport sizes beyond the one
// already covered in prior stages (390x844).
import { chromium } from 'playwright';
import { expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { assertSafeToRunIntegrationTests } from '../integration/_guard.mjs';
import { loadBrowserDataset } from '../integration/browser-dataset.mjs';
import { signInForBrowser, seedSessionAndReload } from './_session.mjs';
import { callEdgeFunction } from '../integration/_functions.mjs';
import { testEmail, syntheticPngBytes, syntheticAudioBytes } from '../integration/fixtures.mjs';
import { check, summary } from './_harness.mjs';

assertSafeToRunIntegrationTests();
if (!process.env.SUPABASE_URL.includes('gcbonlvbgyhsgfayvlvz')) throw new Error('Wrong development target');

const dataset = loadBrowserDataset();
if (!dataset) throw new Error('No browser dataset found — run create-browser-dataset.mjs first.');

const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const anon = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const adminSession = await signInForBrowser(anon, dataset.identities.admin.email, dataset.password);
const adminBearer = `Bearer ${adminSession.access_token}`;

const xyloCollabId = crypto.randomUUID();
const isseyCollabId = crypto.randomUUID();
const XYLO_TITLE = 'XYLØ-TEST-ACCOUNT Collaboration';
const ISSEY_TITLE = 'ISSEY-CROSS-TEST-ACCOUNT Collaboration';
const FIXTURE_PASSWORD = 'Signal-Portal-Test-Fixture-1!';
let xyloIdentity, isseyIdentity;
const browser = await chromium.launch({ headless: true });

async function uploadApprovedCover(collaborationId, label) {
  const req = await callEdgeFunction(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, 'portal-admin-request-upload-url', {
    authHeader: adminBearer,
    body: { collaborationId, assetType: 'track_cover', mimeType: 'image/png', fileSizeBytes: syntheticPngBytes().length, displayLabel: label },
  });
  await fetch(req.body.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'image/png' }, body: syntheticPngBytes() });
  await callEdgeFunction(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, 'portal-admin-confirm-upload', { authHeader: adminBearer, body: { assetId: req.body.assetId } });
  await admin.from('collaboration_assets').update({ is_primary_cover: true }).eq('id', req.body.assetId);
  await callEdgeFunction(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, 'portal-admin-review-asset', { authHeader: adminBearer, body: { assetId: req.body.assetId, decision: 'approve' } });
  await admin.from('collaboration_assets').update({ approval_status: 'approved' }).eq('id', req.body.assetId);
  return req.body.assetId;
}

async function uploadApprovedAudio(collaborationId, label) {
  const req = await callEdgeFunction(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, 'portal-admin-request-upload-url', {
    authHeader: adminBearer,
    body: { collaborationId, assetType: 'audio_full', mimeType: 'audio/wav', fileSizeBytes: syntheticAudioBytes().length, displayLabel: label },
  });
  await fetch(req.body.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'audio/wav' }, body: syntheticAudioBytes() });
  await callEdgeFunction(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, 'portal-admin-confirm-upload', { authHeader: adminBearer, body: { assetId: req.body.assetId } });
  await callEdgeFunction(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, 'portal-admin-review-asset', { authHeader: adminBearer, body: { assetId: req.body.assetId, decision: 'approve' } });
  return req.body.assetId;
}

async function freshPage(session, path) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await seedSessionAndReload(page, process.env.SUPABASE_URL, session, path);
  await page.waitForTimeout(1500);
  return { context, page };
}

try {
  await admin.from('collaborations').insert([
    { id: xyloCollabId, title: XYLO_TITLE, artist_display_name: 'XYLØ-TEST-ACCOUNT', created_by: adminSession.user.id, status: 'draft' },
    { id: isseyCollabId, title: ISSEY_TITLE, artist_display_name: 'ISSEY-CROSS-TEST-ACCOUNT', created_by: adminSession.user.id, status: 'draft' },
  ]);

  const xyloEmail = testEmail('xylo-test-account');
  const isseyEmail = testEmail('issey-cross-test-account');
  const xyloCreated = await admin.auth.admin.createUser({ email: xyloEmail, password: FIXTURE_PASSWORD, email_confirm: true });
  const isseyCreated = await admin.auth.admin.createUser({ email: isseyEmail, password: FIXTURE_PASSWORD, email_confirm: true });
  if (xyloCreated.error) throw xyloCreated.error;
  if (isseyCreated.error) throw isseyCreated.error;
  xyloIdentity = { uid: xyloCreated.data.user.id, session: await signInForBrowser(anon, xyloEmail, FIXTURE_PASSWORD) };
  isseyIdentity = { uid: isseyCreated.data.user.id, session: await signInForBrowser(anon, isseyEmail, FIXTURE_PASSWORD) };

  await admin.from('collaboration_members').insert([
    { collaboration_id: xyloCollabId, user_id: xyloIdentity.uid, added_by: adminSession.user.id, status: 'active' },
    { collaboration_id: isseyCollabId, user_id: isseyIdentity.uid, added_by: adminSession.user.id, status: 'active' },
  ]);

  await uploadApprovedCover(xyloCollabId, 'XYLØ-TEST-ACCOUNT cover');
  await uploadApprovedAudio(xyloCollabId, 'XYLØ-TEST-ACCOUNT demo');
  await uploadApprovedCover(isseyCollabId, 'ISSEY-CROSS-TEST-ACCOUNT cover');
  await uploadApprovedAudio(isseyCollabId, 'ISSEY-CROSS-TEST-ACCOUNT demo');

  // --- ALLOW/DENY matrix: rendered list ---
  await check('ALLOW: XYLØ-TEST-ACCOUNT sees their own collaboration card in the Artist Portal', async () => {
    const { context, page } = await freshPage(xyloIdentity.session, '/artist');
    const visible = await page
      .getByRole('radio', { name: XYLO_TITLE, exact: true })
      .waitFor({ state: 'visible', timeout: 8000 })
      .then(() => true)
      .catch(() => false);
    await context.close();
    return visible;
  });

  await check("DENY: XYLØ-TEST-ACCOUNT's Artist Portal never mentions ISSEY-CROSS-TEST-ACCOUNT's collaboration anywhere in the page", async () => {
    const { context, page } = await freshPage(xyloIdentity.session, '/artist');
    const bodyText = await page.locator('body').innerText();
    await context.close();
    return !bodyText.includes(ISSEY_TITLE);
  });

  await check('ALLOW: ISSEY-CROSS-TEST-ACCOUNT sees their own collaboration card in the Artist Portal', async () => {
    const { context, page } = await freshPage(isseyIdentity.session, '/artist');
    const visible = await page
      .getByRole('radio', { name: ISSEY_TITLE, exact: true })
      .waitFor({ state: 'visible', timeout: 8000 })
      .then(() => true)
      .catch(() => false);
    await context.close();
    return visible;
  });

  await check("DENY: ISSEY-CROSS-TEST-ACCOUNT's Artist Portal never mentions XYLØ-TEST-ACCOUNT's collaboration anywhere in the page", async () => {
    const { context, page } = await freshPage(isseyIdentity.session, '/artist');
    const bodyText = await page.locator('body').innerText();
    await context.close();
    return !bodyText.includes(XYLO_TITLE);
  });

  // --- ALLOW/DENY matrix: direct URL navigation to the other artist's collaboration id ---
  await check("DENY: XYLØ-TEST-ACCOUNT navigating directly to ISSEY-CROSS-TEST-ACCOUNT's Transmission Chamber URL is refused, not shown", async () => {
    const { context, page } = await freshPage(xyloIdentity.session, `/collaboration/${isseyCollabId}/respond`);
    const denied = await page.getByText("This collaboration isn't available to your account.").isVisible().catch(() => false);
    await context.close();
    return denied;
  });

  await check("DENY: ISSEY-CROSS-TEST-ACCOUNT navigating directly to XYLØ-TEST-ACCOUNT's Transmission Chamber URL is refused, not shown", async () => {
    const { context, page } = await freshPage(isseyIdentity.session, `/collaboration/${xyloCollabId}/respond`);
    const denied = await page.getByText("This collaboration isn't available to your account.").isVisible().catch(() => false);
    await context.close();
    return denied;
  });

  await check('ALLOW: XYLØ-TEST-ACCOUNT navigating to their OWN Transmission Chamber URL works normally', async () => {
    const { context, page } = await freshPage(xyloIdentity.session, `/collaboration/${xyloCollabId}/respond`);
    const denied = await page.getByText("This collaboration isn't available to your account.").isVisible().catch(() => false);
    await context.close();
    return !denied;
  });

  // --- NYX ARDENT: real-browser open + quick action, scoped to the signed-in artist's own collaboration only ---
  await check('NYX ARDENT opens for XYLØ-TEST-ACCOUNT and never mentions the other artist\'s collaboration', async () => {
    const { context, page } = await freshPage(xyloIdentity.session, '/artist');
    await page.getByRole('button', { name: /Open Nyx Ardent/ }).click();
    await page.waitForTimeout(500);
    const dialog = page.getByRole('dialog', { name: /Nyx Ardent/ });
    const dialogVisible = await dialog.isVisible().catch(() => false);
    const dialogText = dialogVisible ? await dialog.innerText() : '';
    await context.close();
    return dialogVisible && !dialogText.includes(ISSEY_TITLE);
  });

  await check('NYX ARDENT\'s "Listen to Demo" quick action navigates XYLØ-TEST-ACCOUNT to their OWN collaboration\'s Listening Chamber, never the other\'s', async () => {
    const { context, page } = await freshPage(xyloIdentity.session, '/artist');
    await page.getByRole('button', { name: /Open Nyx Ardent/ }).click();
    await page.waitForTimeout(500);
    const listenButton = page.getByRole('button', { name: 'Listen to Demo', exact: true });
    const hasQuickAction = await listenButton.isVisible().catch(() => false);
    if (hasQuickAction) await listenButton.click();
    await page.waitForTimeout(1000);
    const url = page.url();
    await context.close();
    return hasQuickAction && url.includes(xyloCollabId) && !url.includes(isseyCollabId);
  });

  // --- additional viewport sizes (beyond the 390x844 already covered in prior stages) ---
  const viewports = [
    { width: 375, height: 812, label: '375x812 (iPhone SE/13 mini class)' },
    { width: 430, height: 932, label: '430x932 (iPhone Pro Max class)' },
    { width: 768, height: 1024, label: '768x1024 (iPad portrait)' },
    { width: 1024, height: 768, label: '1024x768 (iPad landscape)' },
  ];
  for (const vp of viewports) {
    await check(`Artist Portal renders with no horizontal overflow at emulated viewport ${vp.label}`, async () => {
      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      const page = await context.newPage();
      await seedSessionAndReload(page, process.env.SUPABASE_URL, xyloIdentity.session, '/artist');
      const card = page.getByRole('radio', { name: XYLO_TITLE, exact: true });
      const cardVisible = await card
        .waitFor({ state: 'visible', timeout: 8000 })
        .then(() => true)
        .catch(() => false);
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      await context.close();
      return scrollWidth <= vp.width + 1 && cardVisible;
    });
  }
} finally {
  await browser.close();
  await admin.from('collaboration_members').delete().in('collaboration_id', [xyloCollabId, isseyCollabId]);
  await admin.from('collaboration_assets').delete().in('collaboration_id', [xyloCollabId, isseyCollabId]);
  await admin.from('collaborations').delete().in('id', [xyloCollabId, isseyCollabId]);
  if (xyloIdentity?.uid) await admin.auth.admin.deleteUser(xyloIdentity.uid);
  if (isseyIdentity?.uid) await admin.auth.admin.deleteUser(isseyIdentity.uid);
}

summary('Signal Portal browser suite (Stage K1.6 validation — artist access acceptance: isolation matrix, NYX ARDENT scoping, extra viewports)');
