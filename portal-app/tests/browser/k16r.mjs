// Stage K1.6R — Artist Portal navigation correction. Verifies the
// corrected destinations in a real browser against the isolated dev
// project: chamber-nav DASHBOARD now goes to /artist (was /dashboard
// by mistake), and a new admin-only ADMIN DASHBOARD link (above the
// chamber nav, alongside Admin Controls) goes to /dashboard instead.
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

async function enterChamber(page, collaboration, chamberLabel) {
  await page.getByRole('radio', { name: collaboration }).click();
  await page.waitForTimeout(500);
  await page.getByRole('link', { name: chamberLabel, exact: true }).click();
  await page.waitForTimeout(1000);
}

try {
  await check('on /artist, "ADMIN DASHBOARD" appears above the chamber navigation for an admin', async () => {
    const { context, page } = await freshPage(adminSession, '/artist');
    await expect(page.getByRole('link', { name: 'Admin Dashboard', exact: true })).toBeVisible();
    const headerY = await page.getByRole('link', { name: 'Admin Dashboard', exact: true }).boundingBox();
    const navY = await page.getByRole('link', { name: 'Dashboard', exact: true }).first().boundingBox();
    await context.close();
    return headerY.y < navY.y;
  });

  await check('"ADMIN DASHBOARD" on /artist navigates to /dashboard', async () => {
    const { context, page } = await freshPage(adminSession, '/artist');
    await page.getByRole('link', { name: 'Admin Dashboard', exact: true }).click();
    await page.waitForTimeout(800);
    const url = page.url();
    await context.close();
    return url.endsWith('/dashboard');
  });

  await check('ADMIN context: the chamber-nav "Dashboard" link points to /dashboard (admin hub); artists keep /artist — see k16v', async () => {
    const { context, page } = await freshPage(adminSession, '/artist');
    const href = await page.getByRole('link', { name: 'Dashboard', exact: true }).first().getAttribute('href');
    await context.close();
    // The dev server runs with no basename (vite.config.ts only
    // prefixes /portal in a production build) — the real link target
    // is just /artist here.
    return href === '/dashboard';
  });

  for (const [label, segment] of [
    ['Listening Chamber', 'listen'],
    ['Transmission Chamber', 'respond'],
    ['Visual Concept Chamber', 'visuals'],
    ['Proposal Chamber', 'proposal'],
  ]) {
    await check(`${label}: "ADMIN DASHBOARD" appears in the upper header, above the chamber nav`, async () => {
      const { context, page } = await freshPage(adminSession, '/artist');
      await enterChamber(page, 'THE GHOST IN THE SIGNAL', label);
      const adminLinkBox = await page.getByRole('link', { name: 'Admin Dashboard', exact: true }).boundingBox();
      const chamberNavBox = await page.locator('.sp-chamber-nav').boundingBox();
      await context.close();
      return adminLinkBox !== null && chamberNavBox !== null && adminLinkBox.y < chamberNavBox.y;
    });

    await check(`${label}: clicking "ADMIN DASHBOARD" navigates to /dashboard`, async () => {
      const { context, page } = await freshPage(adminSession, '/artist');
      await enterChamber(page, 'THE GHOST IN THE SIGNAL', label);
      await page.getByRole('link', { name: 'Admin Dashboard', exact: true }).click();
      await page.waitForTimeout(800);
      const url = page.url();
      await context.close();
      return url.endsWith('/dashboard');
    });

    await check(`${label}: the chamber nav's "Dashboard" link returns to the admin /dashboard (artists: /artist, see k16v)`, async () => {
      const { context, page } = await freshPage(adminSession, '/artist');
      await enterChamber(page, 'LOST TRANSITION', label);
      await page.getByRole('link', { name: 'Dashboard', exact: true }).first().click();
      await page.waitForTimeout(800);
      const url = page.url();
      await context.close();
      return url.endsWith('/dashboard');
    });
  }

  // artistA is a real member only of the browser dataset's own
  // synthetic review projects — NOT the real XYLØ/Issey Cross
  // collaborations (those have zero real members; only the admin
  // sees them, via the admin-select-all RLS policy).
  const ARTIST_PROJECT = 'Ghost Signal (Review Project A)';

  await check('an ordinary artist never sees "Admin Dashboard" anywhere — not on /artist, not inside any chamber', async () => {
    const { context, page } = await freshPage(artistSession, '/artist');
    await expect(page.getByRole('radio', { name: ARTIST_PROJECT })).toBeVisible();
    const onArtistPortal = await page.getByRole('link', { name: 'Admin Dashboard', exact: true }).count();
    await page.getByRole('radio', { name: ARTIST_PROJECT }).click();
    await page.waitForTimeout(500);
    await page.getByRole('link', { name: 'Listening Chamber', exact: true }).click();
    await page.waitForTimeout(1000);
    const inChamber = await page.getByRole('link', { name: 'Admin Dashboard', exact: true }).count();
    await context.close();
    return onArtistPortal === 0 && inChamber === 0;
  });

  await check('an ordinary artist still retains access to their authorized Artist Portal and chamber pages', async () => {
    const { context, page } = await freshPage(artistSession, '/artist');
    await expect(page.getByRole('radio', { name: ARTIST_PROJECT })).toBeVisible();
    await page.getByRole('radio', { name: ARTIST_PROJECT }).click();
    await page.waitForTimeout(500);
    await page.getByRole('link', { name: 'Proposal Chamber', exact: true }).click();
    await page.waitForTimeout(1000);
    const text = await page.locator('body').textContent();
    await context.close();
    return !text.includes('Administrator access is required');
  });

  await check('Admin Controls still works on /artist alongside the new Admin Dashboard link', async () => {
    const { context, page } = await freshPage(adminSession, '/artist');
    await expect(page.getByRole('radio', { name: 'THE GHOST IN THE SIGNAL' })).toBeVisible();
    await page.getByRole('radio', { name: 'THE GHOST IN THE SIGNAL' }).click();
    await page.waitForTimeout(500);
    await expect(page.getByRole('button', { name: 'Admin Controls', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Admin Controls', exact: true }).click();
    await expect(page.getByRole('link', { name: 'Edit Project', exact: true })).toBeVisible();
    await context.close();
    return true;
  });

  await check('the central Dashboard retains its existing ARTIST PORTAL / COMMAND CENTER navigation, unchanged', async () => {
    const { context, page } = await freshPage(adminSession, '/dashboard');
    const artistPortalVisible = await page.getByRole('link', { name: 'Artist Portal', exact: true }).isVisible();
    const commandCenterVisible = await page.getByRole('link', { name: 'Command Center', exact: true }).isVisible();
    await context.close();
    return artistPortalVisible && commandCenterVisible;
  });

  await check('the Command Center retains its existing "Dashboard" link, unchanged', async () => {
    const { context, page } = await freshPage(adminSession, '/admin');
    const href = await page.getByRole('link', { name: 'Dashboard', exact: true }).getAttribute('href');
    await context.close();
    return href === '/dashboard';
  });

  await check('mobile viewport (390x844): "Admin Dashboard" remains visible and tappable inside a chamber', async () => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await seedSessionAndReload(page, process.env.SUPABASE_URL, adminSession, '/artist');
    await page.waitForTimeout(1200);
    await page.getByRole('radio', { name: 'LOST TRANSITION' }).click();
    await page.waitForTimeout(500);
    await page.getByRole('link', { name: 'Visual Concept Chamber', exact: true }).click();
    await page.waitForTimeout(1200);
    const link = page.getByRole('link', { name: 'Admin Dashboard', exact: true });
    const visible = await link.isVisible();
    const box = await link.boundingBox();
    await context.close();
    return visible && box !== null && box.width > 0 && box.height > 0;
  });
} finally {
  await browser.close();
}

summary('Signal Portal browser suite (Stage K1.6R — Artist Portal navigation correction)');
