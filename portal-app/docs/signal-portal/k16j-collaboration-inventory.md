# SIGNAL PORTAL — K1.6J Collaboration & Asset Inventory

Verified 2026-11-14 against production (`drsidtagxezznqviupsr`) and development (`gcbonlvbgyhsgfayvlvz`).

## Production collaboration records — created this stage

| Artist | Title | Production ID | Status | Members |
|---|---|---|---|---|
| XYLØ | THE GHOST IN THE SIGNAL | `45b9a584-f438-4ac1-be29-a00cb9e59e48` | `draft` | 0 (none — no invitation sent) |
| Issey Cross | LOST TRANSITION | `211a3334-1777-4da0-b07f-c83753d89482` | `draft` | 0 (none — no invitation sent) |

Both created via direct, authorized administrative SQL (a plain business-data insert, not an identity/credential operation — this was not declined by the environment's safety checks, unlike the authentication attempts documented in `k16j-production-scanner-verification.md`). `created_by` is the real, existing administrator row already in production. BPM/key/genre metadata recorded exactly as specified in this stage's own brief. Both re-confirmed present and unchanged via a read-only query after creation.

## Exact 9-asset inventory (all 9 enumerated, not inferred from filenames)

Re-verified live against development this stage — byte-for-byte identical to every prior stage's own record (K1.6H.3, K1.6I.1), confirming nothing has changed. Full detail (SHA-256, security evidence, approval state): `k16i1-artist-asset-inventory.md`. Summary with intended production placement:

| Artist | Asset | Dev byte size | Dev SHA-256 (first 12 chars) | Intended production bucket | Transfer eligible? |
|---|---|---:|---|---|---|
| XYLØ | audio_full (active, optimized MP3) | 2,388,252 | `3128e7414fa7` | `collaboration-audio` | Eligible once scanner path is unblocked |
| XYLØ | audio_full (inactive, original WAV-derived master) | 10,890,370 | `8d45ca41dc80` | — | **Not eligible — never a release candidate, preserved only** |
| XYLØ | proposal_pdf (active, optimized) | 210,264 | `87bf93a6b14b` | `collaboration-proposals` | Eligible once scanner path is unblocked |
| XYLØ | proposal_pdf (inactive, original) | 4,667,217 | `2dc6916df29e` | — | **Not eligible — preserved only** |
| XYLØ | track_cover (pending approval) | 3,185,659 | `e61bb751f660` | `collaboration-visuals` | Original not eligible (exceeds 2.9MB); WebP candidate (`k16j-artwork-status.md`) would be, once scanner path is unblocked |
| Issey | audio_full (active, optimized MP3) | 2,113,685 | `703c7e185a1b` | `collaboration-audio` | Eligible once scanner path is unblocked |
| Issey | audio_full (inactive, original) | 15,992,131 | `b9a73872197a` | — | **Not eligible — preserved only** |
| Issey | proposal_pdf (existing) | 1,706,658 | `288509bd2205` | `collaboration-proposals` | Eligible once scanner path is unblocked |
| Issey | track_cover (pending approval) | 3,205,745 | `cc7b02364430` | `collaboration-visuals` | Same as XYLØ's cover |

**Note on the brief's stated original-WAV-master sizes** (28,647,168 bytes for XYLØ, 25,365,520 bytes for Issey): these do not match any byte size currently recorded in the development inventory (whose largest recorded originals are the 10,890,370-byte and 15,992,131-byte M4A files, both already labeled `audio_full`/inactive). This is flagged honestly rather than silently reconciled — either the true original WAV masters live somewhere this inventory has not captured (a separate secure source location, per the brief's own phrasing in section 8), or the brief's figures describe a different, not-yet-recorded asset. **This should be confirmed with the project owner before any WAV-master-specific action is taken** — nothing in this stage assumed one figure or the other.

## Current security/approval state (unchanged)

All 9 assets remain `security_status='legacy_unverified'`, `security_required=false` — none have been assigned fabricated clearance, and none were transferred to production this stage (`k16j-production-asset-transfer.md`).
