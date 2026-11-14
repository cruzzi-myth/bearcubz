# SIGNAL PORTAL — K1.6L Asset Transfer Manifest

Re-verified 2026-11-14 directly against the development project (`gcbonlvbgyhsgfayvlvz`) by downloading
each eligible file's real bytes and recomputing its SHA-256 — not by reusing a previously-quoted value.
Byte-for-byte identical to every prior stage's record.

**Note on this stage's brief:** the brief's own stated original-WAV-master sizes (28,647,168 /
25,365,520 bytes) were not used anywhere in this manifest, per its own instruction to use actual
source-byte measurements. No asset matching either figure exists on record in development; this
remains an open question for the owner (unchanged since K1.6J), not assumed either way.

## XYLØ — THE GHOST IN THE SIGNAL (dev collaboration `e94ff20c-c332-4dcc-bffb-596a0df265cc`, production `45b9a584-f438-4ac1-be29-a00cb9e59e48`)

| Asset | Category | Source size | Source SHA-256 | MIME | Scan status | Artistic approval | Intended bucket | Eligible? |
|---|---|---:|---|---|---|---|---|---|
| Optimized demo (128kbps MP3) | audio_full | 2,388,252 B | `3128e7414fa7767bda89e3913ee9eb6a73622d522c2e592dbd44103ab542a8b3` | audio/mpeg | legacy_unverified | n/a | `collaboration-audio` | **Yes** |
| Full demo (M4A, inactive) | audio_full | 10,890,370 B | — | audio/mp4 | legacy_unverified | n/a | — | No — inactive, never a release candidate |
| Collaboration proposal (optimized) | proposal_pdf | 210,264 B | `87bf93a6b14bec8822ab25e31bcb6c8d2db86f5765ec8868d45827d4a08de017` | application/pdf | legacy_unverified | n/a | `collaboration-proposals` | **Yes** |
| Collaboration proposal (original, inactive) | proposal_pdf | 4,667,217 B | — | application/pdf | legacy_unverified | n/a | — | No — inactive, preserved only |
| Cover art | track_cover | 3,185,659 B | — | image/png | legacy_unverified | **pending** | `collaboration-visuals` | No — exceeds the 2,900,000-byte Cloudmersive ceiling; the pre-measured WebP q90 candidate (534,324 B, `k16j-artwork-status.md`) would be eligible once uploaded, but a human visual check and artistic approval are still outstanding |

## Issey Cross — LOST TRANSITION (dev collaboration `8911f932-0501-49e5-9cff-e0e5ccbc756f`, production `211a3334-1777-4da0-b07f-c83753d89482`)

| Asset | Category | Source size | Source SHA-256 | MIME | Scan status | Artistic approval | Intended bucket | Eligible? |
|---|---|---:|---|---|---|---|---|---|
| Optimized demo (128kbps MP3) | audio_full | 2,113,685 B | `703c7e185a1b28cacb8aaedb5903377d9dd3ebc25c474c5cb6e8ee3681cc1255` | audio/mpeg | legacy_unverified | n/a | `collaboration-audio` | **Yes** |
| Demo (M4A, inactive) | audio_full | 15,992,131 B | — | audio/mp4 | legacy_unverified | n/a | — | No — inactive, preserved only |
| Collaboration proposal | proposal_pdf | 1,706,658 B | `288509bd2205d410d9fc8203e9b257d52965061bb9404362e92f4b9710038974` | application/pdf | legacy_unverified | n/a | `collaboration-proposals` | **Yes** |
| Cover art | track_cover | 3,205,745 B | — | image/png | legacy_unverified | **pending** | `collaboration-visuals` | No — exceeds the 2,900,000-byte Cloudmersive ceiling; same WebP-candidate path as XYLØ's cover |

## The four Cloudmersive-eligible files

1. XYLØ optimized demo MP3 — 2,388,252 bytes
2. XYLØ optimized proposal PDF — 210,264 bytes
3. Issey Cross optimized demo MP3 — 2,113,685 bytes
4. Issey Cross proposal PDF — 1,706,658 bytes

All four are well under the real production 2,900,000-byte Cloudmersive ceiling
(`PORTAL_CLOUDMERSIVE_MAX_BYTES`, enforced in `supabase/functions/_shared/scannerPolicy.ts`). Neither
cover is eligible in its original PNG form; both already have a measured, under-limit WebP candidate
from K1.6H.3/K1.6I.1 awaiting a human visual check and a separate artistic-approval decision.

## Why none of the four were transferred this stage

Unchanged from K1.6J/K1.6K: transferring requires a real authenticated administrator session
(`portal-admin-request-upload-url` → PUT → `portal-admin-confirm-upload`, which also triggers the
real scan). No such session exists for this environment, and creating one was not attempted again
this stage. The owner has also not yet separately authorized transmitting real XYLØ/Issey bytes to
Cloudmersive (section 6 of this stage's own brief) — a second, independent precondition. The exact
transfer sequence remains fully prepared (`k16j-production-asset-transfer.md`) and unexecuted.
