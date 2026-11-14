# SIGNAL PORTAL — K1.6F Scanner Operations Audit

Covers sections 8–11 of the K1.6F brief: Cloudmersive free-tier re-verification, large-file retention, ZIP archive security, and large audio file scanning architecture.

## 8. Cloudmersive free-tier — re-verified

No new live-scanner calls were spent re-proving what K1.6E.1 already proved for real (per the brief's own "avoid unnecessary repeat calls" instruction). Re-read the actual deployed code instead to confirm the reported behaviors are still exactly what's running:

- Genuine clean-scan path, genuine infected-scan path, EICAR-local-precheck distinction, the real 3MB limit, the 2,900,000-byte local threshold — all confirmed present, unchanged, in `malwareScan.ts` / `scanOrchestrator.ts` as deployed.
- Confirmed the full gate chain is still intact: `portal-admin-review-attachment` only acts on `status==='clean'` (itself only reachable via a genuine `security_status==='clean'` scan result); promotion only happens after that; `portal-attachment-signed-url` independently re-checks `security_status`/`review_status`/bucket location before minting anything.

## Small files (within the scanner limit) — verified chain

1. Upload → quarantine (`portal-request-attachment-upload-url` + direct PUT to the signed URL).
2. Validation (`portal-confirm-attachment-upload`: existence, exact byte size, file signature).
3. Genuine Cloudmersive scan (`claimAndRunScan` → `scanFileForMalware`).
4. Verdict recorded (`security_status`, `scan_provider`, `security_scan_detail`, `scanned_at`).
5. Administrator approval required (`portal-admin-review-attachment`, gated on `security_status==='clean'`).
6. Promotion only after both gates (DB CHECK constraint, not just application logic).
7. Signed URLs only to authorized, re-verified recipients.

All seven steps: real, currently passing (`k16e1.mjs`).

## Oversized files (section 8/9) — verified chain, with one real gap

1. Upload allowed up to the portal's own independently-verified limit (confirmed live: `CATEGORY_RULES`/`ATTACHMENT_RULES` document=25MB, image=15MB, audio=100MB, zip=25MB — these are the real, current, enforced numbers, re-read from the deployed function and the DB bucket config, not assumed).
2. File stays in private quarantine — confirmed (never promoted, since `security_status` never reaches `'clean'`).
3. No API request is sent for a file already known to exceed the scanner's limit — confirmed live (`EXCEEDS_SCANNER_SIZE_LIMIT` is produced by a local byte-length check, before any `fetch` call).
4. A distinct condition is recorded — confirmed (`security_scan_detail` literally starts with `EXCEEDS_SCANNER_SIZE_LIMIT`, distinguishable from a genuine scan failure or an infected verdict).
5. Not classified as infected — confirmed (`security_status` is `'error'`, never `'infected'`, for a size-limit rejection).
6. Administrator approval cannot bypass it — confirmed (`portal-admin-review-attachment` refuses with `409` regardless of decision requested, since `security_status !== 'clean'`).
7. Signed URLs refused — confirmed.
8. **Preserved for future scanning, subject to the approved retention policy — NOT confirmed. This is Gap 1 in `k16f-security-audit.md`: the file is deleted by the existing 7-day abandoned-cleanup rule, with no distinction from a genuinely stuck/abandoned upload. Classified as a production blocker.**
9. Artist-facing message — **not yet implemented**. `AttachmentList.tsx`'s `StatusOnlyAttachment` currently shows the generic `STATUS_COPY` label ("Pending review") for every non-terminal status, including a size-limit rejection — it does not yet distinguish "still being scanned" from "too large for the scanner, held privately." The brief's suggested artist-facing copy ("Upload received. This file exceeds the current security scanner limit and cannot be delivered yet. It will remain private until security scanning becomes available.") is not yet shown anywhere. This is a real, user-facing gap, not just a backend one — documented here, not implemented (UI change, outside this audit's authorization).

## 10. ZIP archive security audit

| Property | Status |
|---|---|
| Correct MIME handling | Verified — `application/zip` accepted, routed to the Advanced endpoint specifically |
| Storage bucket MIME allowlist | Verified — both buckets updated (the real gap found in K1.6E.1) |
| ZIP file-signature validation | Verified — local magic-byte check (`PK\x03\x04`/`\x05`/`\x07`), same family as the existing DOCX check |
| Password-protected archive rejection | **Verified live** (K1.6E.1) — a genuine password-protected test archive was flagged and rejected |
| Cloudmersive Advanced endpoint clean/infected behavior | **Verified live** (K1.6E.1) — both a genuine clean and a genuine unsafe-content verdict |
| Archive never extracted into public storage | Verified by construction — this codebase never extracts ZIP contents anywhere, client or server; the whole file is stored as one opaque blob in a **private** bucket, and whatever unpacking Cloudmersive does happens entirely on their own infrastructure, never touching this project's Storage |
| Nested archive handling | **Unverified** — Cloudmersive's own documentation claims recursive unpacking of nested archives (ZIP/RAR/7Z/TAR), but this was not independently tested against the real API this stage (would cost a real API call for a property already vendor-documented; deferred per the "avoid unnecessary repeat calls" instruction) |
| Excessive decompression protection (zip bombs) | **Unverified against the real API** — `allowUnsafeArchives: false` is sent on every ZIP scan request (Cloudmersive's own documented zip-bomb control), and the code also independently checks the response's `ContainsUnsafeArchive` flag rather than trusting the policy header alone (verified via the real local unit tests simulating that flag) — but no genuine zip bomb was submitted to the live API to confirm the vendor's own enforcement actually fires |
| Archive entry-count limits | **No local enforcement exists.** This system does zero local inspection of a ZIP's internal structure (entry count, nesting depth, compression ratio) before sending it to Cloudmersive — archive safety is delegated entirely to the Advanced endpoint. No local defense-in-depth exists for this specific property. |
| Suspicious file types / executables / scripts inside the archive | Policy headers sent (`allowExecutables: false`, `allowScripts: false`, `allowMacros: false`, etc.) and verified live for `allowPasswordProtectedFiles` specifically; the others are the same code path and same policy-flag mechanism, not independently tested per-flag against the live API |
| Malformed archives | Local signature check only confirms the first few magic bytes — a file that starts with a valid ZIP signature but is internally corrupt is NOT separately caught locally; this would surface as Cloudmersive's own `ContainsInvalidFile` flag (sent as `allowInvalidFiles: false`, code path exists, not independently live-tested) |

**Honest summary:** the password-protected-archive and basic clean/infected paths are genuinely, live-verified. Zip-bomb-specific and nested-archive-specific protection rests entirely on Cloudmersive's own vendor claims and a policy header this system sends but has not independently confirmed fires correctly for those two specific attack shapes. This is reported, per the brief's own instruction, as **unverified** rather than assumed safe.

## 11. Large audio file (up to 100MB) scanning architecture

Grounded in Supabase's current documented Edge Function limits (fetched during this audit): 256MB memory, 150s wall-clock duration (Free plan) / 400s (paid), 2s CPU time (excludes async I/O), 150s request idle timeout.

| Question | Answer |
|---|---|
| Can the Edge Function handle large-file scanning reliably? | **At the free-tier's real 3MB cap, yes, trivially** — oversized files never reach the scan call at all. If a future paid Cloudmersive plan raised the size limit toward the portal's full 100MB audio allowance, reliability becomes genuinely uncertain — see memory/timeout analysis below. |
| Synchronous or asynchronous? | **Fully synchronous.** `portal-confirm-attachment-upload` downloads the file, runs the signature check, and awaits the complete scan call in one Edge Function invocation before responding to the client. |
| Does upload confirmation wait for scanning? | **Yes.** The artist's browser `confirm` call does not return until the scan (or the local size-limit short-circuit) has fully resolved. |
| Are timeouts recoverable? | **Partially.** The scan call's own internal 20s `AbortController` timeout is gracefully handled (`security_status='error'`, retryable). An interruption of the *whole function invocation* (platform wall-clock/idle timeout, process kill) is **not** recoverable — this is Gap 2 in `k16f-security-audit.md`, and becomes more likely the larger/slower the transfer. |
| Are retries idempotent? | **Yes** — verified for real (`k16e.mjs`'s duplicate-scan-request tests) via the atomic claim in `scanOrchestrator.ts`. |
| Can repeated scanning create excessive API charges? | **Potentially, operationally** (not a security bug): nothing currently rate-limits how many times an administrator can click "Retry Scan" on a persistently-failing attachment — each click is one more real, billed (against the free-tier's 600/month allowance) API call. |
| Can the file be scanned without loading its entire contents into Edge Function memory? | **No.** `.download(...).arrayBuffer()` always materializes the full file. `malwareScan.ts` then makes a **second** full copy (`bytes.slice().buffer`, to satisfy a `Blob` constructor type constraint) before building the multipart request body. For a file approaching 100MB, this is two ~100MB in-memory buffers simultaneously, on top of Deno/Supabase-client runtime overhead, against a 256MB ceiling — a real, concrete inefficiency worth removing (avoid the extra `.slice()` copy) even though it was not observed to fail in this audit's own testing (which never exercised a near-100MB file against the live scanner, to conserve the free-tier budget). |
| Would a future paid plan require architectural changes? | **Likely yes**, if the goal is reliably scanning near-100MB audio files. Recommended direction if/when a paid plan is adopted: make the scan step asynchronous — return a fast "scanning" response from `confirm-attachment-upload` and run the actual scan via a background task (e.g. `EdgeRuntime.waitUntil`), with the admin UI/artist UI reflecting `security_status` as it updates, rather than holding one HTTP request open for the full transfer-and-scan duration. This was not implemented — it is a proposal for a future stage, not a change made now. |

No Cloudmersive plan was purchased or upgraded, and the existing 100MB audio limit was not reduced, per this stage's authorization.
