import type { AvatarReferenceImage } from '../../../data/avatarSpecies';
import { getAvatarReferenceUrl } from '../../../services/avatarService';

interface AvatarReferencePanelProps {
  speciesName: string;
  images: AvatarReferenceImage[];
  summaryLines: string[];
}

/**
 * The "what am I building" panel. No AI generation exists yet, so
 * this is explicitly reference art + a running text summary of the
 * player's own choices — never presented as the player's finished
 * avatar, and never captioned with the canon character's name (that
 * lives only in the alt text as a description of what's pictured,
 * for players using assistive tech — not as an on-screen label).
 */
export function AvatarReferencePanel({ speciesName, images, summaryLines }: AvatarReferencePanelProps) {
  return (
    <aside className="mr-avatar-reference" aria-label="Visual foundation reference">
      <p className="mr-avatar-reference__eyebrow">Visual Foundation Reference</p>
      {images.length > 0 ? (
        <div className="mr-avatar-reference__images">
          {images.map((img) => (
            <img key={img.src} src={getAvatarReferenceUrl(img.src)} alt={img.alt} loading="lazy" />
          ))}
        </div>
      ) : (
        <p className="mr-avatar-reference__none">No dedicated reference art for this selection yet.</p>
      )}
      <p className="mr-avatar-reference__note">
        Reference art shows the {speciesName} species language — anatomy, materials, and style. You are creating a new,
        original character, not this character.
      </p>
      <div className="mr-avatar-reference__summary">
        <p className="mr-avatar-reference__eyebrow">Current Configuration</p>
        {summaryLines.length > 0 ? (
          <ul>
            {summaryLines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : (
          <p className="mr-avatar-reference__none">No selections yet.</p>
        )}
      </div>
      <p className="mr-avatar-reference__generation-note">AI portrait generation is coming in a later phase.</p>
    </aside>
  );
}
