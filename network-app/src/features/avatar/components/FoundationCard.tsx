import type { AvatarFoundation } from '../../../data/avatarSpecies';
import { getAvatarReferenceUrl } from '../../../services/avatarService';

interface FoundationCardProps {
  foundation: AvatarFoundation;
  selected: boolean;
  onSelect: () => void;
}

/** Step 02 foundation picker. Only Alien and AI have per-foundation
 * reference art (two verified, visually distinct directions each);
 * the other species show a plain choice chip since no dedicated art
 * exists yet — the parent AvatarCreationPage decides which to render. */
export function FoundationCard({ foundation, selected, onSelect }: FoundationCardProps) {
  const thumb = foundation.referenceImages[0];
  return (
    <button type="button" className={`mr-species-card${selected ? ' active' : ''}`} onClick={onSelect} aria-pressed={selected}>
      {thumb && (
        <span className="mr-species-card__thumb">
          <img src={getAvatarReferenceUrl(thumb.src)} alt={thumb.alt} loading="lazy" />
        </span>
      )}
      <span className="mr-species-card__name">{foundation.label}</span>
      <span className="mr-species-card__desc">{foundation.description}</span>
    </button>
  );
}
