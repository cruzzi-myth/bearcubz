# SIGNAL PORTAL — K1.6H.3 Production Migration Validation

Verified 2026-11-12 by live, read-only `supabase migration list` against both the real dev and real production projects (never assumed from a prior stage's documented count — the brief's own instruction, since the repository could have changed in the two days since K1.6H.2).

## Current migration state (re-verified live, unchanged from K1.6H.2)

- **Development** (`gcbonlvbgyhsgfayvlvz`): 29 migrations, all applied, `local === remote` for every one — no drift.
- **Production** (`drsidtagxezznqviupsr`, read-only check only): 17 applied (through `20261108080000`), **12 pending** — the same twelve K1.6H.2 already identified (the eleven from K1.6G/K1.6H.1 plus `20261110020000_signal_portal_dual_scanner_evidence.sql`). No new migration file has been added to the repository since K1.6H.2; the pending set is unchanged.

## Pending-migration checksums (freshly computed this stage)

SHA-256 of all 12 pending migration files, computed directly from the files on disk via `hashlib.sha256`: see `k16h3-pending-migration-hashes.json`. Re-verify against this file immediately before any real production apply — if a single byte of any of these files changes between now and deployment, the hash will catch it.

## Dependencies, RLS, trigger, and function changes across the 12 pending migrations

Unchanged from the K1.6H.1/K1.6H.2 rollback-plan addenda (`k16f-rollback-plan.md`) — not re-derived here since the migration files themselves have not changed:

| Migration | Introduces | Depends on |
|---|---|---|
| `20261109040000` feedback_attachments | `collaboration_feedback_attachments` table, its RLS policies, 2 Storage buckets | Existing `collaboration_feedback`/`collaborations` schema |
| `20261109063400` attachment_review | `review_status`, review RLS | Attachment table above |
| `20261109071500` owner_policy_fix | Narrows "uploader sees own row" RLS to active members only | Attachment table/RLS above (real security fix, found and fixed in K1.6D) |
| `20261109090000` attachment_scanning | `security_status`, `security_scan_detail`, `attachment_available_requires_clearance` CHECK, `pg_cron`/`pg_net` extensions, first cron job | Attachment table above; `pg_cron`/`pg_net` availability on the target project |
| `20261109091500`/`20261109092000` cron fixes | Two real, found-live auth fixes to the cron job's own header/secret handling | Prior migration's cron job |
| `20261109150000`/`20261109151500` ZIP support | `application/zip` in the app-level MIME check and the Storage bucket's own `allowed_mime_types` (two separate, independently-discovered gaps) | Attachment table above |
| `20261110010000` scan_lease_recovery | 10 lease/retention columns, 3 partial indexes | Attachment table above; consumed by every scan/recovery/cleanup function |
| `20261110011500` scan_claim_function | `claim_attachment_for_scan(uuid,uuid,integer)`, service-role-only | Lease columns above |
| `20261110013000` scan_recovery_cron | Dev-only `signal-portal-dev-scan-recovery` cron job (dev-named; **production deployment must use the scheduler-free prepared variant, never this file verbatim** — see `k16f-rollback-plan.md`'s existing warning, unchanged) | Claim function above; `pg_cron`/`pg_net`; Vault cron secret; system UID |
| `20261110020000` dual_scanner_evidence | `collaboration_assets` security columns + `enforce_portal_asset_security` trigger, `claim_asset_for_scan`, `claim_attachment_for_manual_scan` (atomic-cap fix, `CREATE OR REPLACE` over the prior claim function — same signature, additive behavior, re-verified no regression in `k16h3-test-results.md`), `portal_scanner_usage` table + RLS, `attachment_exact_byte_clearance` CHECK | Lease/claim functions above; `collaboration_assets` table |

**Rollback limitations**: unchanged from `k16f-rollback-plan.md`'s existing, still-accurate analysis — forward-only migrations, safe-to-drop only before any real production row depends on the new schema, "fix forward" after that point. Not re-derived here.

## Isolated replay (this stage's own contribution: strengthened, not just repeated)

K1.6H.2 already performed a native (Docker-free) PostgreSQL 17 replay of all 19 historical+H2 transactions with minimal platform shims. This stage went further and performed a **full, genuine logical backup-and-restore test** of the real dev project's actual current schema and data (not a migration replay, a different and complementary verification) — see `k16h3-free-tier-recovery.md` for the complete, measured result: 21 tables (21/21 RLS-enabled), 23 functions, 4 triggers restored cleanly with only platform-managed-schema errors remaining after minimal shims, and exact row-count/content parity confirmed against a fresh live query. This is independent, additional evidence that the current schema (including all 12 pending migrations' cumulative effect, since dev already has them applied) is internally consistent and restorable — not a substitute for a full Supabase/Docker-based replay, which remains unverified because Docker is still absent on this machine.

**Still not claimed**: full Supabase parity (Auth/Storage HTTP runtime, Realtime, `pg_cron`/`pg_net`/`supabase_vault` extension behavior) outside the managed platform. This matches K1.6H.2's own honest scope statement exactly; nothing changed here.

## Production migration plan (database only — see `k16h3-release-manifest.md` for the full ordered sequence across all categories)

1. Verify CLI link targets production only (`--remote=drsidtagxezznqviupsr`, confirmed, never relying on the persistent link — same discipline used throughout this verification).
2. Re-run the checksum comparison in `k16h3-pending-migration-hashes.json` immediately before applying.
3. Apply the scheduler-free prepared variant of the migration set (per `k16f-rollback-plan.md`'s existing, unchanged instruction) — never the raw dev-named cron migrations.
4. Apply in exact chronological order shown above; no out-of-order dependency exists among them.
5. Confirm post-apply: `migration list --remote=drsidtagxezznqviupsr` shows all 12 now `local===remote`; spot-check `information_schema.tables`/`pg_trigger`/`pg_proc` counts the same way this stage did against dev.

This remains a **plan**, not an executed action — no production migration was applied in this stage.
