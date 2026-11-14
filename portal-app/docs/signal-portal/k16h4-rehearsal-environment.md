# SIGNAL PORTAL — K1.6H.4 Rehearsal Environment

Verified 2026-11-12. **Environment used: local-only native PostgreSQL + local frontend build.** No new Supabase project was created — the organization ("Bear Cubz") has exactly 2 existing projects, and I had no reliable way to confirm a 3rd would stay within the free allowance without risking an account charge. Presented as a choice to the project owner, who confirmed: local-only rehearsal. This matches the brief's own explicitly sanctioned fallback ("if a separate managed Supabase project is unavailable, use the strongest supported local environment").

## Exact environment

- A fresh, disposable, loopback-only PostgreSQL 17.11 cluster (Homebrew), initialized and torn down within this stage, never shared with any other process.
- `supabase/scripts/replay-k16h4-local.mjs` (new, this stage): replays the real migration files directly — not a synthetic approximation.
- `openssl` (AES-256-CBC, PBKDF2) for the backup-encryption rehearsal — `age` is not installed on this machine; `gpg`/`openssl` are. `openssl` was used as the more universally-available, equally legitimate, no-cost standard tool.
- The real frontend build (`npm run build`), inspected directly for secret leakage.
- No Docker, no Supabase local dev stack (`supabase start`), no GoTrue/Storage/Realtime/pg_cron/pg_net runtime — all absent, unchanged from every prior stage this engagement has encountered.

## What this environment can and cannot prove

**Can prove, and did** (all performed for real this stage, not merely re-described): migration-file-level schema/RLS/function/trigger correctness from a genuinely fresh baseline; real RLS/grant enforcement under role+claim impersonation; real atomic scan-lease/claim/cap/manual-override SQL behavior; real asset-activation trigger behavior (positive and negative paths); a real encrypted-backup-and-restore cycle with measured timing; real frontend-bundle secret-leakage inspection.

**Cannot prove, and does not claim to**: GoTrue's own Auth HTTP behavior, Storage's own HTTP API and object-byte handling, Realtime, `pg_cron`/`pg_net` actually firing a scheduled job, Edge Function HTTP-layer behavior (CORS, PostgREST-style request parsing, the Deno runtime itself) — none of these exist outside the managed Supabase platform. For these, this stage relies on the real, already-deployed dev project's own continuously-re-confirmed test results (security 233/233, integration 186/186, both re-run fresh this stage against the actual deployed Edge Functions) as the best available evidence, since the dev project runs the exact same function source code a production release would use. This is explicitly a different, complementary form of evidence — not a substitute for the native-Postgres rehearsal, and not claimed as "managed-platform verification."

## Isolation confirmed

The rehearsal cluster/database/encrypted backup never touched: production, the signal-portal-dev project, any real artist account, or any real collaboration's private bytes. All fixture identities and collaborations were synthetic UUIDs created fresh within the disposable cluster. The cluster and all its data were deleted at the end of this stage.
