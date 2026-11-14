# SIGNAL PORTAL — K1.6I Production Deployment Record

Executed 2026-11-13/14. **Production deployment status: LIVE**, with one known, explicitly flagged gap (Cloudmersive key not yet provisioned — see below). This record is the authoritative account of what was actually done to `drsidtagxezznqviupsr` ("moon-racer-passport").

## 1. Pre-deployment verification

- Confirmed project identifiers against the repo and a live CLI check (never relied on the persistent link, which stayed pointed at dev throughout).
- Confirmed all 12 pending migration files' SHA-256 checksums exactly match the values recorded in `k16h3-pending-migration-hashes.json` — zero drift since rehearsal.

## 2. Production backup (mandatory first operation — completed, verified)

Real logical backup (schema + data) of production taken via native `pg_dump`, using the Supabase CLI's `--dry-run`-generated connection script executed directly (its ephemeral credential was never printed to any visible output or log). Encrypted with `openssl aes-256-cbc`/PBKDF2. Decrypt round-trip verified byte-identical via SHA-256. Restored into an isolated local PostgreSQL database with zero errors in the application schema (39 errors, all in platform-managed `auth`/`storage` internals, `supabase_vault`, `supabase_realtime` — the same category already documented in every prior rehearsal stage). Representative data confirmed: 19 real tables, zero real collaborations/members/feedback/assets (production had none before this deployment), exactly 1 `portal_admins` row (the real project owner).

**Stored at**: `~/.signal-portal-backups/production-backup-pre-k16i-20261113T005702Z.sql.enc` (+ a sibling `.passphrase` file, `600` permissions, outside the repository, never committed). **Recovery procedure**: decrypt with `openssl enc -d -aes-256-cbc -pbkdf2 -salt -in <file> -pass file:<passphrase-file>`, then restore into a fresh Postgres database with the platform shims documented in `k16h3-free-tier-recovery.md`/`k16h4-backup-restore.md`. **The project owner should move this file to their own long-term secure storage** (password manager, encrypted drive) — this is a working copy, not a managed backup service.

## 3. Database migrations — applied and verified

All 12 pending migrations applied via `supabase db push` against a staging workdir containing scheduler-free variants of the 4 files that originally contained `cron.schedule(...)` calls pointed at the **development** project's own URL/anon key (never executed against production — see the inline comments left in those 4 production-applied variants, explaining the omission and pointing to the real production cron jobs created separately in step 5). The other 8 files applied completely unmodified.

**Post-migration verification (live, direct SQL, not assumed)**: 29/29 migrations now show applied; 21 public tables, 21/21 RLS-enabled; 23 Signal-Portal-specific functions present (matching the rehearsal's own count exactly); `claim_attachment_for_scan`/`claim_asset_for_scan`/`claim_attachment_for_manual_scan` all exist with `SECURITY DEFINER` and `service_role`-only execute grants (confirmed via `pg_proc.proacl`, never `anon`/`authenticated`); both `attachment_available_requires_clearance` and `attachment_exact_byte_clearance` CHECK constraints present.

## 4. Production secrets configured

| Secret | Status |
|---|---|
| `SIGNAL_PORTAL_CRON_SECRET` | **Set** (freshly generated, 32 random bytes hex-encoded) — set both as an Edge Function secret and inserted into production Vault under `signal_portal_cron_secret`. A first-attempt value was discarded after it was accidentally partially echoed in a psql error message during a permission-troubleshooting step; the value actually in use now was never printed anywhere. |
| `SIGNAL_PORTAL_SYSTEM_UID` | **Set** — a real, dedicated, non-admin `auth.users` row created in production (`51097a5d-2174-4ea0-83f7-fc697d22400a`), modeled on the real admin row's own column conventions, never added to `portal_admins`, never able to authenticate (no valid password hash). |
| `PORTAL_ARTIST_UPLOAD_MAX_BYTES` | Set explicitly to `2900000` for auditability (matches the code's own default). |
| `PORTAL_SCANNER_PROVIDER_MODE` | Set explicitly to `cloudmersive` for auditability (matches the code's own default; ClamAV categorically cannot activate without also setting a worker URL/token, which remain unset). |
| `CLOUDMERSIVE_API_KEY` | **NOT SET — genuine, flagged gap.** No production-specific Cloudmersive account/key exists anywhere accessible to this deployment. Scanning fails closed (`security_status='error'`, nothing becomes available) without it — this is a functionality gap, not a security hole. **Owner action needed**: provide a production Cloudmersive API key (a new account/key, never the development one). |

## 5. Edge Functions deployed

14 functions deployed via `supabase functions deploy --use-api` (no Docker needed): all 11 new Signal-Portal-attachment/scanning/asset-security functions, plus redeployment of the 3 existing functions whose code changed (`portal-admin-request-upload-url`, `portal-admin-confirm-upload`, `portal-signed-url`). Verified via `functions list`: all 21 functions (14 touched + 7 pre-existing + `moon-racer-vote`, untouched) show `status: ACTIVE`; `portal-scanner-worker-access` correctly shows `verify_jwt: false` (its own dedicated bearer check), every other function correctly shows `verify_jwt: true`.

## 6. Storage

No manual bucket configuration was needed — the 2 new buckets (`collaboration-attachments`, `collaboration-attachments-quarantine`) were created automatically by the migrations themselves, already correctly private (`public: false`) with the right MIME-type allowlists and size limits, matching the existing 3 buckets exactly. RLS is enabled on `storage.objects`; by design, no SELECT policies exist for any Signal Portal bucket — all real file access is mediated exclusively through Edge-Function-issued signed URLs, never direct client RLS access (the same architecture every prior stage documented and tested).

## 7. Production scheduled jobs — created and verified genuinely executing

| Job | Schedule | Status |
|---|---|---|
| `signal-portal-prod-cleanup-quarantine` | `0 3 * * *` (daily, 03:00 UTC) | Active; has not fired yet (next run is the next 03:00 UTC) |
| `signal-portal-prod-scan-recovery` | `*/5 * * * *` (every 5 minutes — deliberately more conservative than dev's 2-minute interval, a production-specific cadence choice) | Active; **already fired once for real, genuine 200 response**: `{"ok":true,"reclaimed":0,"retried":0,"exhausted":0}` — confirmed via `net._http_response`, proving the full `pg_cron → pg_net → gateway JWT check → X-Signal-Portal-Cron-Secret check → function logic` chain works end to end in production |

Both jobs use the real production URL and the real production publishable key (public, safe to embed) — never a development URL or key.

## 8. Frontend deployed

Built locally (`npm run build`), bundle inspected for secret leakage (none found — only the public production URL and the public `sb_publishable_` key, plus one harmless UI-text mention of an env var *name*). Committed **only** the `portal/` build output (5 files, a minimally-scoped diff — confirmed via `git status` before committing that nothing else was swept in) and pushed to `origin/master`. GitHub Pages rebuilt and the live site at `bearcubz.com/portal/` now serves the new build (confirmed by fetching the live page and matching the new asset hashes). The rest of `bearcubz.com` (root, `/events/`, `/vote/`) confirmed still serving normally.

**Note for the project owner**: this is the first git commit/push of this entire K1.6 development series. The actual backend source (migrations, Edge Functions, shared modules, frontend attachment/scanning components, and all documentation from K1.6B through K1.6I) remains uncommitted in the working tree — only this one frontend-build commit now has git history. Whether and when to commit the rest is a separate decision this deployment did not make unilaterally.

## 9. Production smoke tests — real, against the live production project

| # | Test | Result |
|---|---|---|
| 1 | Portal loads | `bearcubz.com/portal/` → 200, confirmed serving the new build |
| 2 | Authentication flow | `portal-request-access` with a never-invited email → genuine `{"ok":true}` neutral response |
| 3 | Unauthorized users denied | Anonymous direct table read → `permission denied for table collaborations`; unauthenticated calls to `portal-admin-scanner-status` and `portal-request-attachment-upload-url` → non-2xx |
| 4 | Administrator access / isolation | Two disposable synthetic artist identities + one disposable synthetic collaboration, created and destroyed entirely within this deployment: Artist A (real member) sees it; Artist B (not a member) sees 0 rows; Artist B cannot see Artist A's membership row either |
| 5 | Private Storage remains private | Buckets confirmed `public: false`; no SELECT policy exists on `storage.objects` for any Signal Portal bucket |
| 6/7 | Eligible files receive genuine scanning / infected-or-unscanned cannot become available | Direct attempt to mark a disposable synthetic asset `ready` without evidence → correctly blocked (`ASSET_SECURITY_NOT_CLEARED`). Full real upload→Cloudmersive-scan pipeline could not be exercised end-to-end, since production has zero real collaborations/members to upload through yet and `CLOUDMERSIVE_API_KEY` is not yet set (see Section 4) — the config-level fail-closed behavior is otherwise identical to the extensively-proven dev/rehearsal behavior |
| 8 | Administrator approval works | Same asset-activation gate test as above — the gate itself is proven; a full "approve via the real admin UI" pass was not performed (no real admin credentials were used or should be, by this deployment) |
| 9 | Signed URLs enforce authorization | Covered by the grant-level/RLS tests above — no path exists to a signed URL without passing through the gated Edge Functions |
| 10 | Artist collaboration isolation | Directly proven, disposable fixtures, item 4 above |
| 11 | Scheduled jobs execute correctly | `signal-portal-prod-scan-recovery` genuinely fired and returned a real 200; `signal-portal-prod-cleanup-quarantine` is correctly scheduled and will fire at the next 03:00 UTC (same auth mechanism already proven working by the scan-recovery job) |
| 12 | Existing website functionality intact | `bearcubz.com`, `/events/`, `/vote/` all still 200 |

Every disposable fixture created for smoke testing (2 synthetic auth identities, 1 synthetic collaboration, 1 synthetic membership row, 1 synthetic asset row) was deleted immediately after use — production is confirmed back to its exact pre-test state (0 real collaborations, 1 real admin, 0 members, 0 assets).

## What remains before this is a fully working production system for real artists

1. **`CLOUDMERSIVE_API_KEY`** — the one missing required secret. Scanning fails closed without it; nothing is broken, but no real artist upload can ever complete until this is provided.
2. **Real collaboration/artist data transfer** — production has zero collaborations. The legacy-asset production-byte evidence, artist invitations, and artwork approvals all remain separate, explicitly deferred future steps, exactly as instructed.
3. **Backend source control** — flagged above, an owner decision, not resolved here.
