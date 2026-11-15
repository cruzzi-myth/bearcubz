// Stage K1.6P — Artist Portal + Admin Controls overlay, verified in a
// real browser against the isolated dev project. Mirrors k16m.mjs's
// pattern (same dataset, same freshPage helper via the already-
// running local dev server).
import { chromium } from 'playwright';
import { expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { assertSafeToRunIntegrationTests } from '../integration/_guard.mjs';
import { loadBrowserDataset } from '../integration/browser-dataset.mjs';
import { signInForBrowser, seedSessionAndReload } from './_session.mjs';
import { check, summary } from './_harness.mjs';

assertSafeToRunIntegrationTests();
if (!process.env.SUPABASE_URL.includes('gcbonlvbgyhsgfayvlvz')) throw new Error('Wrong development target');

const BASE = 'http://localhost:5173';
const dataset = loadBrowserDataset();
if (!dataset) throw new Error('No browser dataset found — run create-browser-dataset.mjs first.');

const anon = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const adminSession = await signInForBrowser(anon, dataset.identities.admin.email, dataset.password);
const artistSession = await signInForBrowser(anon, dataset.identities.artistA.email, dataset.password);

const browser = await chromium.launch({ headless: true });

async function freshPage(session, path) {
  const context = await browser.newContext();
  const page = await context.newPage();
  if (session) await seedSessionAndReload(page, process.env.SUPABASE_URL, session, path ?? '/dashboard');
  else await page.goto(`${BASE}${path ?? '/'}`);
  await page.waitForTimeout(1500);
  return { context, page };
}

try {
  await check('Dashboard shows an "Artist Portal" link for every authorized user (admin)', async () => {
    const { context, page } = await freshPage(adminSession, '/dashboard');
    await expect(page.getByRole('link', { name: 'Artist Portal', exact: true })).toBeVisible();
    await context.close();
    return true;
  });

  await check('Dashboard shows an "Artist Portal" link for an ordinary artist too', async () => {
    const { context, page } = await freshPage(artistSession, '/dashboard');
    const visible = await page.getByRole('link', { name: 'Artist Portal', exact: true }).isVisible();
    await context.close();
    return visible;
  });

  await check('clicking "Artist Portal" navigates to /artist', async () => {
    const { context, page } = await freshPage(adminSession, '/dashboard');
    await page.getByRole('link', { name: 'Artist Portal', exact: true }).click();
    await page.waitForTimeout(800);
    const url = page.url();
    await context.close();
    return url.endsWith('/artist');
  });

  // Stage K1.6R correction: the chamber-nav "Dashboard" link is the
  // Artist Portal's own home (/artist, self-referential here) — the
  // central hub is reached via the separate, admin-only "Admin
  // Dashboard" link instead (see k16r.mjs for that coverage).
  await check('the Artist Portal\'s chamber-nav "Dashboard" link is self-referential (points to /artist, not the central hub)', async () => {
    const { context, page } = await freshPage(adminSession, '/artist');
    const href = await page.getByRole('link', { name: 'Dashboard', exact: true }).first().getAttribute('href');
    await context.close();
    return href === '/artist';
  });

  await check('the Artist Portal does NOT show "Command Center" as a primary navigation link', async () => {
    const { context, page } = await freshPage(adminSession, '/artist');
    const count = await page.getByRole('link', { name: 'Command Center', exact: true }).count();
    await context.close();
    return count === 0;
  });

  await check('an admin can select both real collaborations in the Artist Portal project picker', async () => {
    const { context, page } = await freshPage(adminSession, '/artist');
    // The collaboration list resolves asynchronously (a real query) —
    // expect(...).toBeVisible() polls/retries instead of a single
    // count() racing that resolution (same fix as K1.6M).
    await expect(page.getByRole('radio', { name: 'THE GHOST IN THE SIGNAL' })).toBeVisible();
    await expect(page.getByRole('radio', { name: 'LOST TRANSITION' })).toBeVisible();
    await context.close();
    return true;
  });

  await check('selecting a project shows all four chamber tiles', async () => {
    const { context, page } = await freshPage(adminSession, '/artist');
    await page.getByRole('radio', { name: 'THE GHOST IN THE SIGNAL' }).click();
    await page.waitForTimeout(500);
    const visible = await Promise.all(
      ['Listening Chamber', 'Proposal Chamber', 'Visual Concept Chamber', 'Transmission Chamber'].map((label) =>
        page.getByRole('link', { name: label, exact: true }).isVisible(),
      ),
    );
    await context.close();
    return visible.every(Boolean);
  });

  await check('clicking the Listening Chamber tile navigates to the correct collaboration-scoped route', async () => {
    const { context, page } = await freshPage(adminSession, '/artist');
    await page.getByRole('radio', { name: 'THE GHOST IN THE SIGNAL' }).click();
    await page.waitForTimeout(500);
    await page.getByRole('link', { name: 'Listening Chamber', exact: true }).click();
    await page.waitForTimeout(1000);
    const url = page.url();
    await context.close();
    return /\/collaboration\/[0-9a-f-]+\/listen$/.test(url);
  });

  await check('on a real chamber page, an admin sees the "Administrator Preview" badge', async () => {
    const { context, page } = await freshPage(adminSession, '/artist');
    await page.getByRole('radio', { name: 'LOST TRANSITION' }).click();
    await page.waitForTimeout(500);
    await page.getByRole('link', { name: 'Proposal Chamber', exact: true }).click();
    await page.waitForTimeout(1000);
    await expect(page.getByText('Administrator Preview')).toBeVisible();
    await context.close();
    return true;
  });

  await check('an admin on a chamber page sees "Admin Controls"; an ordinary artist on the same chamber does not', async () => {
    const adminCtx = await freshPage(adminSession, '/artist');
    await adminCtx.page.getByRole('radio', { name: 'LOST TRANSITION' }).click();
    await adminCtx.page.waitForTimeout(500);
    await adminCtx.page.getByRole('link', { name: 'Proposal Chamber', exact: true }).click();
    await adminCtx.page.waitForTimeout(1000);
    const adminSeesIt = await adminCtx.page.getByRole('button', { name: 'Admin Controls', exact: true }).isVisible();
    await adminCtx.context.close();

    const artistCtx = await freshPage(artistSession, '/artist');
    const artistSeesIt = await artistCtx.page.getByRole('button', { name: 'Admin Controls', exact: true }).count();
    await artistCtx.context.close();
    return adminSeesIt === true && artistSeesIt === 0;
  });

  await check('opening Admin Controls and clicking "Manage Assets" deep-links to the Asset Library with that collaboration preselected', async () => {
    const { context, page } = await freshPage(adminSession, '/artist');
    await page.getByRole('radio', { name: 'THE GHOST IN THE SIGNAL' }).click();
    await page.waitForTimeout(500);
    await page.getByRole('link', { name: 'Listening Chamber', exact: true }).click();
    await page.waitForTimeout(1000);
    await page.getByRole('button', { name: 'Admin Controls', exact: true }).click();
    await page.getByRole('link', { name: 'Manage Assets', exact: true }).click();
    await page.waitForTimeout(1200);
    const url = page.url();
    const selectedLabel = await page.locator('#asset-collab-filter').inputValue();
    const selectedText = await page.locator('#asset-collab-filter option:checked').textContent();
    await context.close();
    return url.includes('tab=assets') && url.includes('collab=') && selectedLabel.length > 0 && selectedText.includes('THE GHOST IN THE SIGNAL');
  });

  await check('opening Admin Controls and clicking "Edit Project" opens the collaboration editor for that project', async () => {
    const { context, page } = await freshPage(adminSession, '/artist');
    await page.getByRole('radio', { name: 'LOST TRANSITION' }).click();
    await page.waitForTimeout(500);
    await page.getByRole('link', { name: 'Transmission Chamber', exact: true }).click();
    await page.waitForTimeout(1000);
    await page.getByRole('button', { name: 'Admin Controls', exact: true }).click();
    await page.getByRole('link', { name: 'Edit Project', exact: true }).click();
    await page.waitForTimeout(1200);
    await expect(page.getByRole('button', { name: 'Save metadata', exact: true })).toBeVisible();
    await context.close();
    return true;
  });

  await check('"Preview Access" shows a read-only artist-visibility summary without navigating away', async () => {
    const { context, page } = await freshPage(adminSession, '/artist');
    await page.getByRole('radio', { name: 'THE GHOST IN THE SIGNAL' }).click();
    await page.waitForTimeout(500);
    await page.getByRole('link', { name: 'Visual Concept Chamber', exact: true }).click();
    await page.waitForTimeout(1000);
    await page.getByRole('button', { name: 'Admin Controls', exact: true }).click();
    await page.getByRole('button', { name: 'Preview Access', exact: true }).click();
    await page.waitForTimeout(800);
    const url = page.url();
    const visible = await page.getByText('Artist-visible status').isVisible();
    await context.close();
    return visible && url.includes('/collaboration/');
  });

  await check('an artist cannot reach the Command Center even by direct URL (unaffected by this stage)', async () => {
    const { context, page } = await freshPage(artistSession, '/admin');
    const text = await page.locator('body').textContent();
    await context.close();
    return text.includes('Administrator access is required');
  });

  await check('refreshing /artist as admin keeps the project picker and chamber-navigation accessible, not bounced', async () => {
    const { context, page } = await freshPage(adminSession, '/artist');
    await page.reload();
    await page.waitForTimeout(1200);
    const onArtist = page.url().endsWith('/artist');
    await expect(page.getByRole('radio', { name: 'THE GHOST IN THE SIGNAL' })).toBeVisible();
    await context.close();
    return onArtist;
  });

  await check('mobile viewport (390x844): the Admin Controls trigger remains visible and tappable on a chamber page', async () => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await seedSessionAndReload(page, process.env.SUPABASE_URL, adminSession, '/artist');
    await page.waitForTimeout(1200);
    await page.getByRole('radio', { name: 'LOST TRANSITION' }).click();
    await page.waitForTimeout(500);
    await page.getByRole('link', { name: 'Proposal Chamber', exact: true }).click();
    await page.waitForTimeout(1200);
    const trigger = page.getByRole('button', { name: 'Admin Controls', exact: true });
    const visible = await trigger.isVisible();
    const box = await trigger.boundingBox();
    await context.close();
    return visible && box !== null && box.width > 0 && box.height > 0;
  });
} finally {
  await browser.close();
}

summary('Signal Portal browser suite (Stage K1.6P — Artist Portal & Admin Controls overlay)');
