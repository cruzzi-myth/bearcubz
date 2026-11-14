import { useEffect } from 'react';
import type { CollaborationAsset } from '../hooks/useAuthorizedCollaboration';
import { useSignedAssetUrl } from '../hooks/useSignedAssetUrl';

type Props = {
  asset: CollaborationAsset;
  onClose: () => void;
  /** Stage K1.6B addendum — when more than one image exists for this
   * collaboration, the lightbox gets real Previous/Next controls
   * cycling through exactly this project's own images. Optional so a
   * single-image gallery (today's real data for both K1.6B projects)
   * renders exactly as before, with no stray controls. */
  siblings?: { images: CollaborationAsset[]; onNavigate: (id: string) => void };
};

export function GalleryLightbox({ asset, onClose, siblings }: Props) {
  const signed = useSignedAssetUrl(asset.id, 'full');
  const images = siblings?.images ?? [asset];
  const index = images.findIndex((img) => img.id === asset.id);
  const hasMultiple = images.length > 1;

  function goTo(delta: number) {
    if (!siblings || !hasMultiple) return;
    const nextIndex = (index + delta + images.length) % images.length;
    siblings.onNavigate(images[nextIndex].id);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') goTo(1);
      else if (e.key === 'ArrowLeft') goTo(-1);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose, index, images.length]);

  return (
    <div className="sp-gallery__lightbox" role="dialog" aria-label={asset.displayLabel} onClick={onClose}>
      <button type="button" className="sp-gallery__lightbox-close" onClick={onClose} aria-label="Close">
        ×
      </button>

      {hasMultiple && (
        <button
          type="button"
          className="sp-gallery__lightbox-nav sp-gallery__lightbox-nav--prev"
          onClick={(e) => { e.stopPropagation(); goTo(-1); }}
          aria-label="Previous image"
        >
          ‹
        </button>
      )}

      {signed.status === 'ready' && (
        <img src={signed.url} alt={asset.description ?? asset.displayLabel} onClick={(e) => e.stopPropagation()} />
      )}
      {signed.status === 'loading' && <p style={{ color: '#fff' }}>Requesting secure image access…</p>}
      {signed.status === 'unavailable' && <p style={{ color: '#fff' }}>Couldn't authorize this image right now.</p>}

      {hasMultiple && (
        <button
          type="button"
          className="sp-gallery__lightbox-nav sp-gallery__lightbox-nav--next"
          onClick={(e) => { e.stopPropagation(); goTo(1); }}
          aria-label="Next image"
        >
          ›
        </button>
      )}

      {hasMultiple && (
        <p className="sp-gallery__lightbox-count" onClick={(e) => e.stopPropagation()}>
          {index + 1} / {images.length}
        </p>
      )}
    </div>
  );
}
