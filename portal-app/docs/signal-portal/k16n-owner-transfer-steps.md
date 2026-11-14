# SIGNAL PORTAL — K1.6N Owner-Performed Transfer Steps

Same root condition as every prior stage: this environment has no authenticated administrator
session and will not attempt to create one (explicitly prohibited again in this stage's own brief).
Per that brief's own section 4 — "if the current tooling cannot complete the authorized
administrator upload without an interactive browser session, provide the owner with the exact
steps" — this is that fallback. Everything that *can* be done without a session (file verification,
collaboration-ID confirmation, artwork prep) has already been done — see
`k16n-implementation-report.md`.

## One discrepancy found before you start — please confirm

This stage's brief specifies category **"Audio — Short Demo"** for both audio files. The existing
development inventory (carried through every prior stage's own documentation,
`k16i1-artist-asset-inventory.md` / `k16j-collaboration-inventory.md`) classifies both as
**`audio_full`** ("Audio — Full Recording") — they are the already-optimized 128kbps MP3 masters,
not a separate short teaser cut. There is no functional difference between the two categories
(same bucket, same size limits) — this is purely a label choice. **I have not decided this for
you.** Pick one before step 2/5 below:
- **Audio — Full Recording** (matches every prior stage's own classification of these exact files), or
- **Audio — Short Demo** (matches this stage's literal wording).

## Files, in the required order — wait for each scan to finish before starting the next

All four were re-verified immediately before writing this (bytes downloaded fresh from development
Storage and re-hashed, not reused from memory):

| # | File | Exact bytes | SHA-256 |
|---|---|---:|---|
| 1 | XYLØ demo MP3 | 2,388,252 | `3128e7414fa7767bda89e3913ee9eb6a73622d522c2e592dbd44103ab542a8b3` |
| 2 | XYLØ proposal PDF | 210,264 | `87bf93a6b14bec8822ab25e31bcb6c8d2db86f5765ec8868d45827d4a08de017` |
| 3 | Issey Cross demo MP3 | 2,113,685 | `703c7e185a1b28cacb8aaedb5903377d9dd3ebc25c474c5cb6e8ee3681cc1255` |
| 4 | Issey Cross proposal PDF | 1,706,658 | `288509bd2205d410d9fc8203e9b257d52965061bb9404362e92f4b9710038974` |

All four are below the 2,900,000-byte production Cloudmersive threshold.

### Step-by-step, for each file

1. Open `https://bearcubz.com/portal/admin`, go to **Asset Library**.
2. Select the correct collaboration — **THE GHOST IN THE SIGNAL** (XYLØ, production id
   `45b9a584-f438-4ac1-be29-a00cb9e59e48`) for files 1–2, **LOST TRANSITION** (Issey Cross,
   production id `211a3334-1777-4da0-b07f-c83753d89482`) for files 3–4. Do not rely on the display
   name alone — the dropdown list only shows these two real collaborations, both currently with 0
   assets.
3. Fill in exactly:

**File 1 — XYLØ demo:**
- Category: Audio — Full Recording *(or Short Demo — your choice above)*
- Display label: `THE GHOST IN THE SIGNAL — PRIVATE DEMO`
- Description: `Private collaboration demo prepared by BEλR CUBZ for XYLØ. Internal review only. Not publicly released through SIGNAL PORTAL.`

**File 2 — XYLØ proposal:**
- Category: Proposal PDF
- Display label: `THE GHOST IN THE SIGNAL — COLLABORATION PROPOSAL`
- Description: `Private creative proposal for the XYLØ collaboration, including project direction and production concepts.`

**File 3 — Issey Cross demo:**
- Category: Audio — Full Recording *(or Short Demo — your choice above)*
- Display label: `LOST TRANSITION — PRIVATE DEMO`
- Description: `Private collaboration demo prepared by BEλR CUBZ for Issey Cross. Internal review only. Not publicly released through SIGNAL PORTAL.`

**File 4 — Issey Cross proposal:**
- Category: Proposal PDF
- Display label: `LOST TRANSITION — COLLABORATION PROPOSAL`
- Description: `Private creative proposal for the Issey Cross collaboration, including project direction and production concepts.`

4. Select the actual file from your own copy of the development export (or wherever you keep the
   real masters) — **not** the synthetic fixture from K1.6K/K1.6L.
5. Upload, and watch the Security column move to a genuine `clean` verdict with a `cloudmersive`
   detail before starting the next file.
6. **Stop there for each file.** Do not click "Approve security release" unless you're ready to —
   that decision is yours alone; nothing on my side will click it automatically.
7. Once you've uploaded all four (or as many as you're ready to do in one sitting), let me know and
   I'll verify every genuine scan-evidence record, byte count, and SHA-256 against production
   directly, and report back exactly what's clean/pending/approved.

## If anything doesn't match

If a file is rejected, times out, comes back infected, or any displayed size/SHA-256 doesn't match
the table above — stop that one file, leave it as-is, and tell me what you saw. The other files
can still proceed independently. Nothing here increases any size limit or disables scanning to force
a result.

## Artwork — no action needed yet

Both cover WebP candidates have been regenerated fresh from the real, unchanged original PNGs and
saved locally for you to look at whenever you'd like — see `k16n-implementation-report.md` section
I for the exact location. Nothing has been uploaded, scanned, or approved. This is unrelated to the
four-file transfer above and needs no action from you right now.
