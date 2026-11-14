# SIGNAL PORTAL — K1.6J Production Asset Transfer

Attempted 2026-11-14. **No asset bytes were transferred to production this stage.** This is a direct, structural consequence of the same authentication blocker documented in `k16j-production-scanner-verification.md` — not a separate issue.

## Why transfer specifically needs a real session, not just database access

Private Storage object **bytes** live in Supabase's S3-compatible backend, never in Postgres — `storage.objects` only ever holds metadata (path, bucket, size). Writing a real object requires a signed upload URL, which only `portal-admin-request-upload-url` can mint (using the service role internally, after verifying the caller is a real authenticated administrator). There is no SQL-only path to this: inserting a `collaboration_assets`/`storage.objects` row without ever actually PUTting the real bytes would create exactly the "storage-existence lie" this entire project has worked since K1.6H.2 to prevent (a metadata row claiming an object exists and is a certain size, with nothing real behind it) — this was never attempted.

## What was prepared, so transfer can happen quickly once unblocked

- Both real production collaboration records exist (`k16j-collaboration-inventory.md`).
- The exact 9-asset inventory, source checksums, and intended destination bucket for each eligible asset are fully documented.
- The free-tier size constraint was respected in planning: only the four already-optimized files (two MP3s, two PDFs — all well under 2,900,000 bytes) are planned for transfer; **the original WAV/M4A masters are correctly excluded from any activation path**, exactly as this stage's own brief requires ("Do not upload oversized files into an activation path that requires a scanner unavailable in production").
- **No private artist original was sent to Cloudmersive or any other external service** — this was never at risk, since no transfer of any kind occurred.

## Exact sequence prepared for execution once an authenticated session is available

For each of the 4 eligible files (XYLØ MP3 + PDF, Issey MP3 + PDF):
1. Download the real bytes from development Storage (already have service-role access there).
2. Compute SHA-256, compare against the recorded dev value (`k16i1-artist-asset-inventory.md`).
3. Call `portal-admin-request-upload-url` against the correct production `collaboration_id`.
4. Upload via the returned signed URL.
5. Call `portal-admin-confirm-upload` — this both verifies the uploaded bytes server-side and triggers the real `scanAsset()` call.
6. Record the resulting production SHA-256, file size, and genuine scan evidence.
7. Perform the separate administrator security-release action (`portal-admin-review-asset`) only once evidence is complete and genuinely clean.
8. Verify the asset remains inaccessible (no signed URL obtainable) at every step before release.

None of this was executed. This remains a plan, exactly as `k16j-production-scanner-verification.md`'s own remaining-paths list describes.
