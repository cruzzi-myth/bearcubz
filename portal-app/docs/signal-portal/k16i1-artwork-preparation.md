# SIGNAL PORTAL — K1.6I.1 Artwork Preparation

Verified 2026-11-14. Both source cover PNGs' SHA-256 were re-confirmed identical to their K1.6H.3 values this stage (`k16i1-artist-asset-inventory.md`) — since the source bytes have not changed, the WebP optimization results measured in `k16h3-artwork-optimization.md` remain exactly valid and are not regenerated here (doing so would reproduce identical output and spend effort without new information, consistent with this stage's "do not repeat K1.6H.1–K1.6H.4" instruction).

## Candidates (unchanged from K1.6H.3, re-confirmed valid)

| Collaboration | Original | WebP q90 candidate | Fits 2.9MB threshold |
|---|---|---:|---|
| XYLØ | PNG, 3,185,659 bytes, 1254×1254, no alpha | 534,324 bytes | Yes — 5.4× headroom |
| Issey Cross | PNG, 3,205,745 bytes, 1254×1254, no alpha | 527,522 bytes | Yes — 5.5× headroom |

Both originals preserved untouched; both candidates exist only as local measurement artifacts (never uploaded, never replacing anything) — see `k16h3-artwork-optimization.md` for the full per-candidate SHA-256, the JPEG fallback measurements, and the exact `sips`/`cwebp` commands used.

## Remaining limitation, unchanged

**Visual/color comparison against an approved reference was not performed**, for the same reason as K1.6H.3: no approved "ground truth" render exists yet to compare against, since both covers remain in `pending` artistic-approval state. A human visual check of the WebP candidate against the original remains the recommended step before treating either as a release candidate.

## Status

No upload occurred. No approval state changed. Both originals remain exactly as they were. This remains local measurement and preparation only, per this stage's explicit scope.
