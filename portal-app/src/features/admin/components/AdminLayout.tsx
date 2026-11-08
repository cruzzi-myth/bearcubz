import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { usePortalAuth } from '../../auth/PortalAuthContext';
import { portalAsset } from '../../../lib/assetPath';
import '../admin.css';

export type AdminTab = 'overview' | 'artists' | 'collaborations' | 'assets' | 'invitations' | 'feedback' | 'audit' | 'settings';

const TABS: { id: AdminTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'artists', label: 'Artists' },
  { id: 'collaborations', label: 'Collaborations' },
  { id: 'assets', label: 'Asset Library' },
  { id: 'invitations', label: 'Invitations' },
  { id: 'feedback', label: 'Transmissions' },
  { id: 'audit', label: 'Audit Log' },
  { id: 'settings', label: 'Settings' },
];

type Props = {
  activeTab: AdminTab;
  onTabChange: (tab: AdminTab) => void;
  children: ReactNode;
};

export function AdminLayout({ activeTab, onTabChange, children }: Props) {
  const { session, signOut } = usePortalAuth();

  return (
    <div className="sp-admin">
      {/* Stage I2G: decorative ambient art, not content — aria-hidden so
          axe's "content must be in a landmark" region check (and any
          screen reader) correctly treats it as pure atmosphere, same
          fix applied to the chamber/dashboard backgrounds below. */}
      <img
        className="sp-admin__bg"
        src={portalAsset('assets/signal-portal/portal-transition.webp')}
        alt="A circular neon gateway overlooking a dense futuristic skyline — the Administrator Command Center environment"
        aria-hidden="true"
      />
      <div className="sp-admin__scrim" aria-hidden="true" />

      <header className="sp-admin__head">
        {/* Stage K1.2: an absolute, cross-site link, deliberately a
            plain <a> rather than a React Router Link -- this leaves
            the Signal Portal app entirely for the main BEλR CUBZ
            site, a different top-level section outside the portal's
            own basename/router. */}
        <a className="sp-admin__brand" href="https://bearcubz.com/">
          <span className="sp-admin__brand-main">
            BE<span>λ</span>R CUBZ
          </span>
          <span className="sp-admin__brand-sub">Signal Portal — Command Center</span>
        </a>
        {session?.user?.email && <span className="sp-admin__identity">{session.user.email}</span>}
        <div className="sp-admin__head-actions">
          {/* Stage K1.2 fix: the previous plain <a href="/"> resolved
              against the site root, not the portal's own "/portal"
              basename -- it actually left the Signal Portal app
              entirely and landed on the main BEλR CUBZ homepage. A
              router Link, relative to the basename already configured
              in App.tsx, correctly lands back on the Signal Portal
              welcome page instead -- a client-side navigation, so the
              persisted session is never touched either way. */}
          <Link to="/">← Return to Signal Portal</Link>
          <button type="button" onClick={() => void signOut()}>
            Sign Out
          </button>
        </div>
      </header>

      <nav className="sp-admin__tabs" aria-label="Administrator sections">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className="sp-admin__tab"
            aria-current={activeTab === tab.id ? 'page' : undefined}
            onClick={() => onTabChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <main className="sp-admin__main">{children}</main>
    </div>
  );
}
