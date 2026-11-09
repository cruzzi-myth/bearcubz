import { useParams } from 'react-router-dom';
import { useState } from 'react';
import { PortalChamberLayout } from '../layouts/PortalChamberLayout';
import { PortalEmptyState } from '../components/PortalEmptyState';
import { ChamberNoProjectState } from '../components/ChamberNoProjectState';
import { GalleryTile } from '../components/GalleryTile';
import { GalleryLightbox } from '../components/GalleryLightbox';
import { PortalHost } from '../features/portal-host/PortalHost';
import { useAuthorizedCollaboration } from '../hooks/useAuthorizedCollaboration';
import { VISUAL_ASSET_TYPES } from '../lib/visualAssetTypes';
import './chamber-content.css';

export function VisualGalleryPage() {
  const { id } = useParams();
  const authz = useAuthorizedCollaboration(id);
  const [openAssetId, setOpenAssetId] = useState<string | null>(null);

  return (
    <>
    <PortalChamberLayout
      background="visual-gallery.webp"
      backgroundAlt="A multi-level futuristic exhibition of holographic art installations — the Visual Concept Gallery environment"
      eyebrow="Visuals"
      title="Visual Concept Gallery"
    >
      {authz.status === 'loading' && <PortalEmptyState message="Checking authorization for this collaboration…" showReturnLink={false} />}
      {authz.status === 'backend-unavailable' && (
        <PortalEmptyState message="The Signal Portal backend isn't configured in this environment yet." showReturnLink={false} />
      )}
      {authz.status === 'error' && <PortalEmptyState message="Couldn't load this collaboration right now. Please try again." />}
      {authz.status === 'not-authorized' && !id && (
        <ChamberNoProjectState message="No visual concepts are available yet. Approved collaboration artwork will appear here." />
      )}
      {authz.status === 'not-authorized' && id && <PortalEmptyState message="This collaboration isn't available to your account." />}

      {authz.status === 'authorized' &&
        (() => {
          const images = authz.assets.filter((a) => VISUAL_ASSET_TYPES.has(a.assetType));
          const open = images.find((img) => img.id === openAssetId);

          if (images.length === 0) {
            return <p className="sp-gallery__empty">No concept artwork has been loaded for this collaboration yet.</p>;
          }

          return (
            <div className="sp-gallery">
              <div className="sp-gallery__grid">
                {images.map((img) => (
                  <GalleryTile key={img.id} asset={img} onOpen={() => setOpenAssetId(img.id)} />
                ))}
              </div>
              {open && <GalleryLightbox asset={open} onClose={() => setOpenAssetId(null)} />}
            </div>
          );
        })()}
    </PortalChamberLayout>
    <PortalHost />
    </>
  );
}
