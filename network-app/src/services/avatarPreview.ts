import type { AvatarSpeciesId } from '../types/player';
import { AVATAR_COLOR_PALETTE, AVATAR_SPECIES_DEFINITIONS } from '../data/avatarSpecies';
import type { AvatarSpeciesDraft } from './avatarValidation';

// ============================================================
// Maps a player's in-progress selections to a small set of visual
// parameters for AvatarPreviewGlyph — a reactive SCHEMATIC preview,
// not a rendered character. There is no per-option artwork (only 9
// species/foundation reference portraits total), so this is built
// from a handful of generic "visual channels" every species'
// customization groups map into, rather than one bespoke mapping per
// species. Pure/testable — no DOM, no React.
// ============================================================

export interface AvatarPreviewParams {
  species: AvatarSpeciesId;
  /** Which base silhouette shape to draw. Hybrid blends two. */
  baseShape: AvatarSpeciesId;
  /** For Hybrid only: the secondary shape to blend toward. */
  blendShape: AvatarSpeciesId | null;
  /** 0-1, how far toward blendShape the silhouette leans (hybrid_ratio / 100). */
  blendAmount: number;
  /** Silhouette width multiplier, derived from a body/build-ish choice. */
  scale: number;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  /** 0-3 — density of small decorative marks (augmentation, engraving, circuitry, etc). */
  detailIntensity: number;
  /** Glitch only: how broken the silhouette outline looks, 0-3. */
  fragmentation: number;
}

const DEFAULT_HUE: Record<AvatarSpeciesId, string> = {
  human: '#00e5ff',
  alien: '#8b5cf6',
  hybrid: '#00e5ff',
  ai: '#d4af37',
  mythraxian: '#d4af37',
  glitch: '#8b5cf6',
};

const FOUNDATION_HUE: Record<string, string> = {
  xyren: '#ff2d55',
  human_passing: '#00e5ff',
};

function hexFor(colorId: string | undefined): string | null {
  if (!colorId) return null;
  return AVATAR_COLOR_PALETTE.find((c) => c.id === colorId)?.hex ?? null;
}

/** Groups whose value feeds a specific visual channel. Listed by the
 * customization-group id, which is stable across species (see
 * avatarSpecies.ts) even though not every species has every group. */
const HAIR_OR_HEAD_COLOR_GROUPS = ['hair_color', 'eye_color', 'optic_color', 'luminous_eye_color', 'surface_color', 'dermal_tone', 'shell_color'];
const ACCENT_COLOR_GROUPS = ['signal_color', 'marking_color', 'signal_appearance', 'crystal_coloration', 'core_color', 'circuitry_color'];
const BUILD_GROUPS = ['build', 'body_proportions', 'chassis_structure', 'body_structure', 'base_form', 'body_build'];
const DETAIL_GROUPS = ['augmentation_level', 'engraving_density', 'circuitry', 'fragmentation_intensity', 'bioluminescence', 'exposed_mechanics'];

const NARROW_HINTS = ['slender', 'minimal', 'featherless'];
const WIDE_HINTS = ['heavy', 'dense', 'muscular', 'reinforced', 'compact', 'elongated'];

const DETAIL_HINTS: [string[], number][] = [
  [['none', 'minimal'], 0],
  [['low', 'sparse', 'faint', 'subtle'], 1],
  [['medium', 'moderate'], 2],
  [['high', 'dense', 'heavy', 'extensive', 'radiant', 'pervasive', 'dominant'], 3],
];

function firstMatchingValue(values: Record<string, string | boolean | undefined>, groupIds: string[]): string | undefined {
  for (const id of groupIds) {
    const v = values[id];
    if (typeof v === 'string' && v) return v;
  }
  return undefined;
}

function scaleFromBuild(value: string | undefined): number {
  if (!value) return 1;
  if (NARROW_HINTS.some((h) => value.includes(h))) return 0.88;
  if (WIDE_HINTS.some((h) => value.includes(h))) return 1.14;
  return 1;
}

function intensityFromDetail(value: string | undefined): number {
  if (!value) return 0;
  for (const [hints, level] of DETAIL_HINTS) {
    if (hints.some((h) => value.includes(h))) return level;
  }
  return 1;
}

export function computeAvatarPreviewParams(
  species: AvatarSpeciesId,
  draft: AvatarSpeciesDraft | undefined,
): AvatarPreviewParams {
  const def = AVATAR_SPECIES_DEFINITIONS[species];
  const values = draft?.values ?? {};

  const foundationHue = draft?.foundation ? FOUNDATION_HUE[draft.foundation] : undefined;
  const baseHue = foundationHue ?? DEFAULT_HUE[species];

  const primaryColor = hexFor(firstMatchingValue(values, HAIR_OR_HEAD_COLOR_GROUPS)) ?? baseHue;
  const accentColor = hexFor(firstMatchingValue(values, ACCENT_COLOR_GROUPS)) ?? baseHue;

  const buildGroupIds = def.customizationGroups.filter((g) => BUILD_GROUPS.includes(g.id)).map((g) => g.id);
  const scale = scaleFromBuild(firstMatchingValue(values, buildGroupIds));

  const detailGroupIds = def.customizationGroups.filter((g) => DETAIL_GROUPS.includes(g.id)).map((g) => g.id);
  const detailIntensity = intensityFromDetail(firstMatchingValue(values, detailGroupIds));

  let baseShape: AvatarSpeciesId = species;
  let blendShape: AvatarSpeciesId | null = null;
  let blendAmount = 0;
  let secondaryColor = baseHue;

  const primarySpecies: AvatarSpeciesId | null | undefined = draft?.primarySpecies;
  const secondarySpecies: AvatarSpeciesId | null | undefined = draft?.secondarySpecies;
  if (species === 'hybrid' && primarySpecies && secondarySpecies) {
    baseShape = primarySpecies;
    blendShape = secondarySpecies;
    blendAmount = (draft?.hybridRatio ?? 50) / 100;
    secondaryColor = DEFAULT_HUE[secondarySpecies];
  }

  let fragmentation = 0;
  if (species === 'glitch') {
    const human = draft?.glitchHumanRatio ?? 0;
    const alien = draft?.glitchAlienRatio ?? 0;
    const ai = draft?.glitchAiRatio ?? 0;
    // More evenly split composition reads as less stable/more fragmented;
    // a heavily dominant single influence reads as more coherent.
    const dominant = Math.max(human, alien, ai);
    fragmentation = dominant >= 70 ? 1 : dominant >= 45 ? 2 : 3;
  }

  return {
    species,
    baseShape,
    blendShape,
    blendAmount,
    scale,
    primaryColor,
    secondaryColor,
    accentColor,
    detailIntensity,
    fragmentation,
  };
}

// ---- Onboarding's lightweight picker (OnboardingPage.tsx) ----
// A separate, simpler avatar step from the full species creator: base
// preset + hair/eyes/outfit/accent from data/avatarOptions.ts, not the
// rich foundation/customization-group system above. Small dedicated
// mapping rather than forcing that flat shape through
// computeAvatarPreviewParams's AvatarSpeciesDraft-shaped API.

/** Eye style ids from data/avatarOptions.ts's EYE_OPTIONS encode a
 * color in their name already — reuse it as the preview's primary hue
 * rather than leaving eye choice visually inert. */
const ONBOARDING_EYE_HUE: Record<string, string> = {
  'cyan-visor': '#00e5ff',
  'ember-glow': '#ffb700',
  'violet-scan': '#8b5cf6',
  'mono-dark': '#15151f',
};

/** Hairstyle ids from HAIR_OPTIONS, loosely ordered from plainest to
 * most elaborate — just enough to make the detail-dot count move. */
const ONBOARDING_HAIR_DETAIL: Record<string, number> = {
  'static-shave': 0,
  'signal-crop': 1,
  'drift-waves': 2,
  'void-braid': 3,
};

export function computeOnboardingPreviewParams(baseModel: string, hair: string, eyes: string, accent: string): AvatarPreviewParams {
  const species = (AVATAR_SPECIES_DEFINITIONS[baseModel as AvatarSpeciesId] ? baseModel : 'human') as AvatarSpeciesId;
  const baseHue = DEFAULT_HUE[species];

  return {
    species,
    baseShape: species,
    blendShape: null,
    blendAmount: 0,
    scale: 1,
    primaryColor: ONBOARDING_EYE_HUE[eyes] ?? baseHue,
    secondaryColor: baseHue,
    accentColor: hexFor(accent) ?? baseHue,
    detailIntensity: ONBOARDING_HAIR_DETAIL[hair] ?? 1,
    fragmentation: species === 'glitch' ? 1 : 0,
  };
}
