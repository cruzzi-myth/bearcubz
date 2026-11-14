# K1.6H.2 — Test results

**Audit follow-up (2026-11-09/10):** a separate review session re-verified this stage's work rather than extending it blindly. Confirmed fresh and unchanged: security suite 233/233, full integration suite 186/0 (both re-run live against `gcbonlvbgyhsgfayvlvz` with the H2 migration already applied — no regression). Newly closed: the genuine local ClamAV gate (see the dedicated table row and 20-case table below, and `k16h2-clamav-setup.md`).

2026-11-09. No production testing mutations. Fixtures sent to Cloudmersive are generated, non-private data only. Engine/protocol simulations and runtime skips are separated below.

| Suite | Passed | Failed | Skipped | Scope |
|---|---:|---:|---:|---|
| Existing security assertions | 233 | 0 | 0 | 19 test-file wrappers pass |
| Worker/provider/config/cleanup tests | 43 | 0 | 0 | Real local HTTP/filesystem/ZIP checking; mocked ClamD verdicts explicitly labeled |
| Native database security assertions | 26 | 0 | 0 | Actual PostgreSQL constraints/RLS/leases; synthetic evidence fixtures, not scans |
| Genuine ClamAV runtime harness (audit follow-up, 2026-11-09/10) | 34 | 0 | 0 | Real Homebrew ClamAV 1.5.4 daemon on loopback; genuine engine for every check except the Supabase broker/object-transport legs in the WORKER-prefixed checks (explicitly synthetic, never the AV engine). Reproduced twice with identical results. See `k16h2-clamav-setup.md`. |
| Full broader integration regression | 186 | 0 | 0 | Real development; one added separate-release-review assertion; genuine provider calls on generated fixtures |
| Initial H2 targeted integration | 10 | 2 | 0 | Failures individually assessed below |
| H2 focused final integration | 2 | 0 | 10 | Final 100MB pre-transfer rejection and scanner-status checks; no rescanning |
| Full browser/accessibility | 176 | 1 | 0 | One compact-row timing/state assertion; all other 176 passed |
| Focused corrected compact-row browser | 1 | 0 | 176 | Wait for rendered row before counting; same classification expectation |
| Initial H2 admin controls browser | 6 | 0 | 0 | Generated PNG → genuine Cloudmersive → UI release approval → pending artistic approval |
| Final H2 admin controls browser | 7 | 0 | 0 | Simulated expired lease → genuine scan of generated PNG → UI retry/release; pending artistic approval preserved |

TypeScript/build and ten-endpoint Deno checks pass. Lint exits successfully with the same two existing unused clients warnings in artwork.mjs/feedback.mjs. Production build staged to /tmp/k16h2-build; existing chunk-size warning retained. No public portal bundle was overwritten. New/edited JavaScript syntax and git diff --check pass. The first native initdb required sandbox escalation for shared memory; the first Deno run needed an isolated automatic dependency cache. These were environment/tooling failures, not scanner passes.

## Genuine Cloudmersive results

| Generated fixture | Exact bytes | Provider | Verdict | Complete |
|---|---:|---|---|---|
| MP3 | 2387844 | cloudmersive | clean | True |
| WAV | 4096 | cloudmersive | clean | True |
| PDF | 209 | cloudmersive | clean | True |
| image | 68 | cloudmersive | clean | True |
| large-artwork | 3147060 | none | unsupported | False |
| 30MB WAV | 31457280 | none | unsupported | False |
| ZIP | 147 | cloudmersive-advanced | clean | True |
| EICAR-ZIP | 184 | cloudmersive-advanced | infected | True |

The generated MP3 is 2,387,844 bytes, independently ffprobe-decoded as 128kbps MP3 with measured duration 149.2375s; its SHA matches the genuinely scanned bytes. Details: k16h2-audio-metadata.json. WAV is generated RIFF/PCM, PDF generated text, PNG generated fixture and ZIP generated with Python. Plain EICAR remains the existing local rejection shortcut; **compressed EICAR ZIP was genuinely rejected by Cloudmersive Advanced**. Cloudmersive engine/signature versions are null because the API integration does not supply them. No ClamAV metadata is invented. Full per-file SHA, attempt IDs, timestamps and completeness: k16h2-live-scan-evidence.json.

Existing optimized artist MP3s/PDF/artwork were hash-checked read-only but were not sent to a scanner. Automatic approval review rejected the attempted private-copy Cloudmersive test as sensitive egress without specific authorization. Work continued with generated fixtures; private-copy authorization was requested separately and not inferred. Original private-asset genuine revalidation remains unresolved.

## Failure investigation

1. **100MiB generated WAV PUT failed.** Confirmed development global Storage limit is 50MiB via read-only config pull into a temporary copy, despite the bucket/category ceiling of 100MiB. New API/UI pre-transfer cap rejects >50MiB. Focused final test proves no upload URL is issued for 100MiB. This is not a successful 100MiB scan and no 100MiB support is advertised.
2. **Initial scanner-status assertion failed.** Its original response was not captured, so a definitive root cause is not claimed. An identical authenticated diagnostic returned valid Cloudmersive-only config, workerHealthy=false and actualProviderUsage=null. Final focused assertion also passed without weakening the expectation. The initial failure remains recorded as an unexplained transient observation, not silently relabeled as a known cold-start issue.
3. **Browser compact TRACK row assertion failed.** Source counted rows before waiting for the row list, then awaited list text, allowing the count and text to describe different render moments. Added actual row visibility before counting and preserved Track/content checks. Focused final-code test passed. Failure-time fixture state was not captured, so a separate historical fixture-state contribution cannot be ruled out. No timeout increase or full-suite rerun used to chase green.

The full browser run includes real XYLØ/Issey proposal canvas navigation/zoom, dashboard/chambers, administrator views, mobile overflow, keyboard/focus and axe contrast checks. Existing inactive-row contrast fix remains. Do not report a new 177/177 full run: actual full result is 176/1, followed by a separate 1/0 focused result. Likewise do not add overlapping suite totals as if they were one run.

## 20 requested scanner cases

| Case | Actual evidence |
|---|---|
| Clean MP3/WAV/PDF/image/ZIP | Genuine Cloudmersive on generated fixtures; **genuine ClamAV also now verified** (audit follow-up — 1.5.4, loopback, 34/34 real checks) |
| EICAR/plain and in ZIP | Plain local rejection; compressed ZIP genuine Cloudmersive infected; **genuine ClamAV EICAR detection also now verified, plain and compressed** |
| Unsupported/oversized files | Configuration/router tests; 30MiB WAV and large PNG quarantine; 100MiB transfer rejection at the Storage layer (separate, still-real constraint); **genuine ClamAV scan of a 100MiB-exact WAV now verified at the engine level** |
| Malformed/encrypted/nested/high-expansion ZIP | Existing 23 ZIP policy assertions; real bounded decompression/CRC tests; **genuine ClamAV archive behavior now verified** (encrypted/malformed/nested/high-ratio/corrupt ZIP all genuinely blocked before or by the real engine) |
| Timeout/unavailable/stale signatures/partial scan | Explicitly mocked protocol/policy tests plus actual unavailable-worker HTTP health; **a genuine forced 1ms client deadline against the real daemon, and a genuine unavailable-endpoint connection failure, are also now verified**; never clean |
| Interrupted worker | Real private-temp cleanup/restart tests with mocked transport; actual daemon/process interruption not verified |
| Duplicate/late result | Actual native SQL claims/stale identity tests and full development recovery regression |

**Audit follow-up correction**: the ClamAV columns above were accurate when this document was first written (Docker and native ClamAV were both genuinely absent at that time). A Homebrew-native ClamAV 1.5.4 install was added to the workstation afterward and independently verified twice during this audit — see `k16h2-clamav-setup.md` for full detail. "Interrupted worker" (an actual killed daemon/process mid-scan, not a client-side deadline) remains unverified, as does any end-to-end test through a real HTTPS-reachable worker URL (the deployed `scanWithWorker` path itself was not exercised against a live network call — `scannerPolicy.ts` deliberately requires `https://` for any configured worker URL, so this remains correctly untestable without a hosted worker, which is outside this stage's authorization to provision).

## Replay and recovery scope

Native replay passed 19 portal SQL transactions with explicit managed-platform shims. Full Supabase Auth/Storage/pg_cron/pg_net runtime replay remains blocked without Docker. Development applied exactly one H2 migration. Production backups still absent/PITR disabled; no production restore demonstrated.

Run logs: /tmp/k16h2-security.log, worker-tests.log, genuine-clamav.log, database-tests.log, replay.log, integration.log, integration-focused.log, regression-integration.log, browser.log, browser-focused.log, admin-ui.log and admin-ui-final.log (each prefixed k16h2-). Persistent compact evidence is alongside this document. Tests creating temporary collaboration records/objects tear them down; audit/outcome records remain as genuine operational history.


## Native runtime attempt

Docker remained absent. Downloaded the official 1.4.6 macOS package into /tmp, checked its detached signature against the Cisco Talos key linked by the [official installation guide](https://docs.clamav.net/manual/Installing.html), and obtained a good GPG signature (fingerprint 5BADCA2665EF59DCF8A23D8B707F0DB480836771). macOS pkgutil's installer-signature check reported invalid; this was not treated as successful authentication. Independent official detached GPG authentication was used before any execution attempt. The extracted daemon then failed to load @rpath/libclamav.12.dylib because its runtime lookup expects /usr/local/clamav/lib. No executable patch, trust override, system-wide install or system-path change was made. Thus no usable daemon, fresh signature database, actual engine metadata, genuine ClamAV scan or memory measurement exists. Evidence: k16h2-clamav-runtime-attempt.json. Provide an approved correctly installed runtime or Docker environment before closing this gate.
