// Logout redirect repair — every Sign Out control ends the session and returns to
// the public entrance (/portal/ in production); signed-out visitors on protected
// routes are redirected there; an authenticated NON-admin is still denied admin
// access (redirected to /artist, never treated as a logout). DEV project, disposable
// identities, real virtual WebAuthn authenticator for the passkey legs.
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
const anonClient = () => createClient(U, A, { auth: { persistSession: false } });
const svc = createClient(U, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const browser = await chromium.launch({ headless: true });
const FINGER = '.sp-entrance-v2__fingerprint';
const path = (p) => new URL(p.url()).pathname;
const stored = (page) => page.evaluate((k) => !!localStorage.getItem(k), authStorageKey(U));
const sess = (email) => signInForBrowser(anonClient(), email, d.password);
const link = (s) => `${BASE}/#access_token=${s.access_token}&refresh_token=${s.refresh_token}&expires_in=3600&token_type=bearer&type=magiclink`;
const PROJECT_B = d.collaborations.projectB;
let ADMIN_UID;

async function cleanup() {
  if (ADMIN_UID) await svc.from('portal_admin_passkeys').delete().eq('user_id', ADMIN_UID);
  await svc.from('portal_webauthn_challenges').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await svc.from('portal_passkey_attempts').delete().neq('id', '00000000-0000-0000-0000-000000000000');
}
async function newPage({ session, credentials = [], viewport } = {}) {
  const context = await browser.newContext(viewport ? { viewport } : {});
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
  });
  for (const credential of credentials) await cdp.send('WebAuthn.addCredential', { authenticatorId, credential });
  await page.goto(`${BASE}/`);
  if (session) {
    await page.evaluate(([k, v]) => localStorage.setItem(k, v), [authStorageKey(U), JSON.stringify(session)]);
  }
  return { context, page, cdp, authenticatorId };
}
/** Clicks Sign Out and asserts: lands on the public entrance, login UI renders, session gone, stable (no loop), stays after reload. */
async function signOutAndAssert(page) {
  await page.getByRole('button', { name: 'Sign Out' }).click();
  await page.waitForURL((u) => u.pathname === '/', { timeout: 15000 });
  await page.locator('#artist-email').waitFor({ timeout: 15000 });
  const ui = (await page.locator(FINGER).count()) === 1 && (await page.locator('.sp-entrance-v2__access-portal').count()) === 1;
  const gone = !(await stored(page));
  const urls = new Set();
  for (let i = 0; i < 6; i++) { urls.add(path(page)); await page.waitForTimeout(500); } // 3s: no redirect loop
  const stable = urls.size === 1 && path(page) === '/';
  await page.reload();
  await page.locator('#artist-email').waitFor({ timeout: 15000 });
  const afterReload = path(page) === '/' && !(await stored(page));
  return ui && gone && stable && afterReload;
}
const open = async (page, p) => { await page.goto(`${BASE}${p}`); await page.waitForTimeout(1500); };

try {
  const adminS0 = await sess(d.identities.admin.email);
  ADMIN_UID = adminS0.user.id;
  await cleanup();

  // enroll one passkey for the administrator (through the real Settings UI) for the passkey legs
  const enr = await newPage({ session: adminS0 });
  await enr.page.goto(`${BASE}/admin`);
  await enr.page.getByRole('button', { name: 'Settings' }).click();
  await enr.page.getByRole('button', { name: 'REGISTER PASSKEY' }).click();
  await enr.page.getByTestId('passkey-message').filter({ hasText: 'PASSKEY REGISTERED' }).waitFor({ timeout: 20000 });
  const creds = (await enr.cdp.send('WebAuthn.getCredentials', { authenticatorId: enr.authenticatorId })).credentials;
  await enr.context.close();
  const artistS = await sess(d.identities.artistB.email);

  // ---------------- the exact 12-step sequence ----------------
  await check('SEQUENCE: admin passkey sign-in -> Command Center -> Sign Out -> /portal/ entrance -> fingerprint (passkey still valid) -> Dashboard -> Sign Out -> artist -> Sign Out -> entrance, no loops or stale sessions', async () => {
    const b = await newPage({ credentials: creds });
    await b.page.waitForSelector(FINGER);
    await b.page.locator(FINGER).click();                                                       // 1-2 sign in
    await b.page.waitForURL((u) => u.pathname === '/dashboard', { timeout: 25000 });
    await b.page.getByRole('link', { name: 'Command Center', exact: true }).click();             // 2 open Command Center
    await b.page.waitForURL((u) => u.pathname === '/admin', { timeout: 15000 });
    await b.page.getByRole('button', { name: 'Asset Library' }).waitFor({ timeout: 15000 });
    const step3to5 = await signOutAndAssert(b.page);                                             // 3-5
    await b.page.locator(FINGER).click();                                                        // 6-7 passkey valid after logout
    await b.page.waitForURL((u) => u.pathname === '/dashboard', { timeout: 25000 });             // 8
    await b.page.locator('.sp-dash__badge--admin').first().waitFor({ timeout: 15000 });
    const step9 = await signOutAndAssert(b.page);                                                // 9
    await b.page.goto('about:blank');
    await b.page.goto(link(artistS));                                                            // 10 artist signs in
    await b.page.waitForURL((u) => u.pathname === '/artist', { timeout: 15000 });
    await b.page.getByRole('radio', { name: 'Static Bloom' }).waitFor({ timeout: 15000 });
    const noAdminLeak = (await b.page.getByRole('link', { name: 'Admin Dashboard' }).count()) === 0; // no stale admin state
    const step11to12 = await signOutAndAssert(b.page);                                           // 11-12
    await b.context.close();
    if (!(step3to5 && step9 && noAdminLeak && step11to12)) console.log('   detail:', JSON.stringify({ step3to5, step9, noAdminLeak, step11to12 }));
    return step3to5 && step9 && noAdminLeak && step11to12;
  });

  // ---------------- every Sign Out control behaves identically ----------------
  const controls = [
    ['Administrator Dashboard', () => adminS0, '/dashboard'],
    ['Administrator Command Center', () => adminS0, '/admin'],
    ['Artist Portal (artist)', () => artistS, '/artist'],
    ['Artist Portal (administrator view)', () => adminS0, '/artist'],
    ['Listening Chamber (artist)', () => artistS, `/collaboration/${PROJECT_B}/listen`],
    ['Proposal Chamber (artist)', () => artistS, `/collaboration/${PROJECT_B}/proposal`],
    ['Visual Concept Chamber (artist)', () => artistS, `/collaboration/${PROJECT_B}/visuals`],
    ['Transmission Chamber (artist)', () => artistS, `/collaboration/${PROJECT_B}/respond`],
    ['Listening Chamber (administrator view)', () => adminS0, `/collaboration/${PROJECT_B}/listen`],
  ];
  for (const [label, who, route] of controls) {
    await check(`SIGN OUT from ${label}: ends the session, returns to the entrance, sign-in UI renders, no loop`, async () => {
      const s = (who() === adminS0) ? await sess(d.identities.admin.email) : await sess(d.identities.artistB.email);
      const b = await newPage({ session: s });
      await open(b.page, route);
      const ok = await signOutAndAssert(b.page);
      await b.context.close();
      return ok;
    });
  }

  // ---------------- protected routes while signed out ----------------
  for (const route of ['/dashboard', '/admin', '/artist', `/collaboration/${PROJECT_B}/listen`, `/collaboration/${PROJECT_B}/proposal`, `/collaboration/${PROJECT_B}/visuals`, `/collaboration/${PROJECT_B}/respond`]) {
    await check(`SIGNED OUT, direct navigation to ${route.replace(PROJECT_B, ':id')}: redirects to the entrance, no protected content, no loop`, async () => {
      const b = await newPage({});
      await b.page.goto(`${BASE}${route}`);
      await b.page.waitForURL((u) => u.pathname === '/', { timeout: 15000 });
      await b.page.locator('#artist-email').waitFor({ timeout: 15000 });
      const urls = new Set();
      for (let i = 0; i < 6; i++) { urls.add(path(b.page)); await b.page.waitForTimeout(400); }
      const text = await b.page.locator('body').textContent();
      const ok = urls.size === 1 && !(await stored(b.page)) && !text.includes('Administrator access is required') && (await b.page.locator('audio').count()) === 0;
      await b.context.close();
      return ok;
    });
  }

  // ---------------- security boundaries preserved ----------------
  await check('AUTHENTICATED ARTIST on /admin and /dashboard: denied administrator access and sent to /artist — still signed in, not treated as a logout', async () => {
    const s = await sess(d.identities.artistB.email);
    const b = await newPage({ session: s });
    const results = [];
    for (const route of ['/admin', '/dashboard']) {
      await b.page.goto(`${BASE}${route}`);
      await b.page.waitForURL((u) => u.pathname === '/artist', { timeout: 15000 });
      results.push(path(b.page) === '/artist' && (await stored(b.page)) && (await b.page.getByRole('button', { name: 'Asset Library', exact: true }).count()) === 0);
    }
    const c = anonClient();
    await c.auth.setSession({ access_token: s.access_token, refresh_token: s.refresh_token });
    const isAdmin = (await c.rpc('is_portal_admin')).data;
    await b.context.close();
    return results.every(Boolean) && isAdmin === false;
  });
  await check('SIGNED IN but not authorized (no membership): keeps the explanatory message — not logged out, not redirected in a loop', async () => {
    const s = await sess(d.identities.unauthorizedUser.email);
    const b = await newPage({ session: s });
    await b.page.goto(`${BASE}/artist`);
    await b.page.waitForTimeout(3000);
    const ok = path(b.page) === '/artist' && (await stored(b.page)) && /authorized/i.test(await b.page.locator('body').textContent());
    await b.context.close();
    return ok;
  });

  // ---------------- robustness ----------------
  await check('SERVER LOGOUT FAILURE: if the sign-out request fails (offline/5xx), the session still ends locally and the user reaches the entrance', async () => {
    const s = await sess(d.identities.admin.email);
    const b = await newPage({ session: s });
    await b.page.route('**/auth/v1/logout**', (r) => r.abort('connectionreset'));
    await open(b.page, '/dashboard');
    const ok = await signOutAndAssert(b.page);
    await b.context.close();
    return ok;
  });
  await check('REPEATED CLICKS on Sign Out are harmless (one logout, one landing, no error)', async () => {
    const s = await sess(d.identities.artistB.email);
    const b = await newPage({ session: s });
    await open(b.page, '/artist');
    const errs = []; b.page.on('pageerror', (e) => errs.push(String(e)));
    await b.page.getByRole('button', { name: 'Sign Out' }).dblclick();
    await b.page.waitForURL((u) => u.pathname === '/', { timeout: 15000 });
    await b.page.locator('#artist-email').waitFor({ timeout: 15000 });
    const ok = !(await stored(b.page)) && errs.length === 0;
    await b.context.close();
    return ok;
  });
  await check('AFTER LOGOUT the server session is really gone: the old access token no longer restores a session in a new browser', async () => {
    const s = await sess(d.identities.artistB.email);
    const b = await newPage({ session: s });
    await open(b.page, '/artist');
    await signOutAndAssert(b.page);
    // a second browser replaying the captured (now revoked) refresh token must not get back in
    const c = anonClient();
    const r = await c.auth.setSession({ access_token: s.access_token, refresh_token: s.refresh_token });
    const refreshed = r.data?.session ? (await c.auth.refreshSession()).error : { message: 'no session' };
    await b.context.close();
    return Boolean(refreshed);
  });
  await check('mobile 390x844: Sign Out returns to the entrance and the sign-in UI renders', async () => {
    const s = await sess(d.identities.admin.email);
    const b = await newPage({ session: s, viewport: { width: 390, height: 844 } });
    await open(b.page, '/dashboard');
    const ok = await signOutAndAssert(b.page);
    await b.context.close();
    return ok;
  });
} finally {
  await cleanup();
  await browser.close();
}
summary('Signal Portal browser suite (logout redirect repair — shared handler, signed-out redirect, boundaries preserved)');
