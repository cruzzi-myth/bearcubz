import type { AvatarSpeciesId } from '../types/player';
import { AVATAR_COLOR_PALETTE, AVATAR_SPECIES_DEFINITIONS } from '../data/avatarSpecies';
import type { AvatarSpeciesDraft } from './avatarValidation';
import { HAIR_OPTIONS, EYE_OPTIONS, OUTFIT_OPTIONS, ACCENT_OPTIONS } from '../data/avatarOptions';
import {
  DEFAULT_RENDER_FOUNDATION,
  getAvatarRenderAsset,
  getAvatarRenderCategoryLabel,
  type AvatarRenderAsset,
  type AvatarRenderCategory,
} from '../data/avatarRenderManifest';

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

// ---- Real-image AvatarRenderer state ----
// Separate from the schematic AvatarPreviewGlyph above. Resolves the
// player's current selections to actual artwork where it exists, and
// to a plain text summary where it doesn't — see the graceful-
// degradation note in data/avatarRenderManifest.ts. This is the
// single source of truth AvatarRenderer consumes — both the
// onboarding picker and the full /universe/avatar creator feed their
// OWN already-owned state into the SAME resolveAvatarRenderState core
// below (via two small adapters, one per option catalog); neither
// page keeps a second copy of "what's currently selected."

export interface AvatarRenderLayerState {
  category: AvatarRenderCategory;
  label: string;
  optionId: string | undefined;
  optionLabel: string;
  /** Real artwork for this layer, or null if none exists yet (render
   * as text only — never fabricate a low-quality image). */
  asset: AvatarRenderAsset | null;
}

export interface AvatarRenderState {
  species: string;
  foundation: string | undefined;
  /** The single portrait currently shown, whichever category's asset
   * wins under the priority/last-changed rule below — null if nothing
   * has real art yet for this species/foundation at all. V1 swaps
   * whole portraits (no true layer compositing, since source art
   * isn't modular); this field is what "wins" that swap. */
  activeAsset: AvatarRenderAsset | null;
  /** Which category is currently driving activeAsset, or null when
   * activeAsset is null. */
  activeCategory: AvatarRenderCategory | null;
  layers: AvatarRenderLayerState[];
}

/** Default priority when the caller doesn't say which category the
 * player just touched — most visually-dominant trait wins. 'base' is
 * checked last, as the species/foundation's neutral default. */
const CATEGORY_PRIORITY: AvatarRenderCategory[] = ['headFeature', 'outfit', 'eyes', 'accent', 'base'];

/**
 * Generic core: given a species/foundation and the current selection
 * per category (with its already-resolved display label — each
 * caller knows its own option catalog), returns which single portrait
 * should be on screen right now and the per-category text summary.
 *
 * `lastChangedCategory` lets a caller say "the player just changed
 * X" so that category's asset wins even if a higher-priority category
 * also has art — keeps "instant visual update on the thing you just
 * touched" true once more than one category has real art. Optional;
 * falls back to CATEGORY_PRIORITY when omitted (e.g. first render).
 */
export function resolveAvatarRenderState(
  species: string,
  foundation: string | undefined,
  selections: Partial<Record<AvatarRenderCategory, { optionId: string | undefined; optionLabel: string }>>,
  lastChangedCategory?: AvatarRenderCategory | null,
): AvatarRenderState {
  const categories: AvatarRenderCategory[] = ['headFeature', 'eyes', 'outfit', 'accent'];

  const layers: AvatarRenderLayerState[] = categories.map((category) => {
    const selection = selections[category];
    return {
      category,
      label: getAvatarRenderCategoryLabel(species, category),
      optionId: selection?.optionId,
      optionLabel: selection?.optionLabel ?? selection?.optionId ?? '—',
      asset: getAvatarRenderAsset(species, foundation, category, selection?.optionId),
    };
  });

  const order = lastChangedCategory ? [lastChangedCategory, ...CATEGORY_PRIORITY.filter((c) => c !== lastChangedCategory)] : CATEGORY_PRIORITY;

  let activeAsset: AvatarRenderAsset | null = null;
  let activeCategory: AvatarRenderCategory | null = null;
  for (const category of order) {
    if (category === 'base') {
      const asset = getAvatarRenderAsset(species, foundation, 'base', 'default');
      if (asset) {
        activeAsset = asset;
        activeCategory = 'base';
        break;
      }
      continue;
    }
    const layer = layers.find((l) => l.category === category);
    if (layer?.asset) {
      activeAsset = layer.asset;
      activeCategory = category;
      break;
    }
  }

  return { species, foundation, activeAsset, activeCategory, layers };
}

/** Onboarding's flat hair/eyes/outfit/accent picker -> real render
 * state. Mirrors computeOnboardingPreviewParams's inputs exactly so
 * callers don't need to track two shapes of "current selection". */
export function resolveOnboardingAvatarRenderState(
  baseModel: string,
  hair: string,
  eyes: string,
  outfit: string,
  accent: string,
  lastChangedCategory?: AvatarRenderCategory | null,
): AvatarRenderState {
  const foundation = DEFAULT_RENDER_FOUNDATION[baseModel];
  const label = (catalog: { id: string; label: string }[], id: string) => catalog.find((o) => o.id === id)?.label ?? id;

  return resolveAvatarRenderState(
    baseModel,
    foundation,
    {
      headFeature: { optionId: hair, optionLabel: label(HAIR_OPTIONS, hair) },
      eyes: { optionId: eyes, optionLabel: label(EYE_OPTIONS, eyes) },
      outfit: { optionId: outfit, optionLabel: label(OUTFIT_OPTIONS, outfit) },
      accent: { optionId: accent, optionLabel: label(ACCENT_OPTIONS, accent) },
    },
    lastChangedCategory,
  );
}

// ---- Full /universe/avatar creator (AvatarCreationPage.tsx) ----
// The rich per-species customization-group system (avatarSpecies.ts)
// predates this renderer and uses its own option ids, which for
// Human's hair_style group don't match data/avatarOptions.ts's
// canonical hair ids at all (dreadlocks/shaved/short_cropped/
// long_loose/braided vs signal-crop/drift-waves/void-braid/static-
// shave). Rather than fork a second manifest/resolver for this page,
// or fabricate new art, this is a small, explicit bridge from the
// rich creator's ids to the nearest matching canonical render asset.
// TEMPORARY: once art exists that's actually built for these ids (or
// the rich creator's ids are reconciled with the canonical set), this
// bridge should go away in favor of a direct 1:1 lookup.
const HUMAN_HAIR_STYLE_TO_RENDER_ID: Record<string, string> = {
  shaved: 'static-shave',
  short_cropped: 'signal-crop',
  long_loose: 'drift-waves',
  braided: 'void-braid',
  dreadlocks: 'void-braid', // closest available texture match — no dedicated dreadlocks render yet
};

/** The full species creator's current draft -> real render state.
 * Only Human/Racer resolves to anything visual today (see the module
 * note above and data/avatarRenderManifest.ts); every other species/
 * foundation naturally falls through to AvatarRenderer's schematic
 * fallback via an empty/no-match selection set. */
export function resolveSpeciesAvatarRenderState(
  species: AvatarSpeciesId,
  draft: AvatarSpeciesDraft | undefined,
  lastChangedCategory?: AvatarRenderCategory | null,
): AvatarRenderState {
  const foundation = draft?.foundation ?? DEFAULT_RENDER_FOUNDATION[species];
  const values = draft?.values ?? {};

  const hairStyleValue = typeof values.hair_style === 'string' ? values.hair_style : undefined;
  const renderHairId = species === 'human' && hairStyleValue ? HUMAN_HAIR_STYLE_TO_RENDER_ID[hairStyleValue] : undefined;
  const hairLabel = renderHairId ? (HAIR_OPTIONS.find((o) => o.id === renderHairId)?.label ?? renderHairId) : (hairStyleValue ?? '—');

  return resolveAvatarRenderState(
    species,
    foundation,
    {
      headFeature: { optionId: renderHairId, optionLabel: hairLabel },
      // eyes/outfit/accent: the rich creator's option ids for these
      // groups don't correspond to any canonical render id yet either
      // (see the module note) — left unset so they resolve to a plain
      // text summary rather than a fabricated match.
    },
    lastChangedCategory,
  );
}
