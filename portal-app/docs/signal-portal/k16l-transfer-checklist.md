# SIGNAL PORTAL — Final Four-File Transfer Checklist (prepared, not executed)

Prepared 2026-11-14, after the production scanner workflow was genuinely verified end-to-end
(`k16l-production-scanner-test.md`). **No real artist file has been uploaded or transmitted to
Cloudmersive.** This is the exact, ready-to-run sequence for when the owner authorizes it — two
separate preconditions still apply before any step below runs for real:

1. An authenticated administrator session (unchanged blocker — this environment has none and will
   not attempt to create one).
2. The owner's separate, explicit authorization to transmit real XYLØ/Issey bytes to Cloudmersive
   (requested, not yet given — see `k16j-production-asset-transfer.md` section 6).

Byte sizes and SHA-256 values below were re-verified against development Storage directly (not
reused from memory) — see `k16l-asset-transfer-manifest.md` for the full per-asset detail.

## File 1 — XYLØ optimized demo (MP3)

- [ ] Source: dev `collaboration-audio/e94ff20c-.../89d65b23-...mp3`, 2,388,252 bytes, SHA-256 `3128e7414fa7...`
- [ ] Request signed upload URL for production collaboration `45b9a584-f438-4ac1-be29-a00cb9e59e48`, category `audio_full`
- [ ] Upload, then confirm (triggers the real scan)
- [ ] Verify production SHA-256 matches the source exactly
- [ ] Verify genuine `clean` evidence, `complete: true`, `withinLimits: true`
- [ ] Administrator security release — only after evidence is genuinely clean
- [ ] Artistic approval remains a separate, later decision — not part of this checklist

## File 2 — XYLØ proposal (PDF)

- [ ] Source: dev `collaboration-proposals/e94ff20c-.../9c446d3c-...pdf`, 210,264 bytes, SHA-256 `87bf93a6b14b...`
- [ ] Same sequence as File 1, category `proposal_pdf`

## File 3 — Issey Cross optimized demo (MP3)

- [ ] Source: dev `collaboration-audio/8911f932-.../94529e1d-...mp3`, 2,113,685 bytes, SHA-256 `703c7e185a1b...`
- [ ] Same sequence as File 1, production collaboration `211a3334-1777-4da0-b07f-c83753d89482`, category `audio_full`

## File 4 — Issey Cross proposal (PDF)

- [ ] Source: dev `collaboration-proposals/8911f932-.../f7bf9ae9-...pdf`, 1,706,658 bytes, SHA-256 `288509bd2205...`
- [ ] Same sequence as File 1, category `proposal_pdf`

## Explicitly excluded from this checklist

- Both original WAV/M4A masters (10,890,370 / 15,992,131 bytes) — never a release candidate, exceed
  the production scanner's reach in `cloudmersive`-only mode, preserved only.
- Both cover PNGs (3,185,659 / 3,205,745 bytes) — exceed the 2,900,000-byte Cloudmersive ceiling in
  their original form; the pre-measured WebP candidates would fit but still need a human visual
  check and a separate artistic-approval decision before any upload, let alone release.

## After all four, once genuinely clean and administrator-released

- [ ] Re-confirm both real collaborations are still otherwise unchanged (status, metadata, zero
      members) — no invitation follows automatically from this checklist.
- [ ] Report the real production SHA-256, scan attempt IDs, and evidence for all four files.
