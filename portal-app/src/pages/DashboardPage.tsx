import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useDashboardData, type DashboardCollaboration } from '../hooks/useDashboardData';
import { usePortalAuth } from '../features/auth/PortalAuthContext';
import { AssetLibraryList } from '../components/AssetLibraryList';
import { CollaborationsReport } from '../components/CollaborationsReport';
import { CollaborationBriefingModal } from '../components/CollaborationBriefingModal';
import { ChamberNav } from '../components/ChamberNav';
import { PortalEmptyState } from '../components/PortalEmptyState';
import { PortalHost } from '../features/portal-host/PortalHost';
import { portalAsset } from '../lib/assetPath';
import './dashboard-page.css';

type LibraryView = 'asset-library' | 'collaborations';

function formatActivityDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  } catch {
    return iso;
  }
}

export function DashboardPage() {
  const data = useDashboardData();
  const { signOut, isAdmin } = usePortalAuth();
  const [view, setView] = useState<LibraryView>('asset-library');
  const [briefingTarget, setBriefingTarget] = useState<DashboardCollaboration | null>(null);

  return (
    <div className="sp-dash">
      {/* Stage I2G: decorative ambient art, not content — aria-hidden so
          axe's "content must be in a landmark" region check (and any
          screen reader) correctly treats it as pure atmosphere. */}
      <img
        className="sp-dash__bg"
        src={portalAsset('assets/signal-portal/artist-dashboard.webp')}
        alt="A warm, atmospheric futuristic creative studio — the Artist Dashboard environment"
        aria-hidden="true"
      />
      <div className="sp-dash__scrim" aria-hidden="true" />

      <header className="sp-dash__head">
        <div className="sp-dash__brand">
          <span className="sp-dash__brand-main">
            BE<span>λ</span>R CUBZ
          </span>
          <span className="sp-dash__brand-sub">THE COLLECTIVE</span>
        </div>
        {/* Stage K1.5B: the artist-facing badge is replaced, not
            supplemented, when an admin is previewing this page —
            this is never shown for an ordinary artist account, and
            never implies the admin has "become" an artist (no
            membership row is created or implied by this label). */}
        {isAdmin ? (
          <span className="sp-dash__badge sp-dash__badge--admin">Administrator View · Signal Portal</span>
        ) : (
          <span className="sp-dash__badge">Signal Portal // Artist Access</span>
        )}
        <nav className="sp-dash__nav" aria-label="Dashboard navigation">
          <span className="sp-dash__nav-current" aria-current="page">
            Dashboard
          </span>
          {isAdmin && (
            <Link to="/admin" className="sp-dash__admin-return">
              Return to Command Center
            </Link>
          )}
          <button type="button" className="sp-dash__signout" onClick={() => void signOut()}>
            Sign Out
          </button>
        </nav>
      </header>

      <div className="sp-dash__nav-row">
        <ChamberNav />
      </div>

      <main className="sp-dash__main">
        <section className="sp-dash__welcome" aria-labelledby="welcome-h">
          <p className="sp-dash__eyebrow" id="welcome-h">
            Welcome To The Signal
          </p>
          <h1>
            {isAdmin
              ? 'Administrator Preview.'
              : data.kind === 'ready' && data.displayName
                ? `Welcome back, ${data.displayName}.`
                : 'Welcome.'}
          </h1>
        </section>

        <section className="sp-dash__section" aria-labelledby="collabs-h">
          <div className="sp-dash__section-head">
            <h2 id="collabs-h">Your Collaborations</h2>
            {/* Stage K1.4: two differentiated views over the exact same
                already-authorized `data.collaborations` array — no second
                query, no parallel data store. */}
            <div className="sp-dash__view-toggle" role="tablist" aria-label="Collaboration view">
              <button
                type="button"
                role="tab"
                aria-selected={view === 'asset-library'}
                className={view === 'asset-library' ? 'sp-dash__view-tab sp-dash__view-tab--active' : 'sp-dash__view-tab'}
                onClick={() => setView('asset-library')}
              >
                Asset Library
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={view === 'collaborations'}
                className={view === 'collaborations' ? 'sp-dash__view-tab sp-dash__view-tab--active' : 'sp-dash__view-tab'}
                onClick={() => setView('collaborations')}
              >
                Collaborations
              </button>
            </div>
          </div>

          {data.kind === 'loading' && <PortalEmptyState message="Loading your authorized collaborations…" showReturnLink={false} />}

          {data.kind === 'backend-unavailable' && (
            <PortalEmptyState message="The Signal Portal backend isn't configured in this environment yet. This is not a reflection of your access." showReturnLink={false} />
          )}

          {data.kind === 'error' && (
            <PortalEmptyState message="Couldn't load your collaborations right now. Please try again." showReturnLink={false} />
          )}

          {/* Stage K1.6A: the admin-preview empty state is never shown to
              an ordinary artist account (isAdmin only ever reflects a
              real, server-verified is_portal_admin() result — see
              PortalChamberLayout's identical guard), and never implies
              administrative controls to one. */}
          {data.kind === 'ready' && data.collaborations.length === 0 && isAdmin && (
            <PortalEmptyState
              message={
                <>
                  <strong>ADMINISTRATOR PREVIEW</strong>
                  <br />
                  No collaboration projects have been created yet.
                  <br />
                  Create your first collaboration in the Command Center to activate the listening, proposal, visual
                  concept, and transmission chambers.
                </>
              }
              showReturnLink
              returnLinkTo="/admin"
              returnLinkLabel="Return to Command Center"
            />
          )}

          {data.kind === 'ready' && data.collaborations.length === 0 && !isAdmin && (
            <PortalEmptyState message="You're authorized, but no collaborations are assigned to you yet. Check back once one is." showReturnLink={false} />
          )}

          {data.kind === 'ready' && data.collaborations.length > 0 && view === 'asset-library' && (
            <AssetLibraryList
              rows={data.collaborations}
              selectedId={briefingTarget?.id ?? null}
              onSelect={(row) => setBriefingTarget(row)}
            />
          )}

          {data.kind === 'ready' && data.collaborations.length > 0 && view === 'collaborations' && (
            <CollaborationsReport
              rows={data.collaborations}
              selectedId={briefingTarget?.id ?? null}
              onSelect={(row) => setBriefingTarget(row)}
            />
          )}
        </section>

        <section className="sp-dash__section" aria-labelledby="transmissions-h">
          <h2 id="transmissions-h">Recent Transmissions</h2>

          {data.kind === 'ready' && data.activity.length === 0 && (
            <p className="sp-dash__no-transmissions">NO NEW TRANSMISSIONS</p>
          )}
          {data.kind === 'ready' && data.activity.length > 0 && (
            <ul className="sp-dash__activity">
              {data.activity.map((item) => (
                <li key={item.id}>
                  <span className="sp-dash__activity-label">{item.label}</span>
                  <span className="sp-dash__activity-project">{item.collaborationTitle}</span>
                  <span className="sp-dash__activity-at">{formatActivityDate(item.at)}</span>
                </li>
              ))}
            </ul>
          )}
          {(data.kind === 'loading' || data.kind === 'backend-unavailable' || data.kind === 'error') && (
            <p className="sp-dash__no-transmissions">NO NEW TRANSMISSIONS</p>
          )}
        </section>
      </main>

      <PortalHost />

      {briefingTarget && (
        <CollaborationBriefingModal
          collaboration={briefingTarget}
          availableAssetTypes={briefingTarget.availableAssetTypes}
          onClose={() => setBriefingTarget(null)}
        />
      )}
    </div>
  );
}
