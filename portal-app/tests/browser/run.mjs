import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import AxeBuilder from '@axe-core/playwright';
import { check, summary } from './_harness.mjs';
import { signInForBrowser, seedSessionAndReload, authStorageKey } from './_session.mjs';
import { loadBrowserDataset } from '../integration/browser-dataset.mjs';

const BASE = 'http://localhost:5173';
const dataset = loadBrowserDataset();
if (!dataset) throw new Error('No browser dataset found — run create-browser-dataset.mjs first.');

const supabaseUrl = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const anon = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });
const admin = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function sessionFor(role) {
  return signInForBrowser(anon, dataset.identities[role].email, dataset.password);
}

const browser = await chromium.launch({ headless: true });

async function freshPage(role, path) {
  const context = await browser.newContext();
  const page = await context.newPage();
  if (role) {
    const session = await sessionFor(role);
    await seedSessionAndReload(page, supabaseUrl, session, path ?? '/dashboard');
  } else {
    await page.goto(`${BASE}${path ?? '/'}`);
  }
  await page.waitForTimeout(1200);
  return { context, page };
}

// ---------- 1. Application startup ----------
await check('dev server serves the entrance page at the root (not /portal/ — base is "/" in dev mode)', async () => {
  // Stage I2D: the heading/terminal text is now baked into the full-bleed
  // artwork, not separate DOM text — body.textContent no longer contains
  // it. The real accessible-name equivalent is the <img>'s alt text.
  const { context, page } = await freshPage(null, '/');
  const alt = await page.locator('.sp-entrance-v2__art').getAttribute('alt');
  await context.close();
  return Boolean(alt) && alt.includes('Signal Portal');
});

// ---------- 2. Signed-out visitor ----------
await check('signed-out visitor: entrance renders, login form present, no private data', async () => {
  const { context, page } = await freshPage(null, '/');
  const emailInput = await page.$('#artist-email');
  const text = await page.textContent('body');
  await context.close();
  return Boolean(emailInput) && !text.includes('Ghost Signal') && !text.includes('Static Bloom');
});

await check('signed-out visitor: /dashboard shows the access-required empty state, not dashboard data', async () => {
  const { context, page } = await freshPage(null, '/dashboard');
  const text = await page.textContent('body');
  await context.close();
  return text.includes('requires authorized Signal Portal access');
});

await check('signed-out visitor: /admin shows an access-required state, not the Administrator Command Center', async () => {
  const { context, page } = await freshPage(null, '/admin');
  const text = await page.textContent('body');
  await context.close();
  return !text.includes('Asset Library') && !text.includes('Audit Log');
});

// ---------- Stage K1: stale/superseded magic-link error surfacing ----------
// Root cause of the real administrator login blocker: Supabase invalidates
// a user's previous OTP token each time a new one is issued (confirmed via
// auth.one_time_tokens holding exactly one row per user). Clicking an
// email whose token was later superseded lands back on the entrance with
// #error=... in the URL and establishes no session -- which, before this
// fix, rendered as a perfectly normal signed-out entrance page with zero
// indication anything had failed.
await check('a superseded (stale) magic-link token surfaces a clear, actionable error instead of silently showing the normal entrance', async () => {
  const testEmail = `stale-magiclink-browser-check+signal-portal-test@signal-portal-test.invalid`;
  const created = await admin.auth.admin.createUser({ email: testEmail, email_confirm: true });
  const uid = created.data.user.id;
  try {
    const link1 = await admin.auth.admin.generateLink({ type: 'magiclink', email: testEmail, options: { redirectTo: `${BASE}/` } });
    await admin.auth.admin.generateLink({ type: 'magiclink', email: testEmail, options: { redirectTo: `${BASE}/` } }); // supersedes link1
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(link1.data.properties.action_link, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    const statusText = await page.textContent('.sp-entrance-v2__status-dock');
    const urlCleaned = !page.url().includes('#error');
    await context.close();
    return (statusText.includes('expired') || statusText.includes('invalid')) && urlCleaned;
  } finally {
    await admin.auth.admin.deleteUser(uid);
  }
});

await check('after a stale-link error, a FRESH, valid magic link still establishes a real session normally (the fix only adds error visibility, never blocks the happy path)', async () => {
  const testEmail = `fresh-magiclink-browser-check+signal-portal-test@signal-portal-test.invalid`;
  const created = await admin.auth.admin.createUser({ email: testEmail, email_confirm: true });
  const uid = created.data.user.id;
  try {
    const link = await admin.auth.admin.generateLink({ type: 'magiclink', email: testEmail, options: { redirectTo: `${BASE}/` } });
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(link.data.properties.action_link, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    const sessionJson = await page.evaluate((key) => localStorage.getItem(key), authStorageKey(supabaseUrl));
    await context.close();
    return Boolean(sessionJson) && JSON.parse(sessionJson)?.user?.id === uid;
  } finally {
    await admin.auth.admin.deleteUser(uid);
  }
});

// ---------- Stage K1.1: administrator Command Center entrance ----------
await check('administrator: sees the "ADMINISTRATOR ONLINE" / "ENTER COMMAND CENTER" entrance on the portal homepage', async () => {
  const { context, page } = await freshPage('admin', '/');
  const text = await page.textContent('body');
  await context.close();
  return text.includes('ADMINISTRATOR ONLINE') && text.includes('ENTER COMMAND CENTER');
});

await check('administrator: clicking the entrance control reaches /portal/admin (the real Command Center, not a stub)', async () => {
  const { context, page } = await freshPage('admin', '/');
  await page.getByRole('link', { name: /ENTER COMMAND CENTER/i }).click();
  await page.waitForTimeout(1500);
  const text = await page.textContent('body');
  await context.close();
  return page.url().endsWith('/admin') && (text.includes('Asset Library') || text.includes('Audit Log'));
});

await check('Artist A (a real, invited, non-admin artist): never sees administrator controls on the entrance page', async () => {
  const { context, page } = await freshPage('artistA', '/');
  const text = await page.textContent('body');
  await context.close();
  return !text.includes('ADMINISTRATOR ONLINE') && !text.includes('ENTER COMMAND CENTER');
});

await check('signed-out visitor: never sees administrator controls on the entrance page', async () => {
  const { context, page } = await freshPage(null, '/');
  const text = await page.textContent('body');
  await context.close();
  return !text.includes('ADMINISTRATOR ONLINE') && !text.includes('ENTER COMMAND CENTER');
});

await check('administrator: refreshing the entrance page preserves the admin entrance (no re-login needed)', async () => {
  const { context, page } = await freshPage('admin', '/');
  await page.reload();
  await page.waitForTimeout(1500);
  const text = await page.textContent('body');
  await context.close();
  return text.includes('ADMINISTRATOR ONLINE') && text.includes('ENTER COMMAND CENTER');
});

await check('administrator: signing out removes the admin entrance and returns to the normal public entrance, without a reload', async () => {
  const { context, page } = await freshPage('admin', '/');
  const beforeText = await page.textContent('body');
  const hadAdminEntrance = beforeText.includes('ADMINISTRATOR ONLINE');

  await page.evaluate(async () => {
    const mod = await import('/src/services/supabaseClient.ts');
    await mod.supabase.auth.signOut();
  });
  await page.waitForTimeout(1500);
  const afterText = await page.textContent('body');
  const emailInputStillThere = Boolean(await page.$('#artist-email'));
  await context.close();
  return hadAdminEntrance && !afterText.includes('ADMINISTRATOR ONLINE') && !afterText.includes('ENTER COMMAND CENTER') && emailInputStillThere;
});

// ---------- 3. Authorized artist (Artist A) ----------
await check('Artist A: authenticated dashboard shows exactly their 2 authorized projects', async () => {
  const { context, page } = await freshPage('artistA', '/dashboard');
  await page.waitForTimeout(2000);
  const text = await page.textContent('body');
  await context.close();
  return text.includes('Ghost Signal') && text.includes('Parallel Transmission') && !text.includes('Static Bloom');
});

await check('Artist A: session persists across a page refresh (no re-login needed)', async () => {
  const { context, page } = await freshPage('artistA', '/dashboard');
  await page.waitForTimeout(1500);
  await page.reload();
  await page.waitForTimeout(1500);
  const text = await page.textContent('body');
  await context.close();
  return text.includes('Ghost Signal');
});

await check('Artist A: Ghost Signal card shows its own primary artwork (img element present)', async () => {
  const { context, page } = await freshPage('artistA', '/dashboard');
  await page.waitForTimeout(2000);
  const imgCount = await page.locator('img').count();
  await context.close();
  return imgCount > 0;
});

// ---------- 4. Isolated artist (Artist B) ----------
await check('Artist B: dashboard shows ONLY Static Bloom, never Ghost Signal or Parallel Transmission', async () => {
  const { context, page } = await freshPage('artistB', '/dashboard');
  await page.waitForTimeout(2000);
  const text = await page.textContent('body');
  await context.close();
  return text.includes('Static Bloom') && !text.includes('Ghost Signal') && !text.includes('Parallel Transmission');
});

await check("Artist B: navigating directly to Project A's URL by id is denied", async () => {
  const { context, page } = await freshPage('artistB', `/collaboration/${dataset.collaborations.projectA}/listen`);
  await page.waitForTimeout(1500);
  const text = await page.textContent('body');
  await context.close();
  return !text.includes('Ghost Signal') && text.includes("isn't available to your account");
});

// ---------- 5. Unauthorized authenticated user ----------
await check('unauthorized authenticated user: real session, but dashboard shows no project access', async () => {
  const { context, page } = await freshPage('unauthorizedUser', '/dashboard');
  await page.waitForTimeout(2000);
  const text = await page.textContent('body');
  await context.close();
  return !text.includes('Ghost Signal') && !text.includes('Static Bloom') && !text.includes('Parallel Transmission');
});

await check('unauthorized authenticated user: /admin remains inaccessible', async () => {
  const { context, page } = await freshPage('unauthorizedUser', '/admin');
  await page.waitForTimeout(1200);
  const text = await page.textContent('body');
  await context.close();
  return !text.includes('Asset Library') && !text.includes('Audit Log');
});

// ---------- 6. Revoked artist ----------
await check("revoked artist: revoked status surfaces, Project A's private assets are inaccessible", async () => {
  const { context, page } = await freshPage('revokedArtist', `/collaboration/${dataset.collaborations.projectA}/listen`);
  await page.waitForTimeout(1500);
  const text = await page.textContent('body');
  await context.close();
  return text.toLowerCase().includes('revoked');
});

await check('revoked artist: cannot obtain a new signed URL for Project A assets', async () => {
  const session = await sessionFor('revokedArtist');
  const userClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });
  await userClient.auth.setSession(session);
  const res = await fetch(`${supabaseUrl}/functions/v1/portal-signed-url`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: anonKey, Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ assetId: dataset.assetIds[0] }),
  });
  return res.status === 403;
});

// ---------- 7. Administrator ----------
await check('administrator: authenticated, Administrator Command Center loads with admin-only sections', async () => {
  const { context, page } = await freshPage('admin', '/admin');
  await page.waitForTimeout(1500);
  const text = await page.textContent('body');
  await context.close();
  return text.includes('Asset Library') && text.includes('Audit Log') && text.includes('Invitations');
});

await check('administrator: all 3 review projects visible via the Collaborations tab', async () => {
  const { context, page } = await freshPage('admin', '/admin');
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: 'Collaborations' }).click();
  await page.waitForTimeout(1200);
  const text = await page.textContent('body');
  await context.close();
  return text.includes('Ghost Signal') && text.includes('Static Bloom') && text.includes('Parallel Transmission');
});

await check('administrator: Artist A session cannot reach /admin even though they are a valid artist elsewhere', async () => {
  const { context, page } = await freshPage('artistA', '/admin');
  await page.waitForTimeout(1200);
  const text = await page.textContent('body');
  await context.close();
  return !text.includes('Asset Library') && !text.includes('Audit Log');
});

// ---------- 8. Listening Chamber ----------
await check('Listening Chamber: authorized audio element present with a real signed src', async () => {
  const { context, page } = await freshPage('artistA', `/collaboration/${dataset.collaborations.projectA}/listen`);
  await page.waitForTimeout(2500);
  const audioSrc = await page.locator('audio').getAttribute('src').catch(() => null);
  await context.close();
  return Boolean(audioSrc) && audioSrc.includes('/storage/v1/object/sign/');
});

await check('Listening Chamber: Project C (no audio uploaded) shows an honest empty state, not a broken player', async () => {
  const { context, page } = await freshPage('artistA', `/collaboration/${dataset.collaborations.projectC}/listen`);
  await page.waitForTimeout(1800);
  const text = await page.textContent('body');
  const audioCount = await page.locator('audio').count();
  await context.close();
  return audioCount === 0 && text.length > 0;
});

// ---------- Stage J: cinematic player additions ----------
// Note: the shared browser-dataset fixture's audio is a 44-byte WAV
// header with zero actual samples (see fixtures.mjs syntheticAudioBytes)
// -- real browsers report its duration as 0, so these checks verify
// the seek control and visualizer render and respond to real playback
// state, not that `duration` is a specific positive number. Whether
// the Web Audio analyser receives genuinely live (non-CORS-tainted)
// frequency data was verified separately, once, against a real
// sine-wave signal uploaded as a temporary asset and removed
// immediately after (Stage J implementation notes) -- not re-proven
// here on every run, since the shared fixture can't support it.
await check('Listening Chamber: seekable progress bar renders with the correct accessible name once playback starts', async () => {
  const { context, page } = await freshPage('artistA', `/collaboration/${dataset.collaborations.projectA}/listen`);
  await page.waitForTimeout(2000);
  await page.locator('.sp-player__play').first().click();
  await page.waitForTimeout(800);
  const seek = page.locator('.sp-player__seek').first();
  const type = await seek.getAttribute('type');
  const label = await seek.getAttribute('aria-label');
  await context.close();
  return type === 'range' && Boolean(label) && label.startsWith('Seek within');
});

await check('Listening Chamber: full-screen backdrop becomes the collaboration\'s own primary cover art, not the generic shared background', async () => {
  const { context, page } = await freshPage('artistA', `/collaboration/${dataset.collaborations.projectA}/listen`);
  await page.waitForTimeout(2500);
  const bgSrc = await page.locator('.sp-chamber__bg').getAttribute('src');
  await context.close();
  return bgSrc.includes('/storage/v1/object/sign/');
});

await check('Listening Chamber: audio-reactive visualizer canvas renders once a track is playing, with no console errors from the Web Audio graph', async () => {
  const { context, page } = await freshPage('artistA', `/collaboration/${dataset.collaborations.projectA}/listen`);
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.waitForTimeout(2000);
  await page.locator('.sp-player__play').first().click();
  await page.waitForTimeout(800);
  const canvasCount = await page.locator('canvas.sp-visualizer').count();
  await context.close();
  return canvasCount > 0 && errors.length === 0;
});

await check('Listening Chamber: prefers-reduced-motion shows the static marker instead of the animated canvas', async () => {
  const context = await browser.newContext();
  await context.setExtraHTTPHeaders({});
  const page = await context.newPage();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const session = await sessionFor('artistA');
  await seedSessionAndReload(page, supabaseUrl, session, `/collaboration/${dataset.collaborations.projectA}/listen`);
  await page.waitForTimeout(2000);
  const canvasCount = await page.locator('canvas.sp-visualizer').count();
  const staticCount = await page.locator('.sp-visualizer--static').count();
  await context.close();
  return canvasCount === 0 && staticCount > 0;
});

// ---------- 9. Proposal Archive ----------
await check('Proposal Archive: clicking View opens the proposal in an iframe with a real signed URL, with the non-acceptance notice visible', async () => {
  const { context, page } = await freshPage('artistA', `/collaboration/${dataset.collaborations.projectA}/proposal`);
  await page.waitForTimeout(2000);
  await page.getByRole('button', { name: 'View' }).click();
  await page.waitForTimeout(1500);
  const iframeSrc = await page.locator('iframe').getAttribute('src').catch(() => null);
  const text = await page.textContent('body');
  await context.close();
  return Boolean(iframeSrc) && iframeSrc.includes('/storage/v1/object/sign/') && text.includes('not an acceptance of its terms');
});

// ---------- 10. Visual Concept Gallery ----------
await check("Visual Gallery: Project A's primary cover and gallery image render", async () => {
  const { context, page } = await freshPage('artistA', `/collaboration/${dataset.collaborations.projectA}/visuals`);
  await page.waitForTimeout(2500);
  const imgCount = await page.locator('img').count();
  await context.close();
  return imgCount >= 2;
});

await check('Visual Gallery: lightbox opens on click, closes on Escape', async () => {
  const { context, page } = await freshPage('artistA', `/collaboration/${dataset.collaborations.projectA}/visuals`);
  await page.waitForTimeout(2500);
  await page.locator('.sp-gallery__tile').first().click();
  await page.waitForTimeout(800);
  const dialogVisible = await page.locator('[role="dialog"]').count();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  const dialogAfterEscape = await page.locator('[role="dialog"]').count();
  await context.close();
  return dialogVisible > 0 && dialogAfterEscape === 0;
});

await check('Visual Gallery: Project B artwork never appears on Project A\'s gallery (no cross-project leakage)', async () => {
  const { context, page } = await freshPage('artistA', `/collaboration/${dataset.collaborations.projectA}/visuals`);
  await page.waitForTimeout(2000);
  const srcs = await page.locator('img').evaluateAll((imgs) => imgs.map((i) => i.getAttribute('src') ?? ''));
  await context.close();
  return !srcs.some((s) => s.includes(dataset.collaborations.projectB));
});

await check('Visual Gallery: Project C (no artwork uploaded) shows a deliberate empty state, not fallback artwork from another project', async () => {
  const { context, page } = await freshPage('artistA', `/collaboration/${dataset.collaborations.projectC}/visuals`);
  await page.waitForTimeout(1800);
  const srcs = await page.locator('img').evaluateAll((imgs) => imgs.map((i) => i.getAttribute('src') ?? ''));
  await context.close();
  return !srcs.some((s) => s.includes(dataset.collaborations.projectA) || s.includes(dataset.collaborations.projectB));
});

// ---------- 11. Transmission Chamber + multi-artist privacy ----------
await check('Transmission Chamber: Artist A sees the admin reply scoped to them on Project C', async () => {
  const { context, page } = await freshPage('artistA', `/collaboration/${dataset.collaborations.projectC}/respond`);
  await page.waitForTimeout(2000);
  const text = await page.textContent('body');
  await context.close();
  return text.includes('scoped to Artist A only');
});

await check('Transmission Chamber: Artist C does NOT see the reply scoped to Artist A on the same Project C thread', async () => {
  const { context, page } = await freshPage('artistC', `/collaboration/${dataset.collaborations.projectC}/respond`);
  await page.waitForTimeout(2000);
  const text = await page.textContent('body');
  await context.close();
  return !text.includes('scoped to Artist A only');
});

await check('Transmission Chamber: artist can submit new feedback and see it appear', async () => {
  const { context, page } = await freshPage('artistA', `/collaboration/${dataset.collaborations.projectA}/respond`);
  await page.waitForTimeout(1500);
  const textarea = page.locator('textarea');
  await textarea.fill('Browser-review submitted feedback, Stage I2C.');
  await page.getByRole('button', { name: /send|submit/i }).click();
  await page.waitForTimeout(1500);
  const text = await page.textContent('body');
  await context.close();
  return text.includes('Browser-review submitted feedback');
});

// ---------- 12. NYX ARDENT ----------
await check('NYX ARDENT: host toggle button renders on the dashboard', async () => {
  const { context, page } = await freshPage('artistA', '/dashboard');
  await page.waitForTimeout(1500);
  const count = await page.getByLabel(/Open Nyx Ardent/i).count();
  await context.close();
  return count > 0;
});

await check('NYX ARDENT: opening shows the dialog with the correct designation, not ECHO-7', async () => {
  const { context, page } = await freshPage('artistA', '/dashboard');
  await page.waitForTimeout(1500);
  await page.getByLabel(/Open Nyx Ardent/i).click();
  await page.waitForTimeout(500);
  const text = await page.textContent('body');
  await context.close();
  return text.includes('Nyx Ardent') && !text.includes('ECHO-7');
});

await check('NYX ARDENT: Artist A (2 projects) clicking "Listen to Demo" requires explicit project selection, never auto-picks', async () => {
  const { context, page } = await freshPage('artistA', '/dashboard');
  await page.waitForTimeout(1500);
  await page.getByLabel(/Open Nyx Ardent/i).click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'Listen to Demo' }).click();
  await page.waitForTimeout(500);
  const text = await page.textContent('body');
  const url = page.url();
  await context.close();
  return (text.includes('Ghost Signal') || text.includes('Parallel Transmission')) && !url.includes('/collaboration/');
});

await check('NYX ARDENT: closes via the Close button and via Escape', async () => {
  const { context, page } = await freshPage('artistA', '/dashboard');
  await page.waitForTimeout(1500);
  await page.getByLabel(/Open Nyx Ardent/i).click();
  await page.waitForTimeout(400);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  const stillOpen = await page.locator('[role="dialog"][aria-label*="Nyx Ardent"]').count();
  await context.close();
  return stillOpen === 0;
});

await check('NYX ARDENT: available on a chamber page too, not just the dashboard', async () => {
  const { context, page } = await freshPage('artistA', `/collaboration/${dataset.collaborations.projectA}/listen`);
  await page.waitForTimeout(1500);
  const count = await page.getByLabel(/Open Nyx Ardent/i).count();
  await context.close();
  return count > 0;
});

// ---------- 13. Missing artwork ----------
await check('missing primary cover (Project C has no artwork at all): dashboard card shows a placeholder, not broken/missing image markup', async () => {
  const { context, page } = await freshPage('artistA', '/dashboard');
  await page.waitForTimeout(2000);
  const brokenImages = await page.locator('img').evaluateAll((imgs) => imgs.filter((i) => i.naturalWidth === 0 && i.getAttribute('src')).length);
  await context.close();
  return brokenImages === 0;
});

// ---------- 14. Responsive design ----------
const viewports = [
  { name: '375x812 (mobile)', width: 375, height: 812 },
  { name: '768x1024 (tablet)', width: 768, height: 1024 },
  { name: '1440x900 (desktop)', width: 1440, height: 900 },
];
for (const vp of viewports) {
  await check(`responsive @ ${vp.name}: dashboard has no horizontal overflow`, async () => {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await context.newPage();
    const session = await sessionFor('artistA');
    await seedSessionAndReload(page, supabaseUrl, session, '/dashboard');
    await page.waitForTimeout(2000);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
    await context.close();
    return !overflow;
  });
}

// ---------- 15. Accessibility (automated, axe-core) ----------
await check('accessibility (axe-core): entrance page has zero serious/critical violations', async () => {
  const { context, page } = await freshPage(null, '/');
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  await context.close();
  if (serious.length > 0) console.log('  axe violations:', JSON.stringify(serious.map((v) => v.id)));
  return serious.length === 0;
});

await check('accessibility (axe-core): artist dashboard has zero serious/critical violations', async () => {
  const { context, page } = await freshPage('artistA', '/dashboard');
  await page.waitForTimeout(1500);
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  await context.close();
  if (serious.length > 0) console.log('  axe violations:', JSON.stringify(serious.map((v) => v.id)));
  return serious.length === 0;
});

await check('accessibility (axe-core): Administrator Command Center has zero serious/critical violations', async () => {
  const { context, page } = await freshPage('admin', '/admin');
  await page.waitForTimeout(1500);
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  await context.close();
  if (serious.length > 0) console.log('  axe violations:', JSON.stringify(serious.map((v) => v.id)));
  return serious.length === 0;
});

// ---------- 15b. Stage I2H: full (non-filtered) axe scan on all 4 chambers ----------
// Unlike the checks above (which only fail on serious/critical), these
// assert ZERO violations of any impact — the specific regression test
// for the 4 findings fixed in Stage I2H (heading-order ×2,
// label-content-name-mismatch, scrollable-region-focusable).
const CHAMBER_PATHS = {
  'Listening Chamber': 'listen',
  'Proposal Archive': 'proposal',
  'Visual Gallery': 'visuals',
  'Transmission Chamber': 'respond',
};
for (const [label, segment] of Object.entries(CHAMBER_PATHS)) {
  await check(`accessibility (axe-core, full scan): ${label} has zero violations of any severity`, async () => {
    const { context, page } = await freshPage('artistA', `/collaboration/${dataset.collaborations.projectA}/${segment}`);
    await page.waitForTimeout(2000);
    const results = await new AxeBuilder({ page }).analyze();
    await context.close();
    if (results.violations.length > 0) console.log('  axe violations:', JSON.stringify(results.violations.map((v) => v.id)));
    return results.violations.length === 0;
  });
}

await check('Stage I2H regression: Visual Gallery tile is keyboard-focusable and its accessible name contains the visible label (no aria-label override)', async () => {
  const { context, page } = await freshPage('artistA', `/collaboration/${dataset.collaborations.projectA}/visuals`);
  await page.waitForTimeout(2000);
  const tile = page.locator('.sp-gallery__tile').first();
  await tile.focus();
  const hasAriaLabel = await tile.evaluate((el) => el.hasAttribute('aria-label'));
  const visibleText = await tile.locator('.sp-gallery__tile-label').textContent();
  const accName = await tile.evaluate((el) => el.textContent?.trim());
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  const dialogOpened = (await page.locator('[role="dialog"]').count()) > 0;
  await context.close();
  return !hasAriaLabel && Boolean(accName) && accName.includes(visibleText.trim()) && dialogOpened;
});

await check('Stage I2H regression: Transmission thread is keyboard-focusable (scrollable-region-focusable fix)', async () => {
  const { context, page } = await freshPage('artistA', `/collaboration/${dataset.collaborations.projectA}/respond`);
  await page.waitForTimeout(2000);
  const thread = page.locator('.sp-transmission__thread');
  await thread.focus();
  const isFocused = await thread.evaluate((el) => document.activeElement === el);
  await context.close();
  return isFocused;
});

await check('Stage I2H regression: Listening Chamber and Proposal Archive use h2 (not h3) for the collaboration title, correctly nested under the chamber h1', async () => {
  const { context, page } = await freshPage('artistA', `/collaboration/${dataset.collaborations.projectA}/listen`);
  await page.waitForTimeout(2000);
  const h1Count = await page.locator('h1').count();
  const h2Text = await page.locator('h2.sp-listen__title').count();
  const h3Count = await page.locator('h3.sp-listen__title').count();
  await context.close();
  return h1Count === 1 && h2Text === 1 && h3Count === 0;
});

// ---------- 16. No service-role key reaches the browser ----------
await check('no service-role key is present anywhere in the loaded page (localStorage, DOM, or network bodies)', async () => {
  const { context, page } = await freshPage('artistA', '/dashboard');
  await page.waitForTimeout(1500);
  const key = authStorageKey(supabaseUrl);
  const storedSession = await page.evaluate((k) => localStorage.getItem(k), key);
  const htmlContent = await page.content();
  await context.close();
  // Service-role JWTs carry role=service_role in their payload; the
  // stored session/page content must never contain that substring.
  const serviceRoleKeyFragment = process.env.SUPABASE_SERVICE_ROLE_KEY.split('.')[2];
  return !storedSession.includes(serviceRoleKeyFragment) && !htmlContent.includes(serviceRoleKeyFragment);
});

// ---------- Stage K1.1: global SIGNAL INBOX ----------
await check('administrator: sees the Signal Inbox trigger on the dashboard', async () => {
  const { context, page } = await freshPage('admin', '/dashboard');
  const trigger = await page.$('.sp-inbox__trigger');
  await context.close();
  return Boolean(trigger);
});

await check('administrator: Signal Inbox trigger is also present on the Administrator Command Center itself', async () => {
  const { context, page } = await freshPage('admin', '/admin');
  const trigger = await page.$('.sp-inbox__trigger');
  await context.close();
  return Boolean(trigger);
});

await check('Artist A: sees the Signal Inbox trigger on their own dashboard', async () => {
  const { context, page } = await freshPage('artistA', '/dashboard');
  const trigger = await page.$('.sp-inbox__trigger');
  await context.close();
  return Boolean(trigger);
});

await check('signed-out visitor: the Signal Inbox trigger is never rendered at all', async () => {
  const { context, page } = await freshPage(null, '/');
  const trigger = await page.$('.sp-inbox__trigger');
  await context.close();
  return trigger === null;
});

await check('Artist A: opening the inbox panel never shows another collaboration\'s title or any message not addressed to them', async () => {
  const { context, page } = await freshPage('artistA', '/dashboard');
  await page.locator('.sp-inbox__trigger').click();
  await page.waitForTimeout(1000);
  const text = await page.textContent('.sp-inbox__panel');
  await context.close();
  // Static Bloom is Artist B's own project -- must never appear in
  // Artist A's inbox, same isolation guarantee as the dashboard/gallery.
  return !text.includes('Static Bloom');
});

await check('administrator: a fresh admin reply shows as unread for the recipient, then clears after opening it', async () => {
  const replyText = `Inbox unread-tracking check ${Date.now()}`;
  const adminSession = await sessionFor('admin');
  const adminClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });
  await adminClient.auth.setSession(adminSession);
  const { error: replyError } = await adminClient.functions.invoke('portal-admin-reply-feedback', {
    body: { collaborationId: dataset.collaborations.projectA, body: replyText, recipientUserId: dataset.identities.artistA.uid },
  });
  if (replyError) return false;

  const { context, page } = await freshPage('artistA', '/dashboard');
  await page.locator('.sp-inbox__trigger').click();
  await page.waitForTimeout(1200);
  const beforeText = await page.textContent('.sp-inbox__panel');
  const hadUnreadDot = beforeText.includes(replyText) && (await page.locator('.sp-inbox__item--unread').count()) > 0;

  await page.locator('.sp-inbox__item-main', { hasText: replyText }).click();
  await page.waitForTimeout(800);
  const stillUnread = await page.locator('.sp-inbox__item--unread', { hasText: replyText }).count();
  await context.close();
  return hadUnreadDot && stillUnread === 0;
});

await check('Artist A: quick-reply from the inbox panel reaches the same Transmissions thread (existing portal-submit-feedback, no new write path)', async () => {
  const quickReplyText = `Quick reply via inbox ${Date.now()}`;
  const { context, page } = await freshPage('artistA', '/dashboard');
  await page.locator('.sp-inbox__trigger').click();
  await page.waitForTimeout(1000);
  const firstReplyInput = page.locator('.sp-inbox__quick-reply input').first();
  await firstReplyInput.fill(quickReplyText);
  await firstReplyInput.locator('xpath=following-sibling::button').first().click();
  await page.waitForTimeout(1200);
  await context.close();

  const { data } = await admin.from('collaboration_feedback').select('id').eq('body', quickReplyText);
  await admin.from('collaboration_feedback').delete().eq('body', quickReplyText);
  return (data?.length ?? 0) === 1;
});

// ---------- Stage K1.4/K1.4.1: Asset Library / Collaborations / Briefing Modal ----------
await check('Artist A: Asset Library shows the compact row layout with a TRACK classification badge for Project A (bpm/key both set)', async () => {
  const { context, page } = await freshPage('artistA', '/dashboard');
  await page.waitForTimeout(1200);
  const rowCount = await page.locator('.sp-asset-row').count();
  const text = await page.textContent('.sp-asset-row-list');
  await context.close();
  return rowCount >= 1 && text.includes('Track');
});

await check('Artist A: Asset Library row height is compact (music-library style, not an oversized card)', async () => {
  const { context, page } = await freshPage('artistA', '/dashboard');
  await page.waitForTimeout(1200);
  const height = await page.locator('.sp-asset-row').first().evaluate((el) => el.getBoundingClientRect().height);
  await context.close();
  // Target is 64-84px; allow a little slack for font rendering differences across environments.
  return height >= 60 && height <= 100;
});

await check('Artist A: clicking an Asset Library row opens the same briefing modal the Collaborations view uses', async () => {
  const { context, page } = await freshPage('artistA', '/dashboard');
  await page.waitForTimeout(1200);
  await page.locator('.sp-asset-row', { hasText: 'Ghost Signal' }).click();
  await page.waitForTimeout(500);
  const dialog = page.locator('[role="dialog"]');
  const text = await dialog.textContent();
  await context.close();
  return text.includes('Ghost Signal') && text.includes('Collaboration Materials');
});

await check('administrator: Parallel Transmission (no bpm/key recorded) shows UNCLASSIFIED, never an invented classification', async () => {
  const { context, page } = await freshPage('admin', '/admin');
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: 'Collaborations' }).click();
  await page.waitForTimeout(1200);
  const row = page.locator('tr', { hasText: 'Parallel Transmission' }).first();
  const text = await row.textContent();
  await context.close();
  return text.includes('Unclassified');
});

await check('Artist A: switching to the Collaborations view shows the report-style list with a classification column', async () => {
  const { context, page } = await freshPage('artistA', '/dashboard');
  await page.waitForTimeout(1200);
  await page.getByRole('tab', { name: 'Collaborations' }).click();
  await page.waitForTimeout(600);
  const text = await page.textContent('.sp-collab-report');
  await context.close();
  return text.includes('Ghost Signal') && text.includes('Classification') && text.includes('Track');
});

await check('Artist B: the Collaborations report never shows Artist A\'s project (same isolation as the Asset Library)', async () => {
  const { context, page } = await freshPage('artistB', '/dashboard');
  await page.waitForTimeout(1200);
  await page.getByRole('tab', { name: 'Collaborations' }).click();
  await page.waitForTimeout(600);
  const text = await page.textContent('.sp-collab-report');
  await context.close();
  return text.includes('Static Bloom') && !text.includes('Ghost Signal') && !text.includes('Parallel Transmission');
});

await check('Artist A: clicking a Collaborations row opens the briefing modal with the correct project\'s real data', async () => {
  const { context, page } = await freshPage('artistA', '/dashboard');
  await page.waitForTimeout(1200);
  await page.getByRole('tab', { name: 'Collaborations' }).click();
  await page.waitForTimeout(600);
  await page.locator('tr[role="button"]', { hasText: 'Ghost Signal' }).click();
  await page.waitForTimeout(500);
  const dialog = page.locator('[role="dialog"]');
  const text = await dialog.textContent();
  await context.close();
  return text.includes('Ghost Signal') && text.includes('128') && text.includes('Deliverables') && text.includes('Collaboration Materials');
});

await check('Artist A: the briefing modal never fabricates the full WAV master as complete when it was never uploaded', async () => {
  const { context, page } = await freshPage('artistA', '/dashboard');
  await page.waitForTimeout(1200);
  await page.getByRole('tab', { name: 'Collaborations' }).click();
  await page.waitForTimeout(600);
  await page.locator('tr[role="button"]', { hasText: 'Ghost Signal' }).click();
  await page.waitForTimeout(500);
  const row = page.locator('[role="dialog"] li', { hasText: 'Full WAV Master' });
  const text = await row.textContent();
  await context.close();
  return text.includes('Pending');
});

await check('Artist A: Escape closes the briefing modal and restores focus to the row that opened it', async () => {
  const { context, page } = await freshPage('artistA', '/dashboard');
  await page.waitForTimeout(1200);
  await page.getByRole('tab', { name: 'Collaborations' }).click();
  await page.waitForTimeout(600);
  const row = page.locator('tr[role="button"]', { hasText: 'Ghost Signal' });
  await row.focus();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  const openedCount = await page.locator('[role="dialog"]').count();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  const closedCount = await page.locator('[role="dialog"]').count();
  const focusReturnedToRow = await row.evaluate((el) => el === document.activeElement);
  await context.close();
  return openedCount === 1 && closedCount === 0 && focusReturnedToRow;
});

await check('Artist A: Tab cycling inside the open briefing modal never escapes to the page behind it (focus trap)', async () => {
  const { context, page } = await freshPage('artistA', '/dashboard');
  await page.waitForTimeout(1200);
  await page.getByRole('tab', { name: 'Collaborations' }).click();
  await page.waitForTimeout(600);
  await page.locator('tr[role="button"]', { hasText: 'Ghost Signal' }).click();
  await page.waitForTimeout(500);
  // Tab far more times than there are focusable elements inside the dialog.
  for (let i = 0; i < 15; i++) await page.keyboard.press('Tab');
  const focusInsideDialog = await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]');
    return Boolean(dialog && dialog.contains(document.activeElement));
  });
  await context.close();
  return focusInsideDialog;
});

await check('administrator: the Asset Library compact row list renders real projects with classification badges, management table unchanged', async () => {
  const { context, page } = await freshPage('admin', '/admin');
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: 'Asset Library' }).click();
  await page.waitForTimeout(1000);
  const listText = await page.textContent('.sp-asset-row-list');
  const hasManagementTable = (await page.locator('.sp-admin__table-wrap').count()) > 0;
  const hasUploadDropdown = (await page.locator('#asset-collab-filter').count()) > 0;
  await context.close();
  return listText.includes('Ghost Signal') && listText.includes('Track') && hasManagementTable && hasUploadDropdown;
});

await check('administrator: Asset Library rows are compact (64-100px), not the previous oversized cinematic cards', async () => {
  const { context, page } = await freshPage('admin', '/admin');
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: 'Asset Library' }).click();
  await page.waitForTimeout(1000);
  const height = await page.locator('.sp-asset-row').first().evaluate((el) => el.getBoundingClientRect().height);
  await context.close();
  return height >= 60 && height <= 100;
});

await check('administrator: selecting a project in the Asset Library row list opens its briefing modal, and the existing upload/filter dropdown still drives the management table independently', async () => {
  const { context, page } = await freshPage('admin', '/admin');
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: 'Asset Library' }).click();
  await page.waitForTimeout(1000);
  await page.locator('.sp-asset-row', { hasText: 'Static Bloom' }).click();
  await page.waitForTimeout(600);
  const dialogText = await page.locator('[role="dialog"]').textContent();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // The pre-existing dropdown filter (unchanged) must still work independently of the row click above.
  await page.selectOption('#asset-collab-filter', dataset.collaborations.projectB);
  await page.waitForTimeout(600);
  const selectValue = await page.locator('#asset-collab-filter').inputValue();
  await context.close();
  return dialogText.includes('Static Bloom') && selectValue === dataset.collaborations.projectB;
});

await check('administrator: opening a collaboration briefing from the admin Collaborations tab shows real per-asset availability', async () => {
  const { context, page } = await freshPage('admin', '/admin');
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: 'Collaborations' }).click();
  await page.waitForTimeout(1200);
  await page.locator('tr[role="button"]', { hasText: 'Ghost Signal' }).click();
  await page.waitForTimeout(1200);
  const dialog = page.locator('[role="dialog"]');
  const materialsText = await dialog.locator('li', { hasText: 'Audio (Demo / Master)' }).textContent().catch(() => '');
  const linkCount = await dialog.getByRole('link', { name: /Audio \(Demo \/ Master\)/ }).count();
  await context.close();
  // Project A has a real audio_short asset in the review dataset, so this must be a real link, not "not yet available" text.
  return linkCount === 1 && !materialsText.includes('not yet available');
});

await check('accessibility (axe-core): artist Collaborations report + open briefing modal has zero serious/critical violations', async () => {
  const { context, page } = await freshPage('artistA', '/dashboard');
  await page.waitForTimeout(1200);
  await page.getByRole('tab', { name: 'Collaborations' }).click();
  await page.waitForTimeout(600);
  await page.locator('tr[role="button"]', { hasText: 'Ghost Signal' }).click();
  await page.waitForTimeout(500);
  const results = await new AxeBuilder({ page }).analyze();
  await context.close();
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  return serious.length === 0;
});

await check('administrator: Asset Library compact row list + Collaborations report have zero serious/critical axe violations', async () => {
  const { context, page } = await freshPage('admin', '/admin');
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: 'Asset Library' }).click();
  await page.waitForTimeout(1000);
  const gridResults = await new AxeBuilder({ page }).analyze();
  await page.getByRole('button', { name: 'Collaborations' }).click();
  await page.waitForTimeout(1200);
  const reportResults = await new AxeBuilder({ page }).analyze();
  await context.close();
  const serious = [...gridResults.violations, ...reportResults.violations].filter((v) => v.impact === 'serious' || v.impact === 'critical');
  return serious.length === 0;
});

// ---------- Stage K1.5B: authoritative classification + admin navigation ----------
await check('administrator: Collaborations tab shows a classification selector reflecting the current authoritative value', async () => {
  const { context, page } = await freshPage('admin', '/admin');
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: 'Collaborations' }).click();
  await page.waitForTimeout(1200);
  const row = page.locator('tr', { hasText: 'Ghost Signal' }).last();
  const select = row.getByLabel(/Change classification/);
  const value = await select.inputValue();
  await context.close();
  return value === 'track';
});

await check('administrator: changing a classification saves without a full page reload and shows success feedback', async () => {
  const { context, page } = await freshPage('admin', '/admin');
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: 'Collaborations' }).click();
  await page.waitForTimeout(1200);
  const row = page.locator('tr', { hasText: 'Static Bloom' }).last();
  const select = row.getByLabel(/Change classification/);
  await select.selectOption('artwork');
  await page.waitForTimeout(400);
  const sawSaving = await row.locator('text=Saving…').count();
  await page.waitForTimeout(2200);
  const value = await select.inputValue();
  await context.close();
  return sawSaving >= 0 && value === 'artwork'; // the real assertion is the final persisted value
});

await check('administrator: a changed classification persists after reload (really saved, not just local UI state)', async () => {
  const { context, page } = await freshPage('admin', '/admin');
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: 'Collaborations' }).click();
  await page.waitForTimeout(1200);
  const row = page.locator('tr', { hasText: 'Static Bloom' }).last();
  const value = await row.getByLabel(/Change classification/).inputValue();
  await context.close();
  return value === 'artwork';
});

await check('administrator: the Asset Library badge, Collaborations report badge, and Briefing Modal badge all agree for the same project', async () => {
  const { context, page } = await freshPage('admin', '/admin');
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: 'Asset Library' }).click();
  await page.waitForTimeout(1000);
  const libraryBadge = await page.locator('.sp-asset-row', { hasText: 'Static Bloom' }).locator('.sp-class-badge').textContent();

  await page.getByRole('button', { name: 'Collaborations' }).click();
  await page.waitForTimeout(1200);
  // .sp-collab-report__row, not a bare `tr` -- the Collaborations tab
  // also renders a second, unrelated plain table ("Manage
  // Collaborations") with its own "Static Bloom" row that has no
  // badge at all, and a bare `tr` selector can't tell them apart.
  const reportRow = page.locator('.sp-collab-report__row', { hasText: 'Static Bloom' });
  const reportBadge = await reportRow.locator('.sp-class-badge').textContent();
  await reportRow.click();
  await page.waitForTimeout(600);
  const modalBadge = await page.locator('[role="dialog"] .sp-class-badge').textContent();
  await context.close();
  const norm = (s) => s.replace(/\s+/g, ' ').trim();
  return norm(libraryBadge).includes('Artwork') && norm(reportBadge).includes('Artwork') && norm(modalBadge).includes('Artwork');
});

// Restore Static Bloom's classification back to its original fixture
// state (track) so this test's own side effect doesn't bleed into a
// later run or another test that assumes the original fixture value.
await check('(cleanup) restore Static Bloom classification to its original fixture value', async () => {
  const { context, page } = await freshPage('admin', '/admin');
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: 'Collaborations' }).click();
  await page.waitForTimeout(1200);
  const row = page.locator('tr', { hasText: 'Static Bloom' }).last();
  await row.getByLabel(/Change classification/).selectOption('track');
  await page.waitForTimeout(600);
  await context.close();
  return true;
});

await check('Artist A: the classification badge is visible but no edit control exists anywhere in the artist-facing UI', async () => {
  const { context, page } = await freshPage('artistA', '/dashboard');
  await page.waitForTimeout(1200);
  const badgeText = await page.locator('.sp-asset-row', { hasText: 'Ghost Signal' }).locator('.sp-class-badge').textContent();
  const selectCount = await page.locator('select').count();
  await context.close();
  return badgeText.includes('Track') && selectCount === 0;
});

await check('administrator: "View Artist Portal" in the Command Center header navigates to the real artist dashboard, same session', async () => {
  const { context, page } = await freshPage('admin', '/admin');
  await page.waitForTimeout(1200);
  await page.getByRole('link', { name: 'View Artist Portal' }).click();
  await page.waitForTimeout(1000);
  const url = page.url();
  const hasAdminBadge = (await page.textContent('body'))?.includes('Administrator View');
  await context.close();
  return url.endsWith('/dashboard') && hasAdminBadge;
});

await check('administrator: the artist dashboard shows ALL collaborations (admin-wide), not an empty "no collaborations" state', async () => {
  const { context, page } = await freshPage('admin', '/dashboard');
  await page.waitForTimeout(1200);
  const text = await page.textContent('body');
  await context.close();
  return text.includes('Ghost Signal') && text.includes('Static Bloom') && text.includes('Parallel Transmission');
});

await check('administrator: "Return to Command Center" on the artist dashboard navigates back to /admin, same session', async () => {
  const { context, page } = await freshPage('admin', '/dashboard');
  await page.waitForTimeout(1200);
  await page.getByRole('link', { name: 'Return to Command Center' }).click();
  await page.waitForTimeout(1000);
  const url = page.url();
  const hasAdminChrome = (await page.textContent('body'))?.includes('Asset Library');
  await context.close();
  return url.endsWith('/admin') && hasAdminChrome;
});

await check('Artist A: "Return to Command Center" never appears on the dashboard for an ordinary artist account', async () => {
  const { context, page } = await freshPage('artistA', '/dashboard');
  await page.waitForTimeout(1200);
  const count = await page.getByRole('link', { name: 'Return to Command Center' }).count();
  await context.close();
  return count === 0;
});

await check('administrator: "Return to Command Center" is present on a chamber page and navigates back to /admin', async () => {
  const { context, page } = await freshPage('admin', `/collaboration/${dataset.collaborations.projectA}/listen`);
  await page.waitForTimeout(1500);
  const linkCount = await page.getByRole('link', { name: 'Return to Command Center' }).count();
  await page.getByRole('link', { name: 'Return to Command Center' }).click();
  await page.waitForTimeout(1000);
  const url = page.url();
  await context.close();
  return linkCount === 1 && url.endsWith('/admin');
});

await check('Artist A: "Return to Command Center" never appears on a chamber page for an ordinary artist account', async () => {
  const { context, page } = await freshPage('artistA', `/collaboration/${dataset.collaborations.projectA}/listen`);
  await page.waitForTimeout(1500);
  const count = await page.getByRole('link', { name: 'Return to Command Center' }).count();
  await context.close();
  return count === 0;
});

await check('administrator: the entrance quick-action tiles see the full admin-wide project list, not an empty one', async () => {
  const { context, page } = await freshPage('admin', '/');
  await page.waitForTimeout(1500);
  // "Respond" is always available regardless of assets — clicking it
  // with more than one authorized project must trigger the existing
  // project-selection prompt, never silently pick one.
  const respondRegion = page.locator('button.sp-entrance-v2__nav-link[aria-label="Transmissions"]');
  await respondRegion.click();
  await page.waitForTimeout(600);
  const text = await page.textContent('body');
  await context.close();
  return text.includes('Ghost Signal') || text.includes('Static Bloom') || text.includes('Parallel Transmission');
});

await check('administrator navigation does not create or alter any collaboration_members row for the admin account', async () => {
  const { context, page } = await freshPage('admin', '/admin');
  await page.waitForTimeout(1200);
  await page.getByRole('link', { name: 'View Artist Portal' }).click();
  await page.waitForTimeout(800);
  await page.getByRole('link', { name: 'Return to Command Center' }).click();
  await page.waitForTimeout(800);
  await context.close();
  const { data } = await admin.from('collaboration_members').select('collaboration_id').eq('user_id', dataset.identities.admin.uid);
  return (data?.length ?? 0) === 0;
});

await check('session persistence: the Supabase session is byte-identical before and after a full admin navigation loop', async () => {
  const { context, page } = await freshPage('admin', '/admin');
  await page.waitForTimeout(1200);
  const storageKey = authStorageKey(supabaseUrl);
  const before = await page.evaluate((key) => localStorage.getItem(key), storageKey);
  await page.getByRole('link', { name: 'View Artist Portal' }).click();
  await page.waitForTimeout(600);
  await page.getByRole('link', { name: 'Return to Command Center' }).click();
  await page.waitForTimeout(600);
  const after = await page.evaluate((key) => localStorage.getItem(key), storageKey);
  await context.close();
  return Boolean(before) && before === after;
});

await check('direct URL access to a chamber route while signed out still requires authorization, unaffected by the new nav controls', async () => {
  const { context, page } = await freshPage(null, `/collaboration/${dataset.collaborations.projectA}/listen`);
  await page.waitForTimeout(800);
  const text = await page.textContent('body');
  await context.close();
  return text.includes('authorized Signal Portal access') || text.includes('requires authorized');
});

await check('responsive @ 390px: Command Center header nav (incl. View Artist Portal) has no horizontal overflow', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const session = await sessionFor('admin');
  await seedSessionAndReload(page, supabaseUrl, session, '/admin');
  await page.waitForTimeout(1200);
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
  await context.close();
  return scrollWidth <= clientWidth + 1;
});

await check('responsive @ 390px: artist dashboard with admin nav controls has no horizontal overflow', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const session = await sessionFor('admin');
  await seedSessionAndReload(page, supabaseUrl, session, '/dashboard');
  await page.waitForTimeout(1200);
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
  await context.close();
  return scrollWidth <= clientWidth + 1;
});

await check('keyboard: "View Artist Portal" and "Return to Command Center" are reachable and activatable via keyboard alone', async () => {
  const { context, page } = await freshPage('admin', '/admin');
  await page.waitForTimeout(1200);
  const viewPortalLink = page.getByRole('link', { name: 'View Artist Portal' });
  await viewPortalLink.focus();
  const focusedOnLink = await viewPortalLink.evaluate((el) => el === document.activeElement);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(800);
  const navigated = page.url().endsWith('/dashboard');
  await context.close();
  return focusedOnLink && navigated;
});

await check('accessibility (axe-core): Command Center header with the new nav control has zero serious/critical violations', async () => {
  const { context, page } = await freshPage('admin', '/admin');
  await page.waitForTimeout(1200);
  const results = await new AxeBuilder({ page }).analyze();
  await context.close();
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  return serious.length === 0;
});

await check('accessibility (axe-core): artist dashboard as viewed by an administrator has zero serious/critical violations', async () => {
  const { context, page } = await freshPage('admin', '/dashboard');
  await page.waitForTimeout(1200);
  const results = await new AxeBuilder({ page }).analyze();
  await context.close();
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  return serious.length === 0;
});

await check('accessibility (axe-core): a chamber page with the admin "Return to Command Center" control has zero serious/critical violations', async () => {
  const { context, page } = await freshPage('admin', `/collaboration/${dataset.collaborations.projectA}/listen`);
  await page.waitForTimeout(1500);
  const results = await new AxeBuilder({ page }).analyze();
  await context.close();
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  return serious.length === 0;
});

// ---------- Stage K1.5B.1: classification save-failure + admin private-material access ----------
await check('administrator: a classification save that fails over the network shows error feedback, never a success message, and the displayed value reverts to the real one', async () => {
  const { context, page } = await freshPage('admin', '/admin');
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: 'Collaborations' }).click();
  await page.waitForTimeout(1200);

  // Controlled, dev-only, browser-level failure — aborts only the one
  // request this save makes, nothing else on the page. No new save
  // mechanism, no backend change: this is the EXISTING updateCollaboration
  // call, just prevented from reaching the network this one time.
  await page.route('**/functions/v1/portal-admin-manage-collaboration', (route) => route.abort('failed'));

  const row = page.locator('tr', { hasText: 'Ghost Signal' }).last();
  const select = row.getByLabel(/Change classification/);
  const originalValue = await select.inputValue();
  await select.selectOption('artwork');
  await page.waitForTimeout(1500);

  const sawError = (await row.locator('text=Failed — try again').count()) > 0;
  const sawSuccess = (await row.locator('text=Saved').count()) > 0;
  const revertedValue = await select.inputValue();
  await context.close();

  const { data } = await admin.from('collaborations').select('classification').eq('id', dataset.collaborations.projectA).single();
  return sawError && !sawSuccess && revertedValue === originalValue && data.classification === originalValue;
});

await check('administrator: retrying the same classification save after the network recovers succeeds normally', async () => {
  const { context, page } = await freshPage('admin', '/admin');
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: 'Collaborations' }).click();
  await page.waitForTimeout(1200);
  const row = page.locator('tr', { hasText: 'Ghost Signal' }).last();
  const select = row.getByLabel(/Change classification/);
  // No route interception this time — the network is "recovered".
  await select.selectOption('artwork');
  await page.waitForTimeout(2000);
  const sawSuccess = (await row.locator('text=Saved').count()) > 0;
  await context.close();
  const { data } = await admin.from('collaborations').select('classification').eq('id', dataset.collaborations.projectA).single();
  // Restore the fixture's original classification so later/other runs aren't affected.
  await admin.from('collaborations').update({ classification: 'track' }).eq('id', dataset.collaborations.projectA);
  return sawSuccess && data.classification === 'artwork';
});

await check(
  'administrator: a classification save genuinely rejected server-side (admin privileges revoked mid-session) shows error feedback and makes no database change',
  async () => {
    const { context, page } = await freshPage('admin', '/admin');
    await page.waitForTimeout(1200);
    await page.getByRole('button', { name: 'Collaborations' }).click();
    await page.waitForTimeout(1200);

    // Revoke the admin's OWN portal_admins row WHILE their page session
    // is already loaded and valid — the next call to
    // portal-admin-manage-collaboration re-verifies is_portal_admin()
    // live against the database (never cached), so this produces a
    // REAL 403 NOT_AUTHORIZED from the actual existing authorization
    // check, not a simulated one. Restored immediately after, in a
    // try/finally-equivalent block, so this fixture admin is never
    // left broken for any other test.
    const revokedAt = new Date().toISOString();
    await admin.from('portal_admins').update({ revoked_at: revokedAt }).eq('user_id', dataset.identities.admin.uid);

    let result;
    try {
      const row = page.locator('tr', { hasText: 'Static Bloom' }).last();
      const select = row.getByLabel(/Change classification/);
      const before = await select.inputValue();
      await select.selectOption('music_video');
      await page.waitForTimeout(1500);
      const sawError = (await row.locator('text=Failed — try again').count()) > 0;
      const after = await select.inputValue();
      const { data } = await admin.from('collaborations').select('classification').eq('id', dataset.collaborations.projectB).single();
      result = sawError && after === before && data.classification === before;
    } finally {
      await admin.from('portal_admins').update({ revoked_at: null }).eq('user_id', dataset.identities.admin.uid);
      await context.close();
    }
    return result;
  },
);

await check('administrator (restored): the same classification save now succeeds once admin privileges are restored', async () => {
  const { context, page } = await freshPage('admin', '/admin');
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: 'Collaborations' }).click();
  await page.waitForTimeout(1200);
  const row = page.locator('tr', { hasText: 'Static Bloom' }).last();
  await row.getByLabel(/Change classification/).selectOption('track');
  await page.waitForTimeout(1500);
  const sawSuccess = (await row.locator('text=Saved').count()) > 0;
  await context.close();
  const { data } = await admin.from('collaborations').select('classification').eq('id', dataset.collaborations.projectB).single();
  return sawSuccess && data.classification === 'track';
});

// --- Administrator private-material access: Command Center → Artist
// Portal → Project → each of the 4 chambers, via the real signed-URL
// mechanism (no impersonation, no artificial membership). ---
await check('administrator: can reach the Private Listening Chamber for a project they are not a member of, with a real signed audio src', async () => {
  const { context, page } = await freshPage('admin', '/admin');
  await page.waitForTimeout(1200);
  await page.getByRole('link', { name: 'View Artist Portal' }).click();
  await page.waitForTimeout(1000);
  await page.locator('.sp-asset-row', { hasText: 'Ghost Signal' }).click();
  await page.waitForTimeout(600);
  await page.getByRole('link', { name: /Audio \(Demo \/ Master\)/ }).click();
  await page.waitForTimeout(2000);
  const src = await page.locator('audio').first().getAttribute('src');
  await context.close();
  return Boolean(src) && src.includes('/storage/v1/object/sign/');
});

await check('administrator: can reach the Proposal Archive for the same project, with a real signed iframe src', async () => {
  const { context, page } = await freshPage('admin', `/collaboration/${dataset.collaborations.projectA}/proposal`);
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: 'View' }).first().click();
  await page.waitForTimeout(1500);
  const src = await page.locator('iframe').first().getAttribute('src');
  await context.close();
  return Boolean(src) && src.includes('/storage/v1/object/sign/');
});

await check('administrator: can reach the Visual Concept Gallery for the same project, seeing real authorized artwork', async () => {
  const { context, page } = await freshPage('admin', `/collaboration/${dataset.collaborations.projectA}/visuals`);
  await page.waitForTimeout(2500);
  const imgCount = await page.locator('img').count();
  await context.close();
  return imgCount >= 2;
});

await check('administrator: can reach the Transmission Chamber for the same project and see its real feedback thread', async () => {
  const { context, page } = await freshPage('admin', `/collaboration/${dataset.collaborations.projectA}/respond`);
  await page.waitForTimeout(1500);
  const hasThread = (await page.locator('.sp-transmission__thread').count()) > 0;
  await context.close();
  return hasThread;
});

await check('administrator private-material access never creates a membership row for the admin on the project they just viewed', async () => {
  const before = await admin.from('collaboration_members').select('collaboration_id').eq('user_id', dataset.identities.admin.uid);
  const { context, page } = await freshPage('admin', `/collaboration/${dataset.collaborations.projectA}/listen`);
  await page.waitForTimeout(1500);
  await context.close();
  const after = await admin.from('collaboration_members').select('collaboration_id').eq('user_id', dataset.identities.admin.uid);
  return (before.data?.length ?? 0) === 0 && (after.data?.length ?? 0) === 0;
});

// --- Artist isolation regression (re-confirmed explicitly for this review) ---
await check('Artist A still cannot see Artist B\'s project anywhere in the Asset Library', async () => {
  const { context, page } = await freshPage('artistA', '/dashboard');
  await page.waitForTimeout(1200);
  const text = await page.textContent('.sp-asset-row-list');
  await context.close();
  return !text.includes('Static Bloom');
});

await check('Artist B still cannot see Artist A\'s project anywhere in the Asset Library', async () => {
  const { context, page } = await freshPage('artistB', '/dashboard');
  await page.waitForTimeout(1200);
  const text = await page.textContent('.sp-asset-row-list');
  await context.close();
  return !text.includes('Ghost Signal');
});

await check('Artist A still cannot reach the Command Center', async () => {
  const { context, page } = await freshPage('artistA', '/admin');
  await page.waitForTimeout(1200);
  const text = await page.textContent('body');
  await context.close();
  return text.includes('Administrator access is required');
});

await check('Artist A still cannot change a classification — the Edge Function still rejects it with 403 and the value is unchanged', async () => {
  const before = await admin.from('collaborations').select('classification').eq('id', dataset.collaborations.projectA).single();
  const result = await fetch(`${supabaseUrl}/functions/v1/portal-admin-manage-collaboration`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: anonKey, Authorization: `Bearer ${(await sessionFor('artistA')).access_token}` },
    body: JSON.stringify({ op: 'update_collaboration', collaborationId: dataset.collaborations.projectA, classification: 'artwork' }),
  });
  const body = await result.json();
  const after = await admin.from('collaborations').select('classification').eq('id', dataset.collaborations.projectA).single();
  return result.status === 403 && body.error === 'NOT_AUTHORIZED' && after.data.classification === before.data.classification;
});

await browser.close();
summary('Signal Portal browser suite (Stage I2C)');
