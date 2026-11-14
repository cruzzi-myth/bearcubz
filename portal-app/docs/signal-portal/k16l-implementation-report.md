# SIGNAL PORTAL — K1.6L Implementation Report

Implemented 2026-11-14. Per this stage's own directive, K1.6K's work was not rebuilt or re-audited
from scratch — this stage reviewed what exists, closed real gaps found during that review, and
otherwise reused the existing implementation.

## Real gap found and fixed: unapproved artwork was reachable in artist-facing views

Auditing the Listening Chamber, Visual Gallery, and Dashboard card against section 8/10's explicit
requirement ("unapproved artwork must not appear in artist-facing views") found that
`useAuthorizedCollaboration.ts` and `useDashboardData.ts` both returned **every** active,
`upload_status = 'ready'` visual asset to a member, regardless of `approval_status`. `GalleryTile.tsx`
even rendered a visible "pending"/"rejected" status pill, confirming this was shown, not just
fetched. Concretely: the real XYLØ and Issey Cross `track_cover` rows in development are exactly
this shape — `upload_status = 'ready'`, `approval_status = 'pending'` — so if either had a member
today, that artist would see their own un-reviewed cover art as the Gallery, the Listening Chamber
backdrop, and the Dashboard card thumbnail, with nothing hiding it.

**Root cause confirmed, not assumed**: a new integration test (`k16l.mjs`) added a disposable member
to the real XYLØ development collaboration and queried its real `track_cover` row — RLS alone
**does** return it (an admin-select-all and a member-select-active-and-ready policy both exist by
design; approval status is not an RLS condition). The gate has to live in the fetch layer.

**Fix**: added `src/lib/assetVisibility.ts` (`isArtistVisibleAsset`) — a pure, unit-tested function
(19 assertions, `assetVisibility.test.mjs`) requiring `approval_status = 'approved'` for the four
visual asset types only; audio and proposal assets (which have no approval concept at all) are
unaffected. Wired into both `useAuthorizedCollaboration.ts` (Gallery, Listening Chamber backdrop)
and `useDashboardData.ts` (dashboard card availability + cover thumbnail). `GalleryTile.tsx`'s now-
dead status pill (every asset reaching it is always `approved`) was removed. **No artistic approval
state was changed anywhere** — both real covers remain exactly `pending`, as before.

## Section-by-section

**B. Administrator preview (`portal-admin-asset-signed-url`)** — reviewed against the full K1.6L
checklist; every item (admin-only, server-verified role check, genuine complete scan evidence,
rejects infected/incomplete/missing evidence, 5-minute signed URL, no approval requirement, no
artist-facing access, no credential exposure, no public Storage) is already satisfied by the K1.6K
implementation. Not modified. Not re-tested beyond the full suite re-run below, per this stage's own
"do not repeat... unless implementation changes require it."

**C. Collaboration records** — both production rows (XYLØ `45b9a584-...`, Issey Cross
`211a3334-...`) re-verified via direct read-only query: unchanged, both `draft`, correct metadata,
zero members.

**D. Asset inventory / manifest** — `k16l-asset-transfer-manifest.md`. Every byte size and SHA-256
for the four Cloudmersive-eligible files was re-derived by downloading the real bytes from
development Storage and re-hashing them this stage, not reused from a prior doc. Unchanged from
K1.6J/K1.6K. The brief's own WAV-master byte figures were not used anywhere in this manifest, per
its own instruction to use actual measurements — this remains an open question for the owner.

**E. New-collaboration workflow** — `notes` (already fully wired server-side, just never exposed in
the UI) is now a field on the creation form. `update_collaboration` was extended to also accept
`title`/`artistDisplayName`/`genreTags` (previously create-only — a typo meant starting over), with
the same non-empty validation the create path already enforces; a non-admin is still rejected
(403). A new "Edit metadata" inline form was added to the Manage Collaborations table. Added a
readiness checklist (`collaborationReadiness.ts`, `ReadinessChecklist.tsx`, 9 unit assertions) —
computed entirely from existing columns, no new database state, and **deliberately excludes any
"ready to invite" row**: that decision is never represented as a computed checkbox anywhere in this
stage's code, matching the brief's explicit "do not automatically invite" instruction. Surfaced only
in the admin-only section of the collaboration briefing (a new optional `adminExtra` slot on the
shared `CollaborationBriefingModal`, passed only by the admin call site — an artist viewing their own
briefing never receives it).

**F–I. Listening Chamber / Proposal Archive / Visual Gallery / Feedback Chamber** — all already
functional against this stage's checklist (membership-scoped loading/error/empty states, real
signed-URL playback with auto-renewal on expiry, play/pause/seek, a real page-by-page PDF viewer,
a real gallery with lightbox navigation, collaboration-scoped feedback with admin-reply
distinction, extensive pre-existing RLS isolation coverage). One small, genuine gap closed: the
Transmission Chamber's own message thread had no loading/error state (silently blank while
`useFeedbackThread` was loading or erroring, only the compose form remained visible) — added both,
matching every other chamber's existing pattern.

**J. Security** — no RLS policy touched. No scanning requirement weakened. The extended
`update_collaboration` cannot touch asset/security/approval fields (unchanged — `update_asset` is
still the only path for those, per the existing comment in that function). Re-verified via a new
integration test that a non-member still cannot reach the test asset at all, and a non-admin still
cannot rename a collaboration.

**K. Testing / Deployment** — see below.

## Testing

- `npx tsc -b`: clean.
- Full pre-existing + 2 new unit-test files (`assetVisibility.test.mjs`, `collaborationReadiness.test.mjs`):
  23 files, 0 failures.
- Full integration suite against the isolated dev project, including one new scenario (`k16l.mjs`,
  9 assertions covering `update_collaboration`'s new fields and the real RLS-reachability finding
  above): **202 passed, 0 failed.**
- Confirmed afterward that the real XYLØ dev collaboration's 5 real assets are unchanged, and that
  the one disposable test membership this stage added was fully cleaned up (a separate, pre-existing
  K1.6B test membership on the same collaboration was found and left untouched, as it predates this
  stage and is not part of it).

## Deployment

- `portal-admin-manage-collaboration` (the only backend function changed) deployed to both the dev
  project and production (`drsidtagxezznqviupsr`).
- Frontend rebuilt and deployed as a static build to `portal/`.
- A new, clearly-labeled synthetic test collaboration was created in production for the owner's
  manual scanner test — see `k16l-production-scanner-test.md`.

## What remains blocked

The genuine production Cloudmersive scan test — identical root cause to K1.6J/K1.6K (no
authenticated admin session available to this environment; the two SQL-level workarounds already
tried in K1.6J were declined by this environment's own safety classifier and were not retried this
stage). Real private asset transfer/activation — same blocker, plus the separate, still-outstanding
owner authorization to transmit real XYLØ/Issey bytes to Cloudmersive at all.

**STOP. No invitation, email, DM, real artist account, real asset transfer, or artwork publication
occurred this stage.**
