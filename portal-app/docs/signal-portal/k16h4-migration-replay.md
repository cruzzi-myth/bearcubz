# SIGNAL PORTAL — K1.6H.4 Migration Replay

Verified 2026-11-12, by a genuinely new, more rigorous replay than K1.6H.2's — that stage hand-waved the pre-Signal-Portal baseline with synthetic shim fixtures ("portal baseline (7)"); this stage replayed **all 17 real production-baseline migration files**, including the 10 unrelated moon-racer-vote/passport ones that predate Signal Portal in this shared project, followed by the real 12 pending ones — 29 real files total, zero synthetic substitution for any of them.

## Rechecked before proceeding (per the brief's own instruction not to assume)

Live `migration list` against both projects, re-run fresh this stage: development still 29/29 applied, production still 17 applied / 12 pending — unchanged from K1.6H.3, confirmed again rather than assumed.

## Replay process and result

`supabase/scripts/replay-k16h4-local.mjs` (new): minimal platform shims (4 roles, `auth`/`storage`/`extensions`/`cron` schema stubs including `auth.uid()` and the real standard `storage.foldername()` helper — a genuine, precisely-identified gap found on the first run, not assumed in advance), then every migration file applied in exact chronological order, each in its own transaction, scheduler `cron.schedule(...)` blocks stripped before execution (never run against any real endpoint).

**First run: 28/29 applied, 1 failure** — `20260822215446_avatar_phase1_species_foundation.sql` (an unrelated moon-racer-vote migration) failed on `function storage.foldername(text) does not exist`. Added the missing shim (the real, standard Supabase Storage helper function — a simple, well-known `string_to_array`-based implementation, not invented). **Second run, fresh database: 29/29 applied, 0 failures.**

Crucially, **zero Signal-Portal migrations ever depended on the one that failed** — every Signal Portal migration applied cleanly on both runs, confirming Signal Portal's own migration set has no hidden dependency on the unrelated moon-racer-vote schema beyond what both already share (the `auth.users` table and the `pgcrypto` extension, both present and correctly shimmed throughout).

Full per-file manifest (filename, SHA-256, baseline/pending phase, status): `k16h4-native-replay-evidence.json`.

## Resulting schema, verified structurally (not assumed from a successful exit code)

| Check | Result |
|---|---|
| Public tables | 21 |
| RLS-enabled public tables | 21/21 |
| Public functions | 59 (23 Signal-Portal-specific + real moon-racer-vote/passport functions + `pgcrypto` extension functions — all genuinely replayed, not shimmed away) |
| Triggers | 4 |
| `claim_attachment_for_scan` grant | `service_role` + the native superuser role only — **not** `anon`/`authenticated`, confirmed via `information_schema.routine_privileges` |
| `SECURITY DEFINER` correctness | `claim_attachment_for_scan`, `claim_asset_for_scan`, `claim_attachment_for_manual_scan`, `is_portal_admin` all `prosecdef=true`; `enforce_portal_asset_security`/`portal_asset_security_cleared` correctly `prosecdef=false` (plain functions used inside a trigger/check, not meant to run with elevated privilege) |

## What this still does not establish (same honest limitation as K1.6H.2/K1.6H.3, re-stated, not newly resolved)

`pg_cron`/`pg_net` scheduler execution, GoTrue/Storage HTTP runtime, and Realtime remain unverified outside the managed platform — Docker is still absent. This replay is strictly stronger evidence than K1.6H.2's own (real files vs. synthetic baseline substitution) but does not close that specific gap, which requires either Docker or a second managed Supabase project — neither available this stage, per the owner's own confirmed choice (`k16h4-rehearsal-environment.md`).
