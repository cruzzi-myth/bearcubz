// Single place to change her identity later — nothing elsewhere in
// this feature imports a hardcoded name. If a canonical Moon Racer
// NPC name is ever assigned instead, this is the only file that
// needs to change.
export const PORTAL_HOST_CONFIG = {
  designation: 'NYX ARDENT',
  displayName: 'Nyx Ardent',
  role: 'Signal Portal Host & Creative Liaison',
  affiliation: 'THE COLLECTIVE',
  artworkSrc: 'assets/signal-portal/characters/nyx-ardent.webp',
  artworkAlt: 'Nyx Ardent — a cybernetic woman in dark armor with cyan and violet circuitry, the Signal Portal host',
} as const;
