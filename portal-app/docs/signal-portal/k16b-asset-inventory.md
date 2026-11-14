# Stage K1.6B — Asset Inventory

Source searched: `~/Desktop/Portal Asset images/` (recursive). Also checked: repo `public/assets/`, `design-source/`, existing docs/screenshots — nothing else relevant found. All metadata below is measured directly (`file`, `ffprobe`, `shasum -a 256`), never inferred from filenames.

Availability vocabulary used: **FOUND — VERIFIED**, **FOUND — APPROVAL UNCONFIRMED**, **MISSING**, **ALREADY IN DEV**, **ALREADY IN PRODUCTION — READ-ONLY VERIFIED**, **REQUIRES USER REVIEW**.

No asset below is marked "approved" merely because it exists — none of the source files carry an explicit approval record, so every one is **APPROVAL UNCONFIRMED** even where content/quality is clearly final-grade.

---

## PROJECT 001 — SIGNAL-XYLO-001 / "THE GHOST IN THE SIGNAL" (Paige Duddy / XYLØ)

Source folder: `Artist collaboration proposals/XYLO/`

| Category | Original filename | Format | Size | SHA-256 | Notes |
|---|---|---|---|---|---|
| Audio (full) | `BEAR_CUBZ_XYLO_THE_GHOST_IN_THE_SIGNAL.m4a` | ALAC/AAC-LC, 48kHz, stereo | 10,890,370 bytes | `8d45ca41dc80b37c56209bf9846ef21b55066a9843fbee3409983021f6db6529` | Duration **149.20s (2:29)** — real `ffprobe` measurement. Close to the brief's planning reference of "~2:24" for the full demo. Browser-compatible MIME (`audio/mp4` / `audio/x-m4a`), no conversion needed. |
| Audio (master) | `BEλR CUBZ \| THE GHØST IN THE SIGNAL.wav` | PCM s16le, 48kHz, stereo | 28,647,168 bytes | `af133bee1de9e094d656080c4ffbe303824e2d6d9c67495369852e5a347930bc` | Same 149.20s duration. Original master — not for direct browser upload (not in the storage bucket's allowed MIME list as delivered; WAV is technically allowed but this file is the uncompressed master, kept as source, not a delivery copy). |
| Audio (short) | — | — | — | — | **MISSING.** No ~1:19 short-edit file exists anywhere in the searched locations. Only one audio master/delivery pair was found, measured at 2:29, which reads as the "full" demo described in the brief. Do not fabricate a short edit. |
| Proposal | `BEAR_CUBZ_XYLO_GHOST_IN_THE_SIGNAL_Proposal.pdf` | PDF 1.4, 5 pages | 4,667,217 bytes | `2dc6916df29ef0dfaa70a6c34768bb1351c3e192ce9610db4816f8a79babd975` | Visually verified: genuine 5-page "BEλR CUBZ × XYLØ — Private Collaboration Proposal," addressed to Paige Duddy / XYLØ, titled "THE GHOST IN THE SIGNAL." Browser-viewer-compatible (PDF). |
| Artwork | `TRACK_ARTWORK_XYLO.png` | PNG, RGB, 8-bit | 3,185,659 bytes | `e61bb751f660fe4d0f4c23e1630016266df1ab3e732b9f8a9c6e3daf6a685fb3` | 1254×1254px. Visually verified: "BEAR CUBZ × XYLØ — THE GHØST IN THE SIGNAL" cover art, matches the project exactly. |

**Status: FOUND — APPROVAL UNCONFIRMED** for proposal and artwork; audio_full **FOUND — APPROVAL UNCONFIRMED**; audio_short **MISSING**. None contain anything unrelated or sensitive beyond the collaboration content itself (private draft business material — see Section 6 handling).

---

## PROJECT 002 — SIGNAL-ISSEY-001 / "LOST TRANSITION" (Issey Cross)

Source folder: `Artist collaboration proposals/ISSEY CROSS/`

| Category | Original filename | Format | Size | SHA-256 | Notes |
|---|---|---|---|---|---|
| Audio (demo) | `BEAR_CUBZ_LOST_TRANSITION_COVER.m4a` | ALAC/AAC-LC, 48kHz, stereo | 15,992,131 bytes | `b9a73872197ad2d5cda66680ab36c3a388f64599d2389d33f9a8227be94902f9` | Duration **132.04s (2:12)** — real `ffprobe` measurement. The brief requested only "the approved demonstration" (no short/full split specified) — this single file satisfies that. Browser-compatible MIME, no conversion needed. Filename contains "COVER" — confirmed by `file`/`ffprobe` this is an **audio file**, not cover artwork; do not confuse with the artwork asset below. |
| Audio (master) | `BEλR CUBZ \| LØSТ ТЯAИSITIØИ.wav` | PCM s16le, 48kHz, stereo | 25,365,520 bytes | `e1d3d6b10c37220b076f1a2b1434ab646606f66a0a161863d7ac1d3d75a9774b` | Same 132.04s duration. Original master, kept as source. |
| Proposal | `BEAR_CUBZ_ISSEY_CROSS_LOST_TRANSITION_Proposal.pdf` | PDF 1.4, 5 pages | 1,706,658 bytes | `288509bd2205d410d9fc8203e9b257d52965061bb9404362e92f4b9710038974` | Visually verified: genuine 5-page "BEλR CUBZ × ISSEY CROSS — Private Collaboration Proposal," titled "LØST TRANSITIØN." The proposal text itself already uses "LØST TRANSITIØN" throughout — **no "Mercury Transmission" file or reference was found anywhere** in the searched locations, so there is no actual working-title/final-title ambiguity to resolve. |
| Artwork | `TRACK_ARTWORK_IC.png` | PNG, RGB, 8-bit | 3,205,745 bytes | `cc7b02364430d9090c5b3cdf3c287467e857ab76940656bd506295bdf63a79d2` | 1254×1254px. Visually verified: "BEAR CUBZ × ISSEY CROSS — LØST TRANSITIØN" cover art, matches the project exactly. |

**Status: FOUND — APPROVAL UNCONFIRMED** for all three (audio, proposal, artwork).

---

## Musical metadata caveats (per brief, not silently resolved)

- **XYLO / "THE GHOST IN THE SIGNAL"**: brief specifies 96 BPM, A♭ minor. No independent audio-analysis tool was run against the actual waveform to re-derive tempo/key (out of scope for this inventory pass) — recorded as provided, not re-verified against the audio.
- **Issey Cross / "LOST TRANSITION"**: brief specifies 145 BPM, key "A♭" with **mode explicitly unconfirmed**. Stored as the literal string `"A♭"` with no major/minor suffix — `collaborations.musical_key` is free-text, so this is representable exactly as given, with no fabricated mode.

## Non-findings

Searched explicitly for and found **nothing** under: `XYLO`/`XYLØ`/`Paige Duddy` short-demo variants, any `Mercury Transmission` file, any additional artwork variant (alternate covers), or any pre-existing upload of either project into `public/assets/` or any dev/production storage reference in the repo.
