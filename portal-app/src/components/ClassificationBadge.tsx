import { CLASSIFICATION_META, type Classification } from '../lib/collaborationClassification';
import './classification-badge.css';

export function ClassificationBadge({ classification }: { classification: Classification }) {
  const meta = CLASSIFICATION_META[classification];
  return (
    <span
      className={`sp-class-badge sp-class-badge--${classification}`}
      style={{ ['--sp-class-accent' as string]: `var(${meta.accentVar})` }}
    >
      <span aria-hidden="true">{meta.glyph}</span> {meta.label}
    </span>
  );
}
