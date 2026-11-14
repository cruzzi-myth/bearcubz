# SIGNAL PORTAL — K1.6G Oversized-File Retention Policy

Implementation date: 2026-11-09. Resolves K1.6F security-audit Gap 1 (`k16f-security-audit.md`): oversized files were being silently deleted by the generic 7-day abandoned-cleanup rule, with no path back to a rescan.

## The two populations this policy distinguishes

1. **New uploads going forward** — blocked entirely before they ever reach quarantine by the launch policy (`k16g-artist-upload-policy.md`). An artist cannot newly create an oversized row at all once the launch cap is in effect.
2. **Pre-existing oversized files** (uploaded before the launch policy existed, or — in dev — directly simulated to represent that population) — these must remain retrievable and rescannable, never silently deleted, and never promised indefinite storage.

These are deliberately different populations governed by different rules; section 5 (block new oversized uploads) and section 4 (preserve and retain existing oversized files) of the brief are not in tension once this distinction is made explicit.

## Representation

No new `security_status` enum value was added. An oversized-but-unscannable file is represented as `security_status='error'` with `security_scan_detail` starting `EXCEEDS_SCANNER_SIZE_LIMIT`, plus three new fields:

- `awaiting_scanner_capacity boolean` — `true` for this specific failure mode only.
- `scan_waiting_since` — set when the oversized error is first recorded.
- `scan_retention_expires_at` — set to `scan_waiting_since + 30 days` at the same time.

30 days was chosen as a concrete, finite number per the brief's own constraint ("Do not promise indefinite storage without an approved retention policy") — not invented arbitrarily; it is long enough to allow a deliberate administrator decision (upgrade the scanner tier, or author a smaller replacement) without indefinite accumulation.

A row with `awaiting_scanner_capacity=true` is **never** auto-retried (`claimAndRunScan`'s error branch computes `scan_next_retry_at` only when the error category is NOT `unsupported_file_size`) — only an administrator-initiated manual retry (`source='manual_admin_retry'`, bypassing the automatic-attempt cap) can clear it, per the brief's "administrator-authorized rescan" requirement.

## Cleanup function rewrite (`portal-admin-cleanup-quarantine`)

The `abandoned` query (the generic 7-day sweep) now explicitly excludes `awaiting_scanner_capacity=true` rows (`.eq('awaiting_scanner_capacity', false)`), so an oversized file is never caught by the generic rule regardless of how long it's been sitting.

A **separate** `retentionExpired` query was added: `awaiting_scanner_capacity=true AND scan_retention_expires_at < now()`. Only rows matching this — i.e., genuinely past their own 30-day retention window — are added to the cleanup set.

Two additional `.or(...)` clauses were added to the `abandoned` query to also exclude rows with an active scan lease or an active promotion attempt still within a 10-minute grace window (`PROMOTION_GRACE_MINUTES`), closing a related correctness gap found while rewriting this function: the original query had no such exclusions at all, meaning a row legitimately mid-scan or mid-promotion past 7 days old (plausible for a slow artist-review cycle) could be swept.

## Real verification performed

Six real scenarios (A–F) were run directly against the live dev database in one pass:

| Scenario | Setup | Expected | Result |
|---|---|---|---|
| A | Active scan lease, 8 days old | Survives | Survived |
| B | Ordinary abandoned row, 8 days old | Cleaned | Cleaned |
| C | Active promotion attempt, 8 days old | Survives | Survived |
| D | Stuck promotion (grace window expired), 8 days old | Cleaned | Cleaned |
| E | Oversized, retention not yet expired | Survives | Survived |
| F | Oversized, retention expired | Cleaned | Cleaned |

Result: `cleaned: 3`, matching exactly B + D + F. This also validated that supabase-js's chained `.or()` calls combine as AND-ed OR-groups (each `.or()` call adds one OR-group, ANDed across calls) — a correctness property of the query builder that had not been previously confirmed in this codebase.

Permanent coverage: `tests/integration/scenarios/k16g.mjs` (oversized retention fields present and correct, cleanup-vs-active-lease, admin-recovery-of-an-oversized-row-using-the-same-real-bytes).
