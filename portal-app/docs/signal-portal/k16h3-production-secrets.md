# SIGNAL PORTAL — K1.6H.3 Production Secrets Inventory

Verified 2026-11-12 by grepping every `Deno.env.get(...)` call and every `get('NAME')`-style config lookup across the actual deployed Edge Function source (`supabase/functions/`), not read from a prior stage's prose summary — a complete, exhaustive list, cross-checked against `scannerPolicy.ts`'s own validation logic for defaults. **No secret value appears anywhere in this document or was printed to any log this stage.** No secret was copied from development to production. No production secret was created this stage.

## Platform-injected (automatic — never manually provisioned)

| Name | Purpose |
|---|---|
| `SUPABASE_URL` | Project URL, injected by the Edge Function runtime |
| `SUPABASE_ANON_KEY` | Public anon key, injected |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role key, injected |

## Required for the initial Cloudmersive-only release

| Name | Default if unset | Action required |
|---|---|---|
| `CLOUDMERSIVE_API_KEY` | none — scanning fails closed to `security_status='error'` without it | **Provision a new, production-specific key** — never the development key |
| `PORTAL_REDIRECT_URL` | none (pre-existing, unrelated to scanning — required for auth email links) | Verify independently; not a scanner secret |
| `PORTAL_SCANNER_PROVIDER_MODE` | `cloudmersive` | Leave unset, or set explicitly to `cloudmersive` for auditability — **never** `dual` for this release |
| `PORTAL_ARTIST_UPLOAD_MAX_BYTES` | `2900000` | Leave unset, or set explicitly to `2900000` |
| `PORTAL_CLOUDMERSIVE_MAX_BYTES` | `2900000` (falls back to legacy `CLOUDMERSIVE_MAX_FILE_SIZE_BYTES`, then the hardcoded default) | Leave unset |
| `PORTAL_SCANNER_FALLBACK_ENABLED` | `false` | Leave unset, or set explicitly to `false` — setting `true` is rejected at config-load time regardless |

## Required for cron jobs

| Name | Purpose |
|---|---|
| `SIGNAL_PORTAL_CRON_SECRET` | The `X-Signal-Portal-Cron-Secret` header value `requireAdminOrSystem` checks for cron-triggered calls to `portal-admin-cleanup-quarantine`/`portal-scan-recovery` — **generate fresh for production, never reuse the dev value**, and also insert into production's own Vault (never committed) |

## Required for system authorization (audit attribution)

| Name | Purpose |
|---|---|
| `SIGNAL_PORTAL_SYSTEM_UID` | A real, dedicated, non-admin `auth.users` row's UID in **production** (a fresh row, never the dev UID, which does not exist in production's auth schema) — needed so cron-triggered actions have a real, honest `admin_id` to audit-log against |

## Required only for future ClamAV hosting (do NOT set for this release)

| Name | Why it must stay unset now |
|---|---|
| `PORTAL_CLAMAV_WORKER_URL` | Setting this (even correctly) plus `PORTAL_SCANNER_PROVIDER_MODE=dual` is the only way ClamAV routing activates — not approved for this release |
| `PORTAL_SCANNER_WORKER_TOKEN` | Same — the worker's own bearer credential; no hosted worker exists to issue one for yet |
| `PORTAL_CLAMAV_MAX_BYTES` | Only consulted when `mode='dual'`; harmless if set early but has no effect while mode stays `cloudmersive`, so there is no reason to set it now |

## Optional

| Name | Notes |
|---|---|
| `CLOUDMERSIVE_MAX_FILE_SIZE_BYTES` | Legacy fallback name, superseded by `PORTAL_CLOUDMERSIVE_MAX_BYTES`; omit |
| `PORTAL_ADMIN_UPLOAD_MAX_BYTES` | Defaults to `52428800` (50MiB), matching the real current global Storage ceiling found in K1.6H.2 — may be lowered, must never be raised past what Storage actually supports (the code does not independently verify the Storage ceiling, so raising this without first raising the actual Storage limit would silently reintroduce the same "accepted request, failed transfer" gap K1.6H.2 found and fixed) |

## Deprecated

None of the above are deprecated outright; `CLOUDMERSIVE_MAX_FILE_SIZE_BYTES` is the closest to deprecated (superseded naming, listed as optional above, never required).

## Unrelated to Signal Portal, already present in production (do not touch)

| Name | Purpose |
|---|---|
| `MOON_RACER_DEVICE_PEPPER` | Belongs to the `moon-racer-vote` system sharing this same Supabase project — out of scope for this provisioning list, included here only so it is not mistaken for a missing Signal Portal secret |

## Provisioning order (owner-facing instructions, nothing executed this stage)

1. Generate and set `CLOUDMERSIVE_API_KEY` (new account/key).
2. Create the production `SIGNAL_PORTAL_SYSTEM_UID` row (a real `auth.users` insert, never an admin), then set the secret to its UID.
3. Generate `SIGNAL_PORTAL_CRON_SECRET` (32 random bytes, hex-encoded — same method as dev), set it via `supabase secrets set`, and separately insert it into production's own Vault under its own name (never the dev Vault entry, never committed).
4. Leave every ClamAV-only name unset.
5. Leave every "required for initial release" name at its documented default, or set explicitly for auditability — either is correct.
6. Run the minimal Cloudmersive smoke test (`k16h3-production-scanner-policy.md`) once the above are live, before relying on production scanning for any real artist upload.
