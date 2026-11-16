import { assert, importCompiled, report } from './runner.mjs';
const m = await importCompiled(new URL('../../../supabase/functions/_shared/passkeyPolicy.ts', import.meta.url).pathname);
const { resolveWebAuthnConfig, isChallengeUsable, rateLimitDecision, isRecentAuth, authTimeMsFromClaims, normalizePasskeyName, b64urlEncode, b64urlDecode, isPlausibleAuthResponse, PRODUCTION_PROJECT_REF, PRODUCTION_RP_ID, PRODUCTION_ORIGIN, CHALLENGE_TTL_MS, RECENT_AUTH_WINDOW_MS } = m;
const env = (o) => (n) => o[n];
const PROD = `https://${PRODUCTION_PROJECT_REF}.supabase.co`;
const DEV = 'https://gcbonlvbgyhsgfayvlvz.supabase.co';

const prod = resolveWebAuthnConfig(env({ SUPABASE_URL: PROD }));
assert('production RP is fixed: bearcubz.com, HTTPS origin only', prod.ok && prod.config.rpID === 'bearcubz.com' && prod.config.origins.length === 1 && prod.config.origins[0] === 'https://bearcubz.com' && prod.config.production === true);
const evil = resolveWebAuthnConfig(env({ SUPABASE_URL: PROD, PORTAL_WEBAUTHN_RP_ID: 'evil.example', PORTAL_WEBAUTHN_ORIGINS: 'http://localhost:5173,https://evil.example' }));
assert('production IGNORES any env override (cannot be weakened or redirected by a secret)', evil.ok && evil.config.rpID === PRODUCTION_RP_ID && evil.config.origins.join() === PRODUCTION_ORIGIN);
assert('production URL detection is case-insensitive', resolveWebAuthnConfig(env({ SUPABASE_URL: PROD.toUpperCase(), PORTAL_WEBAUTHN_RP_ID: 'localhost', PORTAL_WEBAUTHN_ORIGINS: 'http://localhost:5173' })).config.rpID === PRODUCTION_RP_ID);
assert('dev without explicit config is refused (no silent default)', !resolveWebAuthnConfig(env({ SUPABASE_URL: DEV })).ok);
const dev = resolveWebAuthnConfig(env({ SUPABASE_URL: DEV, PORTAL_WEBAUTHN_RP_ID: 'localhost', PORTAL_WEBAUTHN_ORIGINS: 'http://localhost:5173' }));
assert('dev may use http only for localhost', dev.ok && dev.config.rpID === 'localhost' && !dev.config.production);
assert('dev rejects plain http for a non-local host', !resolveWebAuthnConfig(env({ SUPABASE_URL: DEV, PORTAL_WEBAUTHN_RP_ID: 'example.com', PORTAL_WEBAUTHN_ORIGINS: 'http://example.com' })).ok);
assert('dev rejects an origin that does not belong to the RP ID', !resolveWebAuthnConfig(env({ SUPABASE_URL: DEV, PORTAL_WEBAUTHN_RP_ID: 'example.com', PORTAL_WEBAUTHN_ORIGINS: 'https://other.com' })).ok);
assert('dev rejects origins with paths/queries', !resolveWebAuthnConfig(env({ SUPABASE_URL: DEV, PORTAL_WEBAUTHN_RP_ID: 'localhost', PORTAL_WEBAUTHN_ORIGINS: 'http://localhost:5173/x' })).ok);
assert('missing SUPABASE_URL is refused', !resolveWebAuthnConfig(env({})).ok);

const now = 1_000_000_000_000;
assert('challenge TTL is short (<= 2 minutes)', CHALLENGE_TTL_MS <= 120_000);
assert('unexpired challenge is usable', isChallengeUsable(now + 1000, now));
assert('expired challenge is NOT usable', !isChallengeUsable(now - 1, now) && !isChallengeUsable(now, now));
assert('garbage expiry is NOT usable', !isChallengeUsable(NaN, now));

assert('rate limit: normal use allowed', rateLimitDecision({ failedVerifyForIp: 0, attemptsForIp: 3 }) === 'allow');
assert('rate limit: repeated failures are blocked', rateLimitDecision({ failedVerifyForIp: 8, attemptsForIp: 8 }) === 'limited');
assert('rate limit: sheer volume is blocked', rateLimitDecision({ failedVerifyForIp: 0, attemptsForIp: 40 }) === 'limited');

const claims = (secsAgo) => ({ amr: [{ method: 'otp', timestamp: Math.floor(now / 1000) - secsAgo }] });
assert('recent auth: signed in 1 minute ago is accepted', isRecentAuth(claims(60), now));
assert('recent auth: signed in 2 hours ago is REFUSED (old-but-valid session cannot enroll/remove)', !isRecentAuth(claims(7200), now));
assert('recent auth: window boundary', isRecentAuth(claims(RECENT_AUTH_WINDOW_MS / 1000 - 5), now) && !isRecentAuth(claims(RECENT_AUTH_WINDOW_MS / 1000 + 5), now));
assert('recent auth: missing/empty amr is refused', !isRecentAuth({}, now) && !isRecentAuth(null, now) && !isRecentAuth({ amr: [] }, now));
assert('recent auth: a future-dated timestamp is refused', !isRecentAuth(claims(-3600), now));
assert('auth time uses the NEWEST amr entry', authTimeMsFromClaims({ amr: [{ timestamp: 100 }, { timestamp: 500 }] }) === 500_000);

assert('passkey name: trimmed and accepted', normalizePasskeyName('  MacBook  Touch ID ') === 'MacBook Touch ID');
assert('passkey name: empty/too long/non-string refused', normalizePasskeyName('') === null && normalizePasskeyName('x'.repeat(41)) === null && normalizePasskeyName(5) === null);
assert('passkey name: markup and control characters stripped', normalizePasskeyName('<b>iPhone</b>\u0000') === 'biPhone/b');

const bytes = new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255]);
assert('base64url round-trips and is URL-safe', JSON.stringify([...b64urlDecode(b64urlEncode(bytes))]) === JSON.stringify([...bytes]) && !/[+/=]/.test(b64urlEncode(bytes)));
const ok = { id: 'abc', type: 'public-key', response: { clientDataJSON: 'a', authenticatorData: 'b', signature: 'c' } };
assert('auth response shape check accepts a well-formed response', isPlausibleAuthResponse(ok));
assert('auth response shape check rejects junk', !isPlausibleAuthResponse(null) && !isPlausibleAuthResponse({}) && !isPlausibleAuthResponse({ ...ok, type: 'password' }) && !isPlausibleAuthResponse({ ...ok, id: 'x'.repeat(2000) }) && !isPlausibleAuthResponse({ id: 'a', type: 'public-key', response: {} }));
report('passkeyPolicy');
