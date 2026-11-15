// Stage K1.6T — Collaboration Artwork Thumbnails. Verifies, against
// the real dev project with disposable fixtures: the genuine new
// capability (the Command Center's own collaboration selector can
// now preview a clean-but-not-yet-approved cover, the same way the
// per-asset Preview button already could — a real gap found while
// consolidating the cover-art implementations), that the SAME
// not-yet-approved cover still correctly falls back for an ordinary
// artist viewing the Dashboard's own asset-library list, and that
// the title-bearing fallback appears when a project has no cover at
// all.
import { chromium } from 'playwright';
import { expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { assertSafeToRunIntegrationTests } from '../integration/_guard.mjs';
import { loadBrowserDataset } from '../integration/browser-dataset.mjs';
import { signInForBrowser, seedSessionAndReload } from './_session.mjs';
import { callEdgeFunction } from '../integration/_functions.mjs';
import { syntheticPngBytes } from '../integration/fixtures.mjs';
import { check, summary } from './_harness.mjs';

assertSafeToRunIntegrationTests();
if (!process.env.SUPABASE_URL.includes('gcbonlvbgyhsgfayvlvz')) throw new Error('Wrong development target');

const dataset = loadBrowserDataset();
if (!dataset) throw new Error('No browser dataset found — run create-browser-dataset.mjs first.');

const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const anon = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const adminSession = await signInForBrowser(anon, dataset.identities.admin.email, dataset.password);
const adminBearer = `Bearer ${adminSession.access_token}`;

const collabWithPendingCoverId = crypto.randomUUID();
const collabWithNoCoverId = crypto.randomUUID();
let pendingCoverAssetId;
const browser = await chromium.launch({ headless: true });

async function freshPage(session, path) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await seedSessionAndReload(page, process.env.SUPABASE_URL, session, path);
  await page.waitForTimeout(1500);
  return { context, page };
}

try {
  await admin.from('collaborations').insert([
    { id: collabWithPendingCoverId, title: 'K1.6T Pending Cover Test', artist_display_name: 'Synthetic', created_by: adminSession.user.id, status: 'draft' },
    { id: collabWithNoCoverId, title: 'K1.6T No Cover Test', artist_display_name: 'Synthetic', created_by: adminSession.user.id, status: 'draft' },
  ]);

  const req = await callEdgeFunction(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, 'portal-admin-request-upload-url', {
    authHeader: adminBearer,
    body: { collaborationId: collabWithPendingCoverId, assetType: 'track_cover', mimeType: 'image/png', fileSizeBytes: syntheticPngBytes().length, displayLabel: 'K1.6T pending cover' },
  });
  if (!req.body.uploadUrl) throw new Error(`request-upload-url failed: ${JSON.stringify(req.body)}`);
  pendingCoverAssetId = req.body.assetId;
  await fetch(req.body.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'image/png' }, body: syntheticPngBytes() });
  await callEdgeFunction(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, 'portal-admin-confirm-upload', { authHeader: adminBearer, body: { assetId: pendingCoverAssetId } });
  await admin.from('collaboration_assets').update({ is_primary_cover: true }).eq('id', pendingCoverAssetId);
  // Deliberately never security-released or artistically approved —
  // this stays exactly "clean, awaiting admin approval" throughout.

  await check('setup sanity: the cover is genuinely clean but still unreleased/unapproved', async () => {
    const { data } = await admin.from('collaboration_assets').select('security_status, security_review_status, approval_status, is_primary_cover').eq('id', pendingCoverAssetId).single();
    return data?.security_status === 'clean' && data?.security_review_status === 'pending' && data?.is_primary_cover === true;
  });

  await check('the real gap this stage fixes: the Command Center\'s own collaboration selector now shows the real image for a clean-but-unapproved cover (previously showed the diamond, since it used the artist-grade signed-url function even for the admin)', async () => {
    const { context, page } = await freshPage(adminSession, '/admin');
    await page.getByRole('button', { name: 'Asset Library', exact: true }).click();
    await page.waitForTimeout(1500);
    const row = page.locator('.sp-asset-row', { hasText: 'K1.6T Pending Cover Test' });
    await expect(row).toBeVisible();
    await page.waitForTimeout(1000);
    const hasImg = await row.locator('.sp-cover-art img').count();
    await context.close();
    return hasImg === 1;
  });

  await check('the SAME not-yet-approved cover still correctly shows the placeholder (not the real image) for an ordinary artist\'s own Dashboard asset-library view — the admin-preview fix never leaks into the artist-facing path', async () => {
    // Give artistA real membership just long enough to render the
    // Dashboard's own asset-library list for this one collaboration.
    await admin.from('collaboration_members').insert({ collaboration_id: collabWithPendingCoverId, user_id: dataset.identities.artistA.uid, added_by: adminSession.user.id, status: 'active' });
    const artistSession = await signInForBrowser(anon, dataset.identities.artistA.email, dataset.password);
    const { context, page } = await freshPage(artistSession, '/dashboard');
    await page.waitForTimeout(1000);
    const row = page.locator('.sp-asset-row', { hasText: 'K1.6T Pending Cover Test' });
    await expect(row).toBeVisible();
    await page.waitForTimeout(1000);
    const hasImg = await row.locator('.sp-cover-art img').count();
    const hasPlaceholder = await row.locator('.sp-cover-art--placeholder').count();
    await context.close();
    await admin.from('collaboration_members').delete().eq('collaboration_id', collabWithPendingCoverId).eq('user_id', dataset.identities.artistA.uid);
    return hasImg === 0 && hasPlaceholder === 1;
  });

  await check('a collaboration with no cover at all shows the title-bearing fallback (not just a bare glyph) in a large-enough context (the Collaboration Briefing, opened by clicking its row in the Asset Library)', async () => {
    const { context, page } = await freshPage(adminSession, '/admin');
    await page.getByRole('button', { name: 'Asset Library', exact: true }).click();
    await page.waitForTimeout(1500);
    const row = page.locator('.sp-asset-row', { hasText: 'K1.6T No Cover Test' });
    await expect(row).toBeVisible();
    await row.click();
    await page.waitForTimeout(800);
    const fallbackTitle = await page.locator('.sp-cover-art__fallback-title', { hasText: 'K1.6T No Cover Test' }).count();
    await context.close();
    return fallbackTitle === 1;
  });

  await check('that same no-cover fallback at the Command Center\'s compact 52px selector size omits the title text (glyph only, to avoid illegible clutter)', async () => {
    const { context, page } = await freshPage(adminSession, '/admin');
    await page.getByRole('button', { name: 'Asset Library', exact: true }).click();
    await page.waitForTimeout(1500);
    const row = page.locator('.sp-asset-row', { hasText: 'K1.6T No Cover Test' });
    await expect(row).toBeVisible();
    const titleCount = await row.locator('.sp-cover-art__fallback-title').count();
    await context.close();
    return titleCount === 0;
  });
} finally {
  await browser.close();
  if (pendingCoverAssetId) await admin.from('collaboration_assets').delete().eq('id', pendingCoverAssetId);
  await admin.from('collaboration_members').delete().in('collaboration_id', [collabWithPendingCoverId, collabWithNoCoverId]);
  await admin.from('collaborations').delete().in('id', [collabWithPendingCoverId, collabWithNoCoverId]);
}

summary('Signal Portal browser suite (Stage K1.6T — collaboration artwork thumbnails)');
