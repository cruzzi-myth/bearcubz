import { useId } from 'react';

interface ToggleControlProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export function ToggleControl({ label, checked, onChange }: ToggleControlProps) {
  const id = useId();
  return (
    <div className="mr-toggle">
      <label htmlFor={id} className="mr-toggle__label">
        <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span>{label}</span>
      </label>
    </div>
  );
}
