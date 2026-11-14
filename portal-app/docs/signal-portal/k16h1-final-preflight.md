# SIGNAL PORTAL — K1.6H.1 final preflight

2026-11-09. **Executive readiness: BLOCKED. Deployment recommendation: NO-GO.** Development fixes and local release preparation are authorized; production deployment is not. No commit, push, production mutation, invitation, credential transfer or purchase occurred.

## Completed work

The K1.6G implementation was inspected in the actual migrations, orchestrator, recovery/cleanup functions, frontend upload policy and review/signed-URL paths. Existing systems were preserved. The recovery function's stale introductory comment was corrected to match its existing scan_request_id=null invalidation; no scan behavior was rewritten.

| Required property | Evidence / current scope |
|---|---|
| Scan leases | Atomic service-role-only claim RPC issues fresh UUID and lease; live k16g regression passes |
| Stale completion protection | Every terminal write filters scan_request_id; expired-lease reclamation nulls it; live stale-write test passes |
| Automatic retries bounded | Three attempts, backoff, five eligible rows/run; live exhaustion/idempotency tests pass |
| Manual retries audited | Admin auth plus retry audit events; explicit cap exception remains |
| Oversized retention | 30-day expiry, excluded from seven-day sweep, no automatic retries |
| Cleanup and scans | Active-lease exclusion inspected; live regression covers unexpired lease |
| Artist scanner-capacity cap | Frontend and backend defaults 2,900,000 bytes, server rejects before transfer; deployed production overrides still to provision |
| ZIP validation | Metadata pre-filter before mandatory real Cloudmersive; 23 local ZIP assertions pass |
| Scanner mandatory | Eligible attachment confirmations use scanner; errors/oversize never become clean |
| Approval mandatory | Attachment available requires security clean AND review approved; signed-URL path rechecks |
| Artist isolation | Live integration regression; production smoke remains a release gate |
| Optimized audio accessible | Read-only Storage downloads succeed, exact bytes/hash manifest recorded; no audio replacement |
| Proposals accessible | Both private source objects download; browser canvas/page-navigation outcomes in test-results |
| Artwork state truthful | Both development cover approvals remain pending; primary-cover flags not treated as approval |

These scanner/approval statements describe the attachment workflow. The older administrator asset workflow only verifies storage existence/length; do not extend attachment guarantees to it by assumption. See asset-transfer-plan for the explicit production release hold.

## Accessibility

Exact reproduced failure was inactive rows in the administrator Asset Library's detailed table, not the adjacent Collaborations report. Selector source: AssetsTab.tsx row inline opacity:0.45. Axe reported td text #6d6b73 on #07070d at 3.82:1 and a .sp-admin__pill #046b7b on #07070d at 3.24:1; required 4.5:1 for normal 13px / 9px text. Removed whole-row opacity and added explicit Inactive text using the existing pill style. Resulting text #e7e4ef measures 16.02:1 and cyan #00e5ff 13.06:1 against the same observed background. Focused axe analysis of both tab views reports no violations; inactive-row computed opacity is 1. No dashboard redesign.

## Browser findings

The handoff's final three failures were the deterministic contrast issue, artist refresh and quick-reply timing. Other historical failures included transient page-structure axe findings and classification-save feedback. Existing tests often read after fixed sleeps. Changed only relevant checks to wait for real visible dashboard content, request completion, Saved feedback and main/heading landmarks; feedback submission now asserts a unique new message appears in the actual thread, preventing prior fixture text from masking a failure. No timeout increase or removed assertion.

A focused-run filter now reports skipped checks explicitly to avoid repeated full live-backend runs. A production guard was added to the browser entry point before setup/mutations. During this stage an accidental edit briefly made the administrator entrance-refresh check look for an artist project title; the in-flight full run loaded that error. It was corrected immediately and independently rechecked. Exact results: security 233 passed / 0 failed / 0 skipped; integration 185 / 0 / 0; full browser 176 / 1 / 0 (temporary agent test edit); final focused browser 7 / 0 / 170. All seven focused final-code checks passed, including the corrected administrator refresh. No observed application/browser failure remains unresolved. A fresh 177/177 final-code full run is not claimed. Details: k16h1-test-results.md.

## Production prerequisites and Cloudmersive

Read-only production backup API: backups=[], pitr_enabled=false (walg_enabled=true does not prove a usable restore). Production still has 17 migrations, 10 base functions, four private buckets and zero stored bytes. pg_cron/pg_net and the eight attachment/recovery endpoints are absent. Portal callback URL is configured. Production scanner key, cron secret and system UID secret names are absent; account quotas, production SMTP, runtime limits and production scan operation remain unverified. Full detail and exact configuration names: k16h1-production-prerequisites.md.

Owner-approved free tier retained: artist and scanner caps 2,900,000 bytes, matching frontend. No purchase. Keep larger-file architecture, fail closed, preserve manual artistic review separately, use bounded retries and quota monitoring. Default drift tests do not prove environment overrides agree. Uncontrolled global usage is an operational consideration: per-file retry caps do not enforce a monthly account budget.

## Assets, rollback and release artifacts

All nine source objects hashed; six active candidates recorded in k16h1-source-assets.json and the transfer plan. Both optimized audio lengths match handoff. Original hash-bound scan evidence was not independently recovered; source asset rows do not represent clearance. Production must scan and approve exact production bytes before readiness/activation. Artwork above the free-tier cap remains pending/private until an approved scanning process exists.

Updated k16f rollback and production plans preserve history while superseding unsafe counts/instructions. Eleven pending migrations include four development cron blocks; do not blindly db push. A local preparation script generates a scheduler-free set and dual checksum manifest without editing applied migrations. A separately gated production scheduler SQL template uses production endpoints and Vault names; neither prepared SQL nor rollback SQL was executed. Isolated replay and approved deployment-manifest reconciliation remain prerequisites.

## Outstanding owner decisions only

1. Authorize and fund/provide a suitable verified backup/recovery approach with explicit recovery objectives; PITR is currently disabled. No purchase is made in this stage.
2. Approve a concrete K1.6H.2 release artifact only after unresolved infrastructure, security-evidence and migration-replay gates close. Deployment is not implied by this preflight.
3. Approve the production free-tier key/secret provisioning and scheduler cadence/operational quota owner at that later stage.
4. Approve a security process for larger artwork and package activation once exact-byte evidence exists. Artwork artistic approval and invitation sending remain separate explicit decisions.

No new decision is requested on the already-approved free-tier policy. Stop at K1.6H.1; see k16h1-deployment-checklist.md for Gates A–E.
