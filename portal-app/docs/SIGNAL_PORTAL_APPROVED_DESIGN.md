# Signal Portal — Approved Entrance Design Baseline

Status: **APPROVED** (Stage I2F). The desktop entrance composition described
here is the authoritative visual reference. Do not redesign, replace, or
materially alter any element listed under "Preserve" without explicit
re-approval. This document exists so future stages have a concrete
baseline to check against, not a memory of what was agreed.

## Approved artwork

| Composition | File | Dimensions | Used at |
|---|---|---|---|
| Landscape (desktop) | `public/assets/signal-portal/portal-entrance-wide.webp` (source: `portal-entrance-wide.png`, retained locally) | 1672 × 941 px | viewport width ≥ 1280px |
| Portrait (tablet/mobile) | `public/assets/signal-portal/portal-entrance.webp` | 1199 × 1312 px | viewport width < 1280px |

Both are single, unedited composite images — every visible element (branding,
title, character, terminal, panels) is baked into the artwork itself. No part
of the UI is reconstructed as separate HTML over the image; the artwork *is*
the interface.

## Elements that must remain unchanged

- BEλR CUBZ branding (upper-left) and "ACCESS // ARTIST ONLY" badge (upper-right)
- "SIGNAL PORTAL" title lockup and the glowing planetary ring behind it
- The main character and her surrounding cyberpunk city architecture
- The "ENTER THE SIGNAL" authentication terminal frame
- The fingerprint scanner graphic and its "IDENTITY SYNC ENCRYPTED" label
- The four illustrated navigation panels (Listen / Proposal / Visuals / Respond)
- The left-side label column (Music / Collaborations / Proposals / Visuals / Transmissions)
- The central circular platform at the bottom
- Magenta/cyan neon color language and overall atmospheric density

Only the illustrated "ACCESS CODE / INVITATION" field is intentionally
**not** wired to anything — the real flow has no access-code concept, so it
stays pure background art (see "Authentication behavior" below).

## Desktop overlay coordinates (landscape, 1672×941)

Source of truth: `src/pages/entranceOverlayRegions.ts`, `WIDE_OVERLAY_REGIONS`.
Measured directly against the real file with a Python/Pillow coordinate-grid
overlay (not estimated). All values are percentages of the 1672×941 image,
so they scale with it at any rendered size.

| Control | left,top,width,height (px, of 1672×941) |
|---|---|
| Artist email input | 655, 424, 297, 35 |
| Access Portal button | 640, 514, 320, 40 |
| Fingerprint scanner | 978, 410, 89, 87 |
| Listen panel | 475, 605, 172, 100 |
| Proposal panel | 665, 605, 170, 100 |
| Visuals panel | 852, 605, 168, 100 |
| Respond panel | 1040, 605, 145, 100 |
| Left-nav: Music | 478, 345, 142, 17 (inert — no destination) |
| Left-nav: Collaborations | 478, 362, 142, 17 |
| Left-nav: Proposals | 478, 379, 142, 17 |
| Left-nav: Visuals | 478, 396, 142, 17 |
| Left-nav: Transmissions | 478, 413, 142, 17 |

## Mobile/tablet overlay coordinates (portrait, 1199×1312)

Source of truth: same file, `OVERLAY_REGIONS`. A **separate, independently
measured** coordinate set — never the landscape numbers reused on the
portrait image, or vice versa.

| Control | left,top,width,height (px, of 1199×1312) |
|---|---|
| Artist email input | 320, 627, 440, 40 |
| Access Portal button | 310, 750, 447, 55 |
| Fingerprint scanner | 787, 605, 118, 120 |
| Listen panel | 75, 885, 245, 150 |
| Proposal panel | 345, 885, 247, 150 |
| Visuals panel | 607, 885, 245, 150 |
| Respond panel | 880, 885, 245, 150 |
| Left-nav rows | 75, {505,528,550,572,595}, 150, 20 |

## Responsive image-selection behavior

`useEntranceVariant()` in `EntrancePage.tsx` picks the composition
synchronously from `window.innerWidth` on first render (no flash of the
wrong variant) and re-checks on resize:

- **≥ 1280px**: landscape artwork + `WIDE_OVERLAY_REGIONS`.
- **< 1280px**: portrait artwork + `OVERLAY_REGIONS`.

The stage container's `aspect-ratio` and a `--sp-stage-ratio` CSS custom
property are set inline from the active variant's real dimensions, sized via
`width: min(100vw, 100vh × ratio)` — the full artwork always fits the
viewport with no cropping and no scroll needed to reach the terminal.

**Known limitation** (documented, not fixed — see Stage I2F report for the
proposed correction): at extreme ultrawide ratios where the viewport is
significantly wider than the artwork's own 1.78:1 ratio (e.g. 2560×1080,
3440×1440), the stage becomes height-constrained and visible black bars
appear on both sides. No control is cropped or misaligned in this case —
it's a cosmetic gap, not a functional defect. 1920×1080 (ratio 1.78, nearly
identical to the artwork) fills edge-to-edge with no gap.

## Authentication behavior

- Email input is a real `<input type="email">`; submission calls the real
  `portal-request-access` Edge Function and always shows the same neutral
  response regardless of eligibility.
- The Access Portal button and the fingerprint scanner both submit the same
  form — the fingerprint is explicitly labeled as not performing real
  biometric verification.
- The illustrated "Access Code / Invitation" field has no interactive
  overlay at all; it is never styled as clickable or focusable.

## Navigation behavior

All four panels and the three functional left-nav links reuse the same
pure, already-unit-tested `resolveQuickAction`/`resolveForCollaboration`
functions NYX Ardent uses — never a separate authorization path. Signed-out
or not-yet-authorized clicks show an honest inline message, never fabricated
navigation. An artist with more than one authorized collaboration is always
shown an explicit selection prompt; nothing is auto-picked.

## Change control

Any future change to artwork, overlay coordinates, or the elements listed
above should update this document in the same change, and should be called
out explicitly as a deviation from this approved baseline rather than a
routine edit.
