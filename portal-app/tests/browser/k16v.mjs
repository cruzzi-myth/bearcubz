// Navigation correction — context-aware chamber "Dashboard" link.
// Read-only: uses the existing disposable dev dataset identities
// (admin + artist A), never production, never creates or changes data.
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { assertSafeToRunIntegrationTests } from '../integration/_guard.mjs';
import { loadBrowserDataset } from '../integration/browser-dataset.mjs';
import { signInForBrowser, seedSessionAndReload } from './_session.mjs';
import { check, summary } from './_harness.mjs';

assertSafeToRunIntegrationTests();
if (!process.env.SUPABASE_URL.includes('gcbonlvbgyhsgfayvlvz')) throw new Error('Wrong development target');
const dataset = loadBrowserDataset();
if (!dataset) throw new Error('No browser dataset found.');

const anon = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const adminSession = await signInForBrowser(anon, dataset.identities.admin.email, dataset.password);
const artistSession = await signInForBrowser(anon, dataset.identities.artistA.email, dataset.password);
const browser = await chromium.launch({ headless: true });

async function open(session, path, viewport) {
  const context = await browser.newContext(viewport ? { viewport } : {});
  const page = await context.newPage();
  await seedSessionAndReload(page, process.env.SUPABASE_URL, session, path);
  await page.waitForSelector('.sp-chamber-nav', { timeout: 10000 }).catch(() => {});
  return { context, page };
}
const chamberDashHref = (page) => page.locator('nav.sp-chamber-nav a', { hasText: 'Dashboard' }).first().getAttribute('href');
const path = (page) => new URL(page.url()).pathname;
const hrefs = (page) => page.$$eval('a[href]', (as) => as.map((a) => [a.textContent.trim(), a.getAttribute('href')]));

try {
  await check('ADMIN /dashboard: chamber nav Dashboard -> /dashboard', async () => {
    const { context, page } = await open(adminSession, '/dashboard');
    const h = await chamberDashHref(page);
    await context.close();
    return h === '/dashboard';
  });
  await check('ADMIN /dashboard: header Artist Portal -> /artist (only /artist link), Command Center -> /admin', async () => {
    const { context, page } = await open(adminSession, '/dashboard');
    const all = await hrefs(page);
    await context.close();
    const toArtist = all.filter(([, h]) => h === '/artist');
    return toArtist.length === 1 && /artist portal/i.test(toArtist[0][0]) && all.some(([t, h]) => /command center/i.test(t) && h === '/admin');
  });
  await check('ADMIN: refresh on /dashboard keeps /dashboard and the same nav target', async () => {
    const { context, page } = await open(adminSession, '/dashboard');
    await page.reload();
    await page.waitForSelector('.sp-chamber-nav', { timeout: 10000 });
    const ok = path(page) === '/dashboard' && (await chamberDashHref(page)) === '/dashboard';
    await context.close();
    return ok;
  });
  await check('ADMIN: chamber page Dashboard -> /dashboard (listening chamber)', async () => {
    const { context, page } = await open(adminSession, '/chambers/listening');
    const h = await chamberDashHref(page);
    await context.close();
    return h === '/dashboard';
  });
  await check('ADMIN mobile 390x844: Dashboard link -> /dashboard and click navigates', async () => {
    const { context, page } = await open(adminSession, '/dashboard', { width: 390, height: 844 });
    await page.locator('nav.sp-chamber-nav a', { hasText: 'Dashboard' }).first().click();
    const ok = path(page) === '/dashboard';
    await context.close();
    return ok;
  });
  await check('ARTIST /artist: chamber nav Dashboard -> /artist', async () => {
    const { context, page } = await open(artistSession, '/artist');
    const h = await chamberDashHref(page);
    await context.close();
    return h === '/artist';
  });
  await check('ARTIST chamber page: Dashboard -> /artist, never /dashboard', async () => {
    const { context, page } = await open(artistSession, '/chambers/listening');
    const h = await chamberDashHref(page);
    const none = !(await hrefs(page)).some(([, x]) => x === '/dashboard' || x === '/admin');
    await context.close();
    return h === '/artist' && none;
  });
  await check('ARTIST: direct /dashboard shows no Command Center / admin controls', async () => {
    const { context, page } = await open(artistSession, '/dashboard');
    await page.waitForTimeout(1500);
    const all = await hrefs(page);
    const badge = await page.locator('.sp-dash__badge--admin').count();
    await context.close();
    return !all.some(([, h]) => h === '/admin') && badge === 0;
  });
  await check('ARTIST: direct /admin is denied (no Command Center rendered)', async () => {
    const { context, page } = await open(artistSession, '/admin');
    await page.waitForTimeout(1500);
    const text = await page.locator('body').innerText();
    await context.close();
    return /administrator access is required/i.test(text);
  });
  await check('ARTIST: refresh on /artist keeps /artist and nav target', async () => {
    const { context, page } = await open(artistSession, '/artist');
    await page.reload();
    await page.waitForSelector('.sp-chamber-nav', { timeout: 10000 });
    const ok = path(page) === '/artist' && (await chamberDashHref(page)) === '/artist';
    await context.close();
    return ok;
  });
  await check('ARTIST mobile 390x844: Dashboard click stays on /artist', async () => {
    const { context, page } = await open(artistSession, '/artist', { width: 390, height: 844 });
    await page.locator('nav.sp-chamber-nav a', { hasText: 'Dashboard' }).first().click();
    const ok = path(page) === '/artist';
    await context.close();
    return ok;
  });
} finally {
  await browser.close();
}
summary('Signal Portal browser suite (navigation correction — context-aware Dashboard link)');
