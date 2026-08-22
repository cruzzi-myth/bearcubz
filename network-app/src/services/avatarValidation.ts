import type { AvatarSpeciesId } from '../types/player';
import { isHybridPairAllowed } from '../data/avatarSpecies';

// ============================================================
// Pure functions only — no Supabase, no React. This is the "character
// DNA" validation layer: the same rules the DB CHECK constraints
// enforce (species roots, hybrid parents differ, glitch sums to 100),
// re-expressed as friendly inline errors so a player never has to
// find out their config was invalid from a raw Postgres error.
// ============================================================

/** In-progress selections for ONE species, kept independently so
 * switching species mid-session doesn't discard the others (see
 * AvatarCreationPage's speciesDrafts state). `values` holds every
 * customization-group answer, keyed by group id. */
export interface AvatarSpeciesDraft {
  foundation: string | null;
  values: Record<string, string | boolean | undefined>;
  // Hybrid-only, mirrored here so switching away and back doesn't
  // lose in-progress choices before Save writes them to the
  // first-class player_avatar columns.
  primarySpecies?: AvatarSpeciesId | null;
  secondarySpecies?: AvatarSpeciesId | null;
  hybridRatio?: number | null;
  // Glitch-only, same reasoning.
  glitchHumanRatio?: number | null;
  glitchAlienRatio?: number | null;
  glitchAiRatio?: number | null;
}

export function emptySpeciesDraft(): AvatarSpeciesDraft {
  return { foundation: null, values: {} };
}

export interface AvatarConfigurationDraft {
  version: 1;
  speciesDrafts: Partial<Record<AvatarSpeciesId, AvatarSpeciesDraft>>;
  active: { species: AvatarSpeciesId | null };
}

export function emptyConfigurationDraft(): AvatarConfigurationDraft {
  return { version: 1, speciesDrafts: {}, active: { species: null } };
}

/** Reads a player_avatar.configuration JSONB value back into the
 * typed draft shape. Defensive against anything malformed/partial
 * (older data, a hand-edited row, etc.) — always returns a valid,
 * usable draft rather than throwing. */
export function deserializeAvatarConfiguration(raw: unknown): AvatarConfigurationDraft {
  const draft = emptyConfigurationDraft();
  if (!raw || typeof raw !== 'object') return draft;
  const obj = raw as Record<string, unknown>;

  if (obj.speciesDrafts && typeof obj.speciesDrafts === 'object') {
    for (const [species, value] of Object.entries(obj.speciesDrafts as Record<string, unknown>)) {
      if (!value || typeof value !== 'object') continue;
      const v = value as Record<string, unknown>;
      draft.speciesDrafts[species as AvatarSpeciesId] = {
        foundation: typeof v.foundation === 'string' ? v.foundation : null,
        values: (v.values && typeof v.values === 'object' ? (v.values as Record<string, string | boolean>) : {}),
        primarySpecies: typeof v.primarySpecies === 'string' ? (v.primarySpecies as AvatarSpeciesId) : null,
        secondarySpecies: typeof v.secondarySpecies === 'string' ? (v.secondarySpecies as AvatarSpeciesId) : null,
        hybridRatio: typeof v.hybridRatio === 'number' ? v.hybridRatio : null,
        glitchHumanRatio: typeof v.glitchHumanRatio === 'number' ? v.glitchHumanRatio : null,
        glitchAlienRatio: typeof v.glitchAlienRatio === 'number' ? v.glitchAlienRatio : null,
        glitchAiRatio: typeof v.glitchAiRatio === 'number' ? v.glitchAiRatio : null,
      };
    }
  }
  if (obj.active && typeof obj.active === 'object') {
    const active = obj.active as Record<string, unknown>;
    if (typeof active.species === 'string') draft.active.species = active.species as AvatarSpeciesId;
  }
  return draft;
}

/** Serializes the draft back to a plain JSON-safe object for the
 * `configuration` jsonb column. */
export function serializeAvatarConfiguration(draft: AvatarConfigurationDraft): Record<string, unknown> {
  return JSON.parse(JSON.stringify(draft));
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/** Every species requires a foundation choice before it can be saved
 * as the active species (Avatar Phase 2B brief: "All species: Require
 * species, foundation/archetype where applicable"). */
export function validateFoundationSelected(draft: AvatarSpeciesDraft | undefined): ValidationResult {
  if (!draft || !draft.foundation) {
    return { valid: false, errors: ['Choose a foundation before continuing.'] };
  }
  return { valid: true, errors: [] };
}

export function validateHybridSelection(
  primary: AvatarSpeciesId | null | undefined,
  secondary: AvatarSpeciesId | null | undefined,
  ratio: number | null | undefined,
): ValidationResult {
  const errors: string[] = [];
  if (!primary) errors.push('Choose a primary species.');
  if (!secondary) errors.push('Choose a secondary species.');
  if (primary && secondary && primary === secondary) errors.push('Primary and secondary species must be different.');
  if (primary && secondary && primary !== secondary && !isHybridPairAllowed(primary, secondary)) {
    errors.push('That species pairing is not yet offered in the creator.');
  }
  if (ratio === null || ratio === undefined) {
    errors.push('Set the hybrid ratio.');
  } else if (ratio < 0 || ratio > 100) {
    errors.push('Hybrid ratio must be between 0 and 100.');
  }
  return { valid: errors.length === 0, errors };
}

export function validateGlitchComposition(
  human: number | null | undefined,
  alien: number | null | undefined,
  ai: number | null | undefined,
): ValidationResult {
  const errors: string[] = [];
  if (human === null || human === undefined) errors.push('Set the Human consciousness percentage.');
  if (alien === null || alien === undefined) errors.push('Set the Alien consciousness percentage.');
  if (ai === null || ai === undefined) errors.push('Set the AI consciousness percentage.');
  if (errors.length > 0) return { valid: false, errors };

  for (const [label, value] of [
    ['Human', human],
    ['Alien', alien],
    ['AI', ai],
  ] as [string, number][]) {
    if (value < 0 || value > 100) errors.push(`${label} percentage must be between 0 and 100.`);
  }
  if (errors.length > 0) return { valid: false, errors };

  const total = (human as number) + (alien as number) + (ai as number);
  if (total !== 100) {
    errors.push(`Composition must total 100% — currently ${total}%.`);
  }
  return { valid: errors.length === 0, errors };
}

/** Full pre-save validation for whichever species is active. Combines
 * the foundation check every species needs with the species-specific
 * composition checks. */
export function validateActiveDraft(species: AvatarSpeciesId, draft: AvatarSpeciesDraft | undefined): ValidationResult {
  const foundationCheck = validateFoundationSelected(draft);
  if (!foundationCheck.valid) return foundationCheck;

  if (species === 'hybrid') {
    return validateHybridSelection(draft?.primarySpecies, draft?.secondarySpecies, draft?.hybridRatio);
  }
  if (species === 'glitch') {
    return validateGlitchComposition(draft?.glitchHumanRatio, draft?.glitchAlienRatio, draft?.glitchAiRatio);
  }
  return { valid: true, errors: [] };
}
