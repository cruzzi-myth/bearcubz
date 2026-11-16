// Landing-page login repair: ACCESS PORTAL + fingerprint use ONE handler that
// (1) checks for an existing session, (2) verifies authorization server-side,
// (3) routes admin -> /dashboard and artist -> /artist, (4) otherwise requests a
// secure sign-in link, (5) always terminates its loading state.
// Dev project, disposable identities. portal-request-access is STUBBED, so no
// email is ever sent by this suite.
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { assertSafeToRunIntegrationTests } from '../integration/_guard.mjs';
import { loadBrowserDataset } from '../integration/browser-dataset.mjs';
import { signInForBrowser, authStorageKey } from './_session.mjs';
import { check, summary } from './_harness.mjs';

assertSafeToRunIntegrationTests();
if (!process.env.SUPABASE_URL.includes('gcbonlvbgyhsgfayvlvz')) throw new Error('Wrong development target');
const U = process.env.SUPABASE_URL;
const A = process.env.SUPABASE_ANON_KEY;
const BASE = 'http://localhost:5173';
const d = loadBrowserDataset();
const anon = () => createClient(U, A, { auth: { persistSession: false } });
const sess = (email) => signInForBrowser(anon(), email, d.password);
const browser = await chromium.launch({ headless: true });
const path = (p) => new URL(p.url()).pathname;
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type', 'access-control-allow-methods': 'POST, OPTIONS' };

/** Opens the landing page in a brand-new browser context (like Incognito). */
async function landing({ session, mode = 'ok', viewport } = {}) {
  const context = await browser.newContext(viewport ? { viewport } : {});
  const page = await context.newPage();
  const calls = { posts: 0 };
  await page.route('**/functions/v1/portal-request-access', async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    calls.posts += 1;
    if (mode === 'hang') return; // never answers
    if (mode === '500') return route.fulfill({ status: 500, headers: { ...CORS, 'content-type': 'application/json' }, body: '{"error":"SERVER_CONFIG"}' });
    if (mode === 'abort') return route.abort('connectionreset');
    return route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'application/json' }, body: '{"ok":true}' });
  });
  await page.goto(`${BASE}/`);
  if (session) {
    await page.evaluate(([k, v]) => localStorage.setItem(k, v), [authStorageKey(U), JSON.stringify(session)]);
    await page.reload();
  }
  await page.waitForSelector('.sp-entrance-v2__access-portal', { timeout: 15000 });
  return { context, page, calls };
}
const ACCESS = '.sp-entrance-v2__access-portal';
const FINGER = '.sp-entrance-v2__fingerprint';
const dock = (page) => page.locator('.sp-entrance-v2__status-dock').innerText();
const cursorOf = (page, sel) => page.locator(sel).evaluate((el) => getComputedStyle(el).cursor);

try {
  const adminS = await sess(d.identities.admin.email);
  const artistBS = await sess(d.identities.artistB.email);
  const unauthS = await sess(d.identities.unauthorizedUser.email);
  const revokedS = await sess(d.identities.revokedArtist.email);

  // ---------- existing sessions: instant routing, no link, no email typed ----------
  for (const [label, sel] of [['ACCESS PORTAL', ACCESS], ['fingerprint', FINGER]]) {
    await check(`existing ADMIN session: ${label} opens /dashboard immediately (no email, no link request)`, async () => {
      const { context, page, calls } = await landing({ session: adminS });
      await page.locator('.sp-entrance-v2__admin-badge').waitFor({ timeout: 15000 });
      await page.locator(sel).click();
      await page.waitForURL((u) => u.pathname === '/dashboard', { timeout: 15000 }).catch(() => {});
      const ok = path(page) === '/dashboard' && calls.posts === 0;
      await context.close();
      return ok;
    });
    await check(`existing ARTIST session: ${label} opens /artist (never /dashboard), no link request`, async () => {
      const { context, page, calls } = await landing({ session: artistBS });
      await page.waitForTimeout(2500);
      await page.locator(sel).click();
      await page.waitForURL((u) => u.pathname === '/artist', { timeout: 15000 }).catch(() => {});
      const ok = path(page) === '/artist' && calls.posts === 0;
      await context.close();
      return ok;
    });
  }
  await check('signed-in but NOT authorized (no membership): a clear denial, no navigation, no link request', async () => {
    const { context, page, calls } = await landing({ session: unauthS });
    await page.waitForTimeout(2500);
    await page.locator(ACCESS).click();
    await page.getByTestId('access-denied').waitFor({ timeout: 15000 });
    const ok = path(page) === '/' && calls.posts === 0 && !(await page.locator(ACCESS).isDisabled());
    await context.close();
    return ok;
  });
  await check('signed-in with REVOKED access: a clear denial, no navigation', async () => {
    const { context, page } = await landing({ session: revokedS });
    await page.waitForTimeout(2500);
    await page.locator(FINGER).click();
    await page.getByTestId('access-denied').waitFor({ timeout: 15000 });
    const text = await page.getByTestId('access-denied').innerText();
    const ok = path(page) === '/' && /revoked/i.test(text);
    await context.close();
    return ok;
  });

  // ---------- no session: request a link; never an email-only bypass ----------
  const submitFlow = async (sel) => {
    const { context, page, calls } = await landing();
    await page.locator('#artist-email').fill(d.identities.admin.email);
    await page.locator(sel).click();
    await page.getByTestId('access-submitted').waitFor({ timeout: 15000 });
    const msg = await page.getByTestId('access-submitted').innerText();
    const result = {
      msg,
      stayedOnLanding: path(page) === '/',
      posts: calls.posts,
      buttonsEnabled: !(await page.locator(ACCESS).isDisabled()) && !(await page.locator(FINGER).isDisabled()),
      emailEnabled: !(await page.locator('#artist-email').isDisabled()),
      busy: await page.locator(ACCESS).getAttribute('aria-busy'),
      cursor: await cursorOf(page, ACCESS),
    };
    await context.close();
    return result;
  };
  const viaAccess = await submitFlow(ACCESS);
  const viaFinger = await submitFlow(FINGER);
  await check('no session: ACCESS PORTAL requests ONE link, shows a clear "check your inbox" confirmation, and does NOT grant access from the email alone', async () =>
    /inbox/i.test(viaAccess.msg) && viaAccess.stayedOnLanding && viaAccess.posts === 1);
  await check('no session: the form is NOT left locked or "busy" afterwards (no endless loading state, no progress cursor)', async () =>
    viaAccess.buttonsEnabled && viaAccess.emailEnabled && viaAccess.busy !== 'true' && viaAccess.cursor !== 'progress');
  await check('BOTH buttons behave identically (same request count, same confirmation, same final state)', async () =>
    viaFinger.msg === viaAccess.msg && viaFinger.posts === viaAccess.posts && viaFinger.stayedOnLanding === viaAccess.stayedOnLanding &&
    viaFinger.buttonsEnabled === viaAccess.buttonsEnabled && viaFinger.cursor === viaAccess.cursor);

  await check('repeated clicks never send duplicate requests (in flight + cooldown)', async () => {
    const { context, page, calls } = await landing();
    await page.locator('#artist-email').fill(d.identities.admin.email);
    await page.locator(ACCESS).dblclick();
    await page.getByTestId('access-submitted').waitFor({ timeout: 15000 });
    await page.locator(FINGER).click(); // intentionally again, right after success
    await page.getByTestId('access-cooldown').waitFor({ timeout: 5000 });
    const ok = calls.posts === 1;
    await context.close();
    return ok;
  });
  await check('an invalid email is rejected locally, with feedback, and sends nothing', async () => {
    const { context, page, calls } = await landing();
    await page.locator('#artist-email').fill('not-an-email');
    await page.evaluate(() => document.querySelector('form.sp-entrance-v2__auth-form').noValidate = true);
    await page.locator(ACCESS).click();
    await page.locator('#artist-email-error').waitFor({ timeout: 5000 });
    const ok = calls.posts === 0 && !(await page.locator(ACCESS).isDisabled());
    await context.close();
    return ok;
  });

  // ---------- every failure terminates the loading state ----------
  for (const mode of ['500', 'abort']) {
    await check(`server/network failure (${mode}): loading ends with a clear error and the form is usable again`, async () => {
      const { context, page } = await landing({ mode });
      await page.locator('#artist-email').fill(d.identities.admin.email);
      await page.locator(ACCESS).click();
      await page.getByTestId('access-error').waitFor({ timeout: 15000 });
      const ok = !(await page.locator(ACCESS).isDisabled()) && (await page.locator(ACCESS).getAttribute('aria-busy')) !== 'true';
      await context.close();
      return ok;
    });
  }
  await check('a request that NEVER answers times out: loading ends with a clear message (no endless spinner)', async () => {
    const { context, page } = await landing({ mode: 'hang' });
    await page.locator('#artist-email').fill(d.identities.admin.email);
    await page.locator(FINGER).click();
    const duringBusy = await page.locator(FINGER).getAttribute('aria-busy');
    await page.getByTestId('access-error').waitFor({ timeout: 25000 });
    const ok = duringBusy === 'true' && !(await page.locator(FINGER).isDisabled()) && (await page.locator(FINGER).getAttribute('aria-busy')) !== 'true';
    await context.close();
    return ok;
  });
  await check('after an error the user can retry successfully', async () => {
    const { context, page } = await landing({ mode: '500' });
    await page.locator('#artist-email').fill(d.identities.admin.email);
    await page.locator(ACCESS).click();
    await page.getByTestId('access-error').waitFor({ timeout: 15000 });
    await page.unroute('**/functions/v1/portal-request-access');
    await page.route('**/functions/v1/portal-request-access', (r) => (r.request().method() === 'OPTIONS' ? r.fulfill({ status: 204, headers: CORS }) : r.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'application/json' }, body: '{"ok":true}' })));
    await page.locator(ACCESS).click();
    await page.getByTestId('access-submitted').waitFor({ timeout: 15000 });
    await context.close();
    return true;
  });

  // ---------- the full account-switching sequence (fresh contexts = Incognito) ----------
  const viaMagicLink = async (page, session) => {
    // An emailed link always opens as a fresh page load (never a same-document
    // hash change), so leave the current document first.
    await page.goto('about:blank');
    await page.goto(`${BASE}/#access_token=${session.access_token}&refresh_token=${session.refresh_token}&expires_in=3600&token_type=bearer&type=magiclink`);
  };
  await check('account switching: admin -> Dashboard -> Command Center -> sign out -> artist -> own project only -> sign out -> admin again reaches the Dashboard', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await viaMagicLink(page, await sess(d.identities.admin.email));
    await page.waitForURL((u) => u.pathname === '/dashboard', { timeout: 15000 });
    await page.goto(`${BASE}/admin`);
    await page.getByRole('button', { name: 'Sign Out' }).click();
    await page.waitForTimeout(1500);
    await viaMagicLink(page, await sess(d.identities.artistB.email));
    await page.waitForURL((u) => u.pathname === '/artist', { timeout: 15000 });
    await page.getByRole('radio', { name: 'Static Bloom' }).waitFor({ timeout: 15000 });
    const body = await page.locator('body').textContent();
    const onlyOwn = body.includes('Static Bloom') && !body.includes('Ghost Signal') && !body.includes('Parallel Transmission');
    await page.getByRole('button', { name: 'Sign Out' }).click();
    await page.waitForTimeout(1500);
    // Back on the landing page after the artist signed out: the form must be usable,
    // and the admin completing sign-in lands on the Dashboard without hanging.
    await page.goto(`${BASE}/`);
    await page.waitForSelector(ACCESS, { timeout: 15000 });
    const formUsable = !(await page.locator(ACCESS).isDisabled()) && !(await page.locator('#artist-email').isDisabled());
    await viaMagicLink(page, await sess(d.identities.admin.email));
    await page.waitForURL((u) => u.pathname === '/dashboard', { timeout: 15000 });
    const adminBack = (await page.locator('.sp-dash__badge--admin').count()) > 0;
    await context.close();
    return onlyOwn && formUsable && adminBack;
  });
  await check('a fresh private-window session (no stored state) completes admin sign-in via the emailed-link return', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await viaMagicLink(page, await sess(d.identities.admin.email));
    await page.waitForURL((u) => u.pathname === '/dashboard', { timeout: 15000 });
    const ok = (await page.locator('.sp-dash__badge--admin').count()) > 0;
    await context.close();
    return ok;
  });
  await check('mobile 390x844: both buttons route an existing admin session to the Dashboard', async () => {
    const { context, page } = await landing({ session: adminS, viewport: { width: 390, height: 844 } });
    await page.locator('.sp-entrance-v2__admin-badge').waitFor({ timeout: 15000 });
    await page.locator(FINGER).click();
    await page.waitForURL((u) => u.pathname === '/dashboard', { timeout: 15000 }).catch(() => {});
    const ok = path(page) === '/dashboard';
    await context.close();
    return ok;
  });
} finally {
  await browser.close();
}
summary('Signal Portal browser suite (landing-page login repair — one handler, session-aware, always terminates)');
