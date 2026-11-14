# K1.6H.1 — Test results

2026-11-09. Current-checkout evidence, not inherited totals. No tests targeted production.

## Completed verification

| Check | Passing | Failing | Skipped | Notes |
|---|---:|---:|---:|---|
| Security assertions | 233 | 0 | 0 | 19 files; Node wrapper also reports 19/19 files passed |
| Integration assertions | 185 | 0 | 0 | One full guarded development run; fixtures torn down |
| TypeScript | pass | 0 | 0 | npx tsc -b; also part of production build |
| Lint | pass | 0 errors | 0 | Two pre-existing unused clients warnings in integration artwork.mjs/feedback.mjs |
| Production build | pass | 0 | 0 | npm run build -- --outDir /tmp/k16h1-build; existing chunk-size warning; no public bundle overwrite |
| Focused accessibility | 2 tab views clean | 0 violations | 0 | Real admin Asset Library then Collaborations sequence, full axe analyses |
| Corrected admin entrance refresh | 1 | 0 | 0 | Dedicated focused check asserts actual administrator entrance after reload |
| Source asset byte verification | 9 objects | 0 | 0 | Read-only downloads, exact SHA-256/length report saved |
| Prepared migration integrity | 28 files | 0 | 0 | Source/prepared SHA-256 verified; exactly four scheduler blocks omitted, zero schedule calls remain |

The first sandbox-only security attempt failed because compilation helpers invoke npx/esbuild and local test servers need permissions/network. It did not establish an application failure. The authorized rerun passed all 233 assertions. Initial diagnostic used Playwright browser.newPage, which axe disallows; corrected to an explicit browser context before obtaining before/after evidence.

## Browser full run and focused rerun

One full run completed: **176 passed, 1 failed, 0 skipped** (177 total). The sole failure was the temporary agent-introduced administrator-refresh test error described below. Every other browser check passed, including all accessibility checks, the recovered classification save and attachment review/retry flows. Final-code focused rerun: **7 passed, 0 failed, 170 intentionally skipped**. Selected cases: administrator refresh, artist refresh, unique Transmission submit, Transmission full axe scan, inbox quick reply, Asset Library/Collaborations axe scan and restored classification save. All passed. These results must not be reported as a single fresh 177/177 run. No unresolved application/browser failure remains from the observed runs; a fresh full run of the final test code was deliberately not repeated.

One known run failure is agent-introduced test error: administrator entrance-refresh temporarily checked for artist project title Ghost Signal. The running module loaded that edit before it was corrected. Restored the administrator assertion immediately; a focused check using the real administrator entrance passed. This is reported separately, not relabeled as an application or environmental flake.

## Historical failure assessment and changes

| Case | Evidence / cause | Correction |
|---|---|---|
| Admin Asset Library + Collaborations contrast | Exact sequence reproduces inactive Asset Library management rows, not report cells. Whole-row opacity 0.45 dims text and pills below AA. | Remove row opacity; add explicit Inactive pill; focused full axe analyses now have zero violations. Body text ratio 16.02:1 and cyan pill 13.06:1 on observed #07070d. |
| Artist session refresh | Existing fixed 1500ms read could precede async dashboard/session data. No current evidence of session loss. | Wait for Ghost Signal in body before retaining the same content assertion. |
| Inbox quick reply | Old test closed context after 1200ms, possibly aborting an in-flight feedback request before querying DB. | Register response listener before click, await real POST completion and successful status, then preserve exact one-row DB assertion/cleanup. |
| Restored classification save | Fixed 1500ms read competed with async request and transient Saved state. | Await manage-collaboration POST and visible exact Saved text; retain actual persisted DB classification assertion. |
| Transmission submit | Fixed delay and repeated literal message made fixture state ambiguous. | Unique message, await POST success, assert it appears in actual Feedback messages log, then retain body assertion. |
| Transmission full axe structure | Historical missing-main/h1/region findings were intermittent. Layout source has main and h1; asynchronous navigation/auth loading is a supported timing explanation, not proven historical backend failure. | Wait for actual visible main and h1 before retaining zero-violations-of-any-severity axe assertion. |

No assertion removed, no timeouts increased, no retries added to hide failures. Optional SIGNAL_PORTAL_BROWSER_FILTER selects focused cases and explicitly counts others as skipped. Browser entry point now invokes the same production/opt-in guard as integration before any fixture work. No repeated full-suite run was used to chase a green result.

## Security regression scope

The fresh 185/185 integration run includes all 20 K1.6G cross-checked security regressions: both cross-artist directions, anonymous/unassigned/revoked denial, cross-message claims, pending/unscanned/infected/error/oversized/expired/rejected download denial, manual bypass denial, concurrency, stale completion, duplicate retries and active scan cleanup exclusion. Lease/retention/ZIP/Cloudmersive paths were inspected in source. Unit scanner tests use local HTTP fixtures; integration scenarios distinguish deliberately simulated error rows from real provider scans. Do not interpret simulated tests or asset upload readiness as genuine per-asset malware evidence.

Production backup/PITR and transfer-security blockers remain even with these passing development checks. Isolated migration replay was not run (no Docker binary available); prepared SQL is reviewed local preparation, not production-proven execution.


## Reproduction and evidence locations

From portal-app: `node --test tests/security/*.test.mjs`; `node --env-file=.env.integration tests/integration/run.mjs`; `node --env-file=.env.integration tests/browser/run.mjs` with local Vite on port 5173. Environment must pass the development/opt-in guard. Never print .env contents. Focused filter: `refreshing the entrance|session persists across|artist can submit new feedback|quick-reply from|the same classification save now succeeds|full scan.*Transmission Chamber|compact row list.*zero serious` in SIGNAL_PORTAL_BROWSER_FILTER.

Local run logs: /tmp/k16h1-security.log, /tmp/k16h1-integration.log, /tmp/k16h1-browser.log, /tmp/k16h1-browser-focused.log, /tmp/k16h1-focused-final.log. Persistent concise evidence: k16h1-accessibility-evidence.json, k16h1-source-assets.json, k16h1-release-manifest.json. Full-run output is 176/1/0 and focused output 7/0/170; the counts are separate executions with overlap. Lint and production build warnings remain disclosed above. git diff --check and syntax checks for new/edited JavaScript entry points passed.
