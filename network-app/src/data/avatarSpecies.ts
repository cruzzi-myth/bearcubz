import type { AvatarSpeciesId } from '../types/player';
import { AVATAR_SPECIES } from '../types/player';

export { AVATAR_SPECIES };

// ============================================================
// Species definitions — Avatar Phase 1 foundation.
//
// This is UI/configuration metadata ONLY: display copy, which
// customization groups a species will eventually expose, and its
// starter archetype vocabulary. It contains no prompt text, no
// generation instructions, and no secrets — server-side prompt
// construction (Avatar Phase 3+) is a completely separate, private
// system that this module must never leak into.
//
// `availableCustomizationGroups` are group IDs only, not option
// catalogs — Phase 2 builds the actual per-group option lists (the
// same way onboarding's avatarOptions.ts works today) and decides
// which groups render for the selected species. Adding a new option
// inside an existing group is a data change; adding a new SPECIES is
// not — that requires a matching DB migration (see
// player_avatar.species's CHECK constraint) and is intentionally not
// something this module can do by itself.
//
// The six species IDs are permanent (see types/player.ts). Do not
// add a seventh without a migration + explicit approval — this module
// does not establish new Moon Racer canon on its own.
// ============================================================

export interface AvatarArchetype {
  /** Stable internal id, stored in player_avatar.archetype as-is. */
  id: string;
  /** Display label shown in the creator UI. */
  label: string;
}

export interface AvatarSpeciesDefinition {
  id: AvatarSpeciesId;
  displayName: string;
  /** One or two sentences — enough for a species-select screen, not
   * a lore page. */
  shortDescription: string;
  /** Which customization group IDs this species exposes, in display
   * order. The creator UI switches its controls based on this list
   * instead of rendering one universal form — see the "SPECIES-
   * SPECIFIC UI SCHEMA FOUNDATION" note in the Avatar Phase 1 brief. */
  availableCustomizationGroups: string[];
  starterArchetypes: AvatarArchetype[];
  /** Free-text notes about rules that don't fit the fields above —
   * e.g. Hybrid needing two parent species, Glitch needing a
   * composition that sums to 100. Documentation only; the real
   * enforcement is the DB CHECK constraints on player_avatar. */
  specialRules?: string[];
  /** Every species is enabled today — this exists so a future species
   * (or a temporarily-disabled one) can be hidden from the creator UI
   * without deleting its definition or touching the DB constraint. */
  enabled: boolean;
}

export const AVATAR_SPECIES_DEFINITIONS: Record<AvatarSpeciesId, AvatarSpeciesDefinition> = {
  human: {
    id: 'human',
    displayName: 'Human',
    shortDescription:
      'Biologically human inhabitants of the Moon Racer Universe — recognizably human, but ranging from natural biological racers to heavily augmented Republic citizens and Outer Rim drifters.',
    availableCustomizationGroups: [
      'body',
      'face',
      'skin',
      'eyes',
      'hair',
      'facial_hair',
      'tattoos',
      'scars',
      'signal_markings',
      'cybernetics',
      'prosthetics',
      'clothing',
      'armor',
      'accessories',
    ],
    starterArchetypes: [
      { id: 'racer', label: 'Racer' },
      { id: 'explorer', label: 'Explorer' },
      { id: 'republic_citizen', label: 'Republic Citizen' },
      { id: 'engineer', label: 'Engineer' },
      { id: 'outer_rim_drifter', label: 'Outer Rim Drifter' },
      { id: 'signal_seeker', label: 'Signal Seeker' },
    ],
    specialRules: ['Cybernetic augmentation alone does not change species — a heavily augmented Human stays Human.'],
    enabled: true,
  },

  alien: {
    id: 'alien',
    displayName: 'Alien',
    shortDescription:
      'Biological intelligent beings from non-human species across the galaxy — an intentionally broad category, not a single fixed biology, and never just a human with different skin color.',
    availableCustomizationGroups: [
      'body_structure',
      'cranial_structure',
      'face_geometry',
      'ear_structure',
      'eye_architecture',
      'pupil_type',
      'skin_material',
      'dermal_pattern',
      'biological_markings',
      'appendages',
      'bioluminescence',
      'augmentation',
      'clothing',
      'cultural_accessories',
    ],
    starterArchetypes: [
      { id: 'ethereal', label: 'Ethereal' },
      { id: 'scholar', label: 'Scholar' },
      { id: 'warrior', label: 'Warrior' },
      { id: 'explorer', label: 'Explorer' },
      { id: 'ancient_survivor', label: 'Ancient Civilization Survivor' },
    ],
    specialRules: [
      'Future revisions may expose a biological-family sub-choice (e.g. reptilian, crystalline, aquatic) — no such sub-species names are established yet; do not invent them without approval.',
    ],
    enabled: true,
  },

  hybrid: {
    id: 'hybrid',
    displayName: 'Hybrid',
    shortDescription:
      'A being whose biological or technological ancestry combines two distinct foundations — through lineage, engineering, experimentation, or Signal-related transformation.',
    availableCustomizationGroups: ['parent_species', 'hybrid_ratio', 'dominant_traits', 'mutation_stability', 'clothing'],
    starterArchetypes: [
      { id: 'stable', label: 'Stable' },
      { id: 'altered', label: 'Altered' },
      { id: 'engineered', label: 'Engineered' },
      { id: 'corrupted', label: 'Corrupted' },
    ],
    specialRules: [
      'Requires primary_species + secondary_species (must differ — enforced by DB constraint).',
      'hybrid_ratio (0–100) is primary_species\'s share; the ratio must eventually shape generation, not just display a number.',
      'Not every species pair is guaranteed to be sensible — the allowed-combination list is not hardcoded yet and should stay data-driven.',
    ],
    enabled: true,
  },

  ai: {
    id: 'ai',
    displayName: 'AI',
    shortDescription:
      'A synthetic intelligent being whose fundamental existence is technological, not biological — androids, synths, autonomous constructs, and ancient synthetic forms. Never just a human in metal armor.',
    availableCustomizationGroups: [
      'frame',
      'chassis',
      'head_architecture',
      'face_architecture',
      'optics',
      'core',
      'shell_material',
      'plating',
      'exposed_mechanics',
      'circuitry',
      'illumination',
      'damage_weathering',
      'armor',
    ],
    starterArchetypes: [
      { id: 'android', label: 'Android' },
      { id: 'synth', label: 'Synth' },
      { id: 'archive_construct', label: 'Archive Construct' },
      { id: 'ancient_machine', label: 'Ancient Machine' },
      { id: 'autonomous_intelligence', label: 'Advanced Autonomous Intelligence' },
    ],
    specialRules: ['Species is determined by fundamental nature, not appearance — a heavily cybernetic Human is not AI.'],
    enabled: true,
  },

  mythraxian: {
    id: 'mythraxian',
    displayName: 'Mythraxian',
    shortDescription:
      'An ancient extraterrestrial civilization known for craftsmanship, structural light, resonance, crystalline materials, and relic technology — ancient and impossibly advanced, never generic fantasy or "gray alien."',
    availableCustomizationGroups: [
      'body_structure',
      'crystalline_dermis',
      'facial_geometry',
      'luminous_eyes',
      'dermal_engraving',
      'resonance_pattern',
      'relic_augmentation',
      'ceremonial_clothing',
      'ancient_jewelry',
    ],
    starterArchetypes: [
      { id: 'artisan', label: 'Artisan' },
      { id: 'relic_keeper', label: 'Relic Keeper' },
      { id: 'oracle', label: 'Oracle' },
      { id: 'architect', label: 'Architect' },
      { id: 'archive_keeper', label: 'Archive Keeper' },
    ],
    enabled: true,
  },

  glitch: {
    id: 'glitch',
    displayName: 'Glitch',
    shortDescription:
      'A fundamentally altered form of existence — the convergence or destabilization of biological consciousness, alien consciousness, artificial intelligence, and Signal phenomena. Not an AI, hologram, or corrupted human.',
    availableCustomizationGroups: [
      'consciousness_composition',
      'form_stability',
      'fragmentation',
      'holographic_matter',
      'signal_distortion',
      'reality_artifacts',
      'signal_color',
    ],
    starterArchetypes: [
      { id: 'emergent', label: 'Emergent' },
      { id: 'stable', label: 'Stable' },
      { id: 'fragmented', label: 'Fragmented' },
      { id: 'ascended', label: 'Ascended' },
    ],
    specialRules: [
      'Consciousness composition (glitch_human_ratio / glitch_alien_ratio / glitch_ai_ratio) must sum to 100 once all three are set — enforced by DB constraint.',
      'Glitch composition is a separate system from Hybrid ancestry — they are never interchangeable, even conceptually.',
    ],
    enabled: true,
  },
};

export function getAvatarSpeciesDefinition(id: AvatarSpeciesId): AvatarSpeciesDefinition {
  return AVATAR_SPECIES_DEFINITIONS[id];
}

export function listEnabledAvatarSpecies(): AvatarSpeciesDefinition[] {
  return AVATAR_SPECIES.map((id) => AVATAR_SPECIES_DEFINITIONS[id]).filter((s) => s.enabled);
}
