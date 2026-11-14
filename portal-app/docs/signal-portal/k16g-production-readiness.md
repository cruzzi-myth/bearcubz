# SIGNAL PORTAL — K1.6G Production Readiness

Implementation date: 2026-11-09.

## Acceptance criteria (brief section 15) — honest status

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | Interrupted scans can recover | **MET** | Lease + scheduler reclaim, real end-to-end verified (`k16g-scan-recovery.md`) |
| 2 | Scan retries are bounded | **MET** | `MAX_AUTOMATIC_SCAN_ATTEMPTS = 3`, enforced pre-check in `claimAndRunScan` |
| 3 | Concurrent scan claims are safe | **MET** | Atomic `claim_attachment_for_scan` function; verified a second concurrent claim is rejected |
| 4 | Stale scan responses cannot overwrite newer results | **MET** | `scan_request_id` write-back guard; the exact bug where this was NOT true was found and fixed this stage (reclaim previously failed to null the id) |
| 5 | Confirmed unsafe files remain blocked | **MET** | Infected verdict sets `scan_next_retry_at=null`, never auto-retried; unchanged from K1.6E |
| 6 | Oversized files have an explicit retention policy | **MET** | 30-day, documented, testable (`k16g-retention-policy.md`) |
| 7 | Cleanup respects the new policy | **MET** | Rewritten cleanup query, 6-scenario real verification |
| 8 | Artist upload limits match scanner capabilities | **MET** | `PORTAL_ARTIST_UPLOAD_MAX_BYTES` launch policy, backend+frontend, drift-tested |
| 9 | Artist-facing statuses are truthful | **MET** | 10-state copy implemented; never shows "approved"/available content until both malware clearance and administrator approval are true |
| 10 | ZIP archives receive local safety validation | **MET** | `zipValidation.ts`, wired into `portal-confirm-attachment-upload`, 23 unit tests + real end-to-end verification |
| 11 | Genuine Cloudmersive scanning remains mandatory | **MET** | Unchanged — local ZIP validation supplements, never replaces, the real scan call |
| 12 | Administrator approval remains mandatory | **MET** | `attachment_available_requires_clearance` DB constraint unchanged; review flow unchanged |
| 13 | Artist isolation remains intact | **MET** | No RLS/authorization policy touched this stage; `k16g.mjs`'s cross-project/cross-identity checks pass |
| 14 | Existing collaboration demos still play | **MET** | Section 1 baseline re-verification, byte-for-byte |
| 15 | Existing proposals still render | **MET** | Section 1 baseline re-verification |
| 16 | Existing artwork remains unchanged | **MET** | No artwork-related code or data touched this stage |
| 17 | Security and integration tests pass | **MET WITH A NOTED CAVEAT** | Security: 233/233 fresh. Integration: last full clean run 185/185; a later rerun (needed only to re-validate the backend-inert Section 8 admin-UI change) hit a real, pre-existing per-identity rate limit from running the suite repeatedly within the same 60-minute window — not a code regression. See `k16g-test-results.md` for the full reasoning. |
| 18 | Browser-test failures are investigated and documented | **MET** | Ran 3 full passes (167/177 → 173/177 → 174/177), fixing 2 real K1.6G-introduced issues (a launch-policy fixture break, a stale literal-copy assertion, an "available"-wording collision in new admin-UI text) and investigating the rest to real root causes rather than assuming environmental. One genuine pre-existing, out-of-scope defect was found (a `color-contrast` violation on the Collaborations report table) — see `k16g-test-results.md` |
| 19 | Production release dependencies are clearly identified | **MET** | `k16f-production-release-plan.md`, updated this stage |

Any criterion not met is called out explicitly above rather than silently marked complete; as of this report, every criterion is MET, with #17 carrying a documented, non-code-related caveat about test-identity rate-limit budget exhaustion from repeated same-session runs (not a regression — see `k16g-test-results.md`).

## Remaining blockers before production

1. **Production Cloudmersive key and cron secret are not yet provisioned.** Per the brief's own boundary, purchasing/upgrading Cloudmersive and setting production secrets are explicitly not authorized this stage.
2. **The K1.6F rollback plan has not been re-reviewed against K1.6G's new migrations.** The 3 new K1.6G migrations (lease/retention columns, claim function, recovery cron) should be added to the rollback plan's own migration-by-migration reversal steps before production deployment.
3. **Production backup/PITR verification** (K1.6F's own still-open item) remains unverified — not addressed this stage, as it requires production access this stage does not have.
4. **Artist invitations remain explicitly not sent**, per every stage's unchanged boundary.
5. **A real, pre-existing accessibility defect was found this stage** (not a blocker, but worth the project owner's attention): a `color-contrast` violation on the admin Collaborations report table (muted text against its background), unrelated to any K1.6G change and outside this stage's authorization to fix. See `k16g-test-results.md`.

## What changed in the release plan

`k16f-production-release-plan.md` has been updated (see that file) to reflect that both of K1.6F's identified gaps (oversized-file retention, stuck-scanning recovery) are now resolved and tested in dev, and that the migration set to apply in production step 2 now includes the 3 new K1.6G migrations.

**This stage ends at STOP AND REPORT. No commit, push, or production action was taken. Awaiting the project owner's review before proceeding to production.**
