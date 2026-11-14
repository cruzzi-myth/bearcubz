# SIGNAL PORTAL — K1.6J Deep-Link Routing Investigation

Investigated 2026-11-14. **Conclusion: no defect exists. No fix was needed or applied.**

## What K1.6I.1 actually found, and why it was wrong

K1.6I.1 tested `/portal/dashboard` and `/portal/admin` with bare `curl` and saw HTTP 404, concluding this was a real routing gap. **`curl` never executes JavaScript** — and the entire GitHub Pages SPA-fallback mechanism this project already uses (for both `/universe/` and `/portal/`) depends entirely on client-side JavaScript running inside `404.html` and the app's own `index.html`. A tool that can't run that JavaScript cannot observe whether the mechanism works; it can only ever see the same raw 404 status, whether the mechanism is broken, missing, or working perfectly.

## What actually exists (found by reading the code, before writing any test)

- `404.html` (repo root) already contains a `PORTAL_BASE = '/portal/'` redirect block (immediately after the existing, working `/universe/` block), which rewrites `/portal/dashboard` → `/portal/?p=%2Fdashboard` and calls `location.replace(...)`.
- `portal-app/index.html` already contains the matching restore half: before React mounts, it reads `?p=`, and calls `history.replaceState` to put the real path (`/portal/dashboard`) back in the URL bar.
- Confirmed this restore script is present in the **actual deployed build** (`portal/index.html`, not just the source template) — it survived Vite's build process unchanged, as expected for an inline `<script>` block.
- Both blocks carry their own comments explicitly describing this as a matched pair and warning not to touch one without the other — this was a deliberate, already-completed piece of work, not an oversight.

## Real browser verification (Playwright, against live `bearcubz.com`)

| Scenario | Result |
|---|---|
| Direct navigation to `/portal/dashboard` (logged out) | Raw HTTP 404 (expected, GitHub Pages' own behavior) → real browser redirects transparently → final URL correctly restored to `/portal/dashboard` → app renders its own "This area requires authorized Signal Portal access" message |
| Direct navigation to `/portal/admin` (logged out) | Same mechanism → app renders "Administrator access is required for this area" |
| Reload on the restored URL | Same 404→redirect→restore cycle repeats correctly; no loop, no broken state |
| A genuinely invalid route (`/portal/this-route-does-not-exist-at-all`) | Same redirect mechanism fires, then **the application's own router** (not the hosting layer) correctly renders its in-app not-found state ("Nothing remains at this location inside the Signal Portal") |
| Unrelated site routes (`/`, `/events/`, `/vote/`) | Unaffected — the `PORTAL_BASE`/`UNIVERSE_BASE` checks in `404.html` are prefix-scoped and never touch any other path |

Client-side authorization is unaffected either way, since it's enforced by the app's own logic after it mounts, identically regardless of whether the user arrived via direct navigation or in-app links.

## Why this matters for the acceptance criteria

K1.6J's own acceptance criterion #2 ("the portal deep-link 404 defect is resolved") is satisfied by this finding: there was never a genuine defect to resolve. No code was changed, no deployment occurred, because none was needed — changing working code to "fix" a non-defect would itself have been the wrong action.
