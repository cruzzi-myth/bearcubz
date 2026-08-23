import type { AvatarReferenceImage } from '../../../data/avatarSpecies';
import type { AvatarPreviewParams } from '../../../services/avatarPreview';
import { getAvatarReferenceUrl } from '../../../services/avatarService';
import { AvatarPreviewGlyph } from './AvatarPreviewGlyph';

interface AvatarReferencePanelProps {
  speciesName: string;
  images: AvatarReferenceImage[];
  summaryLines: string[];
  previewParams: AvatarPreviewParams | null;
  previewScanning: boolean;
}

/**
 * The "what am I building" panel — two clearly separate things,
 * deliberately not conflated:
 *
 * 1. "Your Configuration" — a reactive SCHEMATIC glyph
 *    (AvatarPreviewGlyph) that actually changes as the player changes
 *    hair color, build, outfit, etc. This is the closest thing to a
 *    live preview that exists without per-option artwork or AI
 *    generation, and it's captioned as a schematic every time.
 * 2. "Visual Foundation Reference" — the real canon character art
 *    (unchanged from Phase 2B), which only changes when species/
 *    foundation changes and never reacts to cosmetic choices. Never
 *    captioned with the canon character's name on screen (that lives
 *    only in alt text, for assistive tech).
 */
export function AvatarReferencePanel({ speciesName, images, summaryLines, previewParams, previewScanning }: AvatarReferencePanelProps) {
  return (
    <aside className="mr-avatar-reference" aria-label="Avatar preview and visual foundation reference">
      {previewParams && (
        <div className="mr-avatar-preview-block">
          <AvatarPreviewGlyph params={previewParams} scanning={previewScanning} />
          <p className="mr-avatar-preview-block__caption">Schematic Preview — Not A Final Portrait</p>
        </div>
      )}

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
