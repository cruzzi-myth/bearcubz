import type { AvatarReferenceImage } from '../../../data/avatarSpecies';
import type { AvatarPreviewParams, AvatarRenderState } from '../../../services/avatarPreview';
import { getAvatarReferenceUrl } from '../../../services/avatarService';
import { AvatarPreviewGlyph } from './AvatarPreviewGlyph';
import { AvatarRenderer } from './AvatarRenderer';

interface AvatarReferencePanelProps {
  speciesName: string;
  images: AvatarReferenceImage[];
  summaryLines: string[];
  previewParams: AvatarPreviewParams | null;
  previewScanning: boolean;
  /** Real-image render state (data/avatarRenderManifest.ts) — same
   * AvatarRenderer/resolver used by /universe/onboarding. Optional
   * because most species/foundations have no render art yet; when
   * absent (or its activeAsset resolves to nothing) this panel falls
   * back to the schematic glyph exactly as before. */
  renderState?: AvatarRenderState | null;
}

/**
 * The "what am I building" panel — three things, deliberately not
 * conflated:
 *
 * 1. AvatarRenderer — the real, image-based preview, where real
 *    render art exists for the current species/foundation. Same
 *    component and manifest /universe/onboarding uses.
 * 2. The reactive SCHEMATIC glyph (AvatarPreviewGlyph) — Avatar-
 *    Renderer's fallback for every species/foundation without real
 *    art yet, captioned as a schematic every time.
 * 3. "Visual Foundation Reference" — the real canon character art
 *    (unchanged from Phase 2B), which only changes when species/
 *    foundation changes and never reacts to cosmetic choices. Never
 *    captioned with the canon character's name on screen (that lives
 *    only in alt text, for assistive tech).
 */
export function AvatarReferencePanel({ speciesName, images, summaryLines, previewParams, previewScanning, renderState }: AvatarReferencePanelProps) {
  const schematicFallback = previewParams && (
    <div className="mr-avatar-preview-block">
      <AvatarPreviewGlyph params={previewParams} scanning={previewScanning} />
      <p className="mr-avatar-preview-block__caption">Schematic Preview — Not A Final Portrait</p>
    </div>
  );

  return (
    <aside className="mr-avatar-reference" aria-label="Avatar preview and visual foundation reference">
      {renderState ? <AvatarRenderer state={renderState} speciesLabel={speciesName} fallback={schematicFallback} /> : schematicFallback}

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
