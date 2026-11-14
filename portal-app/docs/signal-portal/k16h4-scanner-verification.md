# SIGNAL PORTAL — K1.6H.4 Scanner Verification

Verified 2026-11-12. The local-only rehearsal database cannot make real network calls to Cloudmersive — that requires the actual deployed dev Edge Functions, so this section's genuine scanner checks ran against the real `signal-portal-dev` project (not a new/separate project; the owner's chosen rehearsal approach does not preclude using the already-authorized, already-isolated dev project for the one thing that genuinely requires live infrastructure). No private XYLØ/Issey asset bytes were used — a generated synthetic text fixture was submitted under XYLØ's existing disposable dev test identity, then deleted immediately after.

## Cloudmersive free-tier configuration

1. **Scanner configuration**: unchanged — `scannerConfig()`/`routeScanner()` live-verified fresh this stage (see below), identical results to K1.6H.3.
2. **Correct API endpoint / size enforcement**: unchanged, `CLOUDMERSIVE_API_KEY` present in dev, `PORTAL_CLOUDMERSIVE_MAX_BYTES` effective at 2,900,000.
3. **Genuine clean verdict**: performed for real this stage — a tiny generated text fixture, submitted through the real `portal-request-attachment-upload-url` → upload → `portal-confirm-attachment-upload` path, returned `{"ok":true,"status":"clean"}` with `scan_provider:"cloudmersive"` recorded in the database. Cleaned up immediately (feedback row, attachment row, and Storage object all deleted).
4. **Genuine unsafe verdict where safely testable**: not re-run live this stage — the EICAR local-rejection path is already covered by `tests/security/malwareScan.test.mjs` (18/18 passing, re-confirmed fresh in this stage's test run) and by the existing integration scenarios; repeating it here would spend no new evidence and the brief explicitly says to avoid unnecessary repeated live scans.
5. **Rate-limit / timeout / scanner-error / fail-closed handling**: unchanged, extensively proven in K1.6E.1/K1.6G/K1.6H.2, not re-derived.
6. **Accurate evidence recording**: confirmed directly this stage — the one real scan above wrote `security_status`, `scan_provider`, and the evidence fields correctly and exactly as expected.

**Required result, re-confirmed**: the test attachment never became available at any point before its own clean scan + (never-reached) administrator approval — it was deleted in the `clean`-but-unreviewed state, exactly matching the two-condition gate.

## ClamAV disabled-production-mode rehearsal

Live-verified fresh this stage (identical method and result to K1.6H.3 — re-run because this is a new stage's own gate, not assumed from a prior stage's result):

| Scenario | Result |
|---|---|
| Zero scanner env vars set (the real production starting state) | `mode='cloudmersive'`; `routeScanner` returns `'cloudmersive'` ≤2.9MB, `'unsupported'` above it — ClamAV unreachable |
| `PORTAL_SCANNER_PROVIDER_MODE=dual` with no worker configured | Rejected: `WORKER_NOT_CONFIGURED` |
| Non-`https://` worker URL | Rejected: `INVALID_WORKER_URL` |
| `PORTAL_SCANNER_FALLBACK_ENABLED=true` | Rejected: `FALLBACK_NOT_SUPPORTED` |
| Large-file request (>2.9MB) under Cloudmersive-only mode | `routeScanner` returns `'unsupported'` — correctly fails closed, no large-file support advertised |

The local ClamAV implementation (scanner abstraction, worker, ZIP validation, leases, evidence recording) is preserved exactly as K1.6H.2/K1.6H.3 left it — not touched, not rebuilt, not re-benchmarked a third time in this stage (no code change to justify it; the configuration-level checks above are what this rehearsal specifically needed).
