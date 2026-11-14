# SIGNAL PORTAL — K1.6J Artist Collaboration Activation Plan

Prepared 2026-11-14. **Nothing below is executed.** This is the proposed sequence for the next stage, built on everything verified in K1.6I/K1.6I.1.

## Prerequisite gate (blocks step 1 below)

**Genuine production Cloudmersive scanning must be confirmed working** before any real asset transfer — currently blocked on the production email-sending rate limit preventing a disposable authenticated test session (`k16i1-production-scanner-verification.md`). Resolve via one of: (a) wait for the rate limit to clear and retry; (b) the owner briefly adjusts the project's email settings via the dashboard; (c) the owner performs one real test upload themselves, which would itself satisfy this gate.

## Proposed order

1. **Confirm production scanner operational** — the gate above. Required evidence: one genuine `security_status='clean', scan_provider='cloudmersive'` row from a real uploaded test fixture.
2. **Confirm source code preserved** — done (`k16i1-source-control.md`, commit `60f4fab`).
3. **Verify collaboration metadata** — confirm the exact title/BPM/key/internal-code values for both artists one final time immediately before creating their real production `collaborations` rows (values are already recorded in this stage's brief and in `k16i1-artist-asset-inventory.md`; re-confirm against whatever the owner considers the canonical source if these have changed since).
4. **Transfer approved collaboration records** — create the real `collaborations`/`collaboration_members` rows in production for XYLØ and Issey. Requires: the artists' real email addresses (not yet collected in any document this engagement has produced) and an explicit owner go-ahead, since this is the first real artist-identifying data entering production.
5. **Transfer eligible audio** — upload the two active optimized MP3s (XYLØ 2,388,252 bytes; Issey 2,113,685 bytes) via the real admin upload path.
6. **Transfer eligible proposals** — upload the two active proposal PDFs (XYLØ 210,264 bytes; Issey 1,706,658 bytes).
7. **Transfer approved artwork** — only after a human visual check of the WebP candidates (`k16i1-artwork-preparation.md`) and explicit owner sign-off that the WebP version is an acceptable release candidate; upload as a new asset row, never inheriting the original's (nonexistent) clearance.
8. **Establish genuine production scan evidence** — for every asset transferred in steps 5–7, run the real production scan against the exact uploaded bytes. This is independent of, and happens after, the dev-side evidence already on file — dev evidence is never treated as a substitute.
9. **Perform administrator security release** — a separate, explicit action per asset, per the existing, unchanged `portal-admin-review-asset`/`enforce_portal_asset_security` gate.
10. **Verify artistic approval independently** — both covers are currently `pending`; this stage does not resolve that, and K1.6J shouldn't either without a separate, explicit owner decision — artistic approval and security release must remain visibly distinct actions in whatever UI/record documents them.
11. **Test private artist workspaces** — once real rows exist, re-run the dashboard/chamber verification for real, authenticated as each real artist (requires their actual login, not a disposable fixture — this is the first point where using a synthetic stand-in stops being appropriate).
12. **Verify cross-artist isolation** — re-confirm with the real rows in place, not just synthetic ones (the synthetic-fixture version of this check has already been run repeatedly and passed every time; a final real-data confirmation is still worth doing once real rows exist).
13. **Review invitations** — prepare the actual invitation content/mechanism for review, still not sent.
14. **Send invitations only after explicit, separate authorization** — the final step, and the one this plan will never take on its own initiative.

## What K1.6I.1 explicitly did NOT do (by design)

Steps 1 (pending the scanner gate) and 3–14 were not executed. No real collaboration row, no real asset byte, no real artist email, and no invitation exists in production as a result of this stage.

## Owner decisions this plan surfaces, not resolves

1. How to clear the production email-rate-limit blocker (wait / dashboard setting / perform the test personally).
2. The real artist email addresses for XYLØ and Issey (needed for step 4, not yet in any document).
3. Whether/when to approve the WebP artwork candidates as release-ready (a visual-quality judgment call, not a technical one).
4. The actual timing of steps 4 onward — this plan proposes an order, not a schedule.
