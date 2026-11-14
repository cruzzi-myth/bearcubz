# K1.6H.2 — Release manifest and readiness

**Executive status: BLOCKED. Production deployment: NO-GO and NOT authorized.** Local implementation, development deployment and testing performed. No production mutation, commit, push, purchase, invitations or real artwork activation.

**Audit follow-up (2026-11-09/10):** the genuine local ClamAV gate (acceptance items 2–7 below) is now closed — a Homebrew-native ClamAV 1.5.4 daemon was verified genuinely scanning real generated fixtures, independently reproduced twice (34/34 passing both times). This does **not** change the executive status: production backup/PITR, production worker hosting, and full Supabase/Docker-based migration replay remain unresolved and still block production. See `k16h2-clamav-setup.md` and the updated acceptance table below.

## Proposed production changes (not executed)

1. Replay and review all twelve pending migrations: the eleven listed in H1 plus 20261110020000_signal_portal_dual_scanner_evidence.sql, after a verified recovery gate. Use scheduler-free prepared artifacts, not source-checkout db push.
2. H2 migration extends attachment exact-byte evidence and asset security/lease/review fields, preserves explicit legacy exemptions, adds service-role claim_asset_for_scan and claim_attachment_for_manual_scan, replaces attachment claim with an atomic cap, adds evidence validators and asset enforcement trigger/index plus administrator-only portal_scanner_usage reads. No production secret or scheduler in this migration.
3. New functions: portal-admin-review-asset, portal-scanner-worker-access, portal-admin-scanner-status. Changed existing functions: portal-admin-request-upload-url, portal-admin-confirm-upload, portal-confirm-attachment-upload, portal-admin-retry-attachment-scan, portal-scan-recovery, portal-signed-url, portal-request-attachment-upload-url. Shared modules and concrete SHA-256: k16h2-deployment-hashes.json. Recheck bundled dependencies/hashes against frozen source before approval.
4. Frontend: Asset Library security/revalidation/release controls (including expired asset lease retry), accurate upload/review instructions, 50MiB admin pre-transfer ceiling, Settings scoped provider status/usage, and one browser rendering-wait correction. Existing layouts and inactive-row contrast fix preserved. Build only in staging; public frontend deployment is separate authorization.
5. Optional external private ClamAV worker: infra/clamav, official 1.4.6 image, persistent signatures, restricted daemon network, authenticated loopback worker, bounded temporary files, FreshClam and resource/health configuration. Docker image pull/build/Compose startup, genuine engine tests and memory measurements are not verified. Pin worker base/image digests before production acceptance. Narrow COPY and deny-by-default .dockerignore exclude secrets/private assets from image context.
6. Existing production-only cleanup/recovery scheduler SQL remains preparation only. Do not activate jobs. Review actual free-tier quota monitoring and cadence before enabling.

## Configuration names, never values

Retain production platform SUPABASE_* values and independently verify PORTAL_REDIRECT_URL. Future owner-authorized server configuration: CLOUDMERSIVE_API_KEY; PORTAL_SCANNER_PROVIDER_MODE (default cloudmersive); PORTAL_CLOUDMERSIVE_MAX_BYTES=2900000; optional legacy CLOUDMERSIVE_MAX_FILE_SIZE_BYTES=2900000; PORTAL_CLAMAV_MAX_BYTES (configured ceiling only); PORTAL_ARTIST_UPLOAD_MAX_BYTES=2900000; PORTAL_SCANNER_FALLBACK_ENABLED=false; PORTAL_ADMIN_UPLOAD_MAX_BYTES<=52428800 under current storage capability; PORTAL_CLAMAV_WORKER_URL (private HTTPS, no URL credentials); PORTAL_SCANNER_WORKER_TOKEN (dedicated random credential); SIGNAL_PORTAL_CRON_SECRET; SIGNAL_PORTAL_SYSTEM_UID. Runtime worker also needs approved SUPABASE_URL, SCANNER_WORKER_ID, private CLAMD_HOST/PORT and strict CLAMD_CONFIG_PATH. No service-role key in worker. Broker alone uses verify_jwt=false with its own mandatory bearer authentication; all existing authenticated endpoints retain gateway checks.

Frontend environment remains production VITE_SUPABASE_URL/ANON_KEY and VITE_PORTAL_ARTIST_UPLOAD_MAX_BYTES=2900000. Never put worker or scanner secrets in VITE_* values. Production Vault names: signal_portal_cron_secret and signal_portal_gateway_anon_key, provisioned only after explicit authorization. No production provisioning in H2.

## Blocking gates

- ~~Genuine ClamAV MP3/WAV/PDF/artwork/ZIP/EICAR scans... remain unverified: Docker/ClamAV absent.~~ **Closed (audit follow-up):** a Homebrew-native ClamAV 1.5.4 daemon genuinely scanned every listed fixture type, including a 100MiB-exact WAV, with real signature-reload and real peak-memory measurement; independently reproduced twice. Docker itself is still absent and the pinned 1.4.6 Docker image was never run — see `k16h2-clamav-setup.md`. End-to-end connectivity through a real, hosted, HTTPS worker URL (the actual `scanWithWorker` production path) remains unverified and is correctly untestable without provisioning a hosted worker, which this stage is not authorized to do.
- Full isolated Supabase replay/managed extension and scheduler validation remains unverified; native SQL/RLS evidence is valuable but narrower.
- Production recovery remains unverified: no listed backup and PITR disabled. No production restore evidence.
- Existing private artist asset genuine revalidation has not been performed. Private Cloudmersive egress requires specific authorization; larger artwork also needs an available eligible scanner. All real bytes/states preserved.
- Current global Storage is 50MiB. Do not enable/advertise 100MiB audio or 250MB ZIP delivery on the strength of code/configuration alone.
- Production hosting, private TLS endpoint, measured capacity and operational/backup/scanner quota owners are not established.

## Owner decisions

Provide/authorize the local supported Docker/ClamAV runtime and a suitable measured private host; choose and verify recovery objectives/backup workflow; decide separately whether private copies may be sent to Cloudmersive; approve specific deployment artifacts/secrets/scheduler cadence and a larger-file policy only after evidence exists. No paid resource or plan was selected. Software cost is $0; hosting cost is unresolved. Invitations and artwork artistic approval remain separate decisions.

Stage acceptance cannot be marked complete: required genuine local ClamAV and full replay criteria are unresolved. Passing local/control/development tests do not imply production readiness. Stop and report pending explicit owner authorization.


## Native runtime attempt (original, superseded)

Docker remained absent. Downloaded the official 1.4.6 macOS package into /tmp, checked its detached signature against the Cisco Talos key linked by the [official installation guide](https://docs.clamav.net/manual/Installing.html), and obtained a good GPG signature (fingerprint 5BADCA2665EF59DCF8A23D8B707F0DB480836771). macOS pkgutil's installer-signature check reported invalid; this was not treated as successful authentication. Independent official detached GPG authentication was used before any execution attempt. The extracted daemon then failed to load @rpath/libclamav.12.dylib because its runtime lookup expects /usr/local/clamav/lib. No executable patch, trust override, system-wide install or system-path change was made. Thus no usable daemon, fresh signature database, actual engine metadata, genuine ClamAV scan or memory measurement exists. Evidence: k16h2-clamav-runtime-attempt.json.

**Superseded (audit follow-up, 2026-11-09/10):** that failure was specific to a manual `.pkg` extraction's library rpath, not a statement that ClamAV cannot run on this machine. A Homebrew-native ClamAV 1.5.4 install (correct rpaths) was verified genuinely scanning real fixtures — see `k16h2-clamav-setup.md`. Docker itself remains absent; the pinned 1.4.6 Docker image was never run.

## Acceptance audit

| # | Required outcome | Status |
|---|---|---|
| 1 | Cloudmersive continues working | Verified with genuine generated MP3/WAV/PDF/PNG/ZIP results |
| 2 | Genuine local ClamAV | **RESOLVED (audit follow-up):** Homebrew-native ClamAV 1.5.4, loopback-only, genuinely verified, reproduced twice (34/34). Docker itself still not used. |
| 3 | Genuine clean large-audio scan | **Engine-level RESOLVED:** genuine clean ClamAV verdict for a 100MiB-exact WAV. Storage-layer ceiling (50MiB) separately still blocks any real upload that large — not a scanner limitation, an infrastructure one; not advertised as supported end-to-end. |
| 4 | Artwork scan | Small generated PNG genuine Cloudmersive; large artwork now also genuinely scanned by ClamAV (PNG >2.9MB, engine-level) |
| 5 | EICAR detection | Genuine Cloudmersive compressed EICAR ZIP; **genuine ClamAV EICAR detection now also verified, plain and compressed** |
| 6 | ZIP scanning | Genuine Cloudmersive + local policy checks; **genuine ClamAV archive completeness now verified** (encrypted/malformed/nested/high-ratio/corrupt all correctly blocked against the real engine) |
| 7 | Partial scans blocked | Control/protocol/SQL verified; **genuine engine limit behavior now verified** (forced 1ms deadline, unavailable endpoint, oversized stream, encrypted archive — all against the real daemon) |
| 8 | Errors blocked | Verified fail-closed logic and unavailable-worker HTTP behavior |
| 9 | Deterministic routing | Verified configuration/boundary tests; no fallback loop |
| 10 | Safe leases | Verified native SQL + real development recovery regression |
| 11 | Retry limits | Atomic automatic cap and explicit manual exception verified |
| 12 | Admin asset requirements | Verified database gate + genuine scan + explicit UI release review |
| 13 | Artist isolation | Full integration regression passes; authorization browser checks pass |
| 14 | Existing objects intact | Nine read-only hashes verified; active hashes match H1 transfer table; pending artwork preserved |
| 15 | Development migration | Exactly one H2 migration applied after 28-existing baseline; development only |
| 16 | Migration replay | Native 19 transactions verified; full managed Supabase replay UNRESOLVED |
| 17 | Backup requirements | Documented with supported official workflows and proposed objectives |
| 18 | Honest restore readiness | Explicitly unverified/blocked; no fabricated restore proof |
| 19 | Browser/accessibility reporting | Actual full/focused totals recorded; no fresh 177/177 claim |
| 20 | Release manifest | Concrete source hashes and proposed changes prepared; no production approval |
