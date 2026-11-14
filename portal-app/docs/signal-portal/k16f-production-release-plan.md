# SIGNAL PORTAL — K1.6F Production Release Plan

> K1.6H.1 controls current use: see the controlling addendum below. Historical instructions/counts are retained for context and must not be executed without that addendum. Production remains NO-GO and unauthorized.

**Nothing in this document has been executed.** Every production-facing item below is read-only reconnaissance performed during this audit (`supabase migration list` / `secrets list` / `functions list` / a read-only `db query` — none of these mutate anything) or a proposed future step.

**K1.6G update (2026-11-09):** both gaps identified below (oversized-file retention, stuck-`'scanning'`-state recovery) have since been resolved, implemented, and verified in dev — see `k16g-scan-recovery.md` and `k16g-retention-policy.md`. Step 2's migration set below now includes the 3 new K1.6G migrations (`20261110010000_signal_portal_scan_lease_recovery.sql`, `20261110011500_signal_portal_scan_claim_function.sql`, `20261110013000_signal_portal_scan_recovery_cron.sql`). The "What this plan does NOT include" section at the end is superseded accordingly.

## Read-only production vs. dev comparison (as of this audit)

| Area | Production (`drsidtagxezznqviupsr`) | Dev (`gcbonlvbgyhsgfayvlvz`) |
|---|---|---|
| Migrations | 17 applied, none from K1.6C onward | 28 applied (11 more: feedback_attachments, review, owner-policy-fix, scanning, cron-secret-fix ×2, zip-support, zip-storage-fix, scan-lease-recovery, scan-claim-function, scan-recovery-cron) |
| Edge Functions | 10 — the original base set only (`moon-racer-vote`, `portal-signed-url`, `portal-submit-feedback`, `portal-admin-list-invitations`, `portal-admin-create-invitation`, `portal-admin-reply-feedback`, `portal-admin-request-upload-url`, `portal-admin-confirm-upload`, `portal-admin-manage-collaboration`, `portal-request-access`) | 18 — the above plus 8 new: `portal-request-attachment-upload-url`, `portal-confirm-attachment-upload`, `portal-admin-review-attachment`, `portal-attachment-signed-url`, `portal-admin-cleanup-quarantine`, `portal-admin-reconcile-attachment-promotion`, `portal-admin-retry-attachment-scan`, `portal-scan-recovery` |
| Storage buckets | 3 (`collaboration-audio`, `collaboration-proposals`, `collaboration-visuals`) | 5 (the above plus `collaboration-attachments-quarantine`, `collaboration-attachments`) |
| Secrets | `MOON_RACER_DEVICE_PEPPER`, `PORTAL_REDIRECT_URL`, platform-injected `SUPABASE_*` | The above (minus the device pepper, plus) `CLOUDMERSIVE_API_KEY`, `SIGNAL_PORTAL_CRON_SECRET`, `SIGNAL_PORTAL_SYSTEM_UID` |
| Cron jobs | None | `signal-portal-dev-cleanup-quarantine` (daily, dev-only), `signal-portal-dev-scan-recovery` (every 2 minutes, dev-only) |
| System identities | None | `SIGNAL_PORTAL_SYSTEM_UID` (a real non-admin `auth.users` row for honest cron-triggered audit attribution) |
| Vault secrets | Unknown (not queried — no need, nothing in prod references Vault yet) | `signal_portal_cron_secret` |

No secret *values* were ever displayed, logged, or compared between environments — only names/presence.

## Proposed deployment sequence (NOT executed)

1. **Backup and recovery verification.** Confirm Supabase's own automated backup/PITR is active for the production project and that a restore has been test-verified recently, *before* applying anything. (This audit did not test a production restore — that is itself one of the two biggest open items; see the rollback plan.)
2. **Migration ordering.** There are **11** pending migrations. Do not run `db push` from this checkout: four historical files contain development scheduler SQL. Prepare and review the isolated scheduler-free release set described in the K1.6H.1 addendum below; reconcile history before an explicitly authorized apply — they were written and tested in that order against dev and have no out-of-order dependencies. Re-run the full dev pre-apply checklist (CLI linked to prod and *only* prod, migration not already applied, no conflicting pending migrations) immediately before.
3. **Storage configuration.** The two new buckets are created by migration 1 above — no separate manual step.
4. **Edge Function deployment.** Deploy the **8 new attachment/recovery functions** listed above, plus explicitly reviewed changed existing functions (notably portal-submit-feedback and portal-admin-reply-feedback), only after schema prerequisites pass — none depend on another already being live first, except that `portal-confirm-attachment-upload` and `portal-admin-retry-attachment-scan` both import `_shared/scanOrchestrator.ts`/`_shared/malwareScan.ts`, which deploy automatically as bundled dependencies (same mechanism already used throughout dev).
5. **Production secret configuration.** Set `CLOUDMERSIVE_API_KEY` to a **new, production-specific** free-tier Cloudmersive account/key — never the dev key. Set a **newly generated** `SIGNAL_PORTAL_CRON_SECRET` (never reuse the dev value).
6. **Cloudmersive free-tier verification.** Before relying on it, confirm the production key is live with one real, minimal test scan (same pattern as K1.6E.1's own verification) — do not assume a key "exists" means it "works."
7. **Cron secret generation.** Already covered in step 5 — called out separately in the brief, so noted explicitly here: generate with the same method used in dev (32 random bytes, hex-encoded), store via `supabase secrets set`, then insert into production's own Vault via the same out-of-band (non-committed) method used in dev.
8. **System identity creation.** Create a production `SIGNAL_PORTAL_SYSTEM_UID` — a real, dedicated, non-admin `auth.users` row, the same pattern as dev. Never reuse the dev UID (it refers to a user that doesn't exist in the production auth schema at all).
9. **Cleanup and scan-recovery scheduler configuration.** This is the one step requiring **deliberate, separate reconsideration**, not a copy-paste of the dev migrations: both dev `pg_cron` jobs (`signal-portal-dev-cleanup-quarantine`, `signal-portal-dev-scan-recovery`) were explicitly authorized for dev only. Production's `pg_cron` schedules must be re-reviewed (e.g. for `vault.decrypted_secrets` access control considerations, actual acceptable cadence — the 2-minute scan-recovery cadence was chosen for dev-speed verification and should be re-considered for production load) and re-approved before being enabled — not auto-applied via the same migration files, since those files' own cron.schedule SQL blocks are dev-authorization-scoped.
10. **Frontend deployment.** Standard build + deploy once the above backend steps are live and verified.
11. **Production security smoke tests.** A minimal real-data pass (not the full 171-test dev integration suite, which uses disposable test identities unsuitable for production) — at minimum: one real authorized upload → scan → approve → retrieve cycle, one real cross-project denial check, one real unauthorized-signed-URL-denial check, using accounts created specifically for this purpose.
12. **Artist package activation** — separate from (13) below; this is enabling XYLØ's and Issey's *existing dev-validated* collaboration records in production (creating the real production rows), not inviting them yet.
13. **Artist invitation preparation** — drafting/queuing the actual invitation, explicitly **not sent** by this stage or this plan. Sending an invitation is a distinct, separate, final decision for the project owner.

Steps 12–13 are deliberately listed last and separately, per the brief's "Separate technical deployment from artist invitations" instruction — the technical rollout (1–11) can be fully complete and verified while 12–13 remain pending a separate go/no-go decision.

## What this plan does NOT include

**Superseded by K1.6G (2026-11-09):** this section originally deferred fixing the two gaps found in `k16f-security-audit.md` (oversized-file retention, stuck-`'scanning'`-state recovery) pending a decision — see `k16f-open-decisions.md`. Both have since been resolved and verified in dev (see `k16g-scan-recovery.md`, `k16g-retention-policy.md`), and their migrations are now included in the production migration set at step 2 above. What remains genuinely outside this plan: purchasing/upgrading Cloudmersive for production, generating production-specific secrets, and sending artist invitations — all explicitly out of scope for every development stage to date, per each stage's own authorization boundary.


## K1.6H.1 controlling release addendum — 2026-11-09

**NO-GO. Production deployment remains unauthorized.** This addendum supersedes conflicting counts, blanket migration/deletion instructions and assumptions about asset clearance above. See k16h1-deployment-checklist.md, production-prerequisites and asset-transfer-plan for current gates. Production backups=[] and PITR=false were observed read-only. Existing production storage has four private buckets including avatar-images (the earlier comparison counted only three portal buckets).

The complete 11-file pending order is:

1. 20261109040000_signal_portal_feedback_attachments.sql
2. 20261109063400_signal_portal_attachment_review.sql
3. 20261109071500_signal_portal_attachment_owner_policy_fix.sql
4. 20261109090000_signal_portal_attachment_scanning.sql
5. 20261109091500_signal_portal_cron_secret_fix.sql
6. 20261109092000_signal_portal_cron_header_fix.sql
7. 20261109150000_signal_portal_zip_attachment_support.sql
8. 20261109151500_signal_portal_zip_storage_mime_fix.sql
9. 20261110010000_signal_portal_scan_lease_recovery.sql
10. 20261110011500_signal_portal_scan_claim_function.sql
11. 20261110013000_signal_portal_scan_recovery_cron.sql

Files 4, 5, 6 and 11 execute terminal cron.schedule statements naming development jobs and development HTTP endpoints. Applying them blindly would create inappropriate cross-environment jobs. Do not edit applied development history to hide this. `node supabase/scripts/prepare-k16h1-release.mjs` generates a new local temporary migration set and source/prepared SHA-256 manifest, stripping only those terminal scheduler statements while preserving schema SQL and chronological versions. Generation was exercised successfully; no SQL was executed. The prepared set needs isolated database replay/SQL verification, approved provenance/checksum reconciliation and a newly reviewed deployment allowlist before production execution. Existing approved-migrations.manifest does not authorize this new stage; do not silently expand it.

Future command sequence (illustrative, NOT authorized now): generate and inspect release set; copy reviewed config/functions into a separate release worktree; review `supabase migration list --remote=drsidtagxezznqviupsr` and `supabase db push --help`/dry-run capability; validate exact pending set; obtain owner approval for that artifact; use the production guard only after its reviewed manifest explicitly covers the new artifacts. Do not use a bare db push in this source checkout. Keep existing historical versions intact and retain both manifests as deployment evidence.

Deploy the eight new functions after schema readiness: portal-request-attachment-upload-url, portal-confirm-attachment-upload, portal-admin-review-attachment, portal-attachment-signed-url, portal-admin-cleanup-quarantine, portal-admin-reconcile-attachment-promotion, portal-admin-retry-attachment-scan, portal-scan-recovery. Review existing-function diffs before redeploying (including feedback submission/replies and request-access); preserve verify_jwt and independently reviewed authorization. Function command form after approval: `supabase functions deploy <reviewed-name> --remote=drsidtagxezznqviupsr --yes` through the approved deploy guard, not an unreviewed blanket deploy.

Provision the exact configuration names in k16h1-production-prerequisites.md only after authorization. Keep 2,900,000-byte artist/scanner caps aligned with frontend. Do not purchase a plan. Verify one deliberate production scanner smoke with retained evidence, then separately enable reviewed production-only schedulers using supabase/scripts/k16h1-production-schedulers.sql; it uses production endpoints and refuses without an explicit approval setting. Review global quota monitoring before recovery is enabled.

Build to a staging directory first (`npm run build -- --outDir <staging-dir>`); validate production target and bundle before separate frontend deployment approval. Never overwrite the current public portal bundle as a side effect of preflight. Production security smoke uses dedicated test identities and no real artist credentials/invitations. Asset activation requires the exact-byte security process in the transfer plan: the existing administrator asset-confirmation endpoint does not itself scan. Originals and pending artwork stay truthful and private. Complete all Gates A–D and obtain explicit Gate E authorization before any production change.


## K1.6H.2 controlling addendum — 2026-11-09

Production remains BLOCKED / NO-GO and unauthorized. The proposed pending set is now twelve migrations: H1's scheduler-free eleven plus 20261110020000_signal_portal_dual_scanner_evidence.sql. That migration was applied only to development. See k16h2-release-manifest.md for the exact function, schema, worker and configuration changes and k16h2-test-results.md for current evidence. Native SQL replay passed with explicit platform shims; full Supabase/cron replay remains unverified. No genuine ClamAV runtime exists yet; artist cap stays 2,900,000, default provider Cloudmersive, fallback disabled, current admin transfer cap 50MiB. Production recovery still has no verified backup/restore and PITR is disabled.

Do not roll new asset data back to old confirm/signed-URL code that ignores scan/review evidence. Keep evidence/checksum/lease/review columns, portal_scanner_usage and audit history after real data exists; stop new upload entry points/worker dispatch and retain private objects during containment. Revert only a reviewed compatible function/frontend set. A pre-data reverse migration would need to retire H2 callers, remove dependent trigger/validators/claim functions/usage objects and restore the preceding attachment RPC deliberately; no reverse SQL is executed here. Legacy exemptions are not clearance and must not be imported into production. Changing secrets or removing the worker must fail closed, never set clean or widen upload limits. A verified recovery artifact and separate explicit production authorization are still required.
