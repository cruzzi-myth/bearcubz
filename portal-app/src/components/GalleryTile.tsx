import type { CollaborationAsset } from '../hooks/useAuthorizedCollaboration';
import { useSignedAssetUrl } from '../hooks/useSignedAssetUrl';

type Props = { asset: CollaborationAsset; onOpen: () => void };

export function GalleryTile({ asset, onOpen }: Props) {
  // Thumbnail first — only the full-resolution image is requested
  // when the artist actually opens the lightbox (see GalleryLightbox).
  const signed = useSignedAssetUrl(asset.id, 'thumbnail');

  // Stage I2H fix: the previous aria-label ("View {label}, {status}")
  // fully overrode the button's accessible name, so axe flagged it as
  // a label-content-name-mismatch — the literal visible text (status
  // pill, then label, in that DOM order) never appeared verbatim in
  // the override. No aria-label here now; the accessible name is
  // computed naturally from real content, so it can never drift from
  // what's visibly rendered. The thumbnail is decorative (the label
  // span already names the asset), so it gets alt="" rather than
  // contributing a second, possibly-differently-worded description.
  return (
    <button type="button" className="sp-gallery__tile" onClick={onOpen}>
      <span className="sp-sr-only">View </span>
      {signed.status === 'ready' && <img src={signed.url} alt="" />}
      <span className="sp-gallery__tile-label">
        {asset.approvalStatus && <span className="sp-gallery__tile-status">{asset.approvalStatus}</span>}
        {asset.displayLabel}
      </span>
    </button>
  );
}
