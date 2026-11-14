# K1.6H.1 — Production prerequisites

Read-only inspection on 2026-11-09; production drsidtagxezznqviupsr, development gcbonlvbgyhsgfayvlvz. No production mutation.

| Prerequisite | Current evidence | Release status |
|---|---|---|
| Project | ACTIVE_HEALTHY; PostgreSQL 17.11.0.003 | Verified |
| Backup | `backups list` returns backups=[]; walg_enabled=true | BLOCKER: no verified recent recoverable backup or restore evidence |
| PITR | pitr_enabled=false | Unavailable; owner must approve and verify an adequate recovery solution before release |
| Migration baseline | 17 applied through 20261108080000 | Verified; 11 pending files, not 8 |
| Extensions | plpgsql, pg_stat_statements, uuid-ossp, pgcrypto, supabase_vault | pg_cron and pg_net absent; required before scheduling |
| Scheduler | cron.job relation absent | No production scheduler; do not promote development jobs |
| Buckets | avatar-images plus collaboration-audio/proposals/visuals; all private | Verified; two attachment buckets still need authorized migration |
| Bucket limits | Audio 104857600; proposal 26214400; visuals 15728640 bytes | Existing capacity sufficient per-file for listed sources |
| Storage usage | storage.objects count=0, metadata sum=0; collaborations count=0 | No existing production media. Account quota/headroom not independently verified |
| Auth | config diff: site_url=https://bearcubz.com/; portal redirect https://bearcubz.com/portal/ present alongside passport/universe | Redirect prerequisites verified; SMTP deliverability and actual production login smoke remain pending |
| Edge Functions | 10 existing active functions | 8 new attachment/recovery functions absent; account runtime/concurrency quotas unverified |
| Secrets | MOON_RACER_DEVICE_PEPPER, PORTAL_REDIRECT_URL and platform SUPABASE_* present | CLOUDMERSIVE_API_KEY, SIGNAL_PORTAL_CRON_SECRET, SIGNAL_PORTAL_SYSTEM_UID absent |
| Cloudmersive | Production secret name absent | Production account/key availability, quota and operational scan not verified |
| Artist data | No production objects | Secure transfer and security evidence required; see transfer plan |

Commands used: project listing; backups list; db query with --read-only and explicit project ref; config diff; functions list; secrets list. Secret values were not requested; CLI secret-list digests are not usable credentials. Local production config was never pushed. The first aggregate SQL attempt failed on the absent cron.job relation; the second omitted that relation and succeeded.

## Free-tier configuration to provision only after authorization

Edge Function configuration names: CLOUDMERSIVE_API_KEY (production-specific), SIGNAL_PORTAL_CRON_SECRET (fresh 32 random bytes, hex encoded), SIGNAL_PORTAL_SYSTEM_UID (dedicated production non-admin auth identity), PORTAL_ARTIST_UPLOAD_MAX_BYTES=2900000 and CLOUDMERSIVE_MAX_FILE_SIZE_BYTES=2900000. Preserve platform-managed SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY; verify PORTAL_REDIRECT_URL separately without disclosing its value.

Frontend build: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY for production, VITE_PORTAL_ARTIST_UPLOAD_MAX_BYTES=2900000. The build's production-target guard must pass. Defaults agree in security tests; test coverage of defaults does not prove deployed environment overrides match.

Use an access-controlled temporary env file and `supabase secrets set --remote=drsidtagxezznqviupsr --env-file <private-file>` only after K1.6H.2 authorization; never place secret values in shell history, docs, SQL migrations or the frontend. Provision production Vault signal_portal_cron_secret with the same dedicated cron credential and signal_portal_gateway_anon_key with the production gateway anon JWT, not a service-role credential. Review Vault access controls. Scheduler SQL template: supabase/scripts/k16h1-production-schedulers.sql. Proposed cadence daily cleanup and ten-minute recovery requires owner approval; the script refuses without a separate approval setting.

Keep the free tier; no purchase. Reject artist files above 2,900,000 bytes before transfer, with the existing size explanation. Both optimized audio objects and both PDFs fit. Larger category architecture remains, but raising limits requires a future capacity/memory review. ZIP validation never replaces Cloudmersive; artistic approval never replaces malware clearance. Recovery is bounded to three automatic attempts and five eligible rows per run; manual retries are explicit and audited. These are per-file bounds, not a global quota limiter. Monitor account usage and suspend recovery when budget is exhausted; do not spend repeated scans on unchanged known-oversized files. An operational quota/alert owner must be assigned before enabling cron.
