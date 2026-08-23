// ============================================================
// Avatar render asset registry — species -> foundation -> layer
// category -> optionId -> a real image asset. The ONLY place that
// maps a config value to actual artwork. No secrets, no prompts, no
// generation instructions — just paths, dimensions, and a
// production-readiness flag.
//
// Conceptual category set, shared across all species so the resolver/
// renderer never special-case a species by name:
//   base | eyes | headFeature | outfit | accent
// "headFeature" is deliberately not called "hair" — it means whatever
// that species' head-region trait is (Human: hairstyle. AI: head
// architecture. Alien: cranial/appendage form. Mythraxian: cranial/
// crystalline adornment. Glitch: manifestation/fragmentation form).
// Species-appropriate UI labels live in AVATAR_RENDER_CATEGORY_LABELS
// below — components must read labels from there, never hardcode
// "Hair" for a category that isn't hair on every species.
//
// READ BEFORE ADDING AN ENTRY:
//   - Every entry must point at a real, adequately-resolved image of
//     the SAME character as every other option in that species/
//     foundation (identity lock) — same face, pose, framing, lighting.
//     Never add an entry just to make a config option "have art."
//     resolveAvatarRenderState() falls back to a text-only summary for
//     any (species, foundation, category, optionId) with no entry
//     here — that's intended graceful degradation, not a bug.
//   - `productionReady: false` marks an asset that is real, correctly
//     identity-matched art but NOT yet clean for shipping (e.g. still
//     has UI chrome/labels baked into the pixels from an interim
//     export). AvatarRenderer visibly flags these so nobody mistakes
//     a temporary engineering asset for finished Moon Racer art.
//     Never deploy a productionReady:false pack as the final state —
//     swap in the clean re-export and flip the flag instead.
//   - Runtime assets under public/assets/avatar/renders/ are resized
//     derivatives of master art that lives outside this repo (the
//     artist's original exports). Never point this manifest at
//     public/assets/avatar/references/ (the separate canon-character
//     reference system) or delete/overwrite a master export.
// ============================================================

export const AVATAR_RENDER_BASE = 'assets/avatar/renders/';

export type AvatarRenderCategory = 'base' | 'eyes' | 'headFeature' | 'outfit' | 'accent';

export interface AvatarRenderAsset {
  /** Path relative to AVATAR_RENDER_BASE. */
  src: string;
  width: number;
  height: number;
  /** False = real art, correctly identity-matched, but not yet clean
   * for production (see module note). Defaults to true when omitted. */
  productionReady?: boolean;
  /** Short, dev-facing note on what's temporary about this asset.
   * Never shown to players outside a "temp preview" flag. */
  note?: string;
}

type CategoryMap = Partial<Record<AvatarRenderCategory, Record<string, AvatarRenderAsset>>>;

type SpeciesRenderMap = Record<string, Record<string, CategoryMap>>;

export const AVATAR_RENDER_MANIFEST: SpeciesRenderMap = {
  human: {
    racer: {
      // No dedicated neutral "base" shot of this specific character
      // exists yet — headFeature's default option (signal-crop, the
      // first HAIR_OPTIONS entry) doubles as the default displayed
      // portrait until one is produced. See resolveAvatarRenderState's
      // fallback-priority order.
      headFeature: {
        // Re-exported 2026-08-23 with the card chrome removed, at the
        // correct 1024x1536 canvas with a consistent warm-vignette
        // background. All four now clean — production, all promoted.
        'signal-crop': { src: 'human/racer/headFeature/signal-crop.png', width: 426, height: 640 },
        'drift-waves': { src: 'human/racer/headFeature/drift-waves.png', width: 426, height: 640 },
        'void-braid': { src: 'human/racer/headFeature/void-braid.png', width: 426, height: 640 },
        'static-shave': { src: 'human/racer/headFeature/static-shave.png', width: 426, height: 640 },
      },
      // eyes / outfit / accent: no per-option art delivered yet at a
      // resolution or single-file-per-option format this renderer can
      // honestly use (still flattened 4-in-a-grid contact sheets, or
      // below the resolution bar). Left empty on purpose.
    },
  },
};

/** Species-appropriate display label per category — components must
 * read from here rather than hardcoding "Hair" etc. Falls back to a
 * generic label for a species/category not listed. */
export const AVATAR_RENDER_CATEGORY_LABELS: Record<string, Partial<Record<AvatarRenderCategory, string>>> = {
  human: { headFeature: 'Hair' },
  hybrid: { headFeature: 'Hair' },
  ai: { headFeature: 'Head Architecture' },
  alien: { headFeature: 'Cranial Form' },
  mythraxian: { headFeature: 'Cranial Adornment' },
  glitch: { headFeature: 'Manifestation Form' },
};

const GENERIC_CATEGORY_LABELS: Record<AvatarRenderCategory, string> = {
  base: 'Base',
  eyes: 'Eyes',
  headFeature: 'Head Feature',
  outfit: 'Outfit',
  accent: 'Signal Accent',
};

export function getAvatarRenderCategoryLabel(species: string, category: AvatarRenderCategory): string {
  return AVATAR_RENDER_CATEGORY_LABELS[species]?.[category] ?? GENERIC_CATEGORY_LABELS[category];
}

/** Which foundation a given species should render as when no
 * explicit foundation is chosen (e.g. onboarding's flat species
 * picker). Only species with real render art appear here —
 * everything else resolves to `undefined` and the renderer degrades
 * to its non-visual fallback. */
export const DEFAULT_RENDER_FOUNDATION: Partial<Record<string, string>> = {
  human: 'racer',
};

export function getAvatarRenderAsset(
  species: string,
  foundation: string | undefined,
  category: AvatarRenderCategory,
  optionId: string | undefined,
): AvatarRenderAsset | null {
  if (!foundation || !optionId) return null;
  return AVATAR_RENDER_MANIFEST[species]?.[foundation]?.[category]?.[optionId] ?? null;
}
