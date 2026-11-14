# SIGNAL PORTAL — K1.6H.3 Release Manifest

**Executive status: BLOCKED. Production deployment: NO-GO and NOT authorized.** Everything below is a prepared plan, cross-referenced against genuine evidence gathered this stage and in K1.6H.1/K1.6H.2 — nothing was executed against production.

## A. Database

Apply the 12 pending migrations (unchanged set, checksums in `k16h3-pending-migration-hashes.json`) in their existing chronological order, using the scheduler-free prepared variant for the four containing dev-named cron blocks (per `k16f-rollback-plan.md`'s standing instruction) — never a raw `db push` of the dev-named files. Full dependency table: `k16h3-migration-validation.md`.

## B. Edge Functions

Deploy, in any order (no inter-dependency beyond already-bundled shared modules): `portal-request-attachment-upload-url`, `portal-confirm-attachment-upload`, `portal-admin-review-attachment`, `portal-attachment-signed-url`, `portal-admin-cleanup-quarantine`, `portal-admin-reconcile-attachment-promotion`, `portal-admin-retry-attachment-scan`, `portal-scan-recovery`, `portal-admin-review-asset`, `portal-scanner-worker-access`, `portal-admin-scanner-status`. Changed existing functions: `portal-admin-request-upload-url`, `portal-admin-confirm-upload`, `portal-signed-url`. Deployment source hashes: `k16h2-deployment-hashes.json` (K1.6H.2, unchanged — no function source has changed since).

## C. Storage

No new bucket configuration beyond what K1.6G/K1.6H.2 already specify (5 private buckets, deny-by-default policies, ZIP MIME allowance fix). Confirm production's global Storage size ceiling before enabling any upload path near the dev-discovered 50MiB limit — **do not assume production shares dev's exact ceiling**; this was never independently checked against production in any stage, including this one (no production mutation authority to test it directly; the owner or a read-only platform-settings check should confirm before relying on the `PORTAL_ADMIN_UPLOAD_MAX_BYTES=52428800` default).

## D. Secrets

See `k16h3-production-secrets.md` for the complete categorized inventory and provisioning order. In short: `CLOUDMERSIVE_API_KEY` (new), `SIGNAL_PORTAL_CRON_SECRET` (new), `SIGNAL_PORTAL_SYSTEM_UID` (new production row) are required; every ClamAV-only name must stay unset.

## E. Scanners

**Cloudmersive: enabled** (the default when `PORTAL_SCANNER_PROVIDER_MODE` is left unset — live-verified this stage). **ClamAV: disabled** — live-verified this stage that no realistic partial/incorrect configuration can accidentally activate it; the existing scanner abstraction, local worker, ZIP validation, leases, and evidence recording are all preserved exactly as K1.6H.2 built them, not rebuilt.

## F. Scheduler

Two production-specific cron jobs (cleanup, scan-recovery), each requiring its own freshly-generated `SIGNAL_PORTAL_CRON_SECRET` Vault entry and a deliberately re-reviewed cadence (not a copy of dev's 2-minute scan-recovery interval, chosen for dev-speed verification, not production load) — per the standing instruction in `k16f-rollback-plan.md`'s K1.6G addendum, unchanged.

## G. Frontend

Build (`npm run build` from `portal-app/`) and deployment is, by this repository's own architecture, "commit the `portal/` output and push to the branch GitHub Pages serves" — there is no separate deploy pipeline to describe. This step is categorically blocked by the standing "do not commit or push" authorization boundary regardless of any other gate's status.

## H. Assets

No real artist asset byte transfer is proposed by this manifest. Both real collaborations' 9 legacy rows remain exactly where and as they are (preserved, inventoried, genuinely locally revalidated as not malware — see `k16h3-legacy-asset-security.md`) — none are approved transfer candidates until each receives genuine security evidence for its **exact production bytes**, which do not exist yet. No artwork optimization candidate (`k16h3-artwork-optimization.md`) is proposed for upload.

## I. Verification (post-deployment smoke tests, to run after a real deployment — not performed here)

1. Migration count matches 29 total on production.
2. One minimal generated-fixture Cloudmersive scan (`k16h3-production-scanner-policy.md`'s documented procedure) using a disposable test account.
3. One real cross-project/cross-identity denial check using disposable accounts.
4. One real unauthorized-signed-URL-denial check.
5. Confirm `PORTAL_SCANNER_PROVIDER_MODE` is absent or `cloudmersive` in the live function environment (not just the secret list — a misapplied deploy could theoretically differ).

## J. Rollback

Unchanged from `k16f-rollback-plan.md` (now with a K1.6H.3 addendum) — forward-only migrations, safe-to-drop only before real production data depends on new schema, fix-forward after that point. The genuine restore capability demonstrated this stage (`k16h3-free-tier-recovery.md`) improves confidence but is explicitly **not** a verified production backup.

## K. Release gates (clearly unresolved — not marked complete without evidence)

| Gate | Status |
|---|---|
| Production backup/PITR | **Unresolved.** `backups=[]`, `pitr_enabled=false`, confirmed in K1.6H.2, not re-checked this stage (cannot have changed without a purchase the owner declined). A genuine **dev** restore succeeded this stage; production has never been backed up or restored. |
| Production hosting for a future ClamAV worker | **Unresolved**, and explicitly not required for this release per the owner's own decision. |
| Legacy-asset production-byte evidence | **Unresolved** — no production bytes exist yet to evidence. |
| Full Docker-based Supabase replay | **Unresolved** — Docker still absent. |
| Global Storage ceiling on production | **Unverified** — only dev's 50MiB ceiling was ever directly measured. |

This manifest is complete as a plan. No gate above is marked resolved without the evidence cited next to it, and no gate is silently omitted.
