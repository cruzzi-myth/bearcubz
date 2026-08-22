import { useNavigate } from 'react-router-dom';
import { RouteShell } from '../../components/RouteShell';
import { trackEvent } from '../../services/analytics';

const GUEST_FLAG_KEY = 'mrn.guest';

/** Sets a local-only guest flag (no account, no server) and continues
 * to the Dashboard shell. Real progress persistence is Phase 2. */
export function GuestEntryPage() {
  const navigate = useNavigate();

  function continueAsGuest() {
    try {
      localStorage.setItem(GUEST_FLAG_KEY, '1');
    } catch {
      // localStorage unavailable — guest mode just won't be remembered on reload.
    }
    trackEvent('guest_entry');
    navigate('/dashboard');
  }

  return (
    <RouteShell
      eyebrow="Guest Mode"
      title="Enter As Guest"
      description="Explore the Moon Racer Network without a Passport. Progress won't be saved to an account until you claim one — this is a local-only session."
    >
      <button type="button" className="network-btn" onClick={continueAsGuest}>
        Continue As Guest →
      </button>
    </RouteShell>
  );
}
