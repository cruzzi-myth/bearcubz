// Invitation Phase 01 — Send Invitation panel + invited-artist journey.
// Dev project, disposable identities only. No real email is sent: the one
// Send click targets a collaboration that does not exist on dev, which the
// function rejects BEFORE any mail is requested.
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { assertSafeToRunIntegrationTests } from '../integration/_guard.mjs';
import { loadBrowserDataset } from '../integration/browser-dataset.mjs';
import { signInForBrowser, seedSessionAndReload, authStorageKey } from './_session.mjs';
import { callEdgeFunction, bearerFor } from '../integration/_functions.mjs';
import { testEmail } from '../integration/fixtures.mjs';
import { check, summary } from './_harness.mjs';

assertSafeToRunIntegrationTests();
if (!process.env.SUPABASE_URL.includes('gcbonlvbgyhsgfayvlvz')) throw new Error('Wrong development target');
const U = process.env.SUPABASE_URL;
const A = process.env.SUPABASE_ANON_KEY;
const dataset = loadBrowserDataset();
const admin = createClient(U, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const anon = createClient(U, A, { auth: { persistSession: false } });
const adminSession = await signInForBrowser(anon, dataset.identities.admin.email, dataset.password);
const PASSWORD = 'Signal-Portal-Test-Fixture-1!';

const collabId = crypto.randomUUID();
const otherCollabId = crypto.randomUUID();
const TITLE = 'K16W-INVITED-PROJECT';
const OTHER_TITLE = 'K16W-OTHER-PRIVATE-PROJECT';
const email = testEmail('k16w-invitee');
let uid;
const browser = await chromium.launch({ headless: true });
const path = (p) => new URL(p.url()).pathname;

// magicLink=true reproduces what the browser receives after the emailed
// link is verified: the real session tokens in the URL hash (implicit
// flow), with NO pre-existing stored session.
async function open(session, p, viewport, magicLink = false) {
  const context = await browser.newContext(viewport ? { viewport } : {});
  const page = await context.newPage();
  if (magicLink) {
    const hash = `#access_token=${session.access_token}&refresh_token=${session.refresh_token}&expires_in=3600&token_type=bearer&type=magiclink`;
    await page.goto(`http://localhost:5173${p}${hash}`);
    await page.waitForTimeout(3500);
    return { context, page };
  }
  const hash = '';
  await seedSessionAndReload(page, U, session, '/');
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [authStorageKey(U), JSON.stringify(session)]);
  await page.goto(`http://localhost:5173${p}${hash}`);
  await page.waitForTimeout(2500);
  return { context, page };
}

try {
  // ---- Command Center panel ----
  await check('Command Center: Send Invitation panel offers exactly BEλR CUBZ and Setia Saint Haven', async () => {
    const { context, page } = await open(adminSession, '/admin?tab=invitations');
    await page.getByRole('button', { name: /Invitations/ }).first().click().catch(() => {});
    await page.waitForTimeout(800);
    const opts = await page.locator('#send-artist option').allTextContents();
    await context.close();
    return opts.length === 2 && opts[0].includes('BEλR CUBZ') && opts[1].includes('Setia Saint Haven');
  });
  await check('Command Center: no option exists for XYLØ or Issey Cross', async () => {
    const { context, page } = await open(adminSession, '/admin?tab=invitations');
    await page.getByRole('button', { name: /Invitations/ }).first().click().catch(() => {});
    await page.waitForTimeout(800);
    const text = await page.locator('#send-artist').innerText();
    await context.close();
    return !/XYL|Issey/i.test(text);
  });
  await check('Command Center: shows the exact email + collaboration to confirm; Send is disabled until confirmed', async () => {
    const { context, page } = await open(adminSession, '/admin?tab=invitations');
    await page.getByRole('button', { name: /Invitations/ }).first().click().catch(() => {});
    await page.waitForTimeout(800);
    const emailTxt = await page.getByTestId('send-email').innerText();
    const collabTxt = await page.getByTestId('send-collab').innerText();
    const send = page.getByRole('button', { name: 'Send Invitation', exact: true });
    const before = await send.isDisabled();
    await page.getByLabel(/I confirm this email address/).check();
    const after = await send.isDisabled();
    await page.locator('#send-artist').selectOption({ index: 1 });
    const setiaEmail = await page.getByTestId('send-email').innerText();
    const setiaCollab = await page.getByTestId('send-collab').innerText();
    const resetDisabled = await send.isDisabled();
    await context.close();
    return emailTxt === 'bearcubzmusic@gmail.com' && collabTxt === 'CLIMBING TREES' && before && !after && setiaEmail === 'setiahaven@gmail.com' && setiaCollab === 'WONKY LIQUID DREAMS' && resetDisabled;
  });
  await check('Command Center: a failed send is reported as an error, never as "Email sent" (dev lacks the production collaboration, rejected before any mail)', async () => {
    const { context, page } = await open(adminSession, '/admin?tab=invitations');
    await page.getByRole('button', { name: /Invitations/ }).first().click().catch(() => {});
    await page.waitForTimeout(800);
    await page.getByLabel(/I confirm this email address/).check();
    await page.getByRole('button', { name: 'Send Invitation', exact: true }).click();
    await page.waitForTimeout(2500);
    const text = await page.locator('body').innerText();
    await context.close();
    return /does not exist/i.test(text) && !/Email sent — accepted/i.test(text);
  });

  // ---- invited-artist journey ----
  await admin.from('collaborations').insert([
    { id: collabId, title: TITLE, artist_display_name: 'K16W', created_by: adminSession.user.id, status: 'draft' },
    { id: otherCollabId, title: OTHER_TITLE, artist_display_name: 'K16W-OTHER', created_by: adminSession.user.id, status: 'draft' },
  ]);
  const created = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (created.error) throw created.error;
  uid = created.data.user.id;
  const inv = await callEdgeFunction(U, A, 'portal-admin-create-invitation', { authHeader: `Bearer ${adminSession.access_token}`, body: { email, collaborationId: collabId } });
  const artistSession = await signInForBrowser(anon, email, PASSWORD);

  await check('journey: before sign-in there is no membership', async () => {
    const { data } = await admin.from('collaboration_members').select('collaboration_id').eq('user_id', uid);
    return inv.body.ok === true && (data?.length ?? 0) === 0;
  });
  await check('journey: arriving via the sign-in link accepts the invitation and lands on /artist with the assigned project selected', async () => {
    const { context, page } = await open(artistSession, '/', undefined, true);
    await page.waitForURL((u) => u.pathname === '/artist', { timeout: 15000 }).catch(() => {});
    const onArtist = path(page) === '/artist';
    const tiles = await page.getByRole('heading', { name: TITLE }).count();
    await context.close();
    return onArtist && tiles >= 1;
  });
  await check('journey: membership was created for the authenticated user only, for the invited collaboration only', async () => {
    const { data } = await admin.from('collaboration_members').select('collaboration_id, status').eq('user_id', uid);
    return data?.length === 1 && data[0].collaboration_id === collabId && data[0].status === 'active';
  });
  await check('journey: the other private collaboration is never shown', async () => {
    const { context, page } = await open(artistSession, '/artist');
    const text = await page.locator('body').innerText();
    await context.close();
    return !text.includes(OTHER_TITLE);
  });
  await check('journey: direct URL to the other collaboration is denied', async () => {
    const { context, page } = await open(artistSession, `/collaboration/${otherCollabId}/listen`);
    const text = await page.locator('body').innerText();
    await context.close();
    return /isn't available to your account|not available/i.test(text) && !text.includes(OTHER_TITLE);
  });
  await check('journey: the artist has no Command Center access (/admin denied, no admin link)', async () => {
    const { context, page } = await open(artistSession, '/admin');
    const denied = /Administrator access is required/i.test(await page.locator('body').innerText());
    const { page: p2, context: c2 } = await open(artistSession, '/artist');
    const adminLinks = await p2.locator('a[href="/admin"]').count();
    await context.close();
    await c2.close();
    return denied && adminLinks === 0;
  });
  await check('journey: replayed acceptance creates no duplicate membership', async () => {
    const userClient = createClient(U, A, { auth: { persistSession: false } });
    await userClient.auth.setSession({ access_token: artistSession.access_token, refresh_token: artistSession.refresh_token });
    await userClient.rpc('accept_artist_invitation');
    const { data } = await admin.from('collaboration_members').select('collaboration_id').eq('user_id', uid);
    return data?.length === 1;
  });
  await check('returning artist: a later sign-in opens the workspace directly with no invitation', async () => {
    const fresh = await signInForBrowser(anon, email, PASSWORD);
    const { context, page } = await open(fresh, '/artist');
    const ok = (await page.getByRole('heading', { name: TITLE }).count()) >= 1;
    await context.close();
    return ok;
  });
  await check('sign out then sign back in works', async () => {
    const { context, page } = await open(artistSession, '/artist');
    await page.evaluate(([k]) => localStorage.removeItem(k), [authStorageKey(U)]);
    await page.reload();
    await page.waitForTimeout(1500);
    const signedOut = /requires authorized|Request access/i.test(await page.locator('body').innerText());
    const back = await signInForBrowser(anon, email, PASSWORD);
    await page.evaluate(([k, v]) => localStorage.setItem(k, v), [authStorageKey(U), JSON.stringify(back)]);
    await page.goto('http://localhost:5173/artist');
    await page.waitForTimeout(2500);
    const again = (await page.getByRole('heading', { name: TITLE }).count()) >= 1;
    await context.close();
    return signedOut && again;
  });
  await check('mobile 390x844: invited artist reaches their workspace and the chamber nav works', async () => {
    const fresh = await signInForBrowser(anon, email, PASSWORD);
    const { context, page } = await open(fresh, '/artist', { width: 390, height: 844 });
    const heading = (await page.getByRole('heading', { name: TITLE }).count()) >= 1;
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    await page.locator('nav.sp-chamber-nav button', { hasText: 'Listening Chamber' }).click();
    await page.waitForTimeout(1200);
    const inChamber = path(page).includes(`/collaboration/${collabId}/listen`);
    await context.close();
    return heading && !overflow && inChamber;
  });

  // ---- expired / revoked do not grant access ----
  for (const kind of ['revoked', 'expired']) {
    await check(`${kind} invitation grants no access`, async () => {
      const e = testEmail(`k16w-${kind}`);
      const u = await admin.auth.admin.createUser({ email: e, password: PASSWORD, email_confirm: true });
      const made = await callEdgeFunction(U, A, 'portal-admin-create-invitation', { authHeader: `Bearer ${adminSession.access_token}`, body: { email: e, collaborationId: collabId } });
      if (kind === 'revoked') await admin.from('artist_invitations').update({ status: 'revoked', revoked_at: new Date().toISOString() }).eq('id', made.body.invitationId);
      else await admin.from('artist_invitations').update({ expires_at: new Date(Date.now() - 60_000).toISOString() }).eq('id', made.body.invitationId);
      const s = await signInForBrowser(anon, e, PASSWORD);
      const { context, page } = await open(s, '/', undefined, true);
      await page.waitForTimeout(2000);
      const { data } = await admin.from('collaboration_members').select('collaboration_id').eq('user_id', u.data.user.id);
      const text = await page.locator('body').innerText();
      await context.close();
      await admin.from('artist_invitations').delete().eq('id', made.body.invitationId);
      await admin.auth.admin.deleteUser(u.data.user.id);
      return (data?.length ?? 0) === 0 && !text.includes(TITLE);
    });
  }
} finally {
  await browser.close();
  await admin.from('artist_invitations').delete().ilike('email', '%k16w-%');
  await admin.from('collaboration_members').delete().in('collaboration_id', [collabId, otherCollabId]);
  await admin.from('collaborations').delete().in('id', [collabId, otherCollabId]);
  if (uid) await admin.auth.admin.deleteUser(uid);
}
summary('Signal Portal browser suite (Invitation Phase 01 — Send Invitation panel + invited-artist journey)');
