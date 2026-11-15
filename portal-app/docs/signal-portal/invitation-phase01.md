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

## Required before the first real send (owner actions, Supabase Dashboard → project `drsidtagxezznqviupsr`)
1. **Authentication → Emails → SMTP Settings**: enable custom SMTP (verified sending domain, e.g. Resend /
   Postmark / SES) and set a sender such as `no-reply@bearcubz.com`. Add the provider's SPF/DKIM/DMARC DNS records.
2. **Authentication → Rate Limits**: raise "Emails sent per hour" (only editable with custom SMTP).
3. **Authentication → URL Configuration**: Site URL `https://bearcubz.com/portal/`; add the same URL to Redirect URLs.
4. **Authentication → Emails → Templates → Magic Link**: use the invitation copy below.
5. Upload Setia's revised proposal in the Command Center, run its scan, approve its security release, and
   deactivate the original once the replacement is verified.

### Magic Link template
Subject: `BEλR CUBZ // THE COLLECTIVE — Private Collaboration Access`

> You've been invited to enter SIGNAL PORTAL, the private creative collaboration network for BEλR CUBZ // THE COLLECTIVE.
> Your private workspace includes your assigned collaboration materials, music, artwork, creative proposals, and feedback tools.
> Access is invitation-only and linked to your verified email address.
> **[ENTER THE SIGNAL]** → `{{ .ConfirmationURL }}`
> After authentication, you'll be taken directly to your assigned collaboration workspace.
> This invitation does not constitute acceptance of any collaboration terms, ownership arrangement, or release agreement.

(No signed asset URLs are included.)

## Failure messages you may see
- `EMAIL_RATE_LIMITED` — shared-SMTP/rate limit hit; do steps 1–2. The limit is never bypassed.
- `SMTP_NOT_CONFIGURED` — Supabase's built-in mailer only mails project team members; do step 1.
- `SMTP_REJECTED` — the provider refused the message; check credentials and sender domain.
