import { RouteShell } from '../../components/RouteShell';
import { LoadingState } from '../../components/LoadingState';
import { useAuth } from '../auth/AuthContext';
import { usePlayerState } from '../player/PlayerStateContext';
import './passport-shell.css';

/**
 * The in-Network Passport view. Reads the same passport_members row
 * as the standalone https://cruzzi-myth.github.io/bearcubz/passport/
 * registration flow (via get_my_player_state, scoped by RLS to the
 * signed-in player's own stable user_id — NOT link_my_passport(),
 * which is only for the one-time linking moment). Guests/signed-out
 * visitors are pointed at the standalone page instead.
 */
export function PassportShellPage() {
  const { status: authStatus } = useAuth();
  const playerState = usePlayerState();

  if (authStatus === 'loading' || (authStatus === 'signed-in' && playerState.status === 'loading')) {
    return (
      <RouteShell eyebrow="Identity" title="Your Passport" description="" placeholder={false}>
        <LoadingState message="VERIFYING PASSPORT…" />
      </RouteShell>
    );
  }

  if (authStatus === 'signed-in' && playerState.passport) {
    const p = playerState.passport;
    return (
      <RouteShell eyebrow="Identity" title="Your Passport" description="" placeholder={false}>
        <dl className="mr-passport-card">
          <div>
            <dt>Passport ID</dt>
            <dd>{p.passport_id}</dd>
          </div>
          <div>
            <dt>Racer Name</dt>
            <dd>{p.racer_name}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>{p.founder_status}</dd>
          </div>
          <div>
            <dt>Tribe</dt>
            <dd>{p.tribe}</dd>
          </div>
          <div>
            <dt>Sector</dt>
            <dd>{p.sector}</dd>
          </div>
          <div>
            <dt>Access Level</dt>
            <dd>{p.access_level}</dd>
          </div>
          <div>
            <dt>Issued</dt>
            <dd>{p.issue_date}</dd>
          </div>
        </dl>
      </RouteShell>
    );
  }

  return (
    <RouteShell
      eyebrow="Identity"
      title="Your Passport"
      description="Sign in to see your linked Passport here. Not registered yet? Claim one at the standalone Passport page."
    >
      <a href="https://cruzzi-myth.github.io/bearcubz/passport/" className="network-btn" style={{ textDecoration: 'none' }}>
        Open Passport Registration →
      </a>
    </RouteShell>
  );
}
