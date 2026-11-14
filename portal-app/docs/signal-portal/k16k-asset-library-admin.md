# SIGNAL PORTAL — K1.6K Asset Library Administrator Interface

Implemented 2026-11-14. The owner confirmed the live production Overview, Collaborations, Asset
Library, and Collaboration Briefing sections of the admin dashboard render correctly. This stage
audited the existing Asset Library implementation against the 13 required features and made the
smallest changes needed to close real gaps, rather than rebuilding anything already working.

## What was already fully implemented (reused, not touched)

Collaboration selection, the full request-upload-url → PUT → confirm-upload round trip, file
size/type display, malware-scan status display, genuine scanner-result display (provider +
detail), administrator security-approval display, separate artistic-approval display, actionable
upload error messages, and the automatic retirement of abandoned same-type upload attempts were
all already correctly wired end to end (`AssetsTab.tsx`, `AssetUploadForm.tsx`,
`useAdminAssets.ts`, `portal-admin-request-upload-url`, `portal-admin-confirm-upload`). No code in
this path needed to change.

## Real gap found and fixed: admin preview during review

The existing "Preview" button called the same `portal-signed-url` function the artist-facing
player uses — which deliberately refuses to sign a URL until `security_review_status = 'approved'`
(correctly, so an artist can never see an unreleased asset). But that made it impossible for an
**administrator** to preview an asset in order to decide whether to approve it: the exact asset the
admin most needs to look at (freshly scanned, genuinely clean, awaiting their decision) is the one
state that function will never sign.

Added a separate, admin-only Edge Function, `portal-admin-asset-signed-url`:
- Requires `requireAdmin()` (same server-side `is_portal_admin()` check as every other admin
  function — never a client-trusted flag).
- Requires genuine, complete, checksum-matched scan evidence (the same fields the database's own
  `valid_portal_scan_evidence()` checks) for any asset where `security_required = true` — or
  `upload_status = 'ready'` for a legacy asset.
- Refuses anything flagged `infected`, inactive, or never genuinely scanned.
- Drops **only** the "already approved" requirement — nothing else.
- Mints the same 5-minute signed URL via the service-role client, and writes an audit-log row
  (`admin_preview_asset`), exactly like every other admin action.

The artist-facing `portal-signed-url` function was not modified. Verified directly (new
integration scenario `k16k.mjs`, 7 assertions, run against the isolated dev project): an admin can
now preview a clean-but-unapproved asset; the artist-facing function still correctly refuses the
identical asset; a non-admin caller is rejected; a never-scanned asset is refused; a retired asset
is refused even if it was once clean. Full suite: **193 passed, 0 failed.**

## Two smaller UX gaps closed

1. **Upload progress** (requirement 5): the form used `fetch()` for the Storage PUT, which has no
   upload-progress event, so the UI only ever showed static stage labels. Switched to `XMLHttpRequest`
   so a real byte-level percentage is now shown (progress bar + button label) during upload.
2. **Accidental-overwrite warning** (requirement 13): storage paths were already collision-proof
   (server-generated UUIDs — no file can ever be silently overwritten), and incomplete prior
   attempts were already auto-retired. The one missing piece was visibility: uploading a new asset
   of a category that already has an active, ready asset gave no indication of that. Added a
   non-blocking inline warning naming the existing asset, so the admin is never surprised — it does
   not block the upload, since keeping multiple active versions is a legitimate admin choice already
   supported by the existing "Mark Inactive" action.

## Security review

No RLS policy was changed. No scanning requirement was weakened. No upload-size or MIME limit was
changed (client-side limits remain advisory; the server-side `ASSET_RULES` and the
`PORTAL_CLOUDMERSIVE_MAX_BYTES`/2,900,000-byte production ceiling are untouched and still the real
enforcement). The new function is read-only against Storage (mints a signed URL; writes nothing
except its own audit-log row) and cannot be reached without passing the same `is_portal_admin()`
check every other admin function already requires.

## Production scanner test — still blocked, same root cause as K1.6J

This stage's brief asked for a "safe manual test workflow" using the owner's own authenticated
session, since no new authentication account may be created and none was. I cannot drive that
session myself — this environment has no browser-automation access to the owner's logged-in
browser, and I hold no admin credentials of my own (by design, unchanged since K1.6I.1/K1.6J).

**What the owner can do to complete this test personally, once ready:**
1. In the live Asset Library, select either XYLØ or Issey Cross (both still correctly `draft`,
   zero members).
2. Upload category "Proposal PDF", using the generated, harmless, synthetic fixture at
   `portal-app/docs/signal-portal/private/k16k-harmless-test-fixture.pdf` (209 bytes, SHA-256
   `4d42fe...e40cf2` — gitignored, never committed, not real artist material).
3. Watch the Security column: it should move from "scanning"/"pending" to a real `clean` verdict
   with a `cloudmersive` provider detail within a few seconds — that is the genuine production
   scan this stage could not trigger itself.
4. Either leave it there (don't approve) or click "Approve security release" to exercise that step
   too — then "Mark Inactive" to remove the test row afterward. No invitation, no member, and no
   real artist file is touched by this.

This is the same blocker already reported in `k16j-production-scanner-verification.md`: email-based
self-service auth is rate-limited, and the two SQL-level alternatives (a disposable
password-authenticated identity, and disposable NO_LOGIN rows for RLS testing) were each declined
by this environment's own safety classifier when attempted in K1.6J. Neither was retried this stage.

## Deployment

- New Edge Function `portal-admin-asset-signed-url` deployed to both the dev project
  (`gcbonlvbgyhsgfayvlvz`, for the integration test) and production (`drsidtagxezznqviupsr`).
- Frontend changes (`AssetUploadForm.tsx`, `AssetsTab.tsx`, `admin.css`, `adminApi.ts`, new
  `useAdminAssetPreview.ts` hook) rebuilt and deployed as a static build to `portal/`.
- `npx tsc -b` (frontend), `deno check` (new function), the full pre-existing
  `tests/security/*.test.mjs` suite (unchanged, all still passing), and the full integration suite
  against dev (193 passed, 0 failed, including the 7 new `k16k` assertions) were all run before
  deployment.

## What remains open

Only the manual production scanner test above, which requires the owner's own authenticated
session — exactly as already true in K1.6J. Nothing else in this stage's acceptance criteria is
outstanding.
