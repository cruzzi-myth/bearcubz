# SIGNAL PORTAL — K1.6H.3 Production Scanner Policy

Verified 2026-11-12. No production secrets were provisioned. No development secret was copied anywhere. No live Cloudmersive request was made during this verification — the checks below exercise `scannerPolicy.ts`'s own configuration logic directly, which needs no network call.

## Production Cloudmersive configuration (prepared, not provisioned)

| Setting | Required value for initial release | Source |
|---|---|---|
| `CLOUDMERSIVE_API_KEY` | A **new, production-specific** Cloudmersive account key — never the development key | Owner-provisioned at deployment time, not this stage |
| `PORTAL_SCANNER_PROVIDER_MODE` | Left unset, or explicitly `cloudmersive` | Defaults to `cloudmersive` when unset — verified live below |
| `PORTAL_CLOUDMERSIVE_MAX_BYTES` | Left unset (defaults to 2,900,000), or explicitly `2900000` for auditability | `scannerPolicy.ts` |
| `PORTAL_ARTIST_UPLOAD_MAX_BYTES` | Left unset (defaults to 2,900,000), or explicitly `2900000` | Must never exceed `PORTAL_CLOUDMERSIVE_MAX_BYTES` in `cloudmersive`-only mode — enforced by a config-validation throw, not just convention |
| `PORTAL_SCANNER_FALLBACK_ENABLED` | Left unset, or explicitly `false` | Setting `true` is rejected at config-load time (verified live below) — there is no code path that implements a fallback even if this were somehow forced |

**Genuinely verified this stage** (live calls to the real `scannerConfig()`/`routeScanner()` functions, not read from documentation):
- With **zero** scanner-related environment variables set — the actual state production will start in — `scannerConfig().mode` is `'cloudmersive'`, and `routeScanner()` returns `'cloudmersive'` for any file ≤2,900,000 bytes and `'unsupported'` for anything larger. ClamAV is never reachable from this state.
- Setting `PORTAL_SCANNER_FALLBACK_ENABLED=true` is rejected with `FALLBACK_NOT_SUPPORTED` before any scan ever runs.

### Rate limiting, retry, and usage monitoring (unchanged from K1.6E.1/K1.6G/K1.6H.2 — re-confirmed, not re-derived)

Real confirmed Cloudmersive free-tier limit: 3MB (the app's own 2,900,000-byte threshold stays conservatively under that). Bounded automatic retries (max 3 attempts, exponential backoff with jitter, `vendor_rate_limited` category gets a longer base delay) via `scanRetryPolicy.ts`, unchanged. `portal_scanner_usage` (added in K1.6H.2) records application-observed outcomes per attempt/provider — explicitly **not** the Cloudmersive account's real total usage (that requires checking the Cloudmersive dashboard directly; this stage did not invent an account-wide quota counter). Error handling and verdict recording are the existing, already-tested `scanBytes`/`scanFileForMalware` path — unchanged this stage.

### Minimal post-deployment smoke test (documented procedure, not executed against production — no key exists yet)

Once a production `CLOUDMERSIVE_API_KEY` is provisioned:
1. Generate a small, synthetic, non-private clean fixture locally (e.g., a 1-second generated tone encoded to MP3, or a trivial generated PDF/PNG — the same kind of fixture used throughout K1.6E.1–K1.6H.2, never a real artist file).
2. Submit it through the real `portal-request-attachment-upload-url` → upload → `portal-confirm-attachment-upload` path against production, using a disposable test account created specifically for this purpose (not an artist account).
3. Confirm the resulting row reaches `security_status='clean'`, `scan_provider='cloudmersive'`, with `scan_evidence`/`security_scan_detail` populated — proving the production key is live and wired correctly.
4. Delete the disposable test attachment/account afterward.
This spends exactly one real Cloudmersive request — deliberately minimal, consistent with "do not repeatedly consume live Cloudmersive requests during preparation."

## ClamAV: safely disabled for the initial release

**Preserved, not rebuilt**: the scanner abstraction (`scannerProvider.ts`, `objectScanner.ts`), the worker (`infra/clamav/worker/`), ZIP validation, scan leases, evidence recording, and the routing policy itself are untouched this stage — all exactly as K1.6H.2 left them, independently re-verified in this stage's own confirm-baseline pass (see `k16h3-test-results.md`).

**Genuinely verified this stage that ClamAV cannot be accidentally enabled**:
- `PORTAL_SCANNER_PROVIDER_MODE=dual` set **without** `PORTAL_CLAMAV_WORKER_URL`/`PORTAL_SCANNER_WORKER_TOKEN` is rejected with `WORKER_NOT_CONFIGURED` — dual mode cannot silently activate from a partial or missing configuration.
- A non-`https://` `PORTAL_CLAMAV_WORKER_URL` (e.g., accidentally pointing at a local or plain-HTTP address) is rejected with `INVALID_WORKER_URL` even when every other dual-mode setting is otherwise valid.
- Therefore the **only** way ClamAV routing ever activates in production is an explicit, deliberate `PORTAL_SCANNER_PROVIDER_MODE=dual` **plus** a genuinely-provisioned HTTPS worker URL and a ≥32-character worker token — never a partial configuration, typo, or default.

**Production decision carried forward exactly as instructed**: no hosted ClamAV worker exists or is approved; `PORTAL_CLAMAV_WORKER_URL`/`PORTAL_SCANNER_WORKER_TOKEN` must **not** be set in production for this release. No public ClamAV endpoint is created. The local Homebrew daemon verified in K1.6H.2 (and re-confirmed in `k16h3-test-results.md`) is explicitly a development-machine verification tool, never suitable for or connected to production.

### Future upgrade path (documented, not implemented — a later decision, not a requirement now)

When a secure private worker host is later approved: (1) deploy the existing, unchanged `infra/clamav/worker/` Dockerfile to that host behind a private HTTPS endpoint (TLS termination required — the worker's own HTTP server has none); (2) provision `PORTAL_CLAMAV_WORKER_URL` (the real HTTPS endpoint) and a freshly-generated `PORTAL_SCANNER_WORKER_TOKEN`; (3) set `PORTAL_SCANNER_PROVIDER_MODE=dual`; (4) run the real worker-health check (`GET /health` with the bearer token) before relying on it; (5) only then consider raising `PORTAL_ARTIST_UPLOAD_MAX_BYTES` past the Cloudmersive-only ceiling, and only up to `PORTAL_CLAMAV_MAX_BYTES`, and only after the same genuine-scan verification process K1.6H.2 already performed locally is repeated against the real hosted worker. None of this is required for, or should be rushed ahead of, the initial Cloudmersive-only small-file release.
