# SIGNAL PORTAL — K1.6H.4 Rollback & Forward Recovery

Verified/reasoned 2026-11-12. Scenario A is backed by real evidence produced earlier this stage; B–F are reasoned from the existing, unchanged architecture (`k16f-rollback-plan.md` and its K1.6G/H.1/H.2/H.3 addenda) since no code in those paths changed this stage — re-deriving them from scratch would add nothing.

## Scenario A — a migration fails before completion (demonstrated for real this stage)

This actually happened, not hypothetically: the first migration-replay run (`k16h4-migration-replay.md`) hit a genuine failure mid-sequence (`storage.foldername` missing) on an unrelated moon-racer-vote migration. Because each migration file runs in its own transaction (`begin; ...; commit;`), the failed file's own changes rolled back cleanly and automatically — no partial schema was left behind, and every migration after the point of failure (including every Signal Portal one) still applied correctly once the missing piece was added and the whole sequence re-run from a fresh database. **Forward recovery (fix the gap, re-apply) was safer and simpler than any rollback** — there was nothing to roll back, since the failure was self-contained to its own transaction.

Applied to a real production apply: if any of the 12 pending migrations failed partway, the same per-file transaction boundary means only that one file's own changes are at risk, not the whole batch — but the project's real `supabase db push` behavior for a multi-statement migration file should be independently confirmed to use the same single-transaction-per-file semantics before relying on this exact safety property in production (this stage confirmed it for the **rehearsal harness's own `begin/commit` wrapping**, not for the Supabase CLI's own migration-apply transaction semantics, which is a related but distinct thing not independently tested here).

## Scenario B — Edge Function deployment fails

Not re-tested (no deployment mechanism available in a local-only rehearsal). Reasoned, unchanged: Edge Functions are stateless; a failed deploy leaves the previously-deployed version still live and serving traffic (`supabase functions deploy` does not take down the old version until the new one succeeds) — `k16f-rollback-plan.md`'s own standing analysis, not revised here.

## Scenario C — scanner unavailable

**Verified this stage, live, for real** (`k16h4-scanner-verification.md`): with Cloudmersive unreachable or misconfigured, `routeScanner`/`scannerConfig` fail closed — `unsupported`/`INVALID_SCANNER_CONFIG`/`WORKER_UNAVAILABLE`, never a fabricated clean verdict. New uploads remain blocked at `security_status='error'` or `'unsupported'`, never promoted.

## Scenario D — asset activation fails

**Verified this stage, live, for real** (`k16h4-security-verification.md`): every negative case (missing evidence, checksum mismatch, missing approval, infected, incomplete) left the asset at `upload_status` other than `'ready'` — private, never activated, confirmed by direct query after each failed attempt.

## Scenario E — frontend deployment fails

Not applicable to test directly (deployment is blocked by the standing "no commit/push" boundary regardless of success/failure). Reasoned: since this repository's "deployment" is a GitHub Pages commit of the `portal/` build output, a "failed deployment" in practice means the commit/push never happened — the previous version already live on `bearcubz.com/portal/` keeps serving unchanged until a new commit succeeds. There is no partial-deployment state possible with this architecture.

## Scenario F — scheduler misconfiguration

Not re-tested this stage (requires `pg_cron`, unavailable locally). Reasoned, unchanged from `k16f-rollback-plan.md`'s K1.6G addendum: `select cron.unschedule('<job-name>')` safely and instantly disables a job with zero data-loss risk either way — cleanup/recovery falls back to the existing admin-manual-retry path, which was itself re-verified this stage (`k16h4-security-verification.md`'s manual-claim test).

## Honest summary

**Demonstrated, not just documented, this stage**: A, C, D (all three with real evidence from real tests). **Reasoned from unchanged, already-documented architecture, not re-demonstrated**: B, E, F — none of their underlying mechanisms changed since the analysis in `k16f-rollback-plan.md` was written, so re-deriving them would not produce new information. Database migrations remain forward-only in general (per the standing analysis) — Scenario A's clean per-file transaction rollback is a narrower, real exception to that general rule, not a contradiction of it.
