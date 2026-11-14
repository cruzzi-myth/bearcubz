# K1.6H.2 scanner architecture

## Pre-change path inventory (inspected before implementation)

- Artist attachments: request-attachment-upload-url → quarantine signed upload → confirm-attachment-upload (size/signature/ZIP validation) → scanOrchestrator atomic claim + Cloudmersive → admin-review-attachment (clean AND approval) → final bucket → attachment-signed-url (membership, active, available, clean, approved).
- Attachment recovery: admin-retry-attachment-scan and scan-recovery use the same claim; cleanup honors active leases and 30-day oversized retention. No artist UPDATE grant.
- Administrator assets: admin-request-upload-url creates private bucket object + pending asset → admin-confirm-upload verifies only existence/size → upload_status=ready; admin-manage-collaboration controls visual approval/primary cover; promote_primary_cover requires ready. portal-signed-url requires active + ready + RLS membership, but had no malware gate. storage object SELECT policies also reference these asset rows. Audio/PDF had no explicit release approval. Thumbnail is a separate object and must be scanned separately.
- Existing objects are private. H1 source manifest identifies nine original objects; preserve their bytes, active states and artwork approvals. Existing legacy rows will be explicitly marked legacy/unverified rather than assigned invented clean evidence.

## Implementation boundary

Reuse existing asset and attachment rows, leases, review, authorization and audit patterns. New administrator assets require exact-byte scan evidence and an explicit security-release review before ready. Legacy rows retain existing availability while offering deliberate revalidation. Legacy exemption is an inventory exception, not malware clearance; production currently has zero assets and must not import legacy exemptions.

Cloudmersive remains the default below 2,900,000 bytes. Optional dual routing uses an authenticated external worker above that threshold only within configured capacity. No fallback after provider failure, and no larger artist limit is enabled automatically. Worker uses a short-lived object capability obtained from an authenticated Edge broker scoped to the current lease; it has no Supabase service-role key. Edge and worker independently hash exact object bytes. Final writes remain conditional on the current attempt ID.

The worker runs outside Edge, streams into a private bounded temporary file, validates signatures and ZIP policy, fully decompresses supported ZIP entries with CRC validation under explicit limits, then streams the object through private ClamD INSTREAM. Real ClamD VERSION metadata, signature age and strict daemon limit alerts govern completeness. Missing runtime is never represented as clean.

**Audit follow-up (2026-11-09/10):** local runtime proof has since been obtained via a genuine Homebrew-native ClamAV 1.5.4 daemon (loopback-only), independently reproduced twice — see `k16h2-clamav-setup.md`. Enabling larger uploads in production still additionally requires a hosted, HTTPS-reachable worker and resolved production backup/hosting gates (unchanged, still open — see `k16h2-release-manifest.md`).
