// Stage K1.6M — Dashboard-first navigation. Verifies the real,
// rendered admin/artist UI in a real browser against the isolated
// dev project: the two exact-labeled navigation buttons, admin-only
// gating, refresh persistence, and the post-login auto-redirect
// (simulated the same way a real magic link arrives — a genuine
// access/refresh token pair delivered via the URL hash on first
// load, not seeded into localStorage before the page ever mounts,
// since that would only exercise the "already signed in" branch).
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
  await check('Dashboard shows an admin-only link labeled exactly "COMMAND CENTER"', async () => {
    const { context, page } = await freshPage(adminSession, '/dashboard');
    // isAdmin resolves asynchronously (a real is_portal_admin() RPC) —
    // expect(...).toBeVisible() polls/retries instead of a single
    // isVisible() check racing that resolution.
    await expect(page.getByRole('link', { name: 'Command Center', exact: true })).toBeVisible();
    await context.close();
    return true;
  });

  await check('the old "Return to Command Center" wording no longer appears on the Dashboard', async () => {
    const { context, page } = await freshPage(adminSession, '/dashboard');
    const text = await page.locator('body').textContent();
    await context.close();
    return !text.includes('Return to Command Center');
  });

  await check('an ordinary artist (non-admin) sees NO Command Center link anywhere in their workspace', async () => {
    const { context, page } = await freshPage(artistSession, '/artist');
    await page.getByRole('heading', { name: 'Select a Collaboration' }).waitFor({ state: 'visible', timeout: 12000 });
    const count = await page.getByRole('link', { name: 'Command Center', exact: true }).count();
    await context.close();
    return count === 0;
  });

  await check('clicking "COMMAND CENTER" on the Dashboard navigates to /admin', async () => {
    const { context, page } = await freshPage(adminSession, '/dashboard');
    await page.getByRole('link', { name: 'Command Center', exact: true }).click();
    await page.waitForTimeout(800);
    const url = page.url();
    await context.close();
    return url.endsWith('/admin');
  });

  await check('the Command Center header shows a link labeled exactly "DASHBOARD" (was "View Artist Portal")', async () => {
    const { context, page } = await freshPage(adminSession, '/admin');
    const link = page.getByRole('link', { name: 'Dashboard', exact: true });
    const visible = await link.isVisible();
    const text = await page.locator('body').textContent();
    await context.close();
    return visible && !text.includes('View Artist Portal');
  });

  await check('clicking "DASHBOARD" in the Command Center header navigates to /dashboard', async () => {
    const { context, page } = await freshPage(adminSession, '/admin');
    await page.getByRole('link', { name: 'Dashboard', exact: true }).click();
    await page.waitForTimeout(800);
    const url = page.url();
    await context.close();
    return url.endsWith('/dashboard');
  });

  await check('the separate "← Return to Signal Portal" action is untouched (different destination, not part of this change)', async () => {
    const { context, page } = await freshPage(adminSession, '/admin');
    const link = page.getByRole('link', { name: '← Return to Signal Portal', exact: true });
    const visible = await link.isVisible();
    await context.close();
    return visible;
  });

  await check('an artist attempting /admin directly is redirected to /artist, never sees Command Center tab content', async () => {
    const { context, page } = await freshPage(artistSession, '/admin');
    await page.waitForURL((u) => u.pathname === '/artist', { timeout: 12000 }).catch(() => {});
    const sawAdminTab = await page.getByRole('button', { name: 'Asset Library', exact: true }).count();
    const redirected = new URL(page.url()).pathname === '/artist';
    await context.close();
    return redirected && sawAdminTab === 0;
  });

  await check('an admin can reach /admin directly by URL (not just via the Dashboard link)', async () => {
    const { context, page } = await freshPage(adminSession, '/admin');
    const visible = await page.getByRole('link', { name: 'Dashboard', exact: true }).isVisible();
    await context.close();
    return visible;
  });

  await check('refreshing /dashboard as admin keeps the admin signed in and on /dashboard, not bounced', async () => {
    const { context, page } = await freshPage(adminSession, '/dashboard');
    await page.reload();
    await page.waitForTimeout(1000);
    const onDashboard = page.url().endsWith('/dashboard');
    const stillSignedIn = await page.getByRole('link', { name: 'Command Center', exact: true }).isVisible();
    await context.close();
    return onDashboard && stillSignedIn;
  });

  await check('refreshing /admin as admin keeps the admin on /admin, Command Center remains accessible', async () => {
    const { context, page } = await freshPage(adminSession, '/admin');
    await page.reload();
    await page.waitForTimeout(1000);
    const onAdmin = page.url().endsWith('/admin');
    const stillAccessible = await page.getByRole('link', { name: 'Dashboard', exact: true }).isVisible();
    await context.close();
    return onAdmin && stillAccessible;
  });

  await check(
    'post-login redirect: a fresh, never-before-loaded page that arrives with a genuine auth token in the URL hash (the real shape of a magic-link return) lands on /dashboard, not /admin and not the entrance screen',
    async () => {
      const context = await browser.newContext();
      const page = await context.newPage();
      const hash = `access_token=${adminSession.access_token}&refresh_token=${adminSession.refresh_token}&expires_in=${adminSession.expires_in}&token_type=bearer&type=magiclink`;
      await page.goto(`${BASE}/#${hash}`);
      await page.waitForTimeout(1800);
      const url = page.url();
      await context.close();
      return url.endsWith('/dashboard');
    },
  );

  await check(
    'an admin already signed in who deliberately navigates back to "/" (e.g. via "Return to Signal Portal") is NOT auto-bounced to /dashboard — that link still goes somewhere real',
    async () => {
      const { context, page } = await freshPage(adminSession, '/');
      await page.waitForTimeout(1200);
      const url = page.url();
      const sawAdminBadge = (await page.locator('body').textContent()).includes('ADMINISTRATOR ONLINE');
      await context.close();
      return url.endsWith('/') && sawAdminBadge;
    },
  );

  await check('mobile viewport (390x844): the Dashboard\'s "COMMAND CENTER" link remains visible and tappable', async () => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await seedSessionAndReload(page, process.env.SUPABASE_URL, adminSession, '/dashboard');
    await page.waitForTimeout(1000);
    const link = page.getByRole('link', { name: 'Command Center', exact: true });
    const visible = await link.isVisible();
    const box = await link.boundingBox();
    await context.close();
    return visible && box !== null && box.width > 0 && box.height > 0;
  });

  await check('mobile viewport (390x844): the Command Center header\'s "DASHBOARD" link remains visible and tappable', async () => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await seedSessionAndReload(page, process.env.SUPABASE_URL, adminSession, '/admin');
    await page.waitForTimeout(1000);
    const link = page.getByRole('link', { name: 'Dashboard', exact: true });
    const visible = await link.isVisible();
    const box = await link.boundingBox();
    await context.close();
    return visible && box !== null && box.width > 0 && box.height > 0;
  });
} finally {
  await browser.close();
}

summary('Signal Portal browser suite (Stage K1.6M — Dashboard-first navigation)');
