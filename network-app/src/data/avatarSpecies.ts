import type { AvatarSpeciesId } from '../types/player';
import { AVATAR_SPECIES } from '../types/player';

export { AVATAR_SPECIES };

// ============================================================
// Species definitions — Avatar Phase 2B.
//
// This is UI/configuration metadata ONLY: display copy, reference
// art paths, which customization groups a species exposes and what
// wizard step they belong to, and the option catalog for each group.
// It contains no prompt text, no generation instructions, and no
// secrets — server-side prompt construction (Avatar Phase 3+) is a
// separate, private system this module must never leak into.
//
// Architecture: avatarSpecies.ts -> species -> foundations ->
// customizationGroups -> options -> AvatarCreationPage ->
// player_avatar.configuration. AvatarCreationPage renders itself
// entirely from this data — it does not hardcode per-species JSX.
//
// Reference art: nine images live in
// public/assets/avatar/references/{species}/, copied (not moved) from
// the real Moon Racer character-card art audited in Avatar Phase 2A.
// They are VISUAL FOUNDATION REFERENCES for players building an
// original character — never a "become this character" selection.
// Foundation-level images (Alien/AI) exist because those two species
// have two verified, visually distinct biological/construction
// foundations; the other four species show their one or two
// species-level reference images regardless of which foundation the
// player picks, since no per-foundation art exists for them yet.
//
// The six species IDs are permanent (see types/player.ts). Do not add
// a seventh without a migration + explicit approval.
// ============================================================

export const AVATAR_REFERENCE_BASE = 'assets/avatar/references/';

export interface AvatarReferenceImage {
  /** Path relative to AVATAR_REFERENCE_BASE, e.g. 'human/moon-racer.png'. */
  src: string;
  alt: string;
}

export interface AvatarFoundation {
  id: string;
  label: string;
  description: string;
  /** Empty when this species has no per-foundation art — the UI falls
   * back to the species' own referenceImages. */
  referenceImages: AvatarReferenceImage[];
}

export interface AvatarOptionDef {
  id: string;
  label: string;
  /** Named-palette color, for 'color' controls only. */
  hex?: string;
  /** If set, this option is only offered when the active foundation's
   * id is in this list — the foundation-aware option mechanism (e.g.
   * Alien's cranial-structure choices differ between Atlaran and
   * Xyren). Omitted = available under any foundation. */
  foundations?: string[];
}

export type AvatarWizardStep = 'form' | 'features' | 'augmentation' | 'style' | 'signal';
export type AvatarControlKind = 'choice' | 'color' | 'slider' | 'toggle';

export interface AvatarCustomizationGroup {
  id: string;
  label: string;
  wizardStep: AvatarWizardStep;
  control: AvatarControlKind;
  helpText?: string;
  /** 'choice' | 'color' */
  options?: AvatarOptionDef[];
  /** 'slider' */
  min?: number;
  max?: number;
  sliderStep?: number;
  sliderUnit?: string;
  defaultOptionId?: string;
}

export interface AvatarSpeciesDefinition {
  id: AvatarSpeciesId;
  displayName: string;
  /** One or two sentences — enough for a species-select screen. */
  shortDescription: string;
  /** Species-level reference art, shown when the active foundation has none of its own. */
  referenceImages: AvatarReferenceImage[];
  foundations: AvatarFoundation[];
  customizationGroups: AvatarCustomizationGroup[];
  /** Documentation only — the real enforcement is the DB CHECK
   * constraints on player_avatar / avatar_generations. */
  specialRules?: string[];
  enabled: boolean;
}

/** Controlled Moon Racer palette — named choices so future prompt
 * mapping stays predictable, per the Avatar Phase 2B brief. Hex values
 * mirror the site's existing design tokens (styles/tokens.css) where
 * one already exists. */
export const AVATAR_COLOR_PALETTE: AvatarOptionDef[] = [
  { id: 'cyan', label: 'Cyan', hex: '#00e5ff' },
  { id: 'violet', label: 'Violet', hex: '#8b5cf6' },
  { id: 'magenta', label: 'Magenta', hex: '#ff2d78' },
  { id: 'amber', label: 'Amber', hex: '#ffb700' },
  { id: 'white', label: 'White', hex: '#f2f4f8' },
  { id: 'red', label: 'Red', hex: '#ff2d55' },
  { id: 'gold', label: 'Gold', hex: '#d4af37' },
  { id: 'silver', label: 'Silver', hex: '#c0c8d2' },
  { id: 'obsidian', label: 'Obsidian', hex: '#15151f' },
];

function ref(species: string, file: string, alt: string): AvatarReferenceImage {
  return { src: `${species}/${file}`, alt };
}

export const AVATAR_SPECIES_DEFINITIONS: Record<AvatarSpeciesId, AvatarSpeciesDefinition> = {
  // ============================================================
  human: {
    id: 'human',
    displayName: 'Human',
    shortDescription:
      'Biologically human inhabitants of the Moon Racer Universe, ranging from natural racers and explorers to heavily augmented citizens shaped by advanced technology and the Signal.',
    referenceImages: [
      ref('human', 'moon-racer.png', 'Visual foundation reference: a leather-jacketed racer with dreadlocks, sunglasses, and cybernetic visor gear — low-to-moderate augmentation.'),
      ref('human', 'setia-saint-haven.png', 'Visual foundation reference: an augmented Human with luminous Signal-marked skin and an ornate light-crystal headpiece — the high-augmentation end of the Human range.'),
    ],
    foundations: [
      { id: 'racer', label: 'Racer', description: 'Streetwear, racing gear, and worn tech built for speed and survival.', referenceImages: [] },
      { id: 'explorer', label: 'Explorer', description: 'Practical, weathered gear built for deep-space and Outer Rim travel.', referenceImages: [] },
      { id: 'republic_citizen', label: 'Republic Citizen', description: 'Cleaner, more formal Republic-aligned presentation.', referenceImages: [] },
      { id: 'engineer', label: 'Engineer', description: 'Tool-and-tech-forward, practical augmentation.', referenceImages: [] },
      { id: 'outer_rim_drifter', label: 'Outer Rim Drifter', description: 'Improvised, salvaged, independent styling.', referenceImages: [] },
      { id: 'signal_seeker', label: 'Signal Seeker', description: 'Marked and shaped by exposure to the Signal — the Setia end of the range.', referenceImages: [] },
    ],
    customizationGroups: [
      { id: 'build', label: 'Build', wizardStep: 'form', control: 'choice', options: [
        { id: 'slender', label: 'Slender' }, { id: 'athletic', label: 'Athletic' }, { id: 'muscular', label: 'Muscular' }, { id: 'heavyset', label: 'Heavyset' },
      ] },
      { id: 'facial_structure', label: 'Facial Structure', wizardStep: 'form', control: 'choice', options: [
        { id: 'angular', label: 'Angular' }, { id: 'soft', label: 'Soft' }, { id: 'weathered', label: 'Weathered' }, { id: 'youthful', label: 'Youthful' },
      ] },
      { id: 'skin_tone', label: 'Skin Tone', wizardStep: 'features', control: 'choice', options: [
        { id: 'deep', label: 'Deep' }, { id: 'tan', label: 'Tan' }, { id: 'olive', label: 'Olive' }, { id: 'medium', label: 'Medium' }, { id: 'fair', label: 'Fair' }, { id: 'pale', label: 'Pale' },
      ] },
      { id: 'hair_style', label: 'Hairstyle', wizardStep: 'features', control: 'choice', options: [
        { id: 'dreadlocks', label: 'Dreadlocks' }, { id: 'shaved', label: 'Shaved' }, { id: 'short_cropped', label: 'Short Cropped' }, { id: 'long_loose', label: 'Long, Loose' }, { id: 'braided', label: 'Braided' },
      ] },
      { id: 'hair_color', label: 'Hair Color', wizardStep: 'features', control: 'color', options: AVATAR_COLOR_PALETTE },
      { id: 'eye_color', label: 'Eye Color', wizardStep: 'features', control: 'color', options: AVATAR_COLOR_PALETTE },
      { id: 'augmentation_level', label: 'Augmentation', wizardStep: 'augmentation', control: 'choice', helpText: 'Cybernetic augmentation alone never changes species — a heavily augmented Human stays Human.', options: [
        { id: 'none', label: 'None' }, { id: 'light', label: 'Light' }, { id: 'moderate', label: 'Moderate' }, { id: 'heavy', label: 'Heavy' },
      ] },
      { id: 'outfit', label: 'Outfit Foundation', wizardStep: 'style', control: 'choice', options: [
        { id: 'racer_jacket', label: 'Racer Jacket' }, { id: 'explorer_gear', label: 'Explorer Gear' }, { id: 'republic_uniform', label: 'Republic Uniform' }, { id: 'drifter_wraps', label: 'Drifter Wraps' }, { id: 'signal_cloak', label: 'Signal Cloak' },
      ] },
      { id: 'headwear', label: 'Visor / Headwear', wizardStep: 'style', control: 'choice', options: [
        { id: 'none', label: 'None' }, { id: 'visor_helmet', label: 'Visor Helmet' }, { id: 'hood', label: 'Hood' }, { id: 'goggles', label: 'Goggles' },
      ] },
      { id: 'accessory', label: 'Accessory', wizardStep: 'style', control: 'choice', options: [
        { id: 'none', label: 'None' }, { id: 'pendant', label: 'Pendant' }, { id: 'gloves', label: 'Signal Gloves' }, { id: 'blade', label: 'Sidearm Blade' },
      ] },
      { id: 'signal_markings', label: 'Signal Markings', wizardStep: 'signal', control: 'toggle' },
      { id: 'signal_marking_intensity', label: 'Marking Intensity', wizardStep: 'signal', control: 'choice', options: [
        { id: 'low', label: 'Low' }, { id: 'medium', label: 'Medium' }, { id: 'high', label: 'High' },
      ] },
      { id: 'signal_color', label: 'Signal Color', wizardStep: 'signal', control: 'color', options: AVATAR_COLOR_PALETTE },
    ],
    specialRules: ['Cybernetic augmentation alone does not change species — a heavily augmented Human stays Human.'],
    enabled: true,
  },

  // ============================================================
  alien: {
    id: 'alien',
    displayName: 'Alien',
    shortDescription:
      'Biological intelligent beings from non-human civilizations throughout the galaxy, with anatomy, surfaces, and silhouettes that can differ radically from Humanity.',
    referenceImages: [],
    foundations: [
      {
        id: 'atlaran',
        label: 'Atlaran-type',
        description: 'Elegant, opalescent, luminous dermis; elongated, refined biological silhouette.',
        referenceImages: [ref('alien', 'nyssa-vek-atlaran.png', 'Species reference: an Atlaran-type Alien with opalescent skin, shifting luminous dermal markings, and elongated pointed ears.')],
      },
      {
        id: 'xyren',
        label: 'Xyren-type',
        description: 'Obsidian, glossy, monolithic form; minimal facial structure; glowing circuitry/seam language.',
        referenceImages: [ref('alien', 'vorakh-xer-xyren.png', 'Species reference: a Xyren-type Alien with glossy obsidian skin, a glowing seam down the head, and a largely featureless, monolithic silhouette.')],
      },
    ],
    customizationGroups: [
      { id: 'body_proportions', label: 'Body Proportions', wizardStep: 'form', control: 'choice', options: [
        { id: 'slender', label: 'Slender' }, { id: 'elongated', label: 'Elongated' }, { id: 'dense', label: 'Dense' }, { id: 'asymmetric', label: 'Asymmetric' },
      ] },
      { id: 'cranial_structure', label: 'Cranial Structure', wizardStep: 'form', control: 'choice', options: [
        { id: 'domed', label: 'Domed', foundations: ['atlaran'] },
        { id: 'crested', label: 'Crested', foundations: ['atlaran'] },
        { id: 'smooth_featureless', label: 'Smooth / Featureless', foundations: ['xyren'] },
        { id: 'ridged', label: 'Ridged', foundations: ['xyren'] },
        { id: 'elongated_skull', label: 'Elongated Skull' },
      ] },
      { id: 'ear_appendage', label: 'Ear / Appendage Structure', wizardStep: 'features', control: 'choice', options: [
        { id: 'elongated_points', label: 'Elongated Points', foundations: ['atlaran'] },
        { id: 'none_smooth', label: 'None (Smooth)', foundations: ['xyren'] },
        { id: 'finned', label: 'Finned' }, { id: 'tendrils', label: 'Tendrils' },
      ] },
      { id: 'eye_architecture', label: 'Eye Architecture', wizardStep: 'features', control: 'choice', options: [
        { id: 'almond_dark', label: 'Almond, Dark' }, { id: 'glowing_seam', label: 'Glowing Seam', foundations: ['xyren'] }, { id: 'multi_facet', label: 'Multi-Facet' }, { id: 'luminous', label: 'Luminous', foundations: ['atlaran'] },
      ] },
      { id: 'surface_material', label: 'Surface Material', wizardStep: 'features', control: 'choice', options: [
        { id: 'opalescent', label: 'Opalescent', foundations: ['atlaran'] },
        { id: 'obsidian_glossy', label: 'Obsidian / Glossy', foundations: ['xyren'] },
        { id: 'chitinous', label: 'Chitinous' }, { id: 'membranous', label: 'Membranous' },
      ] },
      { id: 'dermal_pattern', label: 'Dermal Pattern', wizardStep: 'features', control: 'choice', options: [
        { id: 'dotted', label: 'Dotted' }, { id: 'veined', label: 'Veined' }, { id: 'smooth', label: 'Smooth' }, { id: 'circuit_seam', label: 'Circuit Seam', foundations: ['xyren'] },
      ] },
      { id: 'bioluminescence', label: 'Bioluminescence', wizardStep: 'augmentation', control: 'choice', options: [
        { id: 'none', label: 'None' }, { id: 'faint', label: 'Faint' }, { id: 'moderate', label: 'Moderate' }, { id: 'radiant', label: 'Radiant' },
      ] },
      { id: 'outfit_adornment', label: 'Outfit / Adornment', wizardStep: 'style', control: 'choice', options: [
        { id: 'minimal_wrap', label: 'Minimal Wrap' }, { id: 'ceremonial_robe', label: 'Ceremonial Robe' }, { id: 'travel_harness', label: 'Travel Harness' }, { id: 'none', label: 'None' },
      ] },
      { id: 'marking_color', label: 'Marking Color', wizardStep: 'signal', control: 'color', options: AVATAR_COLOR_PALETTE },
    ],
    specialRules: [
      'Two verified foundations only: Atlaran-type and Xyren-type. Do not invent additional named alien civilizations without approval.',
      'Cranial/eye/surface options are foundation-aware — an Atlaran-only option never appears while Xyren-type is active, and vice versa.',
    ],
    enabled: true,
  },

  // ============================================================
  hybrid: {
    id: 'hybrid',
    displayName: 'Hybrid',
    shortDescription:
      'A being whose two physical or technological ancestries are integrated into one coherent form — through lineage, engineering, experimentation, or Signal-related transformation.',
    referenceImages: [ref('hybrid', 'lyra-meridian.png', 'Visual foundation reference: a stable Human x Alien integration — human facial proportions with elongated ears and fine iridescent dermal shimmer, read as one coherent being.')],
    foundations: [
      { id: 'stable', label: 'Stable', description: 'Calm, composed integration — the Lyra Meridian reference point.', referenceImages: [] },
      { id: 'altered', label: 'Altered', description: 'Visibly unusual, but settled integration.', referenceImages: [] },
      { id: 'engineered', label: 'Engineered', description: 'Deliberately, precisely constructed integration.', referenceImages: [] },
      { id: 'corrupted', label: 'Corrupted', description: 'Unstable or damaged integration.', referenceImages: [] },
    ],
    customizationGroups: [
      { id: 'dominant_body_traits', label: 'Dominant Body Traits', wizardStep: 'form', control: 'choice', options: [
        { id: 'primary_leaning', label: 'Primary-Leaning' }, { id: 'balanced', label: 'Balanced' }, { id: 'secondary_leaning', label: 'Secondary-Leaning' },
      ] },
      { id: 'body_build', label: 'Body Build', wizardStep: 'form', control: 'choice', options: [
        { id: 'slender', label: 'Slender' }, { id: 'athletic', label: 'Athletic' }, { id: 'dense', label: 'Dense' },
      ] },
      { id: 'dominant_facial_traits', label: 'Dominant Facial Traits', wizardStep: 'features', control: 'choice', options: [
        { id: 'primary_leaning', label: 'Primary-Leaning' }, { id: 'balanced', label: 'Balanced' }, { id: 'secondary_leaning', label: 'Secondary-Leaning' },
      ] },
      { id: 'dermal_integration', label: 'Dermal Integration', wizardStep: 'features', control: 'choice', options: [
        { id: 'smooth_blend', label: 'Smooth Blend' }, { id: 'visible_seams', label: 'Visible Seams' }, { id: 'patterned_overlay', label: 'Patterned Overlay' },
      ] },
      { id: 'stability', label: 'Visual Stability', wizardStep: 'augmentation', control: 'choice', helpText: 'How settled the integration currently appears — distinct from the Stable/Altered/Engineered/Corrupted foundation.', options: [
        { id: 'coherent', label: 'Coherent' }, { id: 'fluctuating', label: 'Fluctuating' }, { id: 'volatile', label: 'Volatile' },
      ] },
      { id: 'outfit', label: 'Outfit', wizardStep: 'style', control: 'choice', options: [
        { id: 'house_formal', label: 'House Formal' }, { id: 'travel_gear', label: 'Travel Gear' }, { id: 'utilitarian', label: 'Utilitarian' },
      ] },
      { id: 'signal_appearance', label: 'Signal Appearance', wizardStep: 'signal', control: 'color', options: AVATAR_COLOR_PALETTE },
    ],
    specialRules: [
      'primary_species and secondary_species are required and must differ (DB-enforced).',
      "hybrid_ratio (0-100) is the SECONDARY species' visual influence: 0 = dominated by primary, 100 = dominated by secondary. Canon reference art (Lyra Meridian) is not assigned a number — her card establishes no percentage.",
      'Only a fixed set of parent-species pairs is offered in the creator (see HYBRID_ALLOWED_PAIRS) — not every theoretical combination is exposed yet.',
    ],
    enabled: true,
  },

  // ============================================================
  ai: {
    id: 'ai',
    displayName: 'AI',
    shortDescription:
      'Synthetic intelligences whose bodies are fundamentally technological, ranging from overt mechanical constructs to human-passing synthetic forms with visibly engineered anatomy.',
    referenceImages: [],
    foundations: [
      {
        id: 'construct',
        label: 'Construct',
        description: 'Overtly synthetic — non-human head architecture, visible optics, alloy/plated construction.',
        referenceImages: [ref('ai', 'aurelion-vex-construct.png', 'Species reference: a fully synthetic Construct-type AI with a luminal alloy shell, gold filigree, and layered blue optics — no human facial presentation.')],
      },
      {
        id: 'human_passing',
        label: 'Human-Passing',
        description: 'A human-like face over a visibly synthetic, circuitry-lined body.',
        referenceImages: [ref('ai', 'xenia-human-passing.png', 'Species reference: a Human-Passing AI with an organic-looking face and hair fused with a chrome, circuit-lined synthetic body and glowing seams.')],
      },
    ],
    customizationGroups: [
      { id: 'chassis_structure', label: 'Chassis / Body Structure', wizardStep: 'form', control: 'choice', options: [
        { id: 'slender_frame', label: 'Slender Frame' }, { id: 'reinforced_frame', label: 'Reinforced Frame' }, { id: 'utility_frame', label: 'Utility Frame' },
      ] },
      { id: 'head_architecture', label: 'Head Architecture', wizardStep: 'form', control: 'choice', options: [
        { id: 'non_human', label: 'Non-Human', foundations: ['construct'] },
        { id: 'organic_face_synthetic_frame', label: 'Organic Face, Synthetic Frame', foundations: ['human_passing'] },
        { id: 'halo_array', label: 'Halo Array', foundations: ['construct'] },
      ] },
      { id: 'face_architecture', label: 'Face Architecture', wizardStep: 'features', control: 'choice', options: [
        { id: 'featureless_plated', label: 'Featureless / Plated', foundations: ['construct'] },
        { id: 'human_like', label: 'Human-Like', foundations: ['human_passing'] },
      ] },
      { id: 'optics', label: 'Optics', wizardStep: 'features', control: 'choice', options: [
        { id: 'layered_optics', label: 'Layered Optics' }, { id: 'single_visor', label: 'Single Visor' }, { id: 'human_like_eyes', label: 'Human-Like Eyes', foundations: ['human_passing'] },
      ] },
      { id: 'optic_color', label: 'Optic Color', wizardStep: 'features', control: 'color', options: AVATAR_COLOR_PALETTE },
      { id: 'shell_material', label: 'Shell / Plating Material', wizardStep: 'features', control: 'choice', options: [
        { id: 'luminal_alloy', label: 'Luminal Alloy' }, { id: 'dark_alloy', label: 'Dark Alloy' }, { id: 'ceramic_composite', label: 'Ceramic Composite' }, { id: 'chrome', label: 'Chrome', foundations: ['human_passing'] },
      ] },
      { id: 'core', label: 'Core', wizardStep: 'augmentation', control: 'choice', options: [
        { id: 'chest_core', label: 'Chest Core' }, { id: 'distributed', label: 'Distributed' }, { id: 'concealed', label: 'Concealed' },
      ] },
      { id: 'core_color', label: 'Core Color', wizardStep: 'augmentation', control: 'color', options: AVATAR_COLOR_PALETTE },
      { id: 'circuitry', label: 'Circuitry', wizardStep: 'augmentation', control: 'choice', options: [
        { id: 'minimal', label: 'Minimal' }, { id: 'moderate', label: 'Moderate' }, { id: 'extensive', label: 'Extensive', foundations: ['human_passing'] },
      ] },
      { id: 'circuitry_color', label: 'Circuitry Color', wizardStep: 'augmentation', control: 'color', options: AVATAR_COLOR_PALETTE },
      { id: 'repair_state', label: 'Repair / Weathering State', wizardStep: 'augmentation', control: 'choice', options: [
        { id: 'pristine', label: 'Pristine' }, { id: 'worn', label: 'Worn' }, { id: 'battle_worn', label: 'Battle-Worn' },
      ] },
      { id: 'armor', label: 'Armor / Outer Shell', wizardStep: 'style', control: 'choice', options: [
        { id: 'none', label: 'None' }, { id: 'light_plating', label: 'Light Plating' }, { id: 'full_shell', label: 'Full Shell' },
      ] },
      { id: 'illumination', label: 'Illumination', wizardStep: 'signal', control: 'choice', options: [
        { id: 'steady', label: 'Steady' }, { id: 'pulsing', label: 'Pulsing' }, { id: 'none', label: 'None' },
      ] },
    ],
    specialRules: [
      'Species is determined by fundamental nature, not appearance — a heavily cybernetic Human is not AI.',
      'Two verified foundations: Construct (fully synthetic) and Human-Passing (organic face, synthetic body) — the construction must be visibly inherent somewhere on a Human-Passing AI.',
    ],
    enabled: true,
  },

  // ============================================================
  mythraxian: {
    id: 'mythraxian',
    displayName: 'Mythraxian',
    shortDescription:
      'An ancient extraterrestrial people whose refined biology and civilization express crystalline materials, structural light, resonance, memory, and relic craftsmanship.',
    referenceImages: [ref('mythraxian', 'zyr-axel.png', 'Species reference: a Mythraxian with translucent, micro-crystal-textured skin, quartz-like eyes, and fine geometric engraving — an elegant, precise, ancient civilization.')],
    foundations: [
      { id: 'artisan', label: 'Artisan', description: 'Craft- and relic-focused — the Zyr Axel reference point.', referenceImages: [] },
      { id: 'relic_keeper', label: 'Relic Keeper', description: 'Guardian of ancient technology and memory.', referenceImages: [] },
      { id: 'oracle', label: 'Oracle', description: 'Resonance and prophecy-focused presentation.', referenceImages: [] },
      { id: 'architect', label: 'Architect', description: 'Structural-light and design-focused presentation.', referenceImages: [] },
      { id: 'archive_keeper', label: 'Archive Keeper', description: 'Memory- and record-focused presentation.', referenceImages: [] },
    ],
    customizationGroups: [
      { id: 'body_structure', label: 'Body Structure', wizardStep: 'form', control: 'choice', options: [
        { id: 'slender', label: 'Slender' }, { id: 'tall', label: 'Tall' }, { id: 'compact', label: 'Compact' },
      ] },
      { id: 'facial_geometry', label: 'Facial Geometry', wizardStep: 'form', control: 'choice', options: [
        { id: 'angular', label: 'Angular' }, { id: 'elongated', label: 'Elongated' }, { id: 'refined_soft', label: 'Refined / Soft' },
      ] },
      { id: 'crystalline_dermis', label: 'Crystalline Dermis', wizardStep: 'features', control: 'choice', options: [
        { id: 'micro_crystal', label: 'Micro-Crystal' }, { id: 'faceted', label: 'Faceted' }, { id: 'smooth_translucent', label: 'Smooth Translucent' },
      ] },
      { id: 'translucency', label: 'Translucency', wizardStep: 'features', control: 'choice', options: [
        { id: 'opaque', label: 'Opaque' }, { id: 'semi_translucent', label: 'Semi-Translucent' }, { id: 'fully_translucent', label: 'Fully Translucent' },
      ] },
      { id: 'luminous_eye_color', label: 'Luminous Eye Color', wizardStep: 'features', control: 'color', options: AVATAR_COLOR_PALETTE },
      { id: 'engraving_pattern', label: 'Engraving Pattern', wizardStep: 'augmentation', control: 'choice', options: [
        { id: 'geometric', label: 'Geometric' }, { id: 'flowing', label: 'Flowing' }, { id: 'circuit_like', label: 'Circuit-Like' },
      ] },
      { id: 'engraving_density', label: 'Engraving Density', wizardStep: 'augmentation', control: 'choice', options: [
        { id: 'sparse', label: 'Sparse' }, { id: 'moderate', label: 'Moderate' }, { id: 'dense', label: 'Dense' },
      ] },
      { id: 'relic_adornment', label: 'Relic Adornment', wizardStep: 'augmentation', control: 'choice', options: [
        { id: 'none', label: 'None' }, { id: 'hand_tools', label: 'Hand Tools' }, { id: 'ceremonial_piece', label: 'Ceremonial Piece' },
      ] },
      { id: 'clothing_foundation', label: 'Clothing Foundation', wizardStep: 'style', control: 'choice', options: [
        { id: 'artisan_robe', label: 'Artisan Robe' }, { id: 'ceremonial_garb', label: 'Ceremonial Garb' }, { id: 'practical_wrap', label: 'Practical Wrap' },
      ] },
      { id: 'crystal_coloration', label: 'Crystal Coloration', wizardStep: 'signal', control: 'color', options: AVATAR_COLOR_PALETTE },
      { id: 'resonance_markings', label: 'Resonance Markings', wizardStep: 'signal', control: 'toggle' },
    ],
    specialRules: [
      'Currently a single-reference visual specification (Zyr Axel) — his exact profession, garment, and facial engraving are individual traits, not universal Mythraxian law.',
    ],
    enabled: true,
  },

  // ============================================================
  glitch: {
    id: 'glitch',
    displayName: 'Glitch',
    shortDescription:
      'Beings that exist at the unstable convergence of Human, Alien, AI, Signal, information, and physical matter — a form that can shift between coherent body, holographic structure, and fragmented reality.',
    referenceImages: [ref('glitch', 'the-glitch-third-people.png', 'Species reference: a Glitch/Third People individual — a humanoid form partly solid and partly dissolved into glowing geometric shard-fragments, with a forehead sigil.')],
    foundations: [
      { id: 'emergent', label: 'Emergent', description: 'Newly formed, still stabilizing.', referenceImages: [] },
      { id: 'stable', label: 'Stable', description: 'Settled, coherent presentation — the #303 reference point.', referenceImages: [] },
      { id: 'fragmented', label: 'Fragmented', description: 'Visibly unstable, dissolving in places.', referenceImages: [] },
      { id: 'ascended', label: 'Ascended', description: 'Highly integrated, luminous presentation.', referenceImages: [] },
    ],
    customizationGroups: [
      { id: 'base_form', label: 'Base Form', wizardStep: 'form', control: 'choice', options: [
        { id: 'humanoid_coherent', label: 'Humanoid, Coherent' }, { id: 'elongated', label: 'Elongated' }, { id: 'asymmetric', label: 'Asymmetric' },
      ] },
      { id: 'form_stability', label: 'Form Stability', wizardStep: 'form', control: 'choice', helpText: 'Describes physical structure, not a filter effect.', options: [
        { id: 'stable', label: 'Stable' }, { id: 'shifting', label: 'Shifting' }, { id: 'fragmented', label: 'Fragmented' },
      ] },
      { id: 'fragmentation_intensity', label: 'Fragmentation Intensity', wizardStep: 'features', control: 'choice', options: [
        { id: 'low', label: 'Low' }, { id: 'medium', label: 'Medium' }, { id: 'high', label: 'High' },
      ] },
      { id: 'fragmentation_region', label: 'Fragmented Region', wizardStep: 'features', control: 'choice', options: [
        { id: 'face', label: 'Face' }, { id: 'torso', label: 'Torso' }, { id: 'limbs', label: 'Limbs' }, { id: 'scattered', label: 'Scattered' },
      ] },
      { id: 'holographic_matter', label: 'Holographic Matter', wizardStep: 'features', control: 'choice', options: [
        { id: 'minimal', label: 'Minimal' }, { id: 'moderate', label: 'Moderate' }, { id: 'pervasive', label: 'Pervasive' },
      ] },
      { id: 'synthetic_influence', label: 'Synthetic Influence (visual)', wizardStep: 'augmentation', control: 'choice', options: [
        { id: 'subtle', label: 'Subtle' }, { id: 'moderate', label: 'Moderate' }, { id: 'dominant', label: 'Dominant' },
      ] },
      { id: 'organic_influence', label: 'Organic Influence (visual)', wizardStep: 'augmentation', control: 'choice', options: [
        { id: 'subtle', label: 'Subtle' }, { id: 'moderate', label: 'Moderate' }, { id: 'dominant', label: 'Dominant' },
      ] },
      { id: 'alien_influence', label: 'Alien Influence (visual)', wizardStep: 'augmentation', control: 'choice', options: [
        { id: 'subtle', label: 'Subtle' }, { id: 'moderate', label: 'Moderate' }, { id: 'dominant', label: 'Dominant' },
      ] },
      { id: 'reality_distortion', label: 'Reality Distortion', wizardStep: 'augmentation', control: 'choice', options: [
        { id: 'none', label: 'None' }, { id: 'faint', label: 'Faint' }, { id: 'warping', label: 'Warping' },
      ] },
      { id: 'sigil_style', label: 'Sigil Style', wizardStep: 'style', control: 'choice', options: [
        { id: 'infinity_mark', label: 'Infinity Mark' }, { id: 'geometric_seal', label: 'Geometric Seal' }, { id: 'none', label: 'None' },
      ] },
      { id: 'signal_color', label: 'Signal Color', wizardStep: 'signal', control: 'color', options: AVATAR_COLOR_PALETTE },
    ],
    specialRules: [
      'glitch_human_ratio + glitch_alien_ratio + glitch_ai_ratio must total 100 once all three are set (DB-enforced) before a Glitch avatar can be saved as fully configured.',
      'Glitch consciousness composition is a separate system from Hybrid ancestry — never interchangeable, even conceptually.',
      'Currently a single-reference visual specification (#303, THE GLITCH / The Third People).',
    ],
    enabled: true,
  },
};

/** Only these primary/secondary species pairs are offered in the
 * Hybrid creator (unordered — Human+Alien === Alien+Human). Not every
 * theoretical combination is exposed yet; this list is deliberately
 * conservative per the Avatar Phase 2B brief. */
export const HYBRID_ALLOWED_PAIRS: [AvatarSpeciesId, AvatarSpeciesId][] = [
  ['human', 'alien'],
  ['human', 'ai'],
  ['human', 'mythraxian'],
  ['alien', 'ai'],
  ['alien', 'mythraxian'],
  ['mythraxian', 'ai'],
];

export function isHybridPairAllowed(a: AvatarSpeciesId, b: AvatarSpeciesId): boolean {
  if (a === b) return false;
  return HYBRID_ALLOWED_PAIRS.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
}

export function getAvatarSpeciesDefinition(id: AvatarSpeciesId): AvatarSpeciesDefinition {
  return AVATAR_SPECIES_DEFINITIONS[id];
}

export function listEnabledAvatarSpecies(): AvatarSpeciesDefinition[] {
  return AVATAR_SPECIES.map((id) => AVATAR_SPECIES_DEFINITIONS[id]).filter((s) => s.enabled);
}

export function getAvatarFoundation(speciesId: AvatarSpeciesId, foundationId: string | null | undefined): AvatarFoundation | undefined {
  if (!foundationId) return undefined;
  return AVATAR_SPECIES_DEFINITIONS[speciesId].foundations.find((f) => f.id === foundationId);
}

/** Reference images to show for the current species+foundation
 * selection: foundation-specific art if any exists, otherwise the
 * species' own reference images. */
export function getActiveReferenceImages(speciesId: AvatarSpeciesId, foundationId: string | null | undefined): AvatarReferenceImage[] {
  const foundation = getAvatarFoundation(speciesId, foundationId);
  if (foundation && foundation.referenceImages.length > 0) return foundation.referenceImages;
  return AVATAR_SPECIES_DEFINITIONS[speciesId].referenceImages;
}

/** Groups for a wizard step, filtered to those the active foundation
 * makes available (a group appears if it has no options at all — e.g.
 * a toggle — or at least one option valid for the active foundation). */
export function getGroupsForStep(speciesId: AvatarSpeciesId, wizardStep: AvatarWizardStep): AvatarCustomizationGroup[] {
  return AVATAR_SPECIES_DEFINITIONS[speciesId].customizationGroups.filter((g) => g.wizardStep === wizardStep);
}

/** An option list narrowed to the active foundation — options with no
 * `foundations` tag are always included; tagged options only show
 * when they match. This is the "foundation-aware option set"
 * mechanism called for in the Avatar Phase 2A audit. */
export function getOptionsForFoundation(group: AvatarCustomizationGroup, foundationId: string | null | undefined): AvatarOptionDef[] {
  const options = group.options ?? [];
  if (!foundationId) return options.filter((o) => !o.foundations);
  return options.filter((o) => !o.foundations || o.foundations.includes(foundationId));
}
