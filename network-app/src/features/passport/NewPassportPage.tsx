import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RouteShell } from '../../components/RouteShell';
import { RequireAuth } from '../../components/RequireAuth';
import { useAuth } from '../auth/AuthContext';
import { usePlayerState } from '../player/PlayerStateContext';
import { createNewPassport } from '../../services/playerState';
import { describeBackendError } from '../../services/errors';
import { trackEvent } from '../../services/analytics';

const NAME_RE = /^[A-Za-z0-9 ._'-]{2,24}$/;

/**
 * Deliberate, explicit new-Passport creation — reached only from the
 * "CREATE MOON RACER PASSPORT" call to action after a verified
 * identity comes back with NO_PASSPORT_FOUND. Never auto-created
 * inside the login handler. Reuses claim_passport (the same function
 * /passport/ uses) + link_my_passport — no second Passport-writing path.
 */
export function NewPassportPage() {
  return (
    <RequireAuth>
      <NewPassportForm />
    </RequireAuth>
  );
}

function NewPassportForm() {
  const { verifiedEmail } = useAuth();
  const playerState = usePlayerState();
  const navigate = useNavigate();
  const [racerName, setRacerName] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    trackEvent('passport_new_started');
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const name = racerName.trim();
    if (!NAME_RE.test(name)) {
      setFormError("Racer Name must be 2–24 characters (letters, numbers, spaces, - _ . ' only).");
      return;
    }
    if (!verifiedEmail) {
      setFormError('Your signal could not be verified. Please sign in again.');
      return;
    }
    setBusy(true);
    try {
      await createNewPassport(verifiedEmail, name);
      trackEvent('passport_new_created');
      await playerState.refresh();
      navigate('/onboarding', { replace: true });
    } catch (err) {
      setFormError(describeBackendError(err).body);
    } finally {
      setBusy(false);
    }
  }

  return (
    <RouteShell
      eyebrow="Identity"
      title="Create Moon Racer Passport"
      description="Your identity has been verified. Choose the Racer Name that will identify you across the Network."
      placeholder={false}
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 360 }}>
        <label
          style={{
            fontFamily: "'Orbitron', sans-serif",
            fontSize: 11,
            letterSpacing: '0.15em',
            color: 'var(--cyan)',
            textTransform: 'uppercase',
          }}
        >
          Racer Name
          <input
            type="text"
            value={racerName}
            onChange={(e) => setRacerName(e.target.value)}
            maxLength={24}
            placeholder="Your Racer Name"
            style={{
              display: 'block',
              width: '100%',
              marginTop: 6,
              padding: '12px 14px',
              background: 'rgba(255,255,255,.03)',
              border: '1px solid rgba(255,255,255,.14)',
              borderRadius: 4,
              color: '#fff',
              fontFamily: "'Rajdhani', sans-serif",
              fontSize: 16,
            }}
          />
        </label>
        {formError && (
          <p style={{ color: 'var(--pink)', fontSize: 13, margin: 0 }} role="alert">
            {formError}
          </p>
        )}
        <button type="submit" className="network-btn" disabled={busy}>
          {busy ? 'Issuing Passport…' : 'Create Moon Racer Passport →'}
        </button>
      </form>
    </RouteShell>
  );
}
