# SIGNAL PORTAL — K1.6I.1 Artist Asset Inventory

Verified 2026-11-14, re-queried live against the dev project (`gcbonlvbgyhsgfayvlvz`) — confirmed byte-for-byte unchanged from the exhaustive inventory and genuine local-ClamAV-scan evidence already recorded in `k16h3-legacy-asset-security.md`, not redone. **No asset was transferred to production in this stage.** Storage paths and bucket/path strings are omitted below, consistent with prior-stage practice; raw UUIDs are included since they are opaque, not private content, and are needed for any future transfer script to reference exactly.

## XYLØ — SIGNAL-XYLO-001, "THE GHOST IN THE SIGNAL"

| Asset | Source size | Source SHA-256 | Security evidence | Artistic approval | Transfer eligible? | Required next action |
|---|---:|---|---|---|---|---|
| `audio_full` (active, optimized MP3) | 2,388,252 bytes | `3128e7414fa7767bda89e3913ee9eb6a73622d522c2e592dbd44103ab542a8b3` | Genuinely scanned clean **locally** (K1.6H.2/H.3) — not production-byte evidence | N/A (audio has no separate artistic-approval gate) | **No** | Transfer bytes → upload via `portal-admin-request-upload-url` against production → genuine production-byte Cloudmersive scan → administrator security release |
| `audio_full` (inactive, original master, M4A) | 10,890,370 bytes | `8d45ca41dc80b37c56209bf9846ef21b55066a9843fbee3409983021f6db6529` | Same as above | N/A | **No — not a release candidate** | Preserve only, never transfer |
| `proposal_pdf` (active, optimized) | 210,264 bytes | `87bf93a6b14bec8822ab25e31bcb6c8d2db86f5765ec8868d45827d4a08de017` | Genuinely scanned clean locally | N/A | **No** | Same transfer sequence as the demo above |
| `proposal_pdf` (inactive, original) | 4,667,217 bytes | `2dc6916df29ef0dfaa70a6c34768bb1351c3e192ce9610db4816f8a79babd975` | Genuinely scanned clean locally | N/A | **No — not a release candidate** | Preserve only |
| `track_cover` (pending approval) | 3,185,659 bytes | `e61bb751f660fe4d0f4c23e1630016266df1ab3e732b9f8a9c6e3daf6a685fb3` | Genuinely scanned clean locally | **Pending** (unchanged) | **No** | A WebP candidate exists locally (`k16h3-artwork-optimization.md`, re-confirmed this stage, see below) — transfer requires its own genuine production scan + security release, independent of artistic approval |

## Issey Cross — SIGNAL-ISSEY-001, "LOST TRANSITION"

| Asset | Source size | Source SHA-256 | Security evidence | Artistic approval | Transfer eligible? | Required next action |
|---|---:|---|---|---|---|---|
| `audio_full` (active, optimized MP3) | 2,113,685 bytes | `703c7e185a1b28cacb8aaedb5903377d9dd3ebc25c474c5cb6e8ee3681cc1255` | Genuinely scanned clean locally | N/A | **No** | Same transfer sequence as XYLØ's demo |
| `audio_full` (inactive, original master, M4A) | 15,992,131 bytes | `b9a73872197ad2d5cda66680ab36c3a388f64599d2389d33f9a8227be94902f9` | Genuinely scanned clean locally | N/A | **No — not a release candidate** | Preserve only |
| `proposal_pdf` (existing, ~1.7MB) | 1,706,658 bytes | `288509bd2205d410d9fc8203e9b257d52965061bb9404362e92f4b9710038974` | Genuinely scanned clean locally | N/A | **No** | Same transfer sequence |
| `track_cover` (pending approval) | 3,205,745 bytes | `cc7b02364430d9090c5b3cdf3c287467e857ab76940656bd506295bdf63a79d2` | Genuinely scanned clean locally | **Pending** (unchanged) | **No** | WebP candidate exists locally, same as XYLØ's |

## Why none of these are transfer-eligible yet

Every row above has only **development-byte** security evidence — a real, genuine local ClamAV scan, but of the bytes as they sit in the *development* project. This stage's own brief (and every prior stage's own standing rule) requires evidence to bind to the **exact production bytes** and a **real production scan attempt** before any asset may activate in production — a dev-side scan, however genuine, is not a substitute, no matter how it was obtained. No security record was fabricated to work around this; every "No" above reflects that real requirement, not a technical limitation of this stage.

## Intended production location

Once transfer is approved: each asset's real bytes would be uploaded via `portal-admin-request-upload-url` against a **real production `collaborations` row** for each artist (which does not exist yet — production currently has 0 collaborations) into the same bucket layout already live in production (`collaboration-audio`, `collaboration-proposals`, `collaboration-visuals` — all confirmed present, private, and correctly policy-configured in `k16i-deployment-record.md`).
