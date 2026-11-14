# SIGNAL PORTAL — K1.6F Rollback Plan

> K1.6H.1 controls current use: see the controlling addendum below. Historical instructions/counts are retained for context and must not be executed without that addendum. Production remains NO-GO and unauthorized.

Nothing in this document has been executed against production. This is preparation only.

## Rollback limitations — read carefully before any production apply

**Database migrations in this project are forward-only.** There is no `down` migration mechanism in use anywhere in this repository's history — every migration applied so far (production's existing 17, and dev's 25) is a plain forward SQL file. This means:

- **Before any data is written** using the new schema (i.e., before any real artist uploads a real attachment in production), rollback is straightforward: a human-authored *reverse* migration (drop the new columns/constraint/policies/buckets/cron job) can be written and applied, because there is nothing depending on the new state yet.
- **After real data exists** (a real attachment row, a real file in the new Storage buckets), rollback is **not safely automatic**. Dropping `collaboration_feedback_attachments` or its new columns would permanently destroy real artist-uploaded content and its audit trail. The `attachment_available_requires_clearance` CHECK constraint in particular cannot be removed without first deciding what to do with any row it currently protects.
- **Recommendation:** treat the migration step as a one-way door the moment the first real artist attachment is uploaded in production. Rollback planning before that point is "delete the new schema objects." Rollback planning after that point is "feature-flag/disable the new UI entry points while leaving the schema and data intact" — not a database rollback at all.

## Rollback by stage

| If a problem is found... | ...and no real attachment data exists yet | ...and real attachment data exists |
|---|---|---|
| During/after migrations (step 2) | Drop the 8 new schema objects in reverse order via a hand-written reverse migration | Do not drop schema. Investigate and fix forward. |
| During/after Edge Function deploy (step 4) | Remove the 7 new functions via `supabase functions delete` | Same — functions are stateless; removing them is always safe, but leaves any already-written rows in whatever state they're in (no further processing happens, nothing is corrupted) |
| During/after secrets/cron setup (steps 5–9) | `supabase secrets unset`, `cron.unschedule(...)` — both safe, reversible, no data impact | Same |
| After frontend deploy (step 10) | Redeploy the previous frontend build/commit | Same — the frontend has no persistent state of its own |
| After artist package activation (step 12) | Delete the created production collaboration rows (no real artist has seen them yet) | N/A — this step precedes any real artist interaction by definition |
| After artist invitation sent (step 13) | **Out of scope for a technical rollback** — this is a human/communications problem, not a database one, if it ever happens after step 13 | Same |

## What "rollback" does NOT mean here

Rolling back the **cleanup scheduler** specifically (step 9) is always safe and instant (`cron.unschedule`) — it only ever deletes already-abandoned/rejected quarantine objects on a schedule; disabling it just means that cleanup reverts to the existing admin-manual-button path, with zero data-loss risk either way.

Rolling back the **Cloudmersive integration** specifically is also always safe: removing `CLOUDMERSIVE_API_KEY` simply makes every future scan fail closed to `security_status='error'` (the same honest, non-destructive behavior already verified throughout K1.6E/K1.6E.1 when no key is configured) — it does not corrupt or lose anything already scanned.

## Recommended pre-production gate

Given the two real gaps found in this audit (`k16f-security-audit.md`), the project owner should decide whether to require both fixed-and-re-verified-in-dev *before* production migration, since fixing them *after* real production data exists is architecturally harder (the retention-policy fix in particular changes which rows a scheduled job is allowed to touch, and doing that safely against real, already-written production rows needs its own careful one-time reconciliation pass, not just a code change).


## K1.6H.1 controlling rollback addendum — 2026-11-09

This section supersedes older object/function counts and statements that deleting functions/secrets is always safe. No rollback was executed. Production migrations are forward-only. Production currently has no verified backup and PITR is disabled: **database rollback/recovery readiness is blocked**.

### K1.6G dependency inventory

| Migration | Introduced objects | Dependency |
|---|---|---|
| 20261110010000_signal_portal_scan_lease_recovery.sql | 10 attachment columns: scan_attempt_count, scan_started_at, scan_lease_expires_at, scan_last_error, scan_next_retry_at, scan_completed_at, scan_request_id, awaiting_scanner_capacity, scan_waiting_since, scan_retention_expires_at; 3 partial indexes: collaboration_feedback_attachments_stale_lease_idx, collaboration_feedback_attachments_retry_eligible_idx, collaboration_feedback_attachments_retention_expiry_idx | Existing attachment/scanning schema; consumed by all current scan/recovery/cleanup functions and admin UI |
| 20261110011500_signal_portal_scan_claim_function.sql | SECURITY DEFINER public.claim_attachment_for_scan(uuid,uuid,integer); PUBLIC/anon/authenticated execution revoked; service_role granted | Lease columns; consumed by confirm-upload/admin retry/recovery orchestrator |
| 20261110013000_signal_portal_scan_recovery_cron.sql | Development job signal-portal-dev-scan-recovery, every 2 minutes; HTTP to development portal-scan-recovery | pg_cron, pg_net, Vault, cron secret, system identity, deployed recovery function |

New Edge Function: portal-scan-recovery. Changed endpoints include portal-confirm-attachment-upload, portal-admin-retry-attachment-scan, portal-admin-cleanup-quarantine and portal-request-attachment-upload-url; all relevant bundled shared modules must roll together. New schema must remain until every dependent function version is retired. Do not deploy a K1.6F cleanup function over K1.6G data: it could delete oversized-held files after seven days.

### Safe containment, in order

1. Stop artist upload/retry entry points and pause production recovery/cleanup schedules after incident authorization. Record job IDs and original active/cadence configuration. Example prepared SQL only: `select cron.unschedule('signal-portal-prod-scan-recovery');` and `select cron.unschedule('signal-portal-prod-cleanup-quarantine');`. Verify target first. Do not run development-named commands against production blindly.
2. Preserve tables, buckets, exact objects, audit logs and original security/review states. Export row/object manifests and capture deployment hashes. Do not invalidate scan identities or manually mark files clean to unstick an incident.
3. Inspect in-flight leases and provider request state. Let healthy active scans settle; recover expired leases through the approved recovery function, which clears stale request IDs, retains failure evidence and bounds retries. Never run quarantine cleanup to solve a stuck scan.
4. Roll frontend back only to a compatible artifact; disable new upload entry points while keeping privacy/authorization. Existing attachment data may no longer be renderable by an older frontend; assess accessibility and artist communications explicitly.
5. Revert functions only as a reviewed compatible set. Removing signed-URL, review or reconciliation functions interrupts retrieval/processing, even if it does not directly delete rows. Unsetting the scanner key fails future scans closed but can accumulate errors and retry calls; pause scheduling first. Never restore a pre-hardening function version that lacks lease/retention/clearance safeguards.

### Schema reversal boundary

Only before ANY dependent production row/object exists, and after disabling schedules and all writers, may an explicitly reviewed reverse migration be considered. Reverse dependency order: disable/remove production scheduler; retire dependent functions; drop claim_attachment_for_scan(uuid,uuid,integer); drop the three indexes; then remove the ten lease/retention columns. Earlier attachment schema may be reversed only after separately proving no references, objects, audits or production usage exist. No CASCADE and no generic table/bucket deletion recipe. Capture migration history and reconcile any reverse migration as a new forward version; never erase history.

After real data exists, keep schema/security constraints and fix forward. Lease identity conflicts, genuine scan history, pending promotions, quarantined retained files, active memberships or real user interactions require a forward fix or read-only containment, not destructive reversal. Approval/cleanliness/retention facts must not be rewritten as a rollback shortcut.

### Recovery and preservation requirements

Verify a recent production database backup, restore usability, retention window, account scope and RPO/RTO BEFORE deployment. PITR requires a separately verified enabled service/retention window; it is not currently available. Any alternative must have an owner-approved, restore-tested recovery objective. A database restore does not establish recovery of Storage object bytes: keep encrypted independent backups of all private buckets and hash manifests, object metadata, collaboration ownership/references, scan evidence and audit logs. Test restoration in an isolated environment under separate authorization, never by resetting live production in this stage.

A future incident restore requires separate owner authorization and a plan to reconcile writes after the restore point, Auth identities, Storage objects, signed-URL expiry and migration/function compatibility. Retain oversized quarantined bytes through their 30-day policy; do not delete/replace existing artist audio or silently approve artwork. If exact object bytes or trustworthy scan evidence cannot be restored, keep delivery blocked and rescan through the security workflow.


## K1.6H.2 controlling addendum — 2026-11-09

Production remains BLOCKED / NO-GO and unauthorized. The proposed pending set is now twelve migrations: H1's scheduler-free eleven plus 20261110020000_signal_portal_dual_scanner_evidence.sql. That migration was applied only to development. See k16h2-release-manifest.md for the exact function, schema, worker and configuration changes and k16h2-test-results.md for current evidence. Native SQL replay passed with explicit platform shims; full Supabase/cron replay remains unverified. No genuine ClamAV runtime exists yet; artist cap stays 2,900,000, default provider Cloudmersive, fallback disabled, current admin transfer cap 50MiB. Production recovery still has no verified backup/restore and PITR is disabled.

Do not roll new asset data back to old confirm/signed-URL code that ignores scan/review evidence. Keep evidence/checksum/lease/review columns, portal_scanner_usage and audit history after real data exists; stop new upload entry points/worker dispatch and retain private objects during containment. Revert only a reviewed compatible function/frontend set. A pre-data reverse migration would need to retire H2 callers, remove dependent trigger/validators/claim functions/usage objects and restore the preceding attachment RPC deliberately; no reverse SQL is executed here. Legacy exemptions are not clearance and must not be imported into production. Changing secrets or removing the worker must fail closed, never set clean or widen upload limits. A verified recovery artifact and separate explicit production authorization are still required.


## K1.6H.3 controlling addendum — 2026-11-12

Production remains BLOCKED / NO-GO and unauthorized; no migration file has changed since K1.6H.2 — the pending set is still exactly the same twelve, re-verified live via `migration list` against both projects (see `k16h3-migration-validation.md` for fresh checksums). This stage's own contribution: a genuine logical schema+data backup and restore test of the real dev project (not production) succeeded with exact row-count and content parity after minimal platform-role/schema shims — see `k16h3-free-tier-recovery.md`. This materially improves confidence that the schema is internally consistent and recoverable, but does **not** change the rollback analysis above (still forward-only, still "fix forward after real data exists") and does **not** establish a verified production backup — production's own `backups=[]`/`pitr_enabled=false` state is unchanged and still blocks any production rollback/recovery claim.

No scanner provider mode, worker URL, or worker token should ever be set in a way that activates ClamAV routing in production for this release — `k16h3-production-scanner-policy.md` documents the live-verified fail-closed behavior if any of those are set incorrectly or incompletely. If a future incident requires disabling scanning, unsetting `CLOUDMERSIVE_API_KEY` remains the same always-safe fail-closed action already documented above; it still does not corrupt or lose anything already scanned.
