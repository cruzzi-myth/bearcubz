import type { ReactNode } from 'react';
import type { AvatarRenderState } from '../../../services/avatarPreview';
import { getAvatarRenderUrl } from '../../../services/avatarService';

interface AvatarRendererProps {
  state: AvatarRenderState;
  speciesLabel: string;
  /** Rendered when no category has real art yet for this species/
   * foundation — typically the older schematic AvatarPreviewGlyph, so
   * species without render art yet don't regress to a blank panel. */
  fallback: ReactNode;
}

/**
 * The real, image-based avatar preview — reusable as-is from BOTH
 * /universe/onboarding and /universe/avatar. One renderer, one
 * manifest (data/avatarRenderManifest.ts), one configuration source:
 * this component never holds its own copy of the player's
 * selections, it only reads the AvatarRenderState its caller already
 * resolved from state that page already owns (see
 * resolveAvatarRenderState in services/avatarPreview.ts).
 *
 * V1 swaps whole portraits rather than compositing transparent layers
 * (the source art isn't modular yet) — state.activeAsset is whichever
 * category currently "wins" that swap. The manifest/resolver shape
 * doesn't assume that forever; a future move to true layering doesn't
 * require touching this component's props.
 *
 * Graceful degradation, per data/avatarRenderManifest.ts's rule:
 *   - No category has real art for this species/foundation yet -> `fallback`.
 *   - A given category (hair/eyes/outfit/accent) has no matching
 *     asset -> that layer still shows as a plain text line, never a
 *     fabricated image.
 *   - An asset that exists but isn't production-clean yet
 *     (`productionReady: false`) is visibly flagged, never presented
 *     as finished Moon Racer art.
 */
export function AvatarRenderer({ state, speciesLabel, fallback }: AvatarRendererProps) {
  if (!state.activeAsset) {
    return <>{fallback}</>;
  }

  const asset = state.activeAsset;
  const src = getAvatarRenderUrl(asset.src);
  const isTemp = asset.productionReady === false;

  return (
    <div className="mr-avatar-render">
      <div className="mr-avatar-render__stage">
        <img key={src} src={src} alt={`${speciesLabel} avatar preview`} className="mr-avatar-render__image" loading="eager" />
        {isTemp && (
          <p className="mr-avatar-render__temp-flag" title={asset.note}>
            Temp Preview Art — Not Final Quality
          </p>
        )}
      </div>
      <ul className="mr-avatar-render__layers">
        {state.layers.map((layer) => (
          <li
            key={layer.category}
            className={`mr-avatar-render__layer${layer.asset ? '' : ' mr-avatar-render__layer--text-only'}${
              layer.category === state.activeCategory ? ' mr-avatar-render__layer--active' : ''
            }`}
          >
            <span className="mr-avatar-render__layer-label">{layer.label}</span>
            <span className="mr-avatar-render__layer-value">{layer.optionLabel}</span>
            {!layer.asset && (
              <span className="mr-avatar-render__layer-flag" title="No visual asset for this option yet — shown as text only">
                txt
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
