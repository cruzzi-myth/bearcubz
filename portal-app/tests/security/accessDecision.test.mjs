import { assert, importCompiled, report } from './runner.mjs';
const m = await importCompiled(new URL('../../src/features/auth/accessDecision.ts', import.meta.url).pathname);
const { decideAccessAction, cooldownRemainingSeconds, LINK_COOLDOWN_SECONDS, ACCESS_MESSAGES, REQUEST_TIMEOUT_MS } = m;
const d = (authStatus, authorization, isAdmin = false) => decideAccessAction({ authStatus, authorization, isAdmin });

assert('session still initializing => wait (never request a link yet)', d('loading', 'checking').kind === 'wait');
assert('no session => request a link (the only path that sends mail)', d('signed-out', 'not-authorized').kind === 'request-link');
assert('verified administrator => /dashboard', JSON.stringify(d('signed-in', 'authorized', true)) === JSON.stringify({ kind: 'route', path: '/dashboard' }));
assert('verified artist => /artist', JSON.stringify(d('signed-in', 'authorized', false)) === JSON.stringify({ kind: 'route', path: '/artist' }));
assert('session present but authorization not yet verified => wait, NEVER route from the session alone', d('signed-in', 'checking', true).kind === 'wait' && d('signed-in', 'checking', false).kind === 'wait');
assert('isAdmin=true without verified authorization never routes anywhere', ['checking', 'revoked', 'not-authorized', 'error', 'backend-unavailable'].every((a) => d('signed-in', a, true).kind !== 'route'));
assert('revoked => denied with an explanation', d('signed-in', 'revoked').kind === 'denied' && d('signed-in', 'revoked').message.length > 20);
assert('signed in but not authorized => denied (no route, no link request)', d('signed-in', 'not-authorized').kind === 'denied');
assert('verification error => error (retryable), not a silent success', d('signed-in', 'error').kind === 'error');
assert('backend unavailable => error', d('signed-in', 'backend-unavailable').kind === 'error');
assert('a signed-in user is never asked to request a new link', ['checking', 'authorized', 'revoked', 'not-authorized', 'error', 'backend-unavailable'].every((a) => d('signed-in', a).kind !== 'request-link'));

assert('cooldown: nothing sent yet => 0', cooldownRemainingSeconds(null, 1_000_000) === 0);
assert('cooldown: just sent => full window', cooldownRemainingSeconds(1_000_000, 1_000_000) === LINK_COOLDOWN_SECONDS);
assert('cooldown: partway', cooldownRemainingSeconds(1_000_000, 1_030_000) === 30);
assert('cooldown: elapsed => 0 (never a permanent lock)', cooldownRemainingSeconds(1_000_000, 1_000_000 + LINK_COOLDOWN_SECONDS * 1000 + 1) === 0);
assert('request timeout is bounded', REQUEST_TIMEOUT_MS > 0 && REQUEST_TIMEOUT_MS <= 30_000);
assert('confirmation message tells the user to check their inbox and is conditional (no enumeration)', /inbox/i.test(ACCESS_MESSAGES.submitted) && /If this address/i.test(ACCESS_MESSAGES.submitted));
assert('no message claims biometric authentication', Object.values(ACCESS_MESSAGES).every((t) => !/biometric|fingerprint/i.test(t)));
report('accessDecision');
