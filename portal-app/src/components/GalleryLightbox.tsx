import { useEffect } from 'react';
import type { CollaborationAsset } from '../hooks/useAuthorizedCollaboration';
import { useSignedAssetUrl } from '../hooks/useSignedAssetUrl';

type Props = { asset: CollaborationAsset; onClose: () => void };

export function GalleryLightbox({ asset, onClose }: Props) {
  const signed = useSignedAssetUrl(asset.id, 'full');

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="sp-gallery__lightbox" role="dialog" aria-label={asset.displayLabel} onClick={onClose}>
      <button type="button" className="sp-gallery__lightbox-close" onClick={onClose} aria-label="Close">
        ×
      </button>
      {signed.status === 'ready' && (
        <img src={signed.url} alt={asset.description ?? asset.displayLabel} onClick={(e) => e.stopPropagation()} />
      )}
      {signed.status === 'loading' && <p style={{ color: '#fff' }}>Requesting secure image access…</p>}
      {signed.status === 'unavailable' && <p style={{ color: '#fff' }}>Couldn't authorize this image right now.</p>}
    </div>
  );
}
