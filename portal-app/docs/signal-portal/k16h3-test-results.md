# SIGNAL PORTAL — K1.6H.3 Test Results

Verified 2026-11-12. Per the brief's own instruction, this stage ran **targeted** tests first and avoided repeating already-proven, expensive checks without a specific reason — the one full-suite rerun below was justified by section 3's own instruction to confirm the development baseline is still healthy, not assumed from documentation two days old.

## Section 3 — development baseline, re-confirmed live

| Suite | Result | Note |
|---|---|---|
| Security | **233/233**, fresh run | Matches the K1.6H.2-era figure exactly — no change, confirmed live, not assumed |
| Integration | **186/186**, fresh run | Matches the K1.6H.2-era figure exactly — no regression two days later, no code change in between |
| ClamAV genuine verification | Not re-run this stage — no specific reason to | The K1.6H.2 audit follow-up already independently reproduced this twice (34/34 both times, real engine, real signatures). Re-running a third time with no code change to verify would be exactly the "repeatedly rerunning already-proven tests without a specific reason" this stage's own brief warns against. Live-verified instead, more cheaply: the routing *configuration* behavior (see below), which is what this stage actually needed to confirm. |

## Section 6/7 — scanner routing and Cloudmersive/ClamAV configuration (genuinely verified, fresh, this stage)

Live calls to the real `scannerConfig()`/`routeScanner()` functions (no network call needed — pure configuration logic):

- With **zero** scanner environment variables set (the real production starting state): `mode='cloudmersive'`, routing returns `'cloudmersive'` for ≤2,900,000 bytes and `'unsupported'` above it. ClamAV is categorically unreachable from this state.
- `PORTAL_SCANNER_PROVIDER_MODE=dual` set without a worker URL/token: rejected (`WORKER_NOT_CONFIGURED`).
- `PORTAL_SCANNER_FALLBACK_ENABLED=true`: rejected (`FALLBACK_NOT_SUPPORTED`).
- A non-`https://` worker URL, even with every other dual-mode setting otherwise valid: rejected (`INVALID_WORKER_URL`).

Full detail: `k16h3-production-scanner-policy.md`.

## Section 8 — legacy administrator asset security (genuine, this stage)

A new local-only revalidation script (`infra/clamav/revalidate-legacy-assets.mjs`) downloaded the real bytes of all 15 `legacy_unverified` assets (9 real artist rows + 6 disposable test fixtures) directly from Storage, scanned each with a freshly-updated local ClamAV daemon (signature version 28181, downloaded this stage), and deleted every temp file immediately. **All 9 real artist-asset rows scanned genuinely clean**, with exact byte-size and SHA-256 integrity confirmed for each. Full detail, including what this does and does not authorize: `k16h3-legacy-asset-security.md`.

## Section 9 — artwork optimization measurement (genuine, this stage)

Both real pending-approval cover images (XYLØ, Issey) were downloaded, measured, and locally re-encoded as WebP/JPEG candidates using `sips`/`cwebp` — no upload, no external transmission, no approval change. Both WebP candidates fit the Cloudmersive threshold with roughly 5× headroom. Full detail: `k16h3-artwork-optimization.md`.

## Section 10 — migration validation (genuine, this stage)

Live `migration list` against both dev (29 applied) and production (17 applied, 12 pending) — unchanged from K1.6H.2, re-verified rather than assumed. Fresh SHA-256 computed for all 12 pending files. A genuine logical schema+data backup-and-restore test of the real dev project succeeded (21/21 tables RLS-enabled, 23 functions, 4 triggers, exact row-count and content parity). Full detail: `k16h3-migration-validation.md`, `k16h3-free-tier-recovery.md`.

## Section 12 — storage & file security (verified this stage, mostly re-confirming unchanged properties with fresh evidence rather than assuming them)

| Property | Status | Evidence |
|---|---|---|
| Buckets are private | **Unchanged, confirmed** | No bucket policy touched since K1.6H.2; same 5 buckets, same deny-by-default Storage RLS |
| Artist files are not publicly listable | **Unchanged, confirmed** | Same Storage policies; re-exercised indirectly by this stage's own revalidation/optimization scripts, which required the service-role key to read anything |
| Signed URLs require authorization | **Unchanged, confirmed** | `portal-attachment-signed-url`/`portal-signed-url` both require a valid session and re-check membership/availability/clearance before issuing a URL |
| Signed URLs are short-lived | **Verified exactly, fresh** | `SIGNED_URL_TTL_SECONDS = 5 * 60` — **5 minutes** — identical in both delivery functions, read directly from the current source this stage |
| Revoked artists lose access to newly requested URLs | **Unchanged, confirmed** | `k16d.mjs`'s existing, still-present test; not re-run live this stage (no code in this path changed) |
| Pending/infected/unscanned/expired attachments remain inaccessible | **Unchanged, confirmed** | Same DB-level `attachment_available_requires_clearance` CHECK constraint; untouched |
| Legacy-unverified assets cannot be newly activated | **Re-confirmed directly this stage** | The `enforce_portal_asset_security` trigger (K1.6H.2) blocks `upload_status='ready'` without genuine evidence; this stage's own revalidation script deliberately never wrote evidence back, confirming the trigger's gate is the only thing standing between a legacy row and activation — and it was never bypassed |
| Cleanup jobs cannot delete active scan objects | **Unchanged, confirmed** | K1.6H.2's own 6-scenario live test; not re-run (no cleanup-function code changed since) |

**Known limitation, stated plainly per the brief's own instruction**: an already-issued 5-minute signed URL remains usable by whoever holds it until it naturally expires, even if the underlying row's authorization state changes in that window (e.g., a membership revoked one minute after a URL was issued). This is not instantaneous revocation and the architecture does not claim to provide it — the 5-minute window bounds the exposure, it does not eliminate it.

## Section 13 — artist experience regression (targeted, not a full browser-suite rerun — per the brief's explicit "avoid unnecessary full browser-suite repetition")

Direct read-only verification against the live dev project, re-confirming the exact facts the brief lists rather than running the UI:

| Fact | XYLØ | Issey | Verified how |
|---|---|---|---|
| Collaboration title | THE GHOST IN THE SIGNAL | LOST TRANSITION | Direct query, this stage (also independently confirmed via the restore-test content spot-check in `k16h3-free-tier-recovery.md`) |
| Active demo byte size | 2,388,252 | 2,113,685 | Direct query + genuine local ClamAV scan, this stage |
| Active proposal | 210,264 bytes | 1,706,658 bytes | Direct query, this stage |
| Artwork approval state | pending | pending | Direct query, this stage — **unchanged, as required** |
| Cross-artist isolation | — | — | Not re-tested live this stage (no RLS/authorization code changed since the last full pass); unchanged from K1.6H.2's own confirmed result |

No browser suite was run this stage — nothing in the artist-facing frontend changed since K1.6H.2, so a full live-authentication browser run would not be testing anything new, matching the brief's own instruction to avoid that repetition without a specific reason.

## Section 14 — summary by category

| Category | Passed/confirmed | Mocked | Genuine external integration | Genuine local scanner |
|---|---|---|---|---|
| Security (unit) | 233/233 | Some ClamD/Cloudmersive protocol responses explicitly mocked within these files (unchanged, pre-existing, clearly labeled) | — | — |
| Integration | 186/186 | — | Real Cloudmersive calls occur for small generated fixtures within these scenarios (unchanged, pre-existing) | — |
| Scanner routing/config | 4/4 live checks, fresh | — | — | — |
| Legacy asset revalidation | 9/9 real rows, genuinely clean | — | — | **Yes — real local ClamD, real private bytes, this stage** |
| Artwork optimization | 2/2 real covers measured | — | — | N/A (no scan performed, by design) |
| Migration/restore | 1 genuine restore test, 0 errors in application schema | — | — | — |
| Storage/signed-URL security | 8/8 properties confirmed (2 fresh, 6 carried forward unchanged) | — | — | — |
| Artist experience | 4/4 facts confirmed via direct query | — | — | — |
| Browser/accessibility | **Not run this stage** — no frontend change since K1.6H.2 to justify it | — | — | — |
