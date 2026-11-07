import { useParams } from 'react-router-dom';
import { useState } from 'react';
import { PortalChamberLayout } from '../layouts/PortalChamberLayout';
import { PortalEmptyState } from '../components/PortalEmptyState';
import { PrivateProposalViewer } from '../components/PrivateProposalViewer';
import { PortalHost } from '../features/portal-host/PortalHost';
import { useAuthorizedCollaboration } from '../hooks/useAuthorizedCollaboration';
import './chamber-content.css';

export function ProposalArchivePage() {
  const { id } = useParams();
  const authz = useAuthorizedCollaboration(id);
  const [openAssetId, setOpenAssetId] = useState<string | null>(null);

  return (
    <>
    <PortalChamberLayout
      background="proposal-archive.webp"
      backgroundAlt="A monumental archival facility of holographic records — the Proposal Archive environment"
      eyebrow="Proposal"
      title="Proposal Archive"
    >
      {authz.status === 'loading' && <PortalEmptyState message="Checking authorization for this collaboration…" showReturnLink={false} />}
      {authz.status === 'backend-unavailable' && (
        <PortalEmptyState message="The Signal Portal backend isn't configured in this environment yet." showReturnLink={false} />
      )}
      {authz.status === 'error' && <PortalEmptyState message="Couldn't load this collaboration right now. Please try again." />}
      {authz.status === 'not-authorized' && <PortalEmptyState message="This collaboration isn't available to your account." />}

      {authz.status === 'authorized' && (
        <div className="sp-proposal">
          <p className="sp-proposal__meta">{authz.collaboration.artistDisplayName}</p>
          {/* Stage I2H: was h3, skipping a level under the chamber's
              own h1 (PortalChamberLayout) — same class, same visible
              style, just the correct semantic level. */}
          <h2 className="sp-proposal__title">{authz.collaboration.title}</h2>

          {(() => {
            const proposals = authz.assets.filter((a) => a.assetType === 'proposal_pdf');
            const open = proposals.find((p) => p.id === openAssetId);

            if (open) return <PrivateProposalViewer asset={open} onClose={() => setOpenAssetId(null)} />;

            if (proposals.length === 0) {
              return <p className="sp-proposal__empty">No proposal has been loaded for this collaboration yet.</p>;
            }

            return (
              <div className="sp-proposal__list">
                {proposals.map((p) => (
                  <div key={p.id} className="sp-proposal__item">
                    <div className="sp-proposal__item-label">
                      <span>{p.displayLabel}</span>
                      <span className="sp-proposal__item-version">Version {p.version}</span>
                    </div>
                    <button type="button" className="sp-proposal__view-btn" onClick={() => setOpenAssetId(p.id)}>
                      View
                    </button>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      )}
    </PortalChamberLayout>
    <PortalHost />
    </>
  );
}
