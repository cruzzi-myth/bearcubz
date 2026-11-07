import type { ReactNode } from 'react';
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
        <div className="sp-admin__brand">
          <span className="sp-admin__brand-main">
            BE<span>λ</span>R CUBZ
          </span>
          <span className="sp-admin__brand-sub">Signal Portal — Command Center</span>
        </div>
        {session?.user?.email && <span className="sp-admin__identity">{session.user.email}</span>}
        <div className="sp-admin__head-actions">
          <a href="/">← Return to Artist Portal</a>
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
