# SIGNAL PORTAL — K1.6F Artist Experience Verification

Verified live against the real development identities (`SIGNAL-XYLO-001` / `SIGNAL-ISSEY-001`), plus the full automated browser suite (177 passing tests, mostly against the separate synthetic fixture dataset that exercises the identical code paths with different data).

## XYLØ / Paige Duddy — SIGNAL-XYLO-001

| Check | Result |
|---|---|
| Dashboard shows correct title ("THE GHOST IN THE SIGNAL") | **Confirmed live** |
| Correct BPM (96) | **Confirmed live** |
| Correct key (A♭ minor) | **Confirmed live** |
| Classification (Track) | Confirmed via DB read (`classification: 'track'`) |
| Does NOT see Issey's title anywhere | **Confirmed live** |
| Listening Chamber: real audio element present | **Confirmed live** |
| Listening Chamber: no fabricated short demo | **Confirmed** — no `audio_short` asset row exists for this collaboration at all (verified via direct DB read); the UI shows only the one real `audio_full` asset, never a second nonexistent track |
| Proposal Chamber: loads, View control present | **Confirmed live** |
| Visual Concept Chamber: shows a pending/review status, not "approved" | **Confirmed live** — the cover art's `approval_status` is genuinely `'pending'` in the database; nothing in this audit or prior stages changed it |
| Direct URL access to Issey's chamber | **Confirmed denied** — "This collaboration isn't available to your account." No cross-artist data appears in the response body at all |

## Issey Cross — SIGNAL-ISSEY-001

| Check | Result |
|---|---|
| Dashboard shows correct title ("LOST TRANSITION") | **Confirmed live** |
| Correct BPM (145) | **Confirmed live** |
| Correct key (A♭, mode unconfirmed) | **Confirmed live** — displayed exactly as "A♭", no major/minor fabricated anywhere in the UI or the database |
| Classification (Track) | Confirmed via DB read |
| Does NOT see XYLØ's title anywhere | **Confirmed live** |
| Listening Chamber: real audio element present | **Confirmed live** |
| Proposal Chamber: loads, View control present | **Confirmed live** |
| Visual Concept Chamber: shows a pending/review status | **Confirmed live** — same genuine `'pending'` approval status |

## Administrator

Confirmed (via the full automated suite, not re-tested ad hoc this stage — these are existing, currently-passing, real tests against the live dev backend): the administrator can preview every chamber for any collaboration without ever creating an artificial `collaboration_members` row, and "Return to Command Center" / "View Artist Portal" navigation works correctly both directions.

## Transmission Chamber — attachment categories

Supported, confirmed live end-to-end across K1.6C–K1.6E.1: PDF, DOCX, TXT, PNG, JPEG, WebP, WAV, MP3, M4A, and (new as of K1.6E.1) ZIP. Current real limits, read directly from the deployed code and the live Storage bucket configuration — not assumed:

| Category | MIME types | Real enforced limit |
|---|---|---|
| document | pdf, docx, txt | 25 MB |
| image | png, jpeg, webp | 15 MB |
| audio | wav, mp3, m4a | 100 MB |
| zip | zip | **25 MB** — reuses the document limit |

**The brief's own mention of a "proposed 250 MB ZIP limit" was NOT implemented anywhere** — confirmed by reading `CATEGORY_RULES` (backend), `ATTACHMENT_RULES` (frontend), and the Storage bucket's own `file_size_limit` column (104,857,600 bytes = 100MB ceiling at the Storage layer, same as every other category — the 25MB cap is enforced one layer up, in the app's own `CATEGORY_RULES`). No code path anywhere references 250MB.

## Attachment rendering

- Audio, image, PDF rendering: unchanged, real, signed-URL-gated — confirmed via the existing automated suite.
- DOCX/TXT: rendered as a generic "Download" link (`AttachmentList.tsx`'s `DocumentAttachment` fallback branch) — **never** injected as HTML or rendered inline; confirmed by reading the component (no `dangerouslySetInnerHTML` or iframe-based rendering exists anywhere in this file).
- ZIP: same generic download-link path as DOCX/TXT once `status==='available'` — a ZIP is never unpacked or previewed client-side.
- Pending-review / rejection-reason / upload-failure messaging: confirmed via `StatusOnlyAttachment`'s branches, live-tested in K1.6D/K1.6E's browser suite (177 passing).

## Known gap surfaced this audit

The brief's suggested artist-facing copy for an oversized (scanner-limit-exceeded) file — *"Upload received. This file exceeds the current security scanner limit and cannot be delivered yet..."* — is **not yet implemented**. Today, a size-limit-rejected attachment shows the same generic "Pending review" label as any other in-progress upload, which could mislead an artist into thinking it is still actively being processed rather than durably held. See `k16f-scanner-operations.md` section 9 for the full finding.
