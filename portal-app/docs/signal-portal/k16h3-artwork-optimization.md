# SIGNAL PORTAL — K1.6H.3 Large Artwork Optimization

Verified 2026-11-12. Both real pending-approval cover images (one per real collaboration) exceed the 2,900,000-byte Cloudmersive-eligible threshold. This is a measurement of the optimization workflow against the real original bytes, performed entirely locally with official, no-cost tooling (`sips`, Apple's built-in image tool; `cwebp`, Google's official WebP encoder via Homebrew) — nothing was uploaded, replaced, or sent to any external service, and no approval status was changed.

## Measured results

| Collaboration | Original format/size/dims | WebP q90 | JPEG q90 | Recommendation |
|---|---|---|---|---|
| XYLØ | PNG, 3,185,659 bytes, 1254×1254, no alpha | 534,324 bytes (fits, 83% smaller) | 871,468 bytes (fits, 73% smaller) | **WebP** |
| Issey | PNG, 3,205,745 bytes, 1254×1254, no alpha | 527,522 bytes (fits, 84% smaller) | 888,151 bytes (fits, 72% smaller) | **WebP** |

Both originals have no alpha channel, so neither candidate format required a transparency decision (nothing to flatten or lose). WebP at quality 90 comfortably clears the 2,900,000-byte threshold with roughly 5.4× headroom to spare — there is no need to drop quality further to fit. `image/webp` is already a first-class supported MIME type in the frontend's own image-display logic (`AttachmentList.tsx`'s `IMAGE_MIME` set already includes it), so no frontend change would be needed to display an optimized WebP cover once one existed as a real asset row.

## What was verified vs. what remains

- **Verified**: both real images' exact current dimensions, format, alpha status, and byte size; that a WebP (and, as a fallback, JPEG) encode of the exact real pixel data fits the scanner threshold at a visually high quality setting; real SHA-256 of both the original and each candidate output (recorded in the measurement script's own output, not reproduced here since they describe private-asset derivatives).
- **Not verified / explicitly deferred, per the brief's own requirement**: color-accuracy and visual-composition comparison was not performed as an automated metric (no reference/approved "ground truth" render exists to compare against, since these covers are still pending approval) — a human visual check of the WebP candidate against the original is recommended before anyone treats it as the release candidate. Metadata stripping was not separately verified as a distinct step (WebP/JPEG re-encoding from a decoded PNG does not carry forward PNG-specific metadata chunks by construction, but this was not independently confirmed byte-for-byte).
- **Explicitly not performed, and not required to be**: no optimized copy was scanned (genuinely or otherwise) by any scanner — "the exact optimized output must receive genuine scanning before production activation," and no such activation is proposed by this stage. No optimized copy was uploaded as a new asset row. No approval status changed. Neither original was modified or deleted.

## Recommendation for a future stage (not started here)

If and when an optimization pipeline is approved: generate the WebP copy from the exact current original bytes, compute its SHA-256, submit it through the normal `portal-admin-request-upload-url` → scan → `portal-admin-review-asset` security-release path like any other new asset (never inheriting the original's — nonexistent — clearance), and only then let the existing, separate artistic-approval workflow decide whether to make it the active cover. This stage deliberately stops at the measurement, per "do not replace production assets."
