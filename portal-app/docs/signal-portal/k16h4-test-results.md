# SIGNAL PORTAL — K1.6H.4 Test Results

Verified 2026-11-12. Per the brief's own instruction, existing passing suites were re-run once (fresh evidence, not assumed from K1.6H.3's two-day-old numbers) and no assertion was weakened.

## Against the real dev project (existing suites, re-run fresh)

| Suite | Result | Note |
|---|---|---|
| Security (unit) | 233/233 | Fresh, matches every prior stage exactly |
| Integration | 186/186 | Fresh, full suite, no regression from any K1.6H.4 change (none touched the deployed Edge Functions) |
| Genuine Cloudmersive clean verdict | 1/1, genuine | New this stage: a generated fixture through the real pipeline, `security_status='clean'`, `scan_provider='cloudmersive'`, cleaned up immediately |
| Genuine ClamAV | Not re-run a third/fourth time | No code change since K1.6H.2's 34/34 (reproduced twice there) to justify it; this stage's scanner work was configuration-level, covered below |

## Against the native-Postgres rehearsal (new this stage, genuine, not managed-platform)

| Check | Result |
|---|---|
| Migration replay (29 real files: 17 baseline incl. unrelated moon-racer-vote + 12 pending) | 29/29 applied cleanly after one real gap found and fixed |
| RLS/grant attack tests (10 scenarios) | 10/10 denied, 4 at the grant level |
| Asset-activation negative/positive suite | 9/9 cases behaved correctly |
| Scan-lease/claim/cap/manual-override suite | 5/5 cases behaved correctly |
| Encrypted backup/restore round-trip | SHA-256-verified lossless; restore 0 errors in application schema, 1 known platform-shim gap (`auth.jwt()`) |
| Frontend build + secret-leak check | Clean build; only the public production URL and the public `sb_publishable_` key found embedded; one harmless UI-text mention of an env var *name* (not a value) |

## Managed-platform coverage this environment genuinely cannot provide

`pg_cron`/`pg_net` scheduler execution, GoTrue/Storage HTTP runtime, Realtime — unverified outside the managed platform, Docker still absent, no second managed Supabase project created (owner's own confirmed choice this stage — see `k16h4-rehearsal-environment.md`). The real dev project's own continuously-passing integration/security results (above) remain the best available proxy evidence for this gap, since dev runs the identical function source a production release would use.

## Distinguishing genuine vs. mocked vs. not-rerun, explicitly

- **Genuine, this stage**: migration replay, RLS attack tests, asset-activation suite, scan-lease suite, encrypted backup/restore, frontend build/secret check, one real Cloudmersive clean-verdict call.
- **Genuine, re-confirmed fresh but not newly derived**: security unit suite, integration suite.
- **Not re-run, with reasons stated plainly, not hidden**: full browser/accessibility suite (no frontend code changed since K1.6H.2/K1.6H.3's own thorough passes); genuine ClamAV engine test (no code changed since K1.6H.2's 34/34, reproduced twice there); genuine EICAR scan (already covered by the existing, still-passing `malwareScan.test.mjs`).
- **Nothing in this stage was labeled "passed" if it was actually skipped**, and no assertion anywhere was weakened to obtain a result.
