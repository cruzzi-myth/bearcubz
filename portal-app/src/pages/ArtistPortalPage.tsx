import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useDashboardData } from '../hooks/useDashboardData';
import { useAdminPreviewMembership } from '../hooks/useAdminPreviewMembership';
import { usePortalAuth } from '../features/auth/PortalAuthContext';
import { ChamberNav } from '../components/ChamberNav';
import { AdminControlsOverlay } from '../components/AdminControlsOverlay';
import { PrivateCoverArt } from '../components/PrivateCoverArt';
import { PortalEmptyState } from '../components/PortalEmptyState';
import { PortalHost } from '../features/portal-host/PortalHost';
import { portalAsset } from '../lib/assetPath';
import '../pages/dashboard-page.css';
import './artist-portal-page.css';

const CHAMBERS: { segment: 'listen' | 'proposal' | 'visuals' | 'respond'; label: string }[] = [
  { segment: 'listen', label: 'Listening Chamber' },
  { segment: 'proposal', label: 'Proposal Chamber' },
  { segment: 'visuals', label: 'Visual Concept Chamber' },
  { segment: 'respond', label: 'Transmission Chamber' },
];

/**
 * Stage K1.6P — the Artist Portal hub: the Dashboard's other branch
 * alongside the Command Center (hub-and-spoke navigation). This is
 * deliberately NOT a rebuild of the four chambers — it's a project
 * selector plus four links into the exact same, unmodified chamber
 * pages (/collaboration/:id/<segment>), which already independently
 * re-verify authorization on every load. The project picked here is
 * local UI state only, never an authorization mechanism.
 */
export function ArtistPortalPage() {
  const data = useDashboardData();
  const { isAdmin } = usePortalAuth();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const collaborations = data.kind === 'ready' ? data.collaborations : [];
  const selected = collaborations.find((c) => c.id === selectedId) ?? (collaborations.length === 1 ? collaborations[0] : undefined);
  const membership = useAdminPreviewMembership(selected?.id, isAdmin);

  return (
    <div className="sp-dash">
      <img
        className="sp-dash__bg"
        src={portalAsset('assets/signal-portal/artist-dashboard.webp')}
        alt="A warm, atmospheric futuristic creative studio — the Artist Portal environment"
        aria-hidden="true"
      />
      <div className="sp-dash__scrim" aria-hidden="true" />

      <header className="sp-dash__head">
        <div className="sp-dash__brand">
          <span className="sp-dash__brand-main">
            BE<span>λ</span>R CUBZ
          </span>
          <span className="sp-dash__brand-sub">ARTIST PORTAL</span>
        </div>
        {isAdmin && <span className="sp-dash__badge sp-dash__badge--admin">Administrator Preview</span>}
        {/* Stage K1.6R: the Artist Portal is already this page's own
            home, so no self-referential "Dashboard" link belongs
            here — the chamber nav row below has its own "Dashboard"
            link back to this same page, available to every
            authorized user. "Admin Dashboard" is the
            administrator-only escape hatch to the central hub
            (/dashboard), positioned here above the chamber nav,
            alongside Admin Controls — never mixed into it. */}
        {isAdmin && (
          <nav className="sp-dash__nav" aria-label="Administrator navigation">
            <Link to="/dashboard" className="sp-dash__admin-return">
              Admin Dashboard
            </Link>
            <AdminControlsOverlay collaborationId={selected?.id} collaborationTitle={selected?.title} />
          </nav>
        )}
      </header>

      <div className="sp-dash__nav-row">
        <ChamberNav />
      </div>

      <main className="sp-dash__main">
        <section className="sp-dash__welcome" aria-labelledby="artist-portal-h">
          <p className="sp-dash__eyebrow" id="artist-portal-h">
            The Private Collaboration Network
          </p>
          <h1>Artist Portal.</h1>
        </section>

        {isAdmin && selected && membership === 'unverified' && (
          <p className="sp-artist-portal__unverified-note">
            No real artist membership exists for this project yet — artist-account access has not been tested.
          </p>
        )}

        <section className="sp-dash__section" aria-labelledby="artist-project-h">
          <h2 id="artist-project-h">Select a Collaboration</h2>
          {data.kind === 'loading' && <PortalEmptyState message="Loading your authorized collaborations…" showReturnLink={false} />}
          {data.kind === 'backend-unavailable' && (
            <PortalEmptyState message="The Signal Portal backend isn't configured in this environment yet." showReturnLink={false} />
          )}
          {data.kind === 'error' && <PortalEmptyState message="Couldn't load your collaborations right now. Please try again." showReturnLink={false} />}
          {data.kind === 'ready' && collaborations.length === 0 && (
            <PortalEmptyState message="No collaborations are available yet." showReturnLink={false} />
          )}
          {data.kind === 'ready' && collaborations.length > 0 && (
            // Stage K1.6S: visually distinct project cards (cover +
            // title + artist) replacing the plain text buttons — the
            // accessible name is pinned to just the title via
            // aria-label (overriding what the card's own visible
            // text content would otherwise compute to), so this
            // remains a real radio selector, not a rebuild of the
            // selection mechanism itself. Entry into the project's
            // private chambers is the existing chamber-tile grid
            // below, once selected — unchanged.
            <div className="sp-artist-portal__project-list" role="radiogroup" aria-labelledby="artist-project-h">
              {collaborations.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  role="radio"
                  aria-checked={selected?.id === c.id}
                  aria-label={c.title}
                  className={selected?.id === c.id ? 'sp-artist-portal__project-card sp-artist-portal__project-card--active' : 'sp-artist-portal__project-card'}
                  onClick={() => setSelectedId(c.id)}
                >
                  <PrivateCoverArt assetId={c.primaryCoverAssetId} className="sp-artist-portal__project-card-cover" />
                  <span className="sp-artist-portal__project-card-text">
                    <span className="sp-artist-portal__project-card-title">{c.title}</span>
                    <span className="sp-artist-portal__project-card-artist">{c.artistDisplayName}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>

        {selected && (
          <section className="sp-dash__section" aria-labelledby="artist-chambers-h">
            <h2 id="artist-chambers-h">{selected.title}</h2>
            <div className="sp-artist-portal__chamber-grid">
              {CHAMBERS.map((ch) => (
                <Link key={ch.segment} to={`/collaboration/${selected.id}/${ch.segment}`} className="sp-artist-portal__chamber-tile">
                  {ch.label}
                </Link>
              ))}
            </div>
          </section>
        )}
      </main>

      <PortalHost />
    </div>
  );
}
