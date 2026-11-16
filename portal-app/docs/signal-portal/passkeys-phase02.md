# Phase 02 — Administrator passkeys (WebAuthn)

**Status: implemented and tested on the development project only. NOT deployed to production.**

## Architecture
- **WebAuthn:** SimpleWebAuthn (`@simplewebauthn/server` 14.1.0 in Edge Functions, `@simplewebauthn/browser` 14.0.0 in the app).
- **Supabase session:** Supabase Auth has no native passwordless-passkey login (its WebAuthn support is MFA, i.e. a
  second factor on an existing session). The integration uses only documented APIs:
  1. the Edge Function verifies the WebAuthn assertion and re-checks that the credential's owner is an active
     administrator (`portal_admins`, server side);
  2. it calls `auth.admin.generateLink({ type: 'magiclink' })` — which sends **no email** — and returns only the
     single-use `hashed_token`;
  3. the browser redeems it with `auth.verifyOtp({ token_hash, type: 'magiclink' })`.
  Supabase itself issues the session/JWT. No token is ever constructed or signed by this code. Replaying a token hash is
  rejected by Supabase (verified).
- **Discoverable credentials:** the sign-in needs no email, so nothing reveals which addresses are administrators.

## Security properties (each covered by a test)
HTTPS-only production RP (`bearcubz.com`, origin `https://bearcubz.com`, fixed in code — an env override cannot weaken it;
http is allowed for `localhost` on dev only) · 32-byte random single-use challenges (atomic `DELETE … RETURNING`),
120 s expiry · origin, RP ID, signature, authenticator flags and **user verification required** · signature counter
(clone/replay detection) · per-IP rate limit (8 failed verifies / 40 attempts per 10 min → 429) · uniform `AUTH_FAILED`
(no oracle) · public key only, nothing biometric · enroll/revoke require a **recent** sign-in (access-token `amr`
timestamp ≤ 15 min) and a server-verified administrator · all three tables are service-role only (RLS on, no
policies, all client grants revoked) · every enroll/rename/revoke/login is written to `portal_admin_audit_log`.

## Database (migration `20261116120000_signal_portal_admin_passkeys.sql`)
`portal_admin_passkeys`, `portal_webauthn_challenges`, `portal_passkey_attempts`. No existing table or policy is changed.

## Edge Functions
- `portal-passkey-auth` (public, anon key): `options`, `verify`.
- `portal-admin-passkeys` (administrator only): `list`, `registration-options`, `registration-verify`, `rename`, `revoke`.
Both are registered in the production deploy guard and manifest (self-test passes); neither is deployed yet.

## Using it
1. **Enroll:** sign in with the emailed link → Command Center → Settings → **REGISTER PASSKEY** (confirm with Touch ID / Face ID).
   You will see `PASSKEY REGISTERED // SECURE ACCESS ENABLED`.
2. **Sign in:** on the entrance page click the **fingerprint** button. With a session it opens the right portal; without one it
   starts the passkey prompt. If no passkey is available, **Email me a sign-in link instead** appears. ACCESS PORTAL is unchanged
   (session → portal, otherwise emailed link). Artists keep email links only.
3. **Manage:** Settings → rename, revoke, last-used. Email sign-in is always available as the fallback.

## Production deployment requirements (when approved)
1. Apply the migration through the guarded migration workflow (additive; creates three new tables only).
2. Deploy `portal-passkey-auth` and `portal-admin-passkeys` through the guarded function workflow.
   No new secrets are needed: the production RP is fixed in code. **Do not** set `PORTAL_WEBAUTHN_*` on production.
3. Build and publish the frontend (new fingerprint behaviour + Settings section).
4. Verify as administrator: enroll a passkey, sign out, sign in with it from a clean window.
Caveat: the first enrollment on production must be done by you (it needs your Touch ID / Face ID and a recent email-link sign-in).

## Limitations
- Passkeys apply to the administrator account only; invited artists continue with email links.
- A synced passkey (iCloud Keychain) works across your Apple devices; a device-bound security key works only where present.
- Browsers differ in how they word the prompt; a dismissed prompt and "no passkey on this device" look the same to the page
  by design (both offer the email link).
