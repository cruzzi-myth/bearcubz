# SIGNAL PORTAL — K1.6G Scan Recovery

Implementation date: 2026-11-09. Resolves K1.6F security-audit Gap 2 (`k16f-security-audit.md`): a row stuck in `security_status='scanning'` previously had no recovery path.

## Schema (migration `20261110010000_signal_portal_scan_lease_recovery.sql`)

The K1.6F audit's own existing schema already had `security_status`, `security_scan_detail`, and `scanned_at` (K1.6E), but no lease/attempt bookkeeping. Ten new columns were added — none pre-existed:

| Column | Purpose |
|---|---|
| `scan_attempt_count` | Incremented atomically on every claim; gates the automatic-retry cap. |
| `scan_started_at` | Set on claim. |
| `scan_lease_expires_at` | Set on claim to `now() + 180s`; the recovery scheduler's stale-lease detector. |
| `scan_last_error` | The most recent `error`-branch detail string. |
| `scan_next_retry_at` | When set, the scheduler's eligibility filter for an automatic retry. |
| `scan_completed_at` | Set on every terminal write-back (clean/infected/error). |
| `scan_provider` | Pre-existing (K1.6E) — unchanged. |
| `scan_request_id` | A fresh UUID per claim; every write-back is gated on this matching, which is the actual stale-write defense (see below). |
| `awaiting_scanner_capacity` | See `k16g-retention-policy.md`. |
| `scan_waiting_since` / `scan_retention_expires_at` | See `k16g-retention-policy.md`. |

Three partial indexes support the scheduler's own queries without a full-table scan: stale-lease, retry-eligible, retention-expiry.

## Atomic claim (migration `20261110011500_signal_portal_scan_claim_function.sql`)

`claim_attachment_for_scan(p_attachment_id, p_request_id, p_lease_seconds)` is a `security definer` SQL function, granted to `service_role` only. It performs one atomic `UPDATE ... SET security_status='scanning', scan_request_id=$2, scan_started_at=now(), scan_lease_expires_at=now()+interval, scan_attempt_count=scan_attempt_count+1, scan_last_error=null WHERE id=$1 AND security_status IN ('pending','error') RETURNING ...`.

This exists because supabase-js's `.update({...})` cannot express `column + 1` as part of one atomic statement — a separate read-then-write would reopen the exact claim race this function exists to close.

## Orchestrator rewrite (`supabase/functions/_shared/scanOrchestrator.ts`)

`claimAndRunScan(adminClient, attachmentId, bytes, filename, mimeType, source, scanOptions)`:

1. Pre-checks `MAX_AUTOMATIC_SCAN_ATTEMPTS` (3) — skipped only for `source === 'manual_admin_retry'`, since an administrator's own authenticated, audited retry is the brief's own "explicit, audited recovery policy" exception (section 2).
2. Generates a fresh `scan_request_id`, calls the claim function.
3. Runs the real scan.
4. Writes back the verdict with `.eq('id', attachmentId).eq('scan_request_id', requestId)` on every branch (clean / infected / error). If the lease was reclaimed in the meantime, this match fails and the stale write is silently discarded — a late response can never overwrite a newer result.

`ClaimSource` is `'auto' | 'manual_admin_retry' | 'scheduler_retry'` — `portal-confirm-attachment-upload` passes `'auto'`, `portal-admin-retry-attachment-scan` passes `'manual_admin_retry'`, `portal-scan-recovery` passes `'scheduler_retry'`.

Error-branch write-back now also classifies the failure via `scanRetryPolicy.ts`'s `categorizeScanError`/`isAutoRetryable`/`computeBackoffSeconds`, and separately diverts size-limit errors into the `awaiting_scanner_capacity` retention path (never auto-retried; see `k16g-retention-policy.md`) rather than scheduling a `scan_next_retry_at`.

## Recovery scheduler (`portal-scan-recovery`, migration `20261110013000_signal_portal_scan_recovery_cron.sql`)

Runs every 2 minutes via `pg_cron`, same authentication pattern established in K1.6E (`portal-admin-cleanup-quarantine`): the real anon key as `Authorization` (satisfies the Edge Runtime's own gateway JWT check), and a separate `X-Signal-Portal-Cron-Secret` header as the real authorization, checked by `requireAdminOrSystem`. All actions are audit-logged under the dedicated `SIGNAL_PORTAL_SYSTEM_UID`.

**Pass 1 — stale-lease reclaim.** Any row with `security_status='scanning'` and an expired `scan_lease_expires_at` is reclaimed back to `'error'`, with `scan_last_error='LEASE_EXPIRED'` and a backoff-computed `scan_next_retry_at`. Critically, this reclaim **also sets `scan_request_id` to `null`** — found and fixed as a real bug during this stage's own end-to-end verification (see below).

**Pass 2 — eligible retries.** Up to 5 eligible rows per run (`scan_next_retry_at` in the past, attempts not exhausted) are retried sequentially — never concurrently, respecting Cloudmersive's ~1 request/second rate limit — via `claimAndRunScan(..., 'scheduler_retry')`.

## Bug found and fixed during real end-to-end verification

The first version of pass 1's reclaim UPDATE set `security_status`/`scan_last_error`/`scan_lease_expires_at`/`scan_next_retry_at` but never cleared `scan_request_id`. A simulated "late write-back using the old (now-superseded) request id" still matched and overwrote the reclaimed row — verified concretely: after the simulated late write, `security_status` incorrectly read back as `'clean'` instead of staying `'error'`. Fixed by adding `scan_request_id: null` to the reclaim UPDATE. Re-verified: all 6 real verification steps passed, including the late-write-discard check.

## Real verification performed

A disposable ad hoc script (run via `node`, not committed) against the live dev project confirmed, in order: (1) a fresh claim sets all lease fields correctly; (2) a second concurrent claim attempt on the same row is rejected (`claimedRow` null); (3) a stale lease (manually backdated `scan_lease_expires_at`) is reclaimed by a simulated scheduler pass; (4) a late write-back using the original (now-stale) `scan_request_id` is silently discarded; (5) a genuinely new claim after reclaim succeeds and completes normally; (6) `scan_attempt_count` reaches the cap after 3 automatic attempts and a 4th automatic attempt is refused while a manual admin retry (`source='manual_admin_retry'`) still succeeds.

Permanent coverage: `tests/integration/scenarios/k16g.mjs` (lease fields, concurrent-claim rejection, stale-write discard, idempotent double-run, max-attempts-exhaustion-vs-manual-override).
