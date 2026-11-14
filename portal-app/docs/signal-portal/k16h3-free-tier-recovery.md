# SIGNAL PORTAL — K1.6H.3 No-Cost Database Recovery

Verified 2026-11-12. All commands below ran against the isolated development project (`gcbonlvbgyhsgfayvlvz`) only — the "safe, authorized non-production source" the brief specifies. Nothing in this section touched production (`drsidtagxezznqviupsr`); production backup inspection remains read-only (see K1.6H.2's `k16h2-production-recovery.md`, still accurate and unchanged).

## Available tooling (verified present, no installation performed)

`pg_dump`/`pg_restore`/`psql`/`initdb`/`pg_ctl` 17.11 via Homebrew (`/opt/homebrew/bin/`), matching the dev project's own Postgres 17.11 exactly. The Supabase CLI's own `db dump` command exists but its non-dry-run execution path requires Docker (`DockerRunError: docker: command not found`) even when targeting `--remote` — Docker remains absent on this machine (unchanged from K1.6H.2). Workaround: the CLI's `--dry-run` flag prints the exact `pg_dump` invocation (connection parameters plus a documented `sed` pipeline that strips platform-managed schemas/roles/extensions) without executing anything; that script was captured directly to a file and executed with the native `pg_dump` binary, never printing the ephemeral connection credential it contains to any visible output, a log, or this documentation. The script file was deleted immediately after use.

## Backup performed

Two real logical dumps of `gcbonlvbgyhsgfayvlvz`, using Supabase's own documented flag set (`--schema-only --exclude-schema "...platform schemas..."` for structure; `--data-only --use-copy` for rows):

| Artifact | Size | SHA-256 |
|---|---:|---|
| `schema.sql` | 86,478 bytes | `ad267b85c3c3ed298ed63f751f2765a1613dd1ca6d0a1cb8116104db314d0077` |
| `data.sql` (deleted after restore verification — contained real private row data; never committed) | 3,353,707 bytes | `c65eb0b045e44eee245dc8208f4b51b1ca3a9b3f41e91c4525329b8c29edb52c` |

One genuine warning during the data dump (not an error): a circular foreign-key constraint between `player_avatar` and `avatar_generations` — tables belonging to the shared `moon-racer-vote` system in this same Supabase project, not Signal Portal. `pg_dump` noted this might require `--disable-triggers` on restore; not encountered as an actual failure in the restore test below, but worth carrying into any real production backup procedure for this project.

## Restore test (genuine, against an isolated local database — not development, not production)

A fresh, disposable PostgreSQL 17.11 cluster was initialized via `initdb` under the session scratchpad, bound to `127.0.0.1:55491` only (never a shared or network-reachable instance), and stopped/deleted at the end of this test.

**First attempt** (no shims): schema restore produced 215 errors — all of them exactly the platform-managed objects a correctly-scoped application dump excludes by design: `role "postgres"/"authenticated"/"service_role"/"anon" does not exist` (148 of the 215), `schema "auth" does not exist` (30), `schema "extensions" does not exist` (3), `extension "pg_cron"/"pg_net"/"supabase_vault" is not available` (3), plus 11 `function public.is_portal_admin(...)` failures that cascade from the missing `auth` schema their definitions reference.

**Second attempt**, with minimal shims (4 placeholder roles, an `auth` schema containing only a stub `auth.uid()` returning `NULL` and an empty `auth.users` table, an empty `extensions` schema — `k16h3-backup/shims.sql`, not committed, no secrets): schema restore completed in **0.64 seconds** with exactly 5 remaining errors, all genuinely unavoidable outside the managed platform: `publication "supabase_realtime" does not exist`, `function auth.jwt() does not exist` (a second auth function the minimal shim didn't stub — known, not chased further), and the same three missing extensions.

**Data restore**: 0.05 seconds, 36 errors, **every single one** against `auth.*` (`sessions`, `refresh_tokens`, `mfa_factors`, `sso_providers`, `webauthn_*`, `oauth_*`, etc.) and `storage.*` tables — confirming that Supabase's own data-only dump genuinely includes row data for these platform-managed schemas (not just `public`), which cannot be restored into a vanilla Postgres instance without reproducing GoTrue/Storage's own internal schema — correctly out of scope for a logical-dump-based recovery of the **application** data.

**Zero errors in the application's own `public` schema data.** Verified structurally and by content, not merely by exit code:

| Check | Result |
|---|---|
| Tables in `public` | 21 restored, 21/21 with RLS enabled |
| Functions in `public` | 23 restored, including `claim_attachment_for_scan`, `claim_asset_for_scan`, `is_portal_admin`, `portal_asset_security_cleared`, `valid_portal_scan_evidence` — all present and correctly named |
| Triggers | 4 restored |
| Row counts | `collaborations`=5, `collaboration_feedback_attachments`=1, `collaboration_assets`=15, `portal_admins`=4, `portal_admin_audit_log`=999 — **every count exactly matches a fresh live query against the real dev project**, run independently after the restore |
| Real content spot-check | Restored `collaborations.title` rows include the real `"THE GHOST IN THE SIGNAL"` and `"LOST TRANSITION"`; restored `collaboration_assets.byte_size` values include `2388252`, `2113685`, and `210264` — the exact, previously-documented byte counts for XYLØ's demo, Issey's demo, and XYLØ's optimized proposal, confirmed byte-for-byte, not merely present |

This is a genuine, reproducible, measured restore — not a claim from documentation alone.

## What this does NOT prove

- **Not a production restore.** This used development data from an authorized safe source, per the brief's own instruction. Production has never been backed up or restored; `k16h2-production-recovery.md`'s findings (`backups=[]`, `pitr_enabled=false`) are unchanged.
- **Not full Supabase parity.** `auth`/`storage` schema *structure* (not just data), Realtime publications, GoTrue/Storage's own HTTP runtime, and the `pg_cron`/`pg_net`/`supabase_vault` extensions are platform-managed and cannot be reproduced by a logical dump + vanilla Postgres, shimmed or not. Scheduled-job (`pg_cron`) definitions and Vault secret *values* are not in this dump at all — the cron job SQL text lives in the migration files already tracked in this repo, and Vault secret values must be re-entered via `supabase secrets set` / Vault directly, never recovered from a dump.
- **Not a measurement of production-scale restore time.** 0.64s + 0.05s reflects this dev project's current small data volume (5 collaborations, 999 audit rows). Restore time will grow with real data volume and must be re-measured once production has real content.
- **Private Storage object bytes** are not in a `pg_dump` at all (Storage only stores path/size/mime metadata in `storage.objects`, itself platform-managed and excluded here). The separately-proven process for this is the one already used throughout K1.6F/K1.6H.1/K1.6H.2: enumerate real objects via the admin Storage client and download+SHA-256 each one independently — already demonstrated working for all 9 real legacy assets (see `k16h1-asset-transfer-plan.md`, re-confirmed in `k16h3-legacy-asset-security.md`).
- **Authentication configuration, OAuth/SMTP settings, and other platform/project settings** are not in any database dump and have no automated recovery path demonstrated here; they would need to be manually reconfigured via the Supabase dashboard/Management API from documented settings.

## Production backup procedure (prepared, not executed)

1. **Pre-migration backup** (every production migration, going forward): `supabase db dump --remote=drsidtagxezznqviupsr --schema-only -f schema-<timestamp>.sql` and `... --data-only --use-copy -f data-<timestamp>.sql`, run from an operator machine with the Supabase CLI's own temporary login-role mechanism (never a long-lived stored production DB password). Requires: a Supabase account with read access to the production project (same CLI auth already in use for read-only inspection); no new permission grant.
2. **Expected artifacts**: two `.sql` files per backup (schema + data), plus a computed SHA-256 for each, recorded in a manifest — never the files themselves — committed anywhere.
3. **Storage location**: encrypted, off-platform (e.g., an encrypted archive uploaded to a separate, access-controlled location the owner already controls) — never this Git repository, never an unencrypted location. This stage does not select or provision a specific storage destination; that is an owner decision (see the final report).
4. **Encryption**: the dump files contain real private collaboration content (feedback text, asset metadata) and must be encrypted at rest before leaving the operator's machine (e.g., `age`/`gpg` with an owner-held key) — not configured or demonstrated in this stage, since no real backup was taken and no key material should be generated speculatively.
5. **Integrity verification**: SHA-256 each artifact immediately after creation and again before any restore attempt; mismatch means do not restore.
6. **Restore steps**: exactly the procedure genuinely exercised above — fresh isolated Postgres, apply the same minimal platform shims (`k16h3-backup/shims.sql` pattern), restore schema then data with `ON_ERROR_STOP=0`, confirm only the known platform-schema errors appear, verify table/row counts against a separate live read against the source project, then additionally restore Storage object bytes via the separate object-download process.
7. **Known limitations**: everything under "What this does NOT prove" above applies identically to a real production restore — platform-managed schema/extensions/Realtime/Vault/Auth-config are not covered and need their own, separate recovery procedure, which this stage documents as a requirement, not a solved problem.

Never place a database dump containing private data into Git. Never expose the CLI's ephemeral database credential or any production credential in logs, documentation, or chat output — confirmed handled correctly throughout this exercise (the credential was piped directly between two local processes and never appeared in any file this document references).

## Recovery objectives (proposed, not guaranteed)

| Objective | Proposed value | Basis |
|---|---|---|
| RPO | ≤24 hours under normal operation; ≤0 (immediate pre-migration backup) around any production migration | A daily logical backup plus an always-taken pre-migration backup, per the procedure above |
| RTO | **Unproven at production scale.** This stage measured 0.64s + 0.05s restore of schema+data on a 5-collaboration dev dataset. A real RTO figure requires re-measuring against actual production data volume once any exists. Budget planning should assume this scales roughly linearly with row/object count until re-measured. | Direct measurement above, explicitly not extrapolated past what was tested |
| Retention | 30 daily encrypted backups + 4 weekly, matching K1.6H.2's own proposal (unchanged, still reasonable, not newly re-derived here) | Carried forward from `k16h2-production-recovery.md` |
| Storage object backup | Same cadence as the database backup, via the separate object-download-and-hash process | Consistent with "preserve all private collaboration materials" |

**Explicit limitation of operating without PITR** (the owner's own already-made decision, not re-litigated here): any write that happens after the most recent backup and before a failure is genuinely lost — there is no continuous recovery point. A daily cadence means worst-case data loss of up to 24 hours of artist feedback/attachments/collaboration changes, except immediately around a migration (where a fresh pre-migration backup bounds the loss to whatever happened during that single deployment window). This is a real, accepted tradeoff, not a guarantee that nothing will ever be lost.
