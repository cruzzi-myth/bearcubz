import { useId } from 'react';

interface SliderControlProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  helpText?: string;
  onChange: (value: number) => void;
}

/** A semantic <input type="range"> — keyboard-operable, touch-usable,
 * and announced correctly by assistive tech without any custom widget
 * code. Used for the hybrid ratio and the three Glitch composition
 * dials. */
export function SliderControl({ label, value, min, max, step = 1, unit = '%', helpText, onChange }: SliderControlProps) {
  const id = useId();
  return (
    <div className="mr-slider">
      <label htmlFor={id} className="mr-slider__label">
        <span>{label}</span>
        <span className="mr-slider__value">
          {value}
          {unit}
        </span>
      </label>
      {helpText && <p className="mr-avatar-help">{helpText}</p>}
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}
