import { SliderControl } from './SliderControl';

interface GlitchCompositionControlProps {
  human: number;
  alien: number;
  ai: number;
  onChange: (next: { human: number; alien: number; ai: number }) => void;
}

/** Writes directly to player_avatar's first-class glitch_human_ratio /
 * glitch_alien_ratio / glitch_ai_ratio columns. Three linked sliders
 * that always sum to 100 — moving one proportionally rebalances the
 * other two (rather than letting the total drift and only flagging it
 * at save time), so the player always sees a valid, understandable
 * total while they work. */
export function GlitchCompositionControl({ human, alien, ai, onChange }: GlitchCompositionControlProps) {
  function handleChange(key: 'human' | 'alien' | 'ai', nextValue: number) {
    const current = { human, alien, ai };
    const others = (['human', 'alien', 'ai'] as const).filter((k) => k !== key);
    const remaining = 100 - nextValue;
    const othersSum = others.reduce((sum, k) => sum + current[k], 0);

    const next = { ...current, [key]: nextValue };
    if (othersSum <= 0) {
      // Both other dials are at 0 — split the remainder evenly.
      const half = Math.round(remaining / 2);
      next[others[0]] = half;
      next[others[1]] = remaining - half;
    } else {
      // Preserve the existing ratio between the other two dials.
      const first = Math.round((current[others[0]] / othersSum) * remaining);
      next[others[0]] = Math.max(0, Math.min(100, first));
      next[others[1]] = Math.max(0, Math.min(100, remaining - next[others[0]]));
    }
    onChange(next);
  }

  const total = human + alien + ai;

  return (
    <fieldset className="mr-onboard-fieldset">
      <legend>Consciousness Composition</legend>
      <p className="mr-avatar-help">Adjusting one value rebalances the other two so the total always stays at 100%.</p>
      <SliderControl label="Human" value={human} min={0} max={100} onChange={(v) => handleChange('human', v)} />
      <SliderControl label="Alien" value={alien} min={0} max={100} onChange={(v) => handleChange('alien', v)} />
      <SliderControl label="AI" value={ai} min={0} max={100} onChange={(v) => handleChange('ai', v)} />
      <p className={`mr-glitch-total${total === 100 ? ' valid' : ' invalid'}`} role="status">
        Total {total}%
      </p>
    </fieldset>
  );
}
