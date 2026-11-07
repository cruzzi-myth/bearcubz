import { useDashboardData } from '../hooks/useDashboardData';
import { usePortalAuth } from '../features/auth/PortalAuthContext';
import { CollaborationCard } from '../components/CollaborationCard';
import { PortalEmptyState } from '../components/PortalEmptyState';
import { PortalHost } from '../features/portal-host/PortalHost';
import { portalAsset } from '../lib/assetPath';
import './dashboard-page.css';

function formatActivityDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  } catch {
    return iso;
  }
}

export function DashboardPage() {
  const data = useDashboardData();
  const { signOut } = usePortalAuth();

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
        <span className="sp-dash__badge">Signal Portal // Artist Access</span>
        <nav className="sp-dash__nav" aria-label="Dashboard navigation">
          <span className="sp-dash__nav-current" aria-current="page">
            Dashboard
          </span>
          <button type="button" className="sp-dash__signout" onClick={() => void signOut()}>
            Sign Out
          </button>
        </nav>
      </header>

      <main className="sp-dash__main">
        <section className="sp-dash__welcome" aria-labelledby="welcome-h">
          <p className="sp-dash__eyebrow" id="welcome-h">
            Welcome To The Signal
          </p>
          <h1>
            {data.kind === 'ready' && data.displayName ? `Welcome back, ${data.displayName}.` : 'Welcome.'}
          </h1>
        </section>

        <section className="sp-dash__section" aria-labelledby="collabs-h">
          <h2 id="collabs-h">Your Collaborations</h2>

          {data.kind === 'loading' && <PortalEmptyState message="Loading your authorized collaborations…" showReturnLink={false} />}

          {data.kind === 'backend-unavailable' && (
            <PortalEmptyState message="The Signal Portal backend isn't configured in this environment yet. This is not a reflection of your access." showReturnLink={false} />
          )}

          {data.kind === 'error' && (
            <PortalEmptyState message="Couldn't load your collaborations right now. Please try again." showReturnLink={false} />
          )}

          {data.kind === 'ready' && data.collaborations.length === 0 && (
            <PortalEmptyState message="You're authorized, but no collaborations are assigned to you yet. Check back once one is." showReturnLink={false} />
          )}

          {data.kind === 'ready' && data.collaborations.length > 0 && (
            <div className="sp-dash__grid">
              {data.collaborations.map((c) => (
                <CollaborationCard key={c.id} collaboration={c} />
              ))}
            </div>
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
    </div>
  );
}
