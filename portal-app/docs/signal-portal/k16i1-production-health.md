# SIGNAL PORTAL — K1.6I.1 Production Health

Verified 2026-11-14, live, against `bearcubz.com` and `drsidtagxezznqviupsr`.

## Live routes

| Route | Result |
|---|---|
| `/portal/` | 200, serving the current build (`index-BI1J7GjD.js`/`index-BRMKQ0oO.css`, unchanged since the K1.6I deploy) |
| `/portal/dashboard`, `/portal/admin` (direct/hard-refresh) | **404 — a real, pre-existing defect, not caused by this or the K1.6I deployment** |
| `/` (site root), `/events/`, `/vote/` | 200, unaffected |

### Correction (K1.6J, 2026-11-14): the "deep-link 404" finding below was a false positive

This section originally reported a defect based on testing with bare `curl`, which never executes JavaScript. A real browser test (Playwright, against live production) in K1.6J found that `404.html` **already contains** a complete, working `PORTAL_BASE` redirect block (and `portal-app/index.html` already contains its matching restore half) — the exact same pattern already used for `/universe/`. The raw HTTP response to `/portal/dashboard` is genuinely `404` (GitHub Pages' own static-file behavior, unavoidable and expected), but a real browser transparently redirects through `/portal/?p=/dashboard`, restores the URL via `history.replaceState`, and renders the correct page before a user ever sees anything wrong. Confirmed working for: a direct deep link to `/dashboard` (shows the real app, correct "authorized access required" message while logged out), a direct deep link to `/admin` (shows "Administrator access is required"), a reload on the restored URL, and a genuinely invalid route (renders the app's own in-app not-found state, not a dead end). **No fix was needed, and none was made.** See `k16j-deep-link-fix.md` for the full real-browser evidence.

~~Original (incorrect) finding, retained for the record:~~ *The portal uses `BrowserRouter`... [superseded above]*

## Edge Functions

All 21 `ACTIVE` (re-confirmed this stage, see `k16i1-production-scanner-verification.md`).

## Authentication entry

`portal-request-access` (the real auth entry point — this app uses invitation/OTP, not open signup) responds correctly: a never-invited email gets the genuine neutral `{"ok":true}` response. A **separate, real finding**: the project's email-sending rate limit is currently exhausted (see `k16i1-production-scanner-verification.md`) — this affects any flow that needs to actually *send* a confirmation/OTP email (new signups, real invitation OTP emails), not the request-initiation endpoint itself, which responds correctly regardless.

## Administrator access, logout, error handling

Not independently re-tested at the UI level this stage — doing so would require either the real admin's own credentials (not used, by design) or hit the same email-rate-limit wall for a disposable test identity. The underlying authorization logic (admin-gating, 403s for non-admins) was re-confirmed at the Edge Function and RLS level instead (`k16i1-production-scanner-verification.md`), which is the layer that actually enforces these properties — the UI simply reflects what the backend allows.

## No frontend change made

Per this stage's own instruction ("Do not change the live frontend unless a concrete deployment defect is found... document the proposed fix and request approval first"), the one defect found above was documented, not fixed.
