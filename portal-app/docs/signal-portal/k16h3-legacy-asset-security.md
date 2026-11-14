# SIGNAL PORTAL — K1.6H.3 Legacy Administrator Asset Security

Verified 2026-11-12, by direct read-only query against the real dev project plus a genuine local-only ClamAV scan of the exact real bytes (never sent externally — see "Authorized local revalidation" below). Storage paths are omitted from this document by design (only asset type, size, status, and hash are recorded) per the brief's instruction not to expose private storage paths/identifiers in output; the full paths remain queryable directly from `collaboration_assets` by an administrator with service-role access, not reproduced here.

## Inventory: all 15 `security_status='legacy_unverified'` rows

**9 real private artist-asset rows** (across the two real collaborations, XYLØ's "THE GHOST IN THE SIGNAL" and Issey's "LOST TRANSITION" — identified by cross-referencing known byte-exact sizes from prior stages' own documentation, not guessed):

| Collaboration | Asset type | Byte size | Active | Approval status | Required action before production |
|---|---|---:|---|---|---|
| XYLØ | audio_full (optimized demo, MP3) | 2,388,252 | yes | — | Genuine scan of the exact production bytes + security release, after transfer |
| XYLØ | audio_full (original master, M4A) | 10,890,370 | **no** | — | None — superseded, preserve only, never a release candidate |
| XYLØ | proposal_pdf (optimized) | 210,264 | yes | — | Genuine scan of the exact production bytes + security release, after transfer |
| XYLØ | proposal_pdf (original) | 4,667,217 | **no** | — | None — superseded, preserve only |
| XYLØ | track_cover | 3,185,659 | yes | **pending** | Genuine scan + security release (independent of, and before, any future artistic-approval decision — not changed here) |
| Issey | audio_full (optimized demo, MP3) | 2,113,685 | yes | — | Genuine scan of the exact production bytes + security release, after transfer |
| Issey | audio_full (original master, M4A) | 15,992,131 | **no** | — | None — superseded, preserve only |
| Issey | proposal_pdf | 1,706,658 | yes | — | Genuine scan of the exact production bytes + security release, after transfer |
| Issey | track_cover | 3,205,745 | yes | **pending** | Genuine scan + security release (artistic approval untouched) |

**6 disposable browser-test-fixture rows** (the persistent `.browser-dataset.json` identities' own synthetic collaborations — not real artist material, confirmed by matching their collaboration IDs to the known disposable dataset): 2 tiny synthetic PNGs (75 bytes, 1×1 placeholder images), 1 tiny synthetic WAV header (44 bytes), 1 tiny synthetic PDF (208 bytes), repeated across two disposable collaborations. Required action: none — never a production transfer candidate, exist only to drive automated browser tests.

No row in either group has `file_sha256` or `scan_evidence` recorded in the database. **No asset in this inventory is treated as clean, approved, or available by virtue of existing in Storage — `security_required=false` on every one of these rows means they retain their pre-K1.6H.2 availability under the explicit legacy exemption, which is an inventory label, not malware clearance.**

## Authorized local revalidation (genuine, performed this stage)

Per the brief's explicit allowance ("If local ClamAV can genuinely scan the exact private bytes through an authorized local workflow, prepare and test that process") and explicit prohibition (never Cloudmersive, never VirusTotal, never any third party for these real files), a new reusable script — `infra/clamav/revalidate-legacy-assets.mjs` — was written and run for real:

1. Obtained a fresh, genuine ClamAV signature database via `freshclam` (version 28181, real, downloaded and integrity-tested this session — the one left over from K1.6H.2 had aged past its own 48-hour freshness check and was replaced, not reused stale).
2. Started a local `clamd` daemon bound to `127.0.0.1` only (no Unix socket — a real, reproducible permission error on this machine's temp-directory layout for the socket file was worked around by using TCP only, which is all this script needs; documented here rather than hidden).
3. For each of the 15 rows above, downloaded the **exact real bytes** directly from Supabase Storage via the existing service-role admin client into a single `0600`-permission local temp file, computed SHA-256, ran the real `INSTREAM` ClamD command, recorded the verdict, and deleted the temp file immediately. The real file bytes were never logged, never written anywhere else, and never left this machine.

**Real results**: all 9 real artist-asset rows scanned **genuinely clean**, every one with `sizeMatches: true` (the downloaded byte count exactly matched the database's own recorded `byte_size` — an independent integrity check) and a real computed SHA-256 now known for each (recorded in the script's own JSON output, not reproduced in this document). The 6 disposable tiny test fixtures returned either `clean` or `incomplete` (ClamAV's media-format heuristics flagging a few of the deliberately minimal synthetic WAV/PNG headers as too small/non-standard to fully validate) — expected and inconsequential, since these are not real content and not production candidates.

**This explicitly does not authorize production activation.** It proves: (a) the real dev-stored bytes are not malware, and (b) the local revalidation workflow genuinely works end to end against real private bytes without any external transmission. It does not satisfy the brief's own stated requirement that "no legacy asset may be newly activated in production based solely on its development availability" and that production needs "genuine security evidence for the exact production bytes" — those exact bytes do not yet exist in production, and this dev-side evidence is not substituted for that requirement anywhere in code (the result was deliberately never written back to `scan_evidence`/`security_status` in the database).

## Preserving the required separation of decisions

Unchanged and reconfirmed: malware clearance (what this revalidation addresses), administrator security release (a separate, explicit `portal-admin-review-asset` action, not performed here), artistic approval (both pending covers remain exactly `pending`, untouched), and artist access authorization (governed by existing membership/RLS, untouched) remain four independent decisions. Nothing in this stage collapsed them.
