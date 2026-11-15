import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { Modal } from './Modal';
import { useAdminAssets } from '../features/admin/hooks/useAdminAssets';
import { isArtistVisibleAsset } from '../lib/assetVisibility';
import './admin-controls-overlay.css';

type Props = { collaborationId?: string; collaborationTitle?: string };

function PreviewAccessSummary({ collaborationId }: { collaborationId: string }) {
  const { state } = useAdminAssets(collaborationId);

  if (state.kind === 'loading') return <p className="sp-admin-overlay__empty">Loading…</p>;
  if (state.kind !== 'ready') return <p className="sp-admin-overlay__empty">Couldn't load asset status.</p>;
  if (state.assets.length === 0) return <p className="sp-admin-overlay__empty">No assets recorded yet.</p>;

  return (
    <ul className="sp-admin-overlay__preview-list">
      {state.assets
        .filter((a) => a.isActive)
        .map((a) => {
          const artistVisible = a.uploadStatus === 'ready' && isArtistVisibleAsset({ assetType: a.assetType, approvalStatus: a.approvalStatus });
          return (
            <li key={a.id}>
              <span className="sp-admin-overlay__preview-label">{a.displayLabel}</span>
              <span className="sp-admin-overlay__preview-detail">
                {a.assetType} · {a.securityRequired ? a.securityStatus : 'legacy'} · {a.approvalStatus ?? 'n/a'} ·{' '}
                <strong className={artistVisible ? 'sp-admin-overlay__visible' : 'sp-admin-overlay__hidden'}>
                  {artistVisible ? 'artist-visible' : 'hidden from artists'}
                </strong>
              </span>
            </li>
          );
        })}
    </ul>
  );
}

/**
 * Stage K1.6P — administrator-only. Never rendered for an ordinary
 * artist account (every caller gates this behind the same
 * server-verified isAdmin flag everything else in this app already
 * relies on). This is deliberately separate from the normal artist
 * content layout — nothing here renders inline inside a chamber's
 * own content area; it only ever opens in this overlay.
 *
 * Every link below is a real navigation to the existing, unmodified
 * Command Center (deep-linked via query params it now reads — see
 * AdminPage.tsx) — nothing here duplicates an admin form. PREVIEW
 * ACCESS is the one genuinely new piece: a read-only summary, not a
 * mutation, reusing the same isArtistVisibleAsset rule the real
 * artist-facing chambers enforce.
 */
export function AdminControlsOverlay({ collaborationId, collaborationTitle }: Props) {
  const [open, setOpen] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const titleId = useId();

  return (
    <>
      <button type="button" className="sp-admin-overlay__trigger" onClick={() => setOpen(true)}>
        Admin Controls
      </button>
      {open && (
        <Modal titleId={titleId} onClose={() => setOpen(false)} className="sp-admin-overlay">
          <h2 id={titleId}>Admin Controls</h2>
          <p className="sp-admin-overlay__context">{collaborationTitle ?? 'No project selected'}</p>

          <nav className="sp-admin-overlay__actions" aria-label="Administrator actions">
            <Link
              to={collaborationId ? `/admin?tab=collaborations&edit=${collaborationId}` : '/admin?tab=collaborations'}
              className="sp-admin-overlay__action"
              aria-disabled={!collaborationId}
            >
              Edit Project
            </Link>
            <Link
              to={collaborationId ? `/admin?tab=assets&collab=${collaborationId}` : '/admin?tab=assets'}
              className="sp-admin-overlay__action"
              aria-disabled={!collaborationId}
            >
              Manage Assets
            </Link>
            <Link
              to={collaborationId ? `/admin?tab=feedback&collab=${collaborationId}` : '/admin?tab=feedback'}
              className="sp-admin-overlay__action"
              aria-disabled={!collaborationId}
            >
              Review Feedback
            </Link>
            <button
              type="button"
              className="sp-admin-overlay__action"
              onClick={() => setShowPreview((v) => !v)}
              disabled={!collaborationId}
            >
              Preview Access
            </button>
            <Link to="/admin" className="sp-admin-overlay__action">
              Command Center
            </Link>
            <Link to="/dashboard" className="sp-admin-overlay__action">
              Dashboard
            </Link>
          </nav>

          {showPreview && collaborationId && (
            <div className="sp-admin-overlay__preview">
              <h3>Artist-visible status</h3>
              <PreviewAccessSummary collaborationId={collaborationId} />
            </div>
          )}

          <button type="button" className="sp-admin-overlay__close" onClick={() => setOpen(false)} aria-label="Close admin controls">
            ×
          </button>
        </Modal>
      )}
    </>
  );
}
