// Normalized (percentage-of-artwork) coordinates for every interactive
// region baked into the Signal Portal entrance artwork. Two separate
// compositions exist — the original portrait piece and the Stage I2E
// landscape/ultrawide piece — and they are NOT the same image scaled
// differently: the landscape version is a distinct generated
// composition (same central scene, newly extended environment either
// side), so its interactive elements sit at different coordinates and
// get their own independently-measured region set. Never reuse one
// set on the other image.
//
// Both sets were measured directly against their real source files
// with a Python/Pillow coordinate-grid overlay — not guessed.

interface PixelBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

function toPercentBox(imageWidth: number, imageHeight: number, { left, top, width, height }: PixelBox) {
  return {
    left: `${(left / imageWidth) * 100}%`,
    top: `${(top / imageHeight) * 100}%`,
    width: `${(width / imageWidth) * 100}%`,
    height: `${(height / imageHeight) * 100}%`,
  };
}

// ---------- Portrait composition (portal-entrance.webp, 1199×1312) — mobile & tablet ----------
export const ARTWORK_WIDTH = 1199;
export const ARTWORK_HEIGHT = 1312;

const portraitBox = (box: PixelBox) => toPercentBox(ARTWORK_WIDTH, ARTWORK_HEIGHT, box);

// The illustrated "ACCESS CODE / INVITATION" field is deliberately NOT
// in either region map — the real flow has no access-code concept at
// all (eligibility is checked server-side from the email alone).
// Making that field interactive would mean building a control that
// does nothing, which was explicitly prohibited. It's left as pure
// background art in both compositions: never styled as clickable,
// never focusable.
export const OVERLAY_REGIONS = {
  email: portraitBox({ left: 320, top: 627, width: 440, height: 40 }),
  accessPortal: portraitBox({ left: 310, top: 750, width: 447, height: 55 }),
  fingerprint: portraitBox({ left: 787, top: 605, width: 118, height: 120 }),
  panels: {
    listen: portraitBox({ left: 75, top: 885, width: 245, height: 150 }),
    proposal: portraitBox({ left: 345, top: 885, width: 247, height: 150 }),
    visuals: portraitBox({ left: 607, top: 885, width: 245, height: 150 }),
    respond: portraitBox({ left: 880, top: 885, width: 245, height: 150 }),
  },
  leftNav: {
    music: portraitBox({ left: 75, top: 505, width: 150, height: 20 }),
    collaborations: portraitBox({ left: 75, top: 528, width: 150, height: 20 }),
    proposals: portraitBox({ left: 75, top: 550, width: 150, height: 20 }),
    visuals: portraitBox({ left: 75, top: 572, width: 150, height: 20 }),
    transmissions: portraitBox({ left: 75, top: 595, width: 150, height: 20 }),
  },
} as const;

// ---------- Landscape composition (portal-entrance-wide.webp, 1672×941) — Stage I2E, desktop ----------
export const WIDE_ARTWORK_WIDTH = 1672;
export const WIDE_ARTWORK_HEIGHT = 941;

const wideBox = (box: PixelBox) => toPercentBox(WIDE_ARTWORK_WIDTH, WIDE_ARTWORK_HEIGHT, box);

export const WIDE_OVERLAY_REGIONS = {
  email: wideBox({ left: 655, top: 424, width: 297, height: 35 }),
  accessPortal: wideBox({ left: 640, top: 514, width: 320, height: 40 }),
  fingerprint: wideBox({ left: 978, top: 410, width: 89, height: 87 }),
  panels: {
    listen: wideBox({ left: 475, top: 605, width: 172, height: 100 }),
    proposal: wideBox({ left: 665, top: 605, width: 170, height: 100 }),
    visuals: wideBox({ left: 852, top: 605, width: 168, height: 100 }),
    respond: wideBox({ left: 1040, top: 605, width: 145, height: 100 }),
  },
  leftNav: {
    music: wideBox({ left: 478, top: 345, width: 142, height: 17 }),
    collaborations: wideBox({ left: 478, top: 362, width: 142, height: 17 }),
    proposals: wideBox({ left: 478, top: 379, width: 142, height: 17 }),
    visuals: wideBox({ left: 478, top: 396, width: 142, height: 17 }),
    transmissions: wideBox({ left: 478, top: 413, width: 142, height: 17 }),
  },
} as const;

// Desktop/landscape threshold — matches the Stage I2E brief's explicit
// "Desktop: 1280 pixels and wider: use portal-entrance-wide.webp"
// instruction. Below this, the tablet/mobile portrait composition is
// used instead (a 768-wide tablet showing the very wide landscape
// image width-constrained would squash the terminal into a thin
// strip; the portrait image's own aspect ratio fits a tall viewport
// far better and keeps every control clearly sized).
export const WIDE_BREAKPOINT_PX = 1280;
