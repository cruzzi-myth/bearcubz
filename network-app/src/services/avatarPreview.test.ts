import { describe, expect, it } from 'vitest';
import { computeAvatarPreviewParams, computeOnboardingPreviewParams } from './avatarPreview';
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
