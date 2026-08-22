import type { AvatarOptionDef } from '../../../data/avatarSpecies';
import '../../onboarding/onboarding.css';

interface ColorChoiceProps {
  legend: string;
  options: AvatarOptionDef[];
  value: string | undefined;
  onChange: (id: string) => void;
}

/** Same single-select-chip pattern as ChoiceGrid, but each chip shows
 * a color swatch from the controlled Moon Racer palette
 * (AVATAR_COLOR_PALETTE) instead of an unrestricted color picker —
 * keeps every choice a stable, named value a future prompt builder
 * can map predictably. */
export function ColorChoice({ legend, options, value, onChange }: ColorChoiceProps) {
  return (
    <fieldset className="mr-onboard-fieldset">
      <legend>{legend}</legend>
      <div className="mr-onboard-grid" role="radiogroup" aria-label={legend}>
        {options.map((opt) => (
          <button
            key={opt.id}
            type="button"
            role="radio"
            aria-checked={value === opt.id}
            className={`mr-onboard-chip mr-color-chip${value === opt.id ? ' active' : ''}`}
            onClick={() => onChange(opt.id)}
          >
            <span className="mr-color-chip__swatch" style={{ background: opt.hex }} aria-hidden="true" />
            {opt.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
