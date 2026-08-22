import type { AvatarSpeciesDefinition } from '../../../data/avatarSpecies';
import { getAvatarReferenceUrl } from '../../../services/avatarService';

interface SpeciesCardProps {
  species: AvatarSpeciesDefinition;
  selected: boolean;
  onSelect: () => void;
}

/** Step 01 species picker. Shows the approved reference art as
 * "visual foundation" material — never framed as "play as this
 * character." The player is building a new, original character. */
export function SpeciesCard({ species, selected, onSelect }: SpeciesCardProps) {
  const thumb = species.referenceImages[0];
  return (
    <button type="button" className={`mr-species-card${selected ? ' active' : ''}`} onClick={onSelect} aria-pressed={selected}>
      <span className="mr-species-card__thumb" aria-hidden={!thumb}>
        {thumb ? <img src={getAvatarReferenceUrl(thumb.src)} alt={thumb.alt} loading="lazy" /> : <span className="mr-species-card__thumb-placeholder">{species.displayName[0]}</span>}
      </span>
      <span className="mr-species-card__name">{species.displayName}</span>
      <span className="mr-species-card__desc">{species.shortDescription}</span>
    </button>
  );
}
