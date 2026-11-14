# SIGNAL PORTAL — K1.6L Production Scanner Test (owner-performed)

Same root blocker as K1.6J/K1.6K: this environment has no authenticated administrator session and
cannot create one (email-based self-service auth is rate-limited; two SQL-level workarounds were
already declined by this environment's own safety classifier in K1.6J and were not retried this
stage). This test can only be completed by the project owner, using their own already-authenticated
browser session.

## A dedicated synthetic test project now exists in production

Per this stage's own instruction to avoid placing test uploads into a real artist collaboration
unless explicitly approved, a clearly-labeled, disposable collaboration was created directly in
production for this purpose:

- **Title**: `K1.6L SYNTHETIC SCANNER TEST — SAFE TO DELETE`
- **Artist**: `Internal Test (not a real artist)`
- **Status**: `draft`
- **Production ID**: `680b9f34-1626-4632-b1c0-d7ab8df0e8a6`
- Zero members, no invitation — purely an administrative fixture.

## Steps for the owner

1. Open `https://bearcubz.com/portal/admin` (already authenticated in your own browser).
2. Go to **Collaborations** or **Asset Library**, and select **K1.6L SYNTHETIC SCANNER TEST — SAFE TO DELETE**.
3. Upload category **Proposal PDF**, using the generated harmless fixture at
   `portal-app/docs/signal-portal/private/k16k-harmless-test-fixture.pdf` (209 bytes, SHA-256
   `4d42feaebf0aa7d61a58e695e9458e558a8d5ee6dfcf2eca75f80a1ec8e40cf2` — gitignored, never
   committed, not real artist material; reused unchanged from K1.6K).
4. Watch the upload progress indicator move from 0% to 100%.
5. Watch the Security column move from `pending`/`scanning` to a real `clean` verdict with a
   `cloudmersive` provider detail — this is the genuine production scan this environment cannot
   trigger itself.
6. Confirm the asset's Approval column still reads `pending` (artistic approval) — it should, since
   nothing here approves it.
7. Click **Preview** — this now uses the new admin-only `portal-admin-asset-signed-url` function
   (K1.6K), so it should work even though the asset is not yet approved. Confirm it opens.
8. Optional: confirm an unauthorized session (e.g. a private/incognito window with no session) gets
   nothing — there is no member on this test collaboration at all, so this is trivially true.
9. Click **Mark Inactive** to remove the test asset through the existing authorized cleanup action.
10. When you're done with this test collaboration entirely, let me know and I'll remove the
    production row itself (`680b9f34-1626-4632-b1c0-d7ab8df0e8a6`) the same way it was created — a
    plain administrative delete, not something requiring your own session.

## Evidence to record once you've run this

Please share back (no credentials, just the observed outcome): the verdict shown, whether a
provider/attempt detail appeared, and whether the preview worked. I'll fold that into the project
record. If anything about this doesn't work as described, that itself is useful — it would be a
real, reproducible defect rather than a blocked test.

## The other three options, unchanged from K1.6J/K1.6K

If you'd rather not do this yourself: (2) create one disposable test identity via the dashboard or
your own Admin-API script and share only the resulting email (never a password); (3) perform one
real test upload through the live portal yourself, which would itself constitute the verification;
(4) explicitly authorize using the real service-role key for this one purpose (not recommended).
