import type { AvatarOptionDef } from '../../../data/avatarSpecies';
import '../../onboarding/onboarding.css';

interface ChoiceGridProps {
  legend: string;
  helpText?: string;
  options: AvatarOptionDef[];
  value: string | undefined;
  onChange: (id: string) => void;
}

/** A single-select grid of option chips, driven entirely by data
 * (avatarSpecies.ts's AvatarOptionDef[]) — no per-species JSX. Reuses
 * onboarding's existing fieldset/chip visual language rather than
 * introducing a second pattern for the same idea. Real <button>s, a
 * real <fieldset>/<legend>, and a visible focus state (site-wide
 * :focus-visible rule in tokens.css) rather than clickable divs. */
export function ChoiceGrid({ legend, helpText, options, value, onChange }: ChoiceGridProps) {
  if (options.length === 0) return null;
  return (
    <fieldset className="mr-onboard-fieldset">
      <legend>{legend}</legend>
      {helpText && <p className="mr-avatar-help">{helpText}</p>}
      <div className="mr-onboard-grid" role="radiogroup" aria-label={legend}>
        {options.map((opt) => (
          <button
            key={opt.id}
            type="button"
            role="radio"
            aria-checked={value === opt.id}
            className={`mr-onboard-chip${value === opt.id ? ' active' : ''}`}
            onClick={() => onChange(opt.id)}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
