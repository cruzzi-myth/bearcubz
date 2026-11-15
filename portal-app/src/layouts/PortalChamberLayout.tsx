import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { usePortalAuth } from '../features/auth/PortalAuthContext';
import { ChamberNav } from '../components/ChamberNav';
import { AdminControlsOverlay } from '../components/AdminControlsOverlay';
import { useDashboardData } from '../hooks/useDashboardData';
import { portalAsset } from '../lib/assetPath';
import './portal-chamber-layout.css';

type Props = {
  /** Path under /portal/assets/signal-portal/, e.g. "artist-dashboard.webp" */
  background: string;
  /** Stage J: when set, overrides `background` entirely with a full
   * URL (e.g. a signed Storage URL for this collaboration's own
   * primary cover art) — lets the Listening Chamber feel like THIS
   * artist's work rather than a generic shared environment, without
   * changing anything about how the other six environments render. */
  backgroundUrl?: string;
  backgroundAlt: string;
  eyebrow: string;
  title: string;
  children: ReactNode;
};

/**
 * Shared full-bleed environment layout for every authenticated-area
 * page (Dashboard, Admin, the four collaboration chambers). Each page
 * supplies its own approved background image and content — this only
 * owns the backdrop, scrim, and the consistent chrome around it so
 * the seven environments read as one continuous system.
 */
export function PortalChamberLayout({ background, backgroundUrl, backgroundAlt, eyebrow, title, children }: Props) {
  // Stage K1.5B: one shared layout, so this single check covers all
  // four chambers at once — never rendered for an ordinary artist
  // account, since isAdmin only ever reflects a real, server-verified
  // is_portal_admin() result (see PortalAuthContext), same guarantee
  // every other admin-only control in this app already relies on.
  const { isAdmin } = usePortalAuth();
  // Stage K1.6A: this layout is shared by all four chambers, each
  // matched by the exact same `collaboration/:id/<segment>` route
  // shape -- reading :id here (once) is what lets ChamberNav preserve
  // the current project across chamber-to-chamber navigation without
  // any component needing to pass it down explicitly.
  const { id } = useParams<{ id: string }>();
  // Stage K1.6P: title for the Admin Controls panel's context line —
  // reuses the same already-authorized collaboration list every
  // other admin-preview surface draws from (useDashboardData), not a
  // second query.
  const dashboard = useDashboardData();
  const currentTitle = id && dashboard.kind === 'ready' ? dashboard.collaborations.find((c) => c.id === id)?.title : undefined;

  return (
    <div className="sp-chamber">
      {/* Stage I2G: decorative ambient art, not content — aria-hidden so
          axe's "content must be in a landmark" region check (and any
          screen reader) correctly treats it as pure atmosphere. */}
      <img
        className="sp-chamber__bg"
        src={backgroundUrl ?? portalAsset(`assets/signal-portal/${background}`)}
        alt={backgroundAlt}
        aria-hidden="true"
      />
      <div className="sp-chamber__scrim" aria-hidden="true" />
      <header className="sp-chamber__head">
        <Link to="/" className="sp-chamber__brand">
          BE<span>λ</span>R CUBZ <span aria-hidden="true">·</span> SIGNAL PORTAL
        </Link>
        {/* Stage K1.6P: Command Center is reachable only through the
            Admin Controls overlay now, never as a primary header
            link here — the Dashboard is the one hub connecting the
            Artist Portal and Command Center branches (see
            ChamberNav's own "Dashboard" link in the nav row below). */}
        {isAdmin && (
          <>
            <span className="sp-chamber__admin-badge">Administrator Preview</span>
            <AdminControlsOverlay collaborationId={id} collaborationTitle={currentTitle} />
          </>
        )}
      </header>
      <div className="sp-chamber__nav-row">
        <ChamberNav currentCollaborationId={id} />
      </div>
      <main className="sp-chamber__stage">
        <p className="sp-chamber__eyebrow">{eyebrow}</p>
        <h1 className="sp-chamber__title">{title}</h1>
        <div className="sp-chamber__panel">{children}</div>
      </main>
    </div>
  );
}
