# SIGNAL PORTAL — K1.6N Replacement Upload Steps

## What actually happened

The owner uploaded the **original, unoptimized masters** for three of the four files by mistake —
confirmed directly against production: their exact byte counts (10,890,370 / 4,667,217 / 15,992,131)
match the known *inactive original* rows in the development inventory exactly, not the optimized
versions. All three correctly failed with `EXCEEDS_SCANNER_SIZE_LIMIT` — the scanner did exactly
what it should. Issey Cross's proposal PDF (1,706,658 bytes) is the correct optimized file, and is
genuinely clean — and already approved and `ready` in production (ahead of this stage's own
starting description; confirmed by direct query, not assumed).

## No code change was needed

Inspected the existing Asset Library upload workflow (`portal-admin-request-upload-url`) — it
**already** retires any incomplete/failed previous attempt of the same asset category for the same
collaboration automatically, the moment a new upload for that same slot begins:

> "an incomplete previous attempt at the SAME asset_type for this collaboration is retired
> (is_active = false)... This runs automatically the next time this slot is retried."

Confirmed against the real failing rows: all three have `upload_status = 'verifying'`, which is
exactly one of the states this retirement logic matches. **The owner does not need to delete or
mark anything inactive first** — simply uploading the correct file under the same category for the
same collaboration will automatically retire the oversized attempt. Nothing was bypassed, nothing
was fabricated, and this is the existing, already-reviewed mechanism — not a new code path.

Issey Cross's successful proposal (`proposal_pdf`) is a different category than her failed audio
(`audio_full`) — the retirement query is scoped to matching category, so re-uploading her correct
audio file cannot touch her already-approved proposal in any way.

## The three correct files

Exported fresh from development Storage and verified byte-for-byte and SHA-256 against the K1.6L
manifest — all three match exactly:

| File | Local path | Bytes | SHA-256 |
|---|---|---:|---|
| XYLØ demo | `/Users/bearcubz/Desktop/SIGNAL_PORTAL_CORRECT_UPLOADS/XYLO-demo-optimized-2.4MB.mp3` | 2,388,252 | `3128e7414fa7767bda89e3913ee9eb6a73622d522c2e592dbd44103ab542a8b3` |
| XYLØ proposal | `/Users/bearcubz/Desktop/SIGNAL_PORTAL_CORRECT_UPLOADS/XYLO-proposal-optimized-210KB.pdf` | 210,264 | `87bf93a6b14bec8822ab25e31bcb6c8d2db86f5765ec8868d45827d4a08de017` |
| Issey Cross demo | `/Users/bearcubz/Desktop/SIGNAL_PORTAL_CORRECT_UPLOADS/ISSEY-demo-optimized-2.1MB.mp3` | 2,113,685 | `703c7e185a1b28cacb8aaedb5903377d9dd3ebc25c474c5cb6e8ee3681cc1255` |

This folder is on your Desktop (outside the git repository) and has been revealed in Finder.

## Exact steps, one at a time

For each of the three, in the Asset Library:

1. Select the correct collaboration (same as before — THE GHOST IN THE SIGNAL for the two XYLØ
   files, LOST TRANSITION for the Issey Cross file).
2. Select the **same category** you used last time (Audio — Full Recording / your chosen label for
   the demos, Proposal PDF for the XYLØ proposal).
3. This time, choose the file from `/Users/bearcubz/Desktop/SIGNAL_PORTAL_CORRECT_UPLOADS/` using
   the exact filename above — not the original master.
4. Upload. The old oversized attempt will disappear from the active list automatically (retired,
   not deleted — its row and audit trail survive for the record). Watch the Security column reach
   a genuine `clean` verdict before starting the next file.
5. Stop there per file — don't click "Approve security release" unless you're ready to; that
   remains your decision alone, same as always.

Issey Cross's proposal needs no action — it's already clean, approved, and `ready`.

## If you'd also like, optional and not required

You can click "Mark Inactive" on the three failed rows first, purely for your own visual clarity in
the table — the automatic retirement above means this isn't necessary, but it's harmless if you'd
rather do it explicitly.
