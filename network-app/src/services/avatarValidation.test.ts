import { describe, expect, it } from 'vitest';
import {
  deserializeAvatarConfiguration,
  emptyConfigurationDraft,
  sanitizeCosmeticPatch,
  serializeAvatarConfiguration,
  validateActiveDraft,
  validateFoundationSelected,
  validateGlitchComposition,
  validateHybridSelection,
  validateSpeciesConfirmation,
} from './avatarValidation';
import { getAvatarSpeciesDefinition, getOptionsForFoundation, isHybridPairAllowed, listEnabledAvatarSpecies } from '../data/avatarSpecies';

describe('validateHybridSelection', () => {
  it('rejects missing primary/secondary', () => {
    const result = validateHybridSelection(null, null, 50);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Choose a primary species.');
    expect(result.errors).toContain('Choose a secondary species.');
  });

  it('rejects identical primary and secondary', () => {
    const result = validateHybridSelection('human', 'human', 50);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Primary and secondary species must be different.');
  });

  it('rejects a pairing not on the allowed list', () => {
    // hybrid x hybrid is nonsensical and not on the list at all
    const result = validateHybridSelection('hybrid', 'human', 50);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('not yet offered'))).toBe(true);
  });

  it('rejects an out-of-range ratio', () => {
    const result = validateHybridSelection('human', 'alien', 150);
    expect(result.valid).toBe(false);
  });

  it('accepts a valid allowed pair with a valid ratio', () => {
    const result = validateHybridSelection('human', 'alien', 58);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});

describe('validateGlitchComposition', () => {
  it('rejects missing values', () => {
    const result = validateGlitchComposition(40, null, 35);
    expect(result.valid).toBe(false);
  });

  it('rejects a total under 100', () => {
    const result = validateGlitchComposition(40, 25, 30);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/currently 95%/);
  });

  it('rejects a total over 100', () => {
    const result = validateGlitchComposition(50, 30, 30);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/currently 110%/);
  });

  it('accepts a composition that sums to exactly 100', () => {
    const result = validateGlitchComposition(40, 25, 35);
    expect(result.valid).toBe(true);
  });
});

describe('validateFoundationSelected / validateActiveDraft', () => {
  it('rejects an undefined draft', () => {
    expect(validateFoundationSelected(undefined).valid).toBe(false);
  });

  it('rejects a draft with no foundation', () => {
    expect(validateFoundationSelected({ foundation: null, values: {} }).valid).toBe(false);
  });

  it('passes a non-hybrid, non-glitch species once a foundation is set', () => {
    const result = validateActiveDraft('human', { foundation: 'racer', values: {} });
    expect(result.valid).toBe(true);
  });

  it('still enforces hybrid composition even with a foundation set', () => {
    const result = validateActiveDraft('hybrid', { foundation: 'stable', values: {}, primarySpecies: 'human', secondarySpecies: null, hybridRatio: 50 });
    expect(result.valid).toBe(false);
  });
});

describe('isHybridPairAllowed', () => {
  it('is symmetric', () => {
    expect(isHybridPairAllowed('human', 'alien')).toBe(true);
    expect(isHybridPairAllowed('alien', 'human')).toBe(true);
  });

  it('rejects identical species', () => {
    expect(isHybridPairAllowed('human', 'human')).toBe(false);
  });

  it('rejects a pair not on the list', () => {
    expect(isHybridPairAllowed('glitch', 'human')).toBe(false);
  });
});

describe('configuration serialize/deserialize round-trip', () => {
  it('round-trips an empty draft', () => {
    const draft = emptyConfigurationDraft();
    const restored = deserializeAvatarConfiguration(serializeAvatarConfiguration(draft));
    expect(restored).toEqual(draft);
  });

  it('round-trips a populated draft', () => {
    const draft = emptyConfigurationDraft();
    draft.active.species = 'hybrid';
    draft.speciesDrafts.hybrid = {
      foundation: 'stable',
      values: { outfit: 'house_formal', signal_appearance: 'violet' },
      primarySpecies: 'human',
      secondarySpecies: 'alien',
      hybridRatio: 58,
    };
    const restored = deserializeAvatarConfiguration(serializeAvatarConfiguration(draft));
    expect(restored.active.species).toBe('hybrid');
    expect(restored.speciesDrafts.hybrid?.hybridRatio).toBe(58);
    expect(restored.speciesDrafts.hybrid?.values.outfit).toBe('house_formal');
  });

  it('never throws on malformed input', () => {
    expect(() => deserializeAvatarConfiguration(null)).not.toThrow();
    expect(() => deserializeAvatarConfiguration('garbage')).not.toThrow();
    expect(() => deserializeAvatarConfiguration({ speciesDrafts: 'not an object' })).not.toThrow();
    expect(deserializeAvatarConfiguration(undefined)).toEqual(emptyConfigurationDraft());
  });
});

describe('validateSpeciesConfirmation', () => {
  it('accepts a valid Human confirmation (no composition needed)', () => {
    expect(validateSpeciesConfirmation({ species: 'human' }).valid).toBe(true);
  });

  it('accepts a valid Hybrid confirmation', () => {
    const result = validateSpeciesConfirmation({ species: 'hybrid', primarySpecies: 'human', secondarySpecies: 'alien', hybridRatio: 58 });
    expect(result.valid).toBe(true);
  });

  it('rejects a Hybrid confirmation with identical parents', () => {
    const result = validateSpeciesConfirmation({ species: 'hybrid', primarySpecies: 'human', secondarySpecies: 'human', hybridRatio: 50 });
    expect(result.valid).toBe(false);
  });

  it('rejects a Hybrid confirmation with a disallowed pair', () => {
    const result = validateSpeciesConfirmation({ species: 'hybrid', primarySpecies: 'glitch', secondarySpecies: 'human', hybridRatio: 50 });
    expect(result.valid).toBe(false);
  });

  it('rejects a Hybrid confirmation with an invalid ratio', () => {
    const result = validateSpeciesConfirmation({ species: 'hybrid', primarySpecies: 'human', secondarySpecies: 'alien', hybridRatio: -5 });
    expect(result.valid).toBe(false);
  });

  it('accepts a valid Glitch confirmation', () => {
    const result = validateSpeciesConfirmation({ species: 'glitch', glitchHumanRatio: 40, glitchAlienRatio: 25, glitchAiRatio: 35 });
    expect(result.valid).toBe(true);
  });

  it('rejects a Glitch confirmation that does not total 100', () => {
    const result = validateSpeciesConfirmation({ species: 'glitch', glitchHumanRatio: 40, glitchAlienRatio: 25, glitchAiRatio: 30 });
    expect(result.valid).toBe(false);
  });

  it('rejects an unrecognized species', () => {
    // @ts-expect-error deliberately invalid for the test
    expect(validateSpeciesConfirmation({ species: 'dragon' }).valid).toBe(false);
  });
});

describe('sanitizeCosmeticPatch', () => {
  it('strips every permanent-identity key', () => {
    const dirty = {
      hair: 'shaved',
      species: 'alien',
      primary_species: 'human',
      secondary_species: 'alien',
      hybrid_ratio: 50,
      glitch_human_ratio: 10,
      glitch_alien_ratio: 10,
      glitch_ai_ratio: 80,
      species_confirmed_at: '2026-01-01T00:00:00Z',
    };
    const clean = sanitizeCosmeticPatch(dirty);
    expect(clean).toEqual({ hair: 'shaved' });
  });

  it('leaves a purely cosmetic patch untouched', () => {
    const patch = { hair: 'shaved', outfit: 'racer_jacket', archetype: 'racer' };
    expect(sanitizeCosmeticPatch(patch)).toEqual(patch);
  });
});

describe('species option lookup', () => {
  it('lists all six enabled species', () => {
    const ids = listEnabledAvatarSpecies().map((s) => s.id);
    expect(ids).toEqual(['human', 'alien', 'hybrid', 'ai', 'mythraxian', 'glitch']);
  });

  it('narrows Alien cranial-structure options to the active foundation', () => {
    const alien = getAvatarSpeciesDefinition('alien');
    const cranial = alien.customizationGroups.find((g) => g.id === 'cranial_structure')!;
    const atlaranOptions = getOptionsForFoundation(cranial, 'atlaran').map((o) => o.id);
    const xyrenOptions = getOptionsForFoundation(cranial, 'xyren').map((o) => o.id);
    expect(atlaranOptions).toContain('domed');
    expect(atlaranOptions).not.toContain('smooth_featureless');
    expect(xyrenOptions).toContain('smooth_featureless');
    expect(xyrenOptions).not.toContain('domed');
    // untagged options are available under any foundation
    expect(atlaranOptions).toContain('elongated_skull');
    expect(xyrenOptions).toContain('elongated_skull');
  });

  it('every species has at least one foundation and at least one group per wizard step used', () => {
    for (const species of listEnabledAvatarSpecies()) {
      expect(species.foundations.length).toBeGreaterThan(0);
      expect(species.customizationGroups.length).toBeGreaterThan(0);
    }
  });

  it('every species offers a Presentation choice with 4 inclusive options', () => {
    for (const species of listEnabledAvatarSpecies()) {
      const group = species.customizationGroups.find((g) => g.id === 'presentation');
      expect(group, `${species.id} is missing a presentation group`).toBeDefined();
      expect(group?.options?.map((o) => o.id)).toEqual(['masculine', 'feminine', 'androgynous', 'unspecified']);
    }
  });

  it('every species has a skin/surface color equivalent somewhere in its groups', () => {
    const skinLikeGroupIds: Record<string, string> = {
      human: 'skin_tone',
      alien: 'surface_color',
      hybrid: 'dermal_tone',
      ai: 'shell_color',
      mythraxian: 'crystal_coloration',
      glitch: 'holographic_matter',
    };
    for (const [speciesId, groupId] of Object.entries(skinLikeGroupIds)) {
      const species = getAvatarSpeciesDefinition(speciesId as Parameters<typeof getAvatarSpeciesDefinition>[0]);
      expect(species.customizationGroups.some((g) => g.id === groupId), `${speciesId} missing ${groupId}`).toBe(true);
    }
  });

  it('Hybrid offers hair customization', () => {
    const hybrid = getAvatarSpeciesDefinition('hybrid');
    expect(hybrid.customizationGroups.some((g) => g.id === 'hair_style')).toBe(true);
    expect(hybrid.customizationGroups.some((g) => g.id === 'hair_color')).toBe(true);
  });
});
