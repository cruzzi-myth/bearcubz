# Invitation Phase 01 — owner runbook

## What exists
- **Command Center → Invitations → Send Invitation** (administrator only). Pick an artist, confirm the
  email and collaboration shown, tick the confirmation box, click **Send Invitation**.
- Backend: `portal-admin-send-invitation` (admin-verified server-side). Only these exact pairs are mailable
  on production:
  - `bearcubzmusic@gmail.com` → CLIMBING TREES (`fb260abd-2c12-479b-a7db-047e3da810fc`)
  - `setiahaven@gmail.com` → WONKY LIQUID DREAMS (`c297d5be-14d9-4f2b-93e2-a184e1ed2b83`)
- Setia's send is **refused** until the original proposal is no longer active and a different proposal PDF
  is ready, clean and security-approved (`REVISED_PROPOSAL_NOT_READY`).
- Delivery states shown: Invitation created → Email delivery requested → Email sent *(accepted by mail
  provider)* / Delivery failed → Invitation accepted / expired / revoked. "Sent" means Supabase Auth handed the
  message to the configured mail provider; inbox delivery is not observable and is never claimed.
- Duplicate protection: one active pending invitation per email+collaboration; a second send within 15 minutes
  of a successful one (or while one is in flight) is refused; an artist with active access is refused.
- Every attempt is audited (`send_invitation`: requested → sent/failed).

## Artist experience
Email link → sign-in → `accept_artist_invitation()` (identity from `auth.uid()` only) → membership for the
invited collaboration → `/portal/artist` with that project selected. Returning artists sign in normally.
If acceptance fails, an error with **Try again** is shown instead of an empty workspace.

## Email delivery — current state (verified read-only on production)
- Custom SMTP **enabled**: host `smtp.resend.com`, port 465, user `resend`, sender `portal@bearcubz.com`,
  sender name `BEλR CUBZ // THE COLLECTIVE`. (Password is stored by Supabase and is never readable.)
- Auth redirect allow-list contains exactly `https://bearcubz.com/portal/`; Site URL is `https://bearcubz.com/`
  (left unchanged — shared with other bearcubz.com apps).
- The invitation send uses **Supabase Auth** (`signInWithOtp` → the configured SMTP). No second provider or
  extra Edge Function secret is needed. The link returns to `https://bearcubz.com/portal/`, which then sends
  the artist to `/portal/artist` once the invitation is accepted.
- Not readable from the CLI: the **emails-per-hour rate limit** (Authentication → Rate Limits). Confirm it is
  comfortably above the handful of Phase 01 emails.
- Note: the Magic Link template is shared by every sign-in email (including administrator sign-ins). Use copy
  that reads correctly for both, or keep the default and let the invitation email stay generic.

## Delivery stages — what each word means
1. *Request accepted* — Supabase accepted the request.
2. *Provider accepted* — Supabase handed the message to Resend (shown as "Email sent (accepted by mail provider)").
3. *Delivered* — it reached the inbox (only the recipient can confirm this).
4. *Authentication successful* — the artist opened the link and signed in (the invitation then shows "accepted").

## Switching Cloudmersive plans (no code change)
The scanner reads `CLOUDMERSIVE_API_KEY` (and optional size limits `PORTAL_CLOUDMERSIVE_MAX_BYTES`,
`PORTAL_ARTIST_UPLOAD_MAX_BYTES`) from Edge Function secrets only. To move between premium and free tier, set the
key in each project: `supabase secrets set CLOUDMERSIVE_API_KEY=<key> --project-ref <ref>` (or Dashboard → Edge
Functions → Secrets). The free tier's smaller file-size ceiling is already the default (2.9 MB); raise the limits
only on a plan that allows it. No code or deploy is needed.

## Test modes (protects Cloudmersive credits)
- **Standard** (default for every suite): `supabase/scripts/set-dev-scanner-mode.sh mock`. The *development* scanner
  uses a deterministic mock provider (`portal-test-scanner-mock`); malware-rejection assertions still run
  (infected verdicts are recorded and can never be security-released; EICAR, size and archive checks remain local).
- **Live-provider verification** (explicit only): `set-dev-scanner-mode.sh live`, then
  `SIGNAL_PORTAL_LIVE_PROVIDER=1 SIGNAL_PORTAL_INTEGRATION_ONLY=liveProvider node tests/integration/run.mjs`
  (one genuine scan). Switch back with `set-dev-scanner-mode.sh mock`.
- The integration runner refuses to start if the scanner is in the wrong mode for the requested run.
- **Production can never use test mode**: the scanner ignores/refuses it on the production project (it fails
  closed with `SCANNER_TEST_MODE_FORBIDDEN_IN_PRODUCTION`), the mock function is not in the production deploy
  manifest, and the mock endpoint is derived from the project's own URL, never configurable.

## Artist routes
`/portal/dashboard` and `/portal/admin` are administrator-only; an artist who opens either is redirected to
`/portal/artist`. Administrators reach the Artist Portal with the ARTIST PORTAL button. Artists can sign out from
the Artist Portal and from every chamber.

## Remaining owner actions before the first real send
1. Confirm you received the authentication test email from `portal@bearcubz.com` (see handoff).
2. Confirm the emails-per-hour limit.
3. Approve the production deployment plan, then explicitly authorize the two invitations.

## Magic Link template (optional branding)
Subject: `BEλR CUBZ // THE COLLECTIVE — Private Collaboration Access`

> You've been invited to enter SIGNAL PORTAL, the private creative collaboration network for BEλR CUBZ // THE COLLECTIVE.
> Your private workspace includes your assigned collaboration materials, music, artwork, creative proposals, and feedback tools.
> Access is invitation-only and linked to your verified email address.
> **[ENTER THE SIGNAL]** → `{{ .ConfirmationURL }}`
> After authentication, you'll be taken directly to your assigned collaboration workspace.
> This invitation does not constitute acceptance of any collaboration terms, ownership arrangement, or release agreement.

(No signed asset URLs are included. Set in Authentication → Emails → Templates → Magic Link.)

## Failure messages you may see in the Send Invitation panel
- `EMAIL_RATE_LIMITED` — the email rate limit was reached; raise it in Authentication → Rate Limits. It is never bypassed.
- `SMTP_NOT_CONFIGURED` — the built-in mailer only mails team members; custom SMTP must be enabled.
- `SMTP_REJECTED` — the provider refused the message; check the Resend key and sender domain.
- `REVISED_PROPOSAL_NOT_READY` — Setia's proposal gate (original still active, or the replacement is not clean + approved).
