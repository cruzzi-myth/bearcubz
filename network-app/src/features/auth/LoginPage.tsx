import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RouteShell } from '../../components/RouteShell';
import { LoadingState } from '../../components/LoadingState';
import { ErrorState } from '../../components/ErrorState';
import { useAuth } from './AuthContext';
import { usePlayerState } from '../player/PlayerStateContext';
import { linkExistingPassport } from '../../services/playerState';
import { parseBackendError, describeBackendError } from '../../services/errors';
import { trackEvent } from '../../services/analytics';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type LinkOutcome = 'idle' | 'linking' | 'no_passport' | 'already_linked' | 'error';

/**
 * Real Supabase Auth entry point for the Network. Passwordless
 * (magic link) to match the existing /passport/ UX. On a verified
 * session it tries link_my_passport() exactly once per sign-in — NOT
 * on every visit, since a stable Passport is already loaded via
 * get_my_player_state() by PlayerStateProvider once linked.
 */
export function LoginPage() {
  const { status: authStatus, signInWithEmail } = useAuth();
  const playerState = usePlayerState();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const [linkOutcome, setLinkOutcome] = useState<LinkOutcome>('idle');
  const attemptedLink = useRef(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!EMAIL_RE.test(email)) {
      setFormError('Enter a valid email address.');
      return;
    }
    setSending(true);
    trackEvent('network_login_started');
    try {
      await signInWithEmail(email.trim());
      setSent(true);
    } catch {
      setFormError('Could not send your verification email. Please try again.');
    } finally {
      setSending(false);
    }
  }

  // Once signed in, decide where this player belongs. Runs once per
  // sign-in (attemptedLink guards React 18's double-invoke + re-renders).
  useEffect(() => {
    if (authStatus !== 'signed-in' || playerState.status !== 'ready') return;
    if (attemptedLink.current) return;

    // Already has a stable Passport read (not the first visit after
    // linking) — nothing to link, just route onward.
    if (playerState.passport) {
      attemptedLink.current = true;
      trackEvent('network_login_success');
      navigate(playerState.profile ? '/dashboard' : '/onboarding', { replace: true });
      return;
    }

    attemptedLink.current = true;
    setLinkOutcome('linking');
    linkExistingPassport()
      .then(async () => {
        trackEvent('passport_existing_linked');
        trackEvent('network_login_success');
        await playerState.refresh();
        // refresh() updates context; the next render's passport check
        // above will route onward. Nothing else to do here.
        setLinkOutcome('idle');
      })
      .catch((err) => {
        const code = parseBackendError(err);
        setLinkOutcome(code === 'ALREADY_LINKED' ? 'already_linked' : 'no_passport');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authStatus, playerState.status, playerState.passport, playerState.profile]);

  if (authStatus === 'loading') {
    return (
      <RouteShell eyebrow="Identity" title="Moon Racer Passport" description="" placeholder={false}>
        <LoadingState message="ESTABLISHING SIGNAL…" />
      </RouteShell>
    );
  }

  if (authStatus === 'signed-in') {
    if (linkOutcome === 'linking' || playerState.status === 'loading') {
      return (
        <RouteShell eyebrow="Identity" title="Moon Racer Passport" description="" placeholder={false}>
          <LoadingState message="VERIFYING PASSPORT…" />
        </RouteShell>
      );
    }
    if (linkOutcome === 'no_passport') {
      const { title, body } = describeBackendError(new Error('NO_PASSPORT_FOUND'));
      return (
        <RouteShell eyebrow="Identity" title="Moon Racer Passport" description="" placeholder={false}>
          <ErrorState
            tone="info"
            title={title}
            body={body}
            action={{ label: 'Create Moon Racer Passport →', onClick: () => navigate('/passport/new') }}
          />
        </RouteShell>
      );
    }
    if (linkOutcome === 'already_linked') {
      const { title, body } = describeBackendError(new Error('ALREADY_LINKED'));
      return (
        <RouteShell eyebrow="Identity" title="Moon Racer Passport" description="" placeholder={false}>
          {/* No account-recovery flow exists yet — deliberately not
              offering a self-service takeover path. A real support
              contact channel is a Phase 3+ decision. */}
          <ErrorState title={title} body={`${body} No further action is available here yet — this account is not affected.`} />
        </RouteShell>
      );
    }
    return (
      <RouteShell eyebrow="Identity" title="Moon Racer Passport" description="" placeholder={false}>
        <LoadingState message="ACCESSING REPUBLIC NETWORK…" />
      </RouteShell>
    );
  }

  return (
    <RouteShell
      eyebrow="Identity"
      title="Moon Racer Passport"
      description="Sign in with the email you used to claim your Moon Racer Digital Passport. New here? Sign in anyway — you'll be offered a fresh Passport."
      placeholder={false}
    >
      {sent ? (
        <ErrorState
          tone="info"
          title="SIGNAL SENT"
          body={`Check ${email} for a verification link. Open it on this device to continue.`}
        />
      ) : (
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
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
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
          <button type="submit" className="network-btn" disabled={sending}>
            {sending ? 'Sending…' : 'Send Verification Link'}
          </button>
        </form>
      )}
    </RouteShell>
  );
}
