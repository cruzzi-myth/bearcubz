# SIGNAL PORTAL — K1.6F Security Audit

Audit date: 2026-11-09. All findings below were verified against the live `signal-portal-dev` project using the real, already-deployed Edge Functions and RLS policies — never mocked authorization.

## Isolation test matrix (section 13 of the brief)

Every item below is covered by a currently-passing, real integration test (not a new claim — the full suite was re-run for this audit; see `k16f-production-release-plan.md`/final report for totals):

| # | Property | Covered by |
|---|---|---|
| 1 | XYLØ cannot access Issey's files | `k16b.mjs`, `k16c.mjs` cross-artist tests |
| 2 | Issey cannot access XYLØ's files | same |
| 3 | Cross-project feedback access denied | `k16b.mjs` |
| 4 | Cross-project attachment access denied | `k16c.mjs`, `k16e.mjs`, `k16e1.mjs` |
| 5 | Cross-message attachment claims denied | `k16c.mjs` ("cross-message denial") |
| 6 | Cannot attach to a message not authored by the caller | `portal-request-attachment-upload-url`'s own `feedback.author_id` check, tested in `k16c.mjs` |
| 7 | Revoked member cannot get a new signed URL | `k16d.mjs`, `k16e1.mjs` |
| 8 | Anonymous uploads denied | `k16c.mjs` |
| 9 | Pending files not downloadable | `k16d.mjs` |
| 10 | Infected files not downloadable | `k16e.mjs`, `k16e1.mjs` |
| 11 | Scanner-error files not downloadable | `k16e.mjs` |
| 12 | Oversized/unscanned files not downloadable | `k16e1.mjs` |
| 13 | Rejected files not downloadable | `k16c.mjs`, `k16d.mjs` |
| 14 | Available files require valid authorization | `k16c.mjs` ("authorized participant can retrieve") |
| 15 | Administrators cannot bypass the scan gate | `k16e.mjs` ("an infected file can never be approved"), `k16e1.mjs` |

All 15 properties: **confirmed, real, currently passing.**

## Real vulnerabilities found and fixed during prior stages (for context)

1. **K1.6D** — the "uploader sees own row" RLS policy had no active-membership check; a revoked artist could mint signed URLs for their own previously-available attachments indefinitely. Fixed (`...071500_...owner_policy_fix.sql`).
2. **K1.6E** — the first cron-authorization design compared against `SUPABASE_SERVICE_ROLE_KEY`, which turned out to be two materially different credential formats in this project (the long-form JWT this codebase's own tooling uses vs. whatever an Edge Function's own runtime resolves it to). Replaced with a dedicated, purpose-built, low-privilege `SIGNAL_PORTAL_CRON_SECRET`.
3. **K1.6E.1** — Supabase Storage's own bucket-level `allowed_mime_types` (separate from the app's DB check constraint) silently rejected the first real ZIP upload. Fixed via migration.

## Real architectural gaps found during THIS audit (K1.6F) — not yet fixed

Per this stage's authorization, these are documented and a correction is proposed, but **not applied** (audit-only; no migrations or function changes were deployed this stage).

### Gap 1 — oversized files are deleted by the 7-day abandoned-cleanup rule (production blocker)

**Verified live** (not theoretical): uploaded a real 3.5MB file (over the scanner's real 3MB limit), confirmed it correctly reaches `security_status='error'` with `security_scan_detail` starting `EXCEEDS_SCANNER_SIZE_LIMIT`, backdated `uploaded_at` to 8 days ago, ran the real `portal-admin-cleanup-quarantine` function unmodified — **the file was deleted** (`is_active` set to `false`, object removed from Storage).

This directly contradicts the brief's own section 9 requirement: *"A file awaiting scanner capacity must have a clearly defined retention policy... Determine whether an oversized file can be rescanned later without requiring the artist to upload it again."* Today, it cannot — after 7 days it is gone, same as any other abandoned upload.

**Root cause:** `portal-admin-cleanup-quarantine`'s `abandoned` query matches on `status IN (..., 'awaiting_scan', ...)` with no distinction for *why* a row is still at that status — "genuinely stuck/abandoned" and "deliberately held pending future scanner capacity" are indistinguishable to the query.

**Proposed correction** (not applied): exclude rows whose `security_scan_detail` starts with `EXCEEDS_SCANNER_SIZE_LIMIT` from the 7-day abandoned sweep, and give them their own, longer, explicitly-approved retention period (the brief also warns: *"Do not promise indefinite storage without an approved retention policy"* — so this needs a real, finite number, e.g. 90 days, decided by the project owner, not invented here).

### Gap 2 — a row stuck in `security_status='scanning'` has no recovery path

**Verified live**: forced a real attachment's `security_status` to `'scanning'` (the exact state the atomic claim in `scanOrchestrator.ts` leaves a row in before any terminal result is written — i.e., what a genuinely killed/crashed/platform-timed-out Edge Function invocation would leave behind). Neither `portal-admin-retry-attachment-scan` (refuses with `409 NOT_RETRYABLE`, since it only accepts `security_status==='error'`) nor a fresh `portal-confirm-attachment-upload` call (hits its own idempotent early-return before ever re-examining `security_status`) can recover it. The admin UI's Retry Scan button never appears either, for the same reason.

This is directly relevant to section 11's "whether timeouts are recoverable": the scan call's own internal 20-second `AbortController` timeout **is** gracefully handled (produces a real, retryable `security_status='error'`) — but an *outer* interruption (the whole function process being killed, e.g. by a platform execution-time ceiling, mid-scan) is not. The larger the file, the more realistic this failure mode becomes — directly relevant to the 100MB audio tier (see `k16f-scanner-operations.md`).

**Proposed correction** (not applied): extend the claimable set in `scanOrchestrator.ts` to also include a `'scanning'` row whose claim is older than a stale threshold (e.g. `scanned_at`/a new `claimed_at` timestamp older than 60 seconds) — a standard "claim timeout" pattern, letting a genuinely abandoned claim be re-acquired without weakening the duplicate-request protection for a claim that's still legitimately in flight.

## No other new vulnerabilities found

Direct manual UPDATE attempts against `security_status`/`review_status` by an authenticated admin (not just an ordinary user) were re-tested live and are still rejected at the GRANT level (`permission denied for table`, not merely an RLS policy miss) — this remains correctly locked down.
