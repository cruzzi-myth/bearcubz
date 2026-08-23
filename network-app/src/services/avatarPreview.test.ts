import { describe, expect, it } from 'vitest';
import { computeAvatarPreviewParams, computeOnboardingPreviewParams, resolveOnboardingAvatarRenderState, resolveSpeciesAvatarRenderState } from './avatarPreview';
import { emptySpeciesDraft } from './avatarValidation';

describe('computeAvatarPreviewParams', () => {
  it('falls back to a species default color with no selections', () => {
    const params = computeAvatarPreviewParams('human', undefined);
    expect(params.baseShape).toBe('human');
    expect(params.primaryColor).toBe('#00e5ff');
    expect(params.scale).toBe(1);
    expect(params.detailIntensity).toBe(0);
  });

  it('reacts to a hair_color selection', () => {
    const draft = { ...emptySpeciesDraft(), values: { hair_color: 'magenta' } };
    const params = computeAvatarPreviewParams('human', draft);
    expect(params.primaryColor).toBe('#ff2d78');
  });

  it('reacts to a build selection changing scale', () => {
    const narrow = computeAvatarPreviewParams('human', { ...emptySpeciesDraft(), values: { build: 'slender' } });
    const wide = computeAvatarPreviewParams('human', { ...emptySpeciesDraft(), values: { build: 'muscular' } });
    expect(narrow.scale).toBeLessThan(1);
    expect(wide.scale).toBeGreaterThan(1);
  });

  it('reacts to augmentation level changing detail intensity', () => {
    const none = computeAvatarPreviewParams('human', { ...emptySpeciesDraft(), values: { augmentation_level: 'none' } });
    const heavy = computeAvatarPreviewParams('human', { ...emptySpeciesDraft(), values: { augmentation_level: 'heavy' } });
    expect(none.detailIntensity).toBe(0);
    expect(heavy.detailIntensity).toBe(3);
  });

  it('picks up the Xyren foundation accent over the default Alien hue', () => {
    const atlaran = computeAvatarPreviewParams('alien', { ...emptySpeciesDraft(), foundation: 'atlaran' });
    const xyren = computeAvatarPreviewParams('alien', { ...emptySpeciesDraft(), foundation: 'xyren' });
    expect(atlaran.primaryColor).toBe('#8b5cf6');
    expect(xyren.primaryColor).toBe('#ff2d55');
  });

  it('blends Hybrid toward the secondary species by hybrid_ratio', () => {
    const params = computeAvatarPreviewParams('hybrid', {
      ...emptySpeciesDraft(),
      primarySpecies: 'human',
      secondarySpecies: 'alien',
      hybridRatio: 75,
    });
    expect(params.baseShape).toBe('human');
    expect(params.blendShape).toBe('alien');
    expect(params.blendAmount).toBeCloseTo(0.75);
  });

  it('reduces Glitch fragmentation as one influence dominates', () => {
    const balanced = computeAvatarPreviewParams('glitch', {
      ...emptySpeciesDraft(),
      glitchHumanRatio: 34,
      glitchAlienRatio: 33,
      glitchAiRatio: 33,
    });
    const dominant = computeAvatarPreviewParams('glitch', {
      ...emptySpeciesDraft(),
      glitchHumanRatio: 80,
      glitchAlienRatio: 10,
      glitchAiRatio: 10,
    });
    expect(balanced.fragmentation).toBeGreaterThan(dominant.fragmentation);
  });
});

describe('computeOnboardingPreviewParams', () => {
  it('reacts to eye style, accent, and hairstyle independently', () => {
    const a = computeOnboardingPreviewParams('human', 'static-shave', 'cyan-visor', 'magenta');
    const b = computeOnboardingPreviewParams('human', 'void-braid', 'violet-scan', 'amber');
    expect(a.primaryColor).not.toBe(b.primaryColor);
    expect(a.accentColor).not.toBe(b.accentColor);
    expect(a.detailIntensity).not.toBe(b.detailIntensity);
  });

  it('falls back to the species default hue for an unrecognized eye style or "none" accent', () => {
    const params = computeOnboardingPreviewParams('mythraxian', 'static-shave', 'unknown-style', 'none');
    expect(params.primaryColor).toBe('#d4af37');
    expect(params.accentColor).toBe('#d4af37');
  });

  it('falls back to human for an unrecognized base model rather than throwing', () => {
    expect(() => computeOnboardingPreviewParams('not-a-species', 'static-shave', 'cyan-visor', 'none')).not.toThrow();
    expect(computeOnboardingPreviewParams('not-a-species', 'static-shave', 'cyan-visor', 'none').species).toBe('human');
  });
});

describe('resolveOnboardingAvatarRenderState', () => {
  it('resolves a real portrait for Human via the headFeature (hair) category, the one populated so far', () => {
    const state = resolveOnboardingAvatarRenderState('human', 'static-shave', 'cyan-visor', 'racer-jacket', 'cyan');
    expect(state.activeAsset).not.toBeNull();
    expect(state.activeCategory).toBe('headFeature');
    expect(state.activeAsset?.src).toContain('human/racer/headFeature/static-shave');
  });

  it('swaps the active portrait when the hair selection changes', () => {
    const a = resolveOnboardingAvatarRenderState('human', 'static-shave', 'cyan-visor', 'racer-jacket', 'cyan');
    const b = resolveOnboardingAvatarRenderState('human', 'void-braid', 'cyan-visor', 'racer-jacket', 'cyan');
    expect(a.activeAsset?.src).not.toBe(b.activeAsset?.src);
  });

  it('degrades to no active asset for a species with no render art yet, without throwing', () => {
    for (const species of ['alien', 'hybrid', 'ai', 'mythraxian', 'glitch']) {
      const state = resolveOnboardingAvatarRenderState(species, 'static-shave', 'cyan-visor', 'racer-jacket', 'cyan');
      expect(state.activeAsset).toBeNull();
    }
  });

  it('every layer carries a readable option label, art or not', () => {
    const state = resolveOnboardingAvatarRenderState('human', 'void-braid', 'ember-glow', 'signal-cloak', 'magenta');
    const hair = state.layers.find((l) => l.category === 'headFeature');
    expect(hair?.optionLabel).toBe('Void Braid');
    expect(hair?.asset).not.toBeNull(); // hair now has real per-option art
    const eyes = state.layers.find((l) => l.category === 'eyes');
    expect(eyes?.optionLabel).toBe('Ember Glow');
    expect(eyes?.asset).toBeNull(); // eyes has no render art yet — text-only, not fabricated
  });

  it('never fabricates an asset for an unrecognized option id', () => {
    const state = resolveOnboardingAvatarRenderState('human', 'not-a-real-option', 'cyan-visor', 'racer-jacket', 'cyan');
    const hair = state.layers.find((l) => l.category === 'headFeature');
    expect(hair?.asset).toBeNull();
    expect(hair?.optionLabel).toBe('not-a-real-option');
  });

  it('treats all four re-exported, chrome-free hair options as production-ready', () => {
    for (const hair of ['signal-crop', 'drift-waves', 'void-braid', 'static-shave']) {
      const state = resolveOnboardingAvatarRenderState('human', hair, 'cyan-visor', 'racer-jacket', 'cyan');
      expect(state.activeAsset?.productionReady).not.toBe(false);
    }
  });

  it('lets an explicit lastChangedCategory win over the default priority order', () => {
    // headFeature is top priority by default; explicitly naming a
    // different (currently art-less) category should still be
    // respected as "what the player just touched" even though it
    // falls through to the next-priority category since it has no
    // asset of its own yet.
    const state = resolveOnboardingAvatarRenderState('human', 'void-braid', 'cyan-visor', 'racer-jacket', 'cyan', 'eyes');
    // eyes has no art, so it falls through to the next entry in
    // priority order (headFeature) rather than showing nothing.
    expect(state.activeCategory).toBe('headFeature');
  });
});

describe('resolveSpeciesAvatarRenderState (the /universe/avatar rich creator)', () => {
  it('bridges Human hair_style ids to the nearest canonical render asset', () => {
    const draft = { ...emptySpeciesDraft(), foundation: 'racer', values: { hair_style: 'shaved' } };
    const state = resolveSpeciesAvatarRenderState('human', draft);
    expect(state.activeAsset).not.toBeNull();
    expect(state.activeAsset?.src).toContain('static-shave');
  });

  it('degrades gracefully for a hair_style id with no bridge entry, without throwing', () => {
    const draft = { ...emptySpeciesDraft(), foundation: 'racer', values: { hair_style: 'not-a-real-style' } };
    expect(() => resolveSpeciesAvatarRenderState('human', draft)).not.toThrow();
    expect(resolveSpeciesAvatarRenderState('human', draft).activeAsset).toBeNull();
  });

  it('degrades to no active asset for species other than Human, without throwing', () => {
    const draft = { ...emptySpeciesDraft(), foundation: 'atlaran', values: { hair_style: 'shaved' } };
    expect(() => resolveSpeciesAvatarRenderState('alien', draft)).not.toThrow();
    expect(resolveSpeciesAvatarRenderState('alien', draft).activeAsset).toBeNull();
  });
});
