// Phase 02 — administrator passkeys (WebAuthn), end to end on the DEV project.
// Uses Chromium's virtual authenticator (real CTAP2 keys, real signatures) —
// nothing about the cryptography is mocked. portal-request-access is stubbed so
// no email is ever sent; no production system is touched.
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
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type', 'access-control-allow-methods': 'POST, OPTIONS' };
const FN = (n) => `${U}/functions/v1/${n}`;
const ACCESS = '.sp-entrance-v2__access-portal';
const FINGER = '.sp-entrance-v2__fingerprint';
const path = (p) => new URL(p.url()).pathname;

const adminLogin = () => signInForBrowser(anonClient(), d.identities.admin.email, d.password);
let ADMIN_UID;
async function cleanup() {
  if (ADMIN_UID) await svc.from('portal_admin_passkeys').delete().eq('user_id', ADMIN_UID);
  if (d.identities.artistB.uid) await svc.from('portal_admin_passkeys').delete().eq('user_id', d.identities.artistB.uid);
  await svc.from('portal_webauthn_challenges').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await svc.from('portal_passkey_attempts').delete().neq('id', '00000000-0000-0000-0000-000000000000');
}

/** A browser context with a virtual authenticator. credentials: [] to seed. */
async function newBrowser({ session, credentials = [], userVerified = true, stubEmail = true } = {}) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: userVerified, automaticPresenceSimulation: true },
  });
  for (const credential of credentials) await cdp.send('WebAuthn.addCredential', { authenticatorId, credential });
  const calls = { emailPosts: 0, passkeyOps: [] };
  if (stubEmail) {
    await page.route('**/functions/v1/portal-request-access', (r) => {
      if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204, headers: CORS });
      calls.emailPosts += 1;
      return r.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'application/json' }, body: '{"ok":true}' });
    });
  }
  await page.route('**/functions/v1/portal-passkey-auth', async (r) => {
    if (r.request().method() === 'POST') { try { calls.passkeyOps.push(JSON.parse(r.request().postData() ?? '{}').op); } catch { /* ignore */ } }
    return r.fallback();
  });
  await page.goto(`${BASE}/`);
  if (session) {
    await page.evaluate(([k, v]) => localStorage.setItem(k, v), [authStorageKey(U), JSON.stringify(session)]);
    await page.reload();
  }
  await page.waitForSelector(FINGER, { timeout: 15000 });
  return { context, page, cdp, authenticatorId, calls };
}
const exportCreds = async (b) => (await b.cdp.send('WebAuthn.getCredentials', { authenticatorId: b.authenticatorId })).credentials;
const hasStoredSession = (page) => page.evaluate((k) => !!localStorage.getItem(k), authStorageKey(U));


/** Passkey sign-in on a brand-new browser; returns updated credentials (signCount advanced) and the captured verify request. */
async function passkeyLogin(credentials, { wantUrl = '/dashboard' } = {}) {
  await svc.from('portal_passkey_attempts').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  const b = await newBrowser({ credentials });
  let captured = null;
  await b.page.route('**/functions/v1/portal-passkey-auth', async (route) => {
    const req = route.request();
    if (req.method() === 'POST' && JSON.parse(req.postData() ?? '{}').op === 'verify') captured = req.postData();
    return route.fallback();
  });
  await b.page.locator(FINGER).click();
  await b.page.waitForURL((u) => u.pathname === wantUrl, { timeout: 25000 });
  await b.page.locator('.sp-dash__badge--admin').first().waitFor({ timeout: 15000 }).catch(() => {});
  const fresh = await exportCreds(b);
  return { b, fresh, captured };
}
/** Enrolls a new passkey for the administrator through the real Settings UI. Returns its credentials. */
async function enrollNew(name = 'Test key') {
  const e = await newBrowser({ session: await adminLogin() });
  await e.page.goto(`${BASE}/admin`);
  await e.page.getByRole('button', { name: 'Settings' }).click();
  await e.page.locator('#passkey-name').fill(name);
  await e.page.getByRole('button', { name: 'REGISTER PASSKEY' }).click();
  await e.page.getByTestId('passkey-message').filter({ hasText: 'PASSKEY REGISTERED // SECURE ACCESS ENABLED' }).waitFor({ timeout: 20000 });
  const c = await exportCreds(e);
  await e.context.close();
  return c;
}

try {
  const first = await adminLogin();
  ADMIN_UID = first.user.id;
  await cleanup();

  // ---------------- non-administrators can never enroll ----------------
  const artistS = await signInForBrowser(anonClient(), d.identities.artistB.email, d.password);
  const callAdminFn = (token, body) => fetch(FN('portal-admin-passkeys'), { method: 'POST', headers: { 'content-type': 'application/json', apikey: A, authorization: `Bearer ${token}` }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
  await check('non-administrator (artist) cannot start passkey enrollment, list, or revoke (403)', async () => {
    const results = await Promise.all(['registration-options', 'list', 'revoke'].map((op) => callAdminFn(artistS.access_token, { op, passkeyId: crypto.randomUUID() })));
    return results.every((r) => r.status === 403 && r.body.error === 'NOT_AUTHORIZED');
  });
  await check('an anonymous caller (anon key) cannot use the passkey management function (403)', async () => (await callAdminFn(A, { op: 'list' })).status === 403);

  // ---------------- first-time enrollment through Command Center -> Settings ----------------
  const enroll = await newBrowser({ session: await adminLogin() });
  await check('enrollment: Settings shows the passkey section; REGISTER PASSKEY shows "PASSKEY REGISTERED // SECURE ACCESS ENABLED"', async () => {
    await enroll.page.goto(`${BASE}/admin`);
    await enroll.page.getByRole('button', { name: 'Settings' }).click();
    await enroll.page.getByRole('heading', { name: 'SECURE ACCESS // PASSKEY MANAGEMENT' }).waitFor({ timeout: 15000 });
    await enroll.page.locator('#passkey-name').fill('Test MacBook Touch ID');
    await enroll.page.getByRole('button', { name: 'REGISTER PASSKEY' }).click();
    await enroll.page.getByTestId('passkey-message').filter({ hasText: 'PASSKEY REGISTERED // SECURE ACCESS ENABLED' }).waitFor({ timeout: 20000 });
    return (await enroll.page.getByTestId('passkey-table').innerText()).includes('Test MacBook Touch ID');
  });
  let credRow;
  await check('enrollment stored ONLY a public key + metadata, bound to the administrator (no private/biometric data)', async () => {
    const { data } = await svc.from('portal_admin_passkeys').select('*').eq('user_id', ADMIN_UID);
    credRow = data?.[0];
    const keys = Object.keys(credRow ?? {});
    return data?.length === 1 && credRow.public_key.length > 40 && credRow.credential_id.length > 10 && !keys.some((k) => /private|secret|biometric|fingerprint/i.test(k)) && credRow.name === 'Test MacBook Touch ID' && credRow.revoked_at === null;
  });
  await check('the credential table is unreachable from the browser (no grants, no RLS policies)', async () => {
    const r = await anonClient().from('portal_admin_passkeys').select('*');
    const r2 = await (await signInForBrowser(anonClient(), d.identities.admin.email, d.password)) && null;
    const adminClient = anonClient();
    const s = await adminLogin();
    await adminClient.auth.setSession({ access_token: s.access_token, refresh_token: s.refresh_token });
    const r3 = await adminClient.from('portal_admin_passkeys').select('*');
    return (r.error || (r.data ?? []).length === 0) && (r3.error || (r3.data ?? []).length === 0) && r2 === null;
  });
  const creds = await exportCreds(enroll);

  await check('rename via Settings works', async () => {
    await enroll.page.getByRole('button', { name: 'Rename' }).click();
    const input = enroll.page.getByLabel(/Rename /);
    await input.fill('Renamed Key');
    await enroll.page.getByRole('button', { name: 'Save' }).click();
    await enroll.page.getByTestId('passkey-table').getByText('Renamed Key').waitFor({ timeout: 10000 });
    return true;
  });
  await check('enrolling the same authenticator twice is refused with a clear message', async () => {
    await enroll.page.getByRole('button', { name: 'REGISTER PASSKEY' }).click();
    await enroll.page.getByTestId('passkey-message').filter({ hasText: /already has a passkey|failed/i }).waitFor({ timeout: 15000 });
    const { data } = await svc.from('portal_admin_passkeys').select('id').eq('user_id', ADMIN_UID);
    return data?.length === 1;
  });
  await enroll.context.close();

  // ---------------- returning administrator on a NEW browser ----------------
  let dashboardSession;
  let cur = creds; // credentials in step with the server's signature counter
  await check('NEW BROWSER (control 1): fingerprint -> passkey prompt -> verified -> Supabase session -> /dashboard, no emailed link', async () => {
    const before = (await svc.from('portal_admin_passkeys').select('counter, last_used_at').eq('user_id', ADMIN_UID).single()).data;
    const { b, fresh } = await passkeyLogin(cur);
    cur = fresh;
    const badge = (await b.page.locator('.sp-dash__badge--admin').count()) > 0;
    const after = (await svc.from('portal_admin_passkeys').select('counter, last_used_at').eq('user_id', ADMIN_UID).single()).data;
    dashboardSession = await b.page.evaluate((k) => localStorage.getItem(k), authStorageKey(U));
    const ops = JSON.stringify(b.calls.passkeyOps);
    const result = { badge, emailPosts: b.calls.emailPosts, ops, counterAdvanced: Number(after.counter) > Number(before.counter), lastUsedSet: !!after.last_used_at };
    await b.context.close();
    if (!(badge && b.calls.emailPosts === 0 && ops === JSON.stringify(['options', 'verify']) && result.counterAdvanced && result.lastUsedSet)) console.log('   detail:', JSON.stringify(result));
    return badge && b.calls.emailPosts === 0 && ops === JSON.stringify(['options', 'verify']) && result.counterAdvanced && result.lastUsedSet;
  });
  await check('the established session is a genuine Supabase session for the administrator (server confirms is_portal_admin)', async () => {
    const s = JSON.parse(dashboardSession);
    const c = anonClient();
    await c.auth.setSession({ access_token: s.access_token, refresh_token: s.refresh_token });
    const { data } = await c.rpc('is_portal_admin');
    return data === true && s.user.id === ADMIN_UID;
  });
  await check('REPLAY (control 2 + attack): a second valid sign-in works, then re-sending its captured request is rejected (challenge is single-use)', async () => {
    const { b, fresh, captured } = await passkeyLogin(cur);
    cur = fresh;
    await b.context.close();
    const replay = await fetch(FN('portal-passkey-auth'), { method: 'POST', headers: { 'content-type': 'application/json', apikey: A, authorization: `Bearer ${A}` }, body: captured });
    const text = await replay.text();
    return replay.status === 401 && !/tokenHash/.test(text);
  });
  await check('CLONE / COUNTER REPLAY: a stale authenticator copy whose signature counter did not advance is rejected', async () => {
    const b = await newBrowser({ credentials: creds }); // the ORIGINAL, now-stale copy
    await b.page.locator(FINGER).click();
    await b.page.getByTestId('passkey-fallback').waitFor({ timeout: 25000 });
    const ok = !(await hasStoredSession(b.page)) && path(b.page) === '/';
    await b.context.close();
    return ok;
  });

  // ---------------- Settings: list shows last used; revoke ----------------
  await check('Settings lists the passkey with a real "Last used" time after sign-in', async () => {
    const b = await newBrowser({ session: await adminLogin() });
    await b.page.goto(`${BASE}/admin`);
    await b.page.getByRole('button', { name: 'Settings' }).click();
    const table = await b.page.getByTestId('passkey-table').innerText();
    await b.context.close();
    return table.includes('Renamed Key') && !/Never/.test(table.split('\n').find((l) => l.includes('Renamed Key')) ?? '');
  });

  // ---------------- missing passkey / cancellation / email fallback ----------------
  await check('MISSING PASSKEY: a device with no passkey gets a clear message, stays signed out, and is offered email sign-in', async () => {
    const b = await newBrowser({ credentials: [] });
    await b.page.locator(FINGER).click();
    await b.page.getByTestId('passkey-fallback').waitFor({ timeout: 25000 });
    const ok = path(b.page) === '/' && !(await hasStoredSession(b.page)) && !(await b.page.locator(FINGER).isDisabled()) && (await b.page.getByTestId('email-fallback').count()) === 1;
    await b.context.close();
    return ok;
  });
  await check('CANCELLATION (Touch ID / Face ID not confirmed): no session, clear message, loading ends, buttons usable', async () => {
    const b = await newBrowser({ credentials: creds, userVerified: false });
    await b.page.locator(FINGER).click();
    await b.page.getByTestId('passkey-fallback').waitFor({ timeout: 25000 });
    const ok = !(await hasStoredSession(b.page)) && (await b.page.locator(FINGER).getAttribute('aria-busy')) !== 'true' && !(await b.page.locator(ACCESS).isDisabled());
    await b.context.close();
    return ok;
  });
  await check('EMAIL FALLBACK: after a passkey failure the user can request the emailed link instead', async () => {
    const b = await newBrowser({ credentials: [] });
    await b.page.locator('#artist-email').fill(d.identities.admin.email);
    await b.page.locator(FINGER).click();
    await b.page.getByTestId('email-fallback').waitFor({ timeout: 25000 });
    await b.page.getByTestId('email-fallback').click();
    await b.page.getByTestId('access-submitted').waitFor({ timeout: 15000 });
    const ok = b.calls.emailPosts === 1;
    await b.context.close();
    return ok;
  });
  await check('ACCESS PORTAL stays independent: with no session it requests the email link and never starts a passkey ceremony', async () => {
    const b = await newBrowser({ credentials: creds });
    await b.page.locator('#artist-email').fill(d.identities.admin.email);
    await b.page.locator(ACCESS).click();
    await b.page.getByTestId('access-submitted').waitFor({ timeout: 15000 });
    const ok = b.calls.emailPosts === 1 && b.calls.passkeyOps.length === 0 && path(b.page) === '/';
    await b.context.close();
    return ok;
  });

  // ---------------- attacks on the verify step ----------------
  const attack = async (mutate) => {
    const b = await newBrowser({ credentials: cur });
    let responseBody = null;
    await b.page.route('**/functions/v1/portal-passkey-auth', async (route) => {
      const req = route.request();
      if (req.method() !== 'POST') return route.fallback();
      const body = JSON.parse(req.postData() ?? '{}');
      if (body.op !== 'verify') return route.fallback();
      const mutated = await mutate(body);
      const resp = await route.fetch({ postData: JSON.stringify(mutated) });
      responseBody = await resp.text();
      return route.fulfill({ response: resp, body: responseBody });
    });
    const countBefore = (await svc.from('portal_admin_passkeys').select('counter').eq('user_id', ADMIN_UID).single()).data.counter;
    await b.page.locator(FINGER).click();
    await b.page.getByTestId('passkey-fallback').waitFor({ timeout: 25000 });
    const out = {
      signedOut: !(await hasStoredSession(b.page)) && path(b.page) === '/',
      noToken: !/tokenHash/.test(responseBody ?? ''),
      counterUnchanged: (await svc.from('portal_admin_passkeys').select('counter').eq('user_id', ADMIN_UID).single()).data.counter === countBefore,
    };
    await b.context.close();
    return out.signedOut && out.noToken && out.counterUnchanged;
  };
  await check('INVALID SIGNATURE: a tampered assertion is rejected — no token, no session, counter unchanged', () =>
    attack((body) => { const sig = body.response.response.signature; body.response.response.signature = (sig[0] === 'A' ? 'B' : 'A') + sig.slice(1); return body; }));
  await check('TAMPERED CLIENT DATA (wrong challenge/origin binding): rejected', () =>
    attack((body) => { const cd = JSON.parse(Buffer.from(body.response.response.clientDataJSON, 'base64url').toString()); cd.origin = 'https://evil.example'; body.response.response.clientDataJSON = Buffer.from(JSON.stringify(cd)).toString('base64url'); return body; }));
  await check('EXPIRED CHALLENGE: a challenge past its expiry is rejected even with a valid signature', () =>
    attack(async (body) => { await svc.from('portal_webauthn_challenges').update({ expires_at: new Date(Date.now() - 5000).toISOString() }).eq('id', body.challengeId); return body; }));
  await check('UNKNOWN / FORGED CHALLENGE ID: rejected', () => attack((body) => { body.challengeId = crypto.randomUUID(); return body; }));

  await check('REVOKED credential: after revocation the same device can no longer sign in (and Settings reflects it)', async () => {
    const s = await adminLogin();
    const id = (await svc.from('portal_admin_passkeys').select('id').eq('user_id', ADMIN_UID).is('revoked_at', null).single()).data.id;
    const r = await callAdminFn(s.access_token, { op: 'revoke', passkeyId: id });
    const result = await attack((body) => body); // untouched assertion — must still fail
    const row = (await svc.from('portal_admin_passkeys').select('revoked_at, revoked_by').eq('id', id).single()).data;
    return r.status === 200 && result && row.revoked_at !== null && row.revoked_by === ADMIN_UID;
  });

  // ---------------- artist can never use the administrator passkey path ----------------
  await check('ARTIST ATTEMPT: even if a valid credential were bound to an artist account, no administrator session or token is issued', async () => {
    // Fresh enrollment as admin, then (simulating a worst case) re-bind the credential to an artist.
    const c2 = await enrollNew('artist-attempt key');
    const row = (await svc.from('portal_admin_passkeys').select('id').eq('user_id', ADMIN_UID).is('revoked_at', null).single()).data;
    await svc.from('portal_admin_passkeys').update({ user_id: d.identities.artistB.uid }).eq('id', row.id);
    const b = await newBrowser({ credentials: c2 });
    let responseBody = '';
    await b.page.route('**/functions/v1/portal-passkey-auth', async (route) => {
      const req = route.request();
      if (req.method() !== 'POST' || JSON.parse(req.postData() ?? '{}').op !== 'verify') return route.fallback();
      const resp = await route.fetch(); responseBody = await resp.text(); return route.fulfill({ response: resp, body: responseBody });
    });
    await b.page.locator(FINGER).click();
    await b.page.getByTestId('passkey-fallback').waitFor({ timeout: 25000 });
    const ok = !(await hasStoredSession(b.page)) && !/tokenHash/.test(responseBody) && path(b.page) === '/';
    await b.context.close();
    await svc.from('portal_admin_passkeys').update({ user_id: ADMIN_UID }).eq('id', row.id);
    return ok;
  });

  // ---------------- sessions: restore, sign out, account switching ----------------
  await check('SESSION RESTORATION + LOGOUT + ACCOUNT SWITCHING: passkey admin -> reload -> sign out -> artist (own project only, /admin redirected) -> sign out -> passkey admin again', async () => {
    const cs = await enrollNew('switch key');
    const { b, fresh } = await passkeyLogin(cs);
    await b.page.reload();
    await b.page.waitForTimeout(2500);
    const still = path(b.page) === '/dashboard' && (await b.page.locator('.sp-dash__badge--admin').count()) > 0;
    await b.page.goto(`${BASE}/admin`);
    await b.page.getByRole('button', { name: 'Sign Out' }).click();
    await b.page.waitForTimeout(1500);
    const signedOut = !(await hasStoredSession(b.page));
    await b.page.goto('about:blank');
    await b.page.goto(`${BASE}/#access_token=${artistS.access_token}&refresh_token=${artistS.refresh_token}&expires_in=3600&token_type=bearer&type=magiclink`);
    await b.page.waitForURL((u) => u.pathname === '/artist', { timeout: 15000 });
    await b.page.getByRole('radio', { name: 'Static Bloom' }).waitFor({ timeout: 15000 });
    const txt = await b.page.locator('body').textContent();
    const artistOnlyOwn = txt.includes('Static Bloom') && !txt.includes('Ghost Signal');
    await b.page.goto(`${BASE}/admin`);
    await b.page.waitForURL((u) => u.pathname === '/artist', { timeout: 15000 }).catch(() => {});
    const adminRoute = path(b.page) === '/artist';
    await b.page.getByRole('button', { name: 'Sign Out' }).click();
    await b.page.waitForTimeout(1500);
    await b.context.close();
    const again = await passkeyLogin(fresh); // brand-new browser, same passkey
    const backAsAdmin = (await again.b.page.locator('.sp-dash__badge--admin').count()) > 0;
    await again.b.context.close();
    return still && signedOut && artistOnlyOwn && adminRoute && backAsAdmin;
  });

  // ---------------- rate limiting (last: it fills this IP's quota) ----------------
  await check('RATE LIMIT: repeated failed verifications are throttled (429) without leaking anything', async () => {
    await svc.from('portal_passkey_attempts').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    const junk = { op: 'verify', challengeId: crypto.randomUUID(), response: { id: 'x', type: 'public-key', response: { clientDataJSON: 'a', authenticatorData: 'b', signature: 'c' } } };
    const statuses = [];
    for (let i = 0; i < 10; i++) {
      const r = await fetch(FN('portal-passkey-auth'), { method: 'POST', headers: { 'content-type': 'application/json', apikey: A, authorization: `Bearer ${A}` }, body: JSON.stringify(junk) });
      statuses.push(r.status);
    }
    return statuses.slice(0, 8).every((s) => s === 401) && statuses.slice(8).every((s) => s === 429);
  });
} finally {
  await cleanup();
  await browser.close();
}
summary('Signal Portal browser suite (Phase 02 — administrator passkeys / WebAuthn)');
