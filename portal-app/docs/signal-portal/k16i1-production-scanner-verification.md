# SIGNAL PORTAL — K1.6I.1 Production Scanner Verification

Verified 2026-11-13/14, `drsidtagxezznqviupsr`. `CLOUDMERSIVE_API_KEY`'s presence was confirmed by secret **name** only (`secrets list`); its value was never printed, inspected, exported, or copied at any point.

## Environment re-confirmed (Section 2)

| Check | Result |
|---|---|
| Production reachable | Yes — live `migration list`/`secrets list`/`functions list` all responded |
| Required Edge Functions ACTIVE | 21/21, including all 11 attachment/scanning/asset-security functions |
| Scanner selects Cloudmersive | Confirmed live: `scannerConfig()` with production's actual secret values (`PORTAL_SCANNER_PROVIDER_MODE=cloudmersive`) → `mode: 'cloudmersive'`, routing `2,900,000 bytes → cloudmersive`, `3,000,000 bytes → unsupported` |
| ClamAV disabled | Confirmed — no `PORTAL_CLAMAV_WORKER_URL`/`PORTAL_SCANNER_WORKER_TOKEN` set; `mode='dual'` remains categorically unreachable |
| Upload limit still 2,900,000 bytes | Confirmed via the same live config check above |
| Scheduled jobs configured | `signal-portal-prod-cleanup-quarantine` (daily 03:00 UTC) and `signal-portal-prod-scan-recovery` (every 5 min), both `active=true` |
| Private Storage policies intact | All 6 buckets still `public=false`; RLS still enabled on `storage.objects` |

## Genuine production Cloudmersive test — BLOCKED, with a concrete, real, named cause

**This is the one item this stage could not complete**, and it is reported honestly rather than worked around.

To exercise the real attachment-scanning pipeline (not a direct, orchestration-bypassing Cloudmersive call — which the brief explicitly prohibits), an authenticated artist-level session is required: `portal-request-attachment-upload-url` and `portal-confirm-attachment-upload` both correctly reject unauthenticated calls (re-confirmed this stage — see below). Creating that session requires either:
1. Self-service signup/OTP (`supabase.auth.signUp`/`signInWithOtp`) — **attempted, genuinely failed**: `email rate limit exceeded` on every attempt, across both password-signup and OTP paths, across two different disposable mailbox domains. This is Supabase's own project-level email-sending rate limit (the default shared SMTP service), not a code or configuration defect in Signal Portal. It applies uniformly to every auth-email type, so there is no code-level way around it.
2. The Admin API (`auth.admin.createUser`, the method the existing dev integration-test harness `_client.mjs` correctly uses) — requires the real production `SUPABASE_SERVICE_ROLE_KEY`, which this stage was never given and should not attempt to extract, consistent with "do not print, inspect, export, or copy" applying by the same principle to any credential, not only the Cloudmersive key specifically.

**What was genuinely verified instead**, as the strongest available substitute evidence:
- Every negative-path database guarantee (Section 4 below) — exercised for real against production's live schema with disposable fixtures, all correctly enforced.
- The scan-evidence validation function (`valid_portal_scan_evidence`) and the asset/attachment activation triggers — proven, live, to require exact checksum/size/attempt-id/completeness binding before anything can become available, using real evidence shapes.
- The scheduled `portal-scan-recovery` job's own real HTTP round-trip (pg_cron → pg_net → gateway → `requireAdminOrSystem` → function logic → genuine `200 {"ok":true,...}`) — proof the exact same code path and credential-checking machinery the attachment-confirm flow depends on is genuinely live and functioning end-to-end in production, independent of Cloudmersive specifically.

**What remains unverified**: a real `security_status='clean', scan_provider='cloudmersive'` row written by the actual deployed `scanBytes()` call against the real production key, for a real uploaded file. This requires either (a) waiting for the email rate limit to clear and retrying self-service auth, or (b) the project owner briefly raising the project's email rate limit / configuring custom SMTP via the dashboard (a 2-minute owner action), or (c) the owner performing one real upload themselves through the live portal once scanning should be active, which would itself constitute the verification.

No Cloudmersive quota was spent attempting this (the blocker occurred before any scan call could be reached).

## Negative security verification (Section 4) — all genuine, live, against production, disposable fixtures only

| # | Property | Result |
|---|---|---|
| 1 | Missing scan evidence prevents release | **Blocked** — `attachment_available_requires_clearance` |
| 2 | Incorrect checksum prevents release | **Blocked** — `attachment_exact_byte_clearance` (evidence `fileSha256` deliberately mismatched from the row's `file_sha256`) |
| 3 | Infected verdict prevents release | **Blocked** — even with correct checksum and administrator approval forced |
| 4 | Missing administrator approval prevents release | **Blocked** — even with correct checksum and a genuine `clean` verdict |
| 5 | Positive path (correct checksum + clean + approved) | **Succeeds** — confirms the gate isn't simply broken/always-denying |
| 6 | Cross-artist access denied, even post-release | A non-member identity sees 0 rows for the now-`available` attachment |
| 7 | Unauthorized users cannot obtain signed URLs | Re-confirmed — unauthenticated calls to `portal-request-attachment-upload-url`/`portal-admin-scanner-status` return non-2xx |
| 8 | Large uploads cannot bypass the 2.9MB limit | Confirmed at the routing-config level (`routeScanner(3_000_000) → 'unsupported'`); a live HTTP-level confirmation awaits the same auth blocker above |
| 9 | ClamAV cannot accidentally activate | Re-confirmed live against production's actual current secret set |

All disposable fixtures (2 synthetic identities, 1 synthetic collaboration, 1 synthetic feedback row, 1 synthetic attachment row) were created and deleted within this verification pass — production confirmed back to 0 collaborations / 1 real admin / 0 members / 0 assets afterward.
