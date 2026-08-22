// ============================================================
// Avatar V1 — a small, hand-curated cosmetic catalog, NOT the Phase 3
// creator. There is no options table backing this yet, so these are
// static, clearly-provisional Moon Racer-themed choices. Every value
// here is a plain string stored directly in player_avatar's matching
// column (hair, eyes, outfit, accent) — swapping this file out for a
// real catalog later is a data change, not a schema change.
// ============================================================

export interface AvatarOptionChoice {
  id: string;
  label: string;
}

export const HAIR_OPTIONS: AvatarOptionChoice[] = [
  { id: 'signal-crop', label: 'Signal Crop' },
  { id: 'drift-waves', label: 'Drift Waves' },
  { id: 'void-braid', label: 'Void Braid' },
  { id: 'static-shave', label: 'Static Shave' },
];

export const EYE_OPTIONS: AvatarOptionChoice[] = [
  { id: 'cyan-visor', label: 'Cyan Visor' },
  { id: 'ember-glow', label: 'Ember Glow' },
  { id: 'violet-scan', label: 'Violet Scan' },
  { id: 'mono-dark', label: 'Mono Dark' },
];

export const OUTFIT_OPTIONS: AvatarOptionChoice[] = [
  { id: 'racer-jacket', label: 'Racer Jacket' },
  { id: 'signal-cloak', label: 'Signal Cloak' },
  { id: 'core-uniform', label: 'Core Uniform' },
  { id: 'outer-rim-gear', label: 'Outer Rim Gear' },
];

export const ACCENT_OPTIONS: AvatarOptionChoice[] = [
  { id: 'cyan', label: 'Cyan' },
  { id: 'magenta', label: 'Magenta' },
  { id: 'amber', label: 'Amber' },
  { id: 'none', label: 'None' },
];
