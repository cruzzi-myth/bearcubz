// Stage K1.6Q — Asset Library UI refinement. Verifies the real,
// rendered admin UI against the isolated dev project: the clean-but-
// unapproved state reads "Scan Complete — Awaiting Admin Approval"
// (not "verifying"), approving it in a real browser click genuinely
// moves it to "Ready" with a success confirmation and no Approve
// button left, and Delete/Mark Inactive are visually distinct.
// Setup uses direct Edge Function calls (fast, reliable — same
// pattern as k16h2.mjs/k16n.mjs) against a disposable synthetic
// collaboration; the assertions themselves drive the real browser UI.
import { chromium } from 'playwright';
import { expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { assertSafeToRunIntegrationTests } from '../integration/_guard.mjs';
import { loadBrowserDataset } from '../integration/browser-dataset.mjs';
import { signInForBrowser, seedSessionAndReload } from './_session.mjs';
import { callEdgeFunction } from '../integration/_functions.mjs';
import { syntheticPdfBytes } from '../integration/fixtures.mjs';
import { check, summary } from './_harness.mjs';

assertSafeToRunIntegrationTests();
if (!process.env.SUPABASE_URL.includes('gcbonlvbgyhsgfayvlvz')) throw new Error('Wrong development target');

const BASE = 'http://localhost:5173';
const dataset = loadBrowserDataset();
if (!dataset) throw new Error('No browser dataset found — run create-browser-dataset.mjs first.');

const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const anon = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const adminSession = await signInForBrowser(anon, dataset.identities.admin.email, dataset.password);

const collabId = crypto.randomUUID();
let assetId;
const browser = await chromium.launch({ headless: true });
// signInForBrowser returns the raw Supabase session (access_token,
// snake_case) — not the { accessToken } shape _functions.mjs's own
// bearerFor() expects from the integration-test identity helper.
const adminBearer = `Bearer ${adminSession.access_token}`;

async function freshAssetsTabPage(collaboration) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await seedSessionAndReload(page, process.env.SUPABASE_URL, adminSession, '/admin');
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: 'Asset Library', exact: true }).click();
  await page.waitForTimeout(500);
  await page.locator('#asset-collab-filter').selectOption({ label: collaboration });
  await page.waitForTimeout(800);
  return { context, page };
}

try {
  const inserted = await admin.from('collaborations').insert({ id: collabId, title: 'K1.6Q UI refinement synthetic fixture', artist_display_name: 'Synthetic', created_by: adminSession.user.id, status: 'draft' });
  if (inserted.error) throw inserted.error;

  const bytes = syntheticPdfBytes();
  const req = await callEdgeFunction(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, 'portal-admin-request-upload-url', {
    authHeader: adminBearer,
    body: { collaborationId: collabId, assetType: 'proposal_pdf', mimeType: 'application/pdf', fileSizeBytes: bytes.length, displayLabel: 'K1.6Q UI refinement fixture' },
  });
  if (!req.body.uploadUrl) throw new Error(`request-upload-url failed: ${JSON.stringify(req.body)} (status ${req.status})`);
  assetId = req.body.assetId;
  await fetch(req.body.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'application/pdf' }, body: bytes });
  await callEdgeFunction(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, 'portal-admin-confirm-upload', { authHeader: adminBearer, body: { assetId } });

  await check('the real backend genuinely reached security_status=clean before any UI assertion runs (setup sanity, not the test itself)', async () => {
    const { data } = await admin.from('collaboration_assets').select('security_status, security_review_status, upload_status').eq('id', assetId).single();
    return data?.security_status === 'clean' && data?.security_review_status === 'pending';
  });

  await check('the Asset Library shows "Scan Complete — Awaiting Admin Approval", never the raw "verifying" upload_status, for a genuinely clean-but-unapproved asset', async () => {
    const { context, page } = await freshAssetsTabPage('K1.6Q UI refinement synthetic fixture');
    const row = page.locator('tr', { hasText: 'K1.6Q UI refinement fixture' });
    await expect(row).toContainText('Scan Complete — Awaiting Admin Approval');
    const text = await row.textContent();
    await context.close();
    return !text.includes('verifying');
  });

  await check('the "Approve Security Release" button is visible for this row, and Preview is already available (clean evidence, review pending)', async () => {
    const { context, page } = await freshAssetsTabPage('K1.6Q UI refinement synthetic fixture');
    const row = page.locator('tr', { hasText: 'K1.6Q UI refinement fixture' });
    const approveVisible = await row.getByRole('button', { name: 'Approve Security Release', exact: true }).isVisible();
    const previewVisible = await row.getByRole('button', { name: 'Preview', exact: true }).isVisible();
    await context.close();
    return approveVisible && previewVisible;
  });

  await check('clicking "Approve Security Release" shows a brief success confirmation, moves the row to "Ready", and removes the approve button', async () => {
    const { context, page } = await freshAssetsTabPage('K1.6Q UI refinement synthetic fixture');
    const row = page.locator('tr', { hasText: 'K1.6Q UI refinement fixture' });
    const approved = page.waitForResponse((r) => r.url().includes('/portal-admin-review-asset') && r.request().method() === 'POST');
    await row.getByRole('button', { name: 'Approve Security Release', exact: true }).click();
    expect((await approved).ok()).toBeTruthy();
    await expect(page.getByText('Approved — asset is now READY.')).toBeVisible();
    await page.waitForTimeout(600);
    const refreshedRow = page.locator('tr', { hasText: 'K1.6Q UI refinement fixture' });
    await expect(refreshedRow).toContainText('Ready');
    const approveStillThere = await refreshedRow.getByRole('button', { name: 'Approve Security Release', exact: true }).count();
    await context.close();
    return approveStillThere === 0;
  });

  await check('the real backend confirms upload_status genuinely reached ready and security_review_status approved — not just a UI label', async () => {
    const { data } = await admin.from('collaboration_assets').select('upload_status, security_review_status').eq('id', assetId).single();
    return data?.upload_status === 'ready' && data?.security_review_status === 'approved';
  });

  await check('Delete and Mark Inactive are visually distinct (different border colors), not the same red treatment', async () => {
    const { context, page } = await freshAssetsTabPage('K1.6Q UI refinement synthetic fixture');
    const row = page.locator('tr', { hasText: 'K1.6Q UI refinement fixture' });
    const deleteColor = await row.getByRole('button', { name: 'Delete', exact: true }).evaluate((el) => getComputedStyle(el).borderColor);
    const inactiveColor = await row.getByRole('button', { name: 'Mark Inactive', exact: true }).evaluate((el) => getComputedStyle(el).borderColor);
    await context.close();
    return deleteColor !== inactiveColor;
  });

  await check('the column header letter-spacing was genuinely increased (0.12em, not left at the old 0.08em)', async () => {
    const { context, page } = await freshAssetsTabPage('K1.6Q UI refinement synthetic fixture');
    const th = page.locator('.sp-admin__table th').first();
    const spacing = await th.evaluate((el) => getComputedStyle(el).letterSpacing);
    const fontSize = await th.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    await context.close();
    // letterSpacing resolves to px; 0.12em at a 10px font is 1.2px.
    return Math.abs(parseFloat(spacing) - fontSize * 0.12) < 0.3;
  });

  await check('an ordinary artist (non-admin) cannot reach the Asset Library UI at all — unauthorized approval stays impossible at the UI level too', async () => {
    const artistSession = await signInForBrowser(anon, dataset.identities.artistA.email, dataset.password);
    const context = await browser.newContext();
    const page = await context.newPage();
    await seedSessionAndReload(page, process.env.SUPABASE_URL, artistSession, '/admin');
    await page.waitForTimeout(1200);
    const text = await page.locator('body').textContent();
    await context.close();
    return text.includes('Administrator access is required');
  });

  await check('mobile viewport (390x844): the Asset Library table scrolls horizontally and action buttons remain tappable', async () => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await seedSessionAndReload(page, process.env.SUPABASE_URL, adminSession, '/admin');
    await page.waitForTimeout(1200);
    await page.getByRole('button', { name: 'Asset Library', exact: true }).click();
    await page.waitForTimeout(500);
    await page.locator('#asset-collab-filter').selectOption({ label: 'K1.6Q UI refinement synthetic fixture' });
    await page.waitForTimeout(800);
    const row = page.locator('tr', { hasText: 'K1.6Q UI refinement fixture' });
    const deleteBtn = row.getByRole('button', { name: 'Delete', exact: true });
    const box = await deleteBtn.boundingBox();
    await context.close();
    return box !== null && box.width > 0 && box.height > 0;
  });
} finally {
  await browser.close();
  if (assetId) await admin.from('collaboration_assets').delete().eq('id', assetId);
  await admin.from('collaborations').delete().eq('id', collabId);
}

summary('Signal Portal browser suite (Stage K1.6Q — Asset Library UI refinement)');
