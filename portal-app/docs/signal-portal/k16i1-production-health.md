# SIGNAL PORTAL — K1.6I.1 Production Health

Verified 2026-11-14, live, against `bearcubz.com` and `drsidtagxezznqviupsr`.

## Live routes

| Route | Result |
|---|---|
| `/portal/` | 200, serving the current build (`index-BI1J7GjD.js`/`index-BRMKQ0oO.css`, unchanged since the K1.6I deploy) |
| `/portal/dashboard`, `/portal/admin` (direct/hard-refresh) | **404 — a real, pre-existing defect, not caused by this or the K1.6I deployment** |
| `/` (site root), `/events/`, `/vote/` | 200, unaffected |

### Found defect: direct deep-links into the portal SPA 404 (pre-existing, not fixed, flagged for approval)

The portal uses `BrowserRouter` (real history-based routing, confirmed in `App.tsx`), which requires server/CDN-level fallback support for any URL other than the exact served path. The repository's existing root `404.html` already implements exactly this pattern — but **only** for the `/universe/` app (its own comment explains it exists specifically to catch deep links into that SPA); it was never extended to also cover `/portal/`. `git log -- 404.html` confirms this file was last touched at "Checkpoint C," long before the K1.6 series began — this is not a regression from K1.6I or K1.6I.1.

**Practical impact**: normal use (landing on `/portal/`, then navigating via in-app links) is unaffected, since client-side navigation never issues a new HTTP request. Only a hard refresh, a bookmark, or a shared link to a deep route (e.g. `/portal/dashboard`) breaks. **Proposed fix** (not applied — a frontend deployment requires approval per this stage's own instruction): extend `404.html`'s existing `UNIVERSE_BASE` redirect pattern with an equivalent `PORTAL_BASE = '/portal/'` branch, redirecting any 404'd path under `/portal/` back to `/portal/#<original-path>` or re-triggering client-side routing the same way the universe branch already does. This is a small, well-scoped, low-risk addition to an existing, already-proven pattern — awaiting explicit approval before implementation.

## Edge Functions

All 21 `ACTIVE` (re-confirmed this stage, see `k16i1-production-scanner-verification.md`).

## Authentication entry

`portal-request-access` (the real auth entry point — this app uses invitation/OTP, not open signup) responds correctly: a never-invited email gets the genuine neutral `{"ok":true}` response. A **separate, real finding**: the project's email-sending rate limit is currently exhausted (see `k16i1-production-scanner-verification.md`) — this affects any flow that needs to actually *send* a confirmation/OTP email (new signups, real invitation OTP emails), not the request-initiation endpoint itself, which responds correctly regardless.

## Administrator access, logout, error handling

Not independently re-tested at the UI level this stage — doing so would require either the real admin's own credentials (not used, by design) or hit the same email-rate-limit wall for a disposable test identity. The underlying authorization logic (admin-gating, 403s for non-admins) was re-confirmed at the Edge Function and RLS level instead (`k16i1-production-scanner-verification.md`), which is the layer that actually enforces these properties — the UI simply reflects what the backend allows.

## No frontend change made

Per this stage's own instruction ("Do not change the live frontend unless a concrete deployment defect is found... document the proposed fix and request approval first"), the one defect found above was documented, not fixed.
