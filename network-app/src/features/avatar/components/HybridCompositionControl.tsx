import type { AvatarSpeciesId } from '../../../types/player';
import { AVATAR_SPECIES_DEFINITIONS, isHybridPairAllowed } from '../../../data/avatarSpecies';
import { SliderControl } from './SliderControl';

const HYBRID_CANDIDATE_SPECIES: AvatarSpeciesId[] = ['human', 'alien', 'ai', 'mythraxian'];

interface HybridCompositionControlProps {
  primarySpecies: AvatarSpeciesId | null;
  secondarySpecies: AvatarSpeciesId | null;
  hybridRatio: number;
  onChange: (patch: { primarySpecies?: AvatarSpeciesId | null; secondarySpecies?: AvatarSpeciesId | null; hybridRatio?: number }) => void;
}

/**
 * Writes directly to player_avatar's first-class primary_species /
 * secondary_species / hybrid_ratio columns (not the configuration
 * jsonb) — this is identity-level data, not a cosmetic choice. Only
 * offers the species pairs on HYBRID_ALLOWED_PAIRS.
 */
export function HybridCompositionControl({ primarySpecies, secondarySpecies, hybridRatio, onChange }: HybridCompositionControlProps) {
  const secondaryOptions = HYBRID_CANDIDATE_SPECIES.filter((s) => !primarySpecies || isHybridPairAllowed(primarySpecies, s));

  return (
    <fieldset className="mr-onboard-fieldset">
      <legend>Ancestry</legend>
      <div className="mr-hybrid-pickers">
        <label className="mr-onboard-label">
          Primary Species
          <select
            className="mr-onboard-input"
            value={primarySpecies ?? ''}
            onChange={(e) => {
              const next = (e.target.value || null) as AvatarSpeciesId | null;
              onChange({ primarySpecies: next, secondarySpecies: next === secondarySpecies ? null : secondarySpecies });
            }}
          >
            <option value="">Choose…</option>
            {HYBRID_CANDIDATE_SPECIES.map((id) => (
              <option key={id} value={id}>
                {AVATAR_SPECIES_DEFINITIONS[id].displayName}
              </option>
            ))}
          </select>
        </label>
        <label className="mr-onboard-label">
          Secondary Species
          <select
            className="mr-onboard-input"
            value={secondarySpecies ?? ''}
            onChange={(e) => onChange({ secondarySpecies: (e.target.value || null) as AvatarSpeciesId | null })}
            disabled={!primarySpecies}
          >
            <option value="">Choose…</option>
            {secondaryOptions.map((id) => (
              <option key={id} value={id}>
                {AVATAR_SPECIES_DEFINITIONS[id].displayName}
              </option>
            ))}
          </select>
        </label>
      </div>
      <SliderControl
        label="Secondary Species Influence"
        value={hybridRatio}
        min={0}
        max={100}
        helpText="0 = visually dominated by the primary species. 100 = visually dominated by the secondary species."
        onChange={(value) => onChange({ hybridRatio: value })}
      />
    </fieldset>
  );
}
