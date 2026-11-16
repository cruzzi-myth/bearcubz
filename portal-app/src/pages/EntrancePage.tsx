import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { portalAsset } from '../lib/assetPath';
import { supabase } from '../services/supabaseClient';
import { usePortalAuth } from '../features/auth/PortalAuthContext';
import { decideAccessAction, cooldownRemainingSeconds, ACCESS_MESSAGES, REQUEST_TIMEOUT_MS, SESSION_CHECK_TIMEOUT_MS } from '../features/auth/accessDecision';
import { useDashboardData } from '../hooks/useDashboardData';
import { resolveQuickAction, resolveForCollaboration } from '../features/portal-host/portalHostActions';
import type { HostCollaboration, ProjectChoice, QuickActionId } from '../features/portal-host/portalHostTypes';
import {
  ARTWORK_WIDTH,
  ARTWORK_HEIGHT,
  OVERLAY_REGIONS,
  WIDE_ARTWORK_WIDTH,
  WIDE_ARTWORK_HEIGHT,
  WIDE_OVERLAY_REGIONS,
  WIDE_BREAKPOINT_PX,
} from './entranceOverlayRegions';
import './entrance-page.css';

type RequestState =
  | { kind: 'idle' }
  | { kind: 'invalid'; message: string }
  | { kind: 'sending' }
  | { kind: 'checking-session' }
  | { kind: 'submitted' }
  | { kind: 'cooldown'; seconds: number }
  | { kind: 'denied'; message: string }
  | { kind: 'network-error'; message: string };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Always the same copy regardless of what the backend actually did —
// portal-request-access returns an identical { ok: true } whether the
// email was eligible, ineligible, rate-limited, or never heard of. The copy
// (ACCESS_MESSAGES.submitted) is therefore phrased conditionally on purpose.

type QuickPanelId = 'listen' | 'proposal' | 'visuals' | 'respond';
const QUICK_PANELS: { id: QuickPanelId; region: keyof typeof OVERLAY_REGIONS.panels; srLabel: string }[] = [
  { id: 'listen', region: 'listen', srLabel: 'Listen — Private Listening Chamber' },
  { id: 'proposal', region: 'proposal', srLabel: 'Proposal — Proposal Archive' },
  { id: 'visuals', region: 'visuals', srLabel: 'Visuals — Visual Concept Gallery' },
  { id: 'respond', region: 'respond', srLabel: 'Respond — Transmission Chamber' },
];

/**
 * Two distinct artwork compositions, two distinct overlay coordinate
 * sets (Stage I2E) — never the wide image with portrait coordinates
 * or vice versa. Determined synchronously from the real viewport
 * width on first render (no SSR here, so window is always available)
 * so there's no flash of the wrong variant, and re-checked on resize
 * so a window drag across the breakpoint swaps both the image and
 * its matching coordinates together, never just one.
 */
function useEntranceVariant() {
  const [isWide, setIsWide] = useState(() => window.innerWidth >= WIDE_BREAKPOINT_PX);

  useEffect(() => {
    function onResize() {
      setIsWide(window.innerWidth >= WIDE_BREAKPOINT_PX);
    }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return isWide
    ? {
        src: portalAsset('assets/signal-portal/portal-entrance-wide.webp'),
        width: WIDE_ARTWORK_WIDTH,
        height: WIDE_ARTWORK_HEIGHT,
        regions: WIDE_OVERLAY_REGIONS,
        alt: 'Signal Portal — BEλR CUBZ // THE COLLECTIVE. A cybernetic woman before a neon-lit future city beneath a glowing planetary ring, above an illuminated circular platform, flanked by a dense, rain-soaked cyberpunk skyline extending left and right. Artist-only private collaboration network.',
      }
    : {
        src: portalAsset('assets/signal-portal/portal-entrance.webp'),
        width: ARTWORK_WIDTH,
        height: ARTWORK_HEIGHT,
        regions: OVERLAY_REGIONS,
        alt: 'Signal Portal — BEλR CUBZ // THE COLLECTIVE. A cybernetic woman before a neon-lit future city beneath a glowing planetary ring, above an illuminated circular platform. Artist-only private collaboration network.',
      };
}

export function EntrancePage() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<RequestState>({ kind: 'idle' });
  const [choicePrompt, setChoicePrompt] = useState<{ action: QuickActionId; choices: ProjectChoice[]; text: string } | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const { status: authStatus, authorization, isAdmin, retry } = usePortalAuth();
  const dashboard = useDashboardData();
  // Guards against duplicate submissions from repeated clicks, and records when
  // the last link was requested so an intentional re-send is allowed after a
  // short cooldown (never a permanent lock).
  const busyRef = useRef(false);
  const lastSentAtRef = useRef<number | null>(null);
  const [waitingForSession, setWaitingForSession] = useState(false);
  const navigate = useNavigate();
  const variant = useEntranceVariant();

  // Dashboard-first navigation (Stage K1.6M): the Dashboard, not this
  // entrance screen, is the primary landing page right after a
  // successful sign-in — for both artists and administrators (an
  // admin is never auto-sent to /admin).
  //
  // The naive version of this ("navigate once authStatus becomes
  // signed-in") was tried and is wrong: PortalAuthContext's status
  // always STARTS at 'loading' and only resolves asynchronously,
  // whether or not a session already existed in storage before this
  // page even mounted — so that transition looks identical for a
  // genuine fresh magic-link return and for an admin who already has
  // a session simply reloading or deliberately navigating back to
  // "/" (e.g. via "← Return to Signal Portal" from the Command
  // Center). A real browser test caught this: it auto-bounced that
  // link straight back to /dashboard, breaking it.
  //
  // The only thing that's actually different between those two cases
  // is the URL itself: a genuine magic-link return always arrives
  // with Supabase's auth tokens in the hash (#access_token=...&type=
  // magiclink); a plain reload or an in-app Link navigation never
  // does. Capturing that fact once, synchronously, on this
  // component's very first render — before anything (including
  // supabase-js's own listener) has a chance to consume and clear the
  // hash — is what makes the distinction reliable.
  const cameFromMagicLinkRef = useRef(window.location.hash.includes('access_token='));
  useEffect(() => {
    // Wait for the invitation-acceptance + membership check to finish
    // ('checking' → final) before redirecting, so an invited artist is
    // never sent to an empty, pre-membership workspace. Artists land in
    // their Artist Portal; administrators keep the Dashboard hub.
    if (cameFromMagicLinkRef.current && authStatus === 'signed-in' && authorization !== 'checking') {
      navigate(isAdmin ? '/dashboard' : '/artist', { replace: true });
    }
  }, [authStatus, authorization, isAdmin, navigate]);

  const collaborations: HostCollaboration[] =
    dashboard.kind === 'ready' ? dashboard.collaborations.map((c) => ({ id: c.id, title: c.title, availableAssetTypes: c.availableAssetTypes })) : [];

  // Stage K1: Supabase's own auth redirect can land back here with
  // #error=...&error_description=... instead of a session -- most
  // commonly an already-superseded or expired magic-link token (e.g.
  // a stale link clicked after a later "Access Portal" click issued a
  // newer one, which invalidates the previous token). Before this,
  // nothing here ever looked at these params: the page just rendered
  // its normal signed-out entrance with no indication anything had
  // gone wrong, which is indistinguishable from "never clicked
  // anything" -- confirmed by reproducing it directly. supabase-js's
  // own session-detection logic reads and consumes the token/error
  // hash separately from this; this only ever reads it for display,
  // and clears it from the URL afterward so a refresh doesn't
  // re-trigger the same message.
  useEffect(() => {
    const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash;
    if (!hash) return;
    const params = new URLSearchParams(hash);
    const errorDescription = params.get('error_description');
    if (errorDescription) {
      setState({ kind: 'invalid', message: `${errorDescription} Please request a new sign-in link below.` });
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }, []);

  // ONE handler for both the ACCESS PORTAL button and the fingerprint button
  // (both are submit buttons of the same form). The fingerprint is a visual
  // alternative only — no biometric/WebAuthn flow exists or is claimed.
  function applyDecision(decision: ReturnType<typeof decideAccessAction>): boolean {
    if (decision.kind === 'route') {
      setWaitingForSession(false);
      setState({ kind: 'idle' });
      navigate(decision.path, { replace: false });
      return true;
    }
    if (decision.kind === 'denied') {
      setWaitingForSession(false);
      setState({ kind: 'denied', message: decision.message });
      return true;
    }
    if (decision.kind === 'error') {
      setWaitingForSession(false);
      setState({ kind: 'network-error', message: decision.message });
      return true;
    }
    return false;
  }

  // An existing session whose authorization is still being verified: finish
  // the routing as soon as the backend answers (never from the session alone).
  useEffect(() => {
    if (!waitingForSession) return;
    const decision = decideAccessAction({ authStatus, authorization, isAdmin });
    if (decision.kind === 'wait') return;
    if (decision.kind === 'request-link') {
      setWaitingForSession(false);
      setState({ kind: 'idle' });
      return;
    }
    applyDecision(decision);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waitingForSession, authStatus, authorization, isAdmin]);

  // ...and never wait forever.
  useEffect(() => {
    if (!waitingForSession) return;
    const t = window.setTimeout(() => {
      setWaitingForSession(false);
      setState({ kind: 'network-error', message: ACCESS_MESSAGES.sessionTimeout });
    }, SESSION_CHECK_TIMEOUT_MS);
    return () => window.clearTimeout(t);
  }, [waitingForSession]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busyRef.current) return; // duplicate click while a request is in flight

    // 1–4. Existing session? Verify authorization, then route by role.
    const decision = decideAccessAction({ authStatus, authorization, isAdmin });
    if (decision.kind === 'wait') {
      setState({ kind: 'checking-session' });
      setWaitingForSession(true);
      return;
    }
    if (decision.kind !== 'request-link') {
      if (decision.kind === 'error' && authorization === 'error') retry();
      applyDecision(decision);
      return;
    }

    // 5. No session: request a secure sign-in link for this email.
    const trimmed = email.trim();
    if (!EMAIL_PATTERN.test(trimmed)) {
      setState({ kind: 'invalid', message: 'Enter a valid email address.' });
      return;
    }
    const remaining = cooldownRemainingSeconds(lastSentAtRef.current, Date.now());
    if (remaining > 0) {
      setState({ kind: 'cooldown', seconds: remaining });
      return;
    }

    busyRef.current = true;
    setState({ kind: 'sending' });
    try {
      const { error } = await supabase.functions.invoke('portal-request-access', { body: { email: trimmed }, timeout: REQUEST_TIMEOUT_MS });
      if (error) {
        const timedOut = /abort|timeout|timed out/i.test(String((error as { name?: string; message?: string }).name ?? '') + String((error as { message?: string }).message ?? ''));
        setState({ kind: 'network-error', message: timedOut ? ACCESS_MESSAGES.timeout : ACCESS_MESSAGES.networkError });
      } else {
        lastSentAtRef.current = Date.now();
        setState({ kind: 'submitted' });
      }
    } catch {
      setState({ kind: 'network-error', message: ACCESS_MESSAGES.networkError });
    } finally {
      busyRef.current = false; // the UI can never be left pending
    }
  }

  function runQuickAction(actionId: QuickActionId) {
    setChoicePrompt(null);

    if (actionId !== 'about' && authStatus !== 'signed-in') {
      setActionMessage('Sign in above to unlock this for your authorized collaborations.');
      return;
    }
    if (actionId !== 'about' && dashboard.kind === 'loading') {
      setActionMessage('Checking your authorized collaborations…');
      return;
    }

    const decision = resolveQuickAction(actionId, collaborations);
    if (decision.kind === 'select-project') {
      setActionMessage(null);
      setChoicePrompt({ action: actionId, choices: decision.choices, text: decision.text });
      return;
    }
    setActionMessage(decision.text);
    if (decision.kind === 'navigate') navigate(decision.path);
  }

  function chooseProject(collaborationId: string) {
    if (!choicePrompt || choicePrompt.action === 'about') return;
    const chosen = collaborations.find((c) => c.id === collaborationId);
    setChoicePrompt(null);
    if (!chosen) return;
    const decision = resolveForCollaboration(choicePrompt.action, chosen);
    setActionMessage(decision.text);
    if (decision.kind === 'navigate') navigate(decision.path);
  }

  return (
    <main className="sp-entrance-v2">
      {/* Stage K1.3: a dedicated, fixed full-viewport environment layer,
          independent of the hero stage box below — it covers 100% of
          the viewport on every axis via object-fit: cover regardless
          of the hero's own aspect-ratio-constrained width, and sits at
          z-index 0 so it never intercepts clicks/keyboard focus (the
          hero stage is z-index 1, every interactive overlay above
          that). Same <img>-as-fixed-backdrop pattern already used for
          the Command Center's own background (AdminLayout.tsx) —
          decorative only, hence aria-hidden, same as that one. */}
      <picture>
        <source type="image/webp" srcSet={portalAsset('signal-portal-environment.webp')} />
        <img className="sp-entrance-v2__environment-bg" src={portalAsset('signal-portal-environment.png')} alt="" aria-hidden="true" />
      </picture>

      {/* Stage I2G: a real (though visually-hidden) h1 and a <main>
          landmark — the Stage I2D/I2E redesign baked the visible
          "Signal Portal" title into the artwork image itself, which
          left the page with no heading element at all. This doesn't
          touch the approved artwork, branding, or layout in any way
          that's visible — it only restores the accessible structure a
          screen reader needs around it. */}
      <h1 className="sp-entrance-v2__sr-label">Signal Portal — BEλR CUBZ // THE COLLECTIVE, Private Collaboration Network</h1>

      {/* Stage K1.1: new chrome, independent of the illustrated
          artwork's own coordinate system (unlike every other control
          on this page) -- shown only once authorization has actually
          resolved to true, never during 'checking'/'loading' and
          never from the session's email alone. isAdmin starts false
          and is only ever flipped by PortalAuthContext after a real,
          server-verified is_portal_admin() check succeeds; it's reset
          to false immediately on sign-out/session loss, so this
          disappears automatically in every one of those cases without
          any extra logic here. */}
      {authStatus === 'signed-in' && isAdmin && (
        <div className="sp-entrance-v2__admin-entrance">
          <p className="sp-entrance-v2__admin-badge">◈ ADMINISTRATOR ONLINE</p>
          <Link to="/admin" className="sp-entrance-v2__admin-link">
            ENTER COMMAND CENTER <span aria-hidden="true">→</span>
          </Link>
        </div>
      )}

      <div className="sp-entrance-v2__stage" style={{ aspectRatio: `${variant.width} / ${variant.height}`, ['--sp-stage-ratio' as string]: variant.width / variant.height }}>
        <img className="sp-entrance-v2__art" src={variant.src} alt={variant.alt} />

        {/* DOM order follows the artwork's own visual reading order
            (left-nav sits above the terminal in both compositions),
            not grouped by implementation concern — Stage I2E fix for
            keyboard Tab order previously not matching visual order. */}
        {/* "// MUSIC" has no corresponding page in Signal Portal today — left as
            inert background art rather than an active control with nowhere to go. */}
        <a
          className="sp-entrance-v2__nav-link"
          style={variant.regions.leftNav.collaborations}
          href="/dashboard"
          onClick={(e) => {
            e.preventDefault();
            if (authStatus === 'signed-in') navigate(isAdmin ? '/dashboard' : '/artist');
            else setActionMessage('Sign in above to view your authorized collaborations.');
          }}
          aria-label="Collaborations — your dashboard"
        />
        <button
          type="button"
          className="sp-entrance-v2__nav-link"
          style={variant.regions.leftNav.proposals}
          onClick={() => runQuickAction('proposal')}
          aria-label="Proposals"
        />
        <button
          type="button"
          className="sp-entrance-v2__nav-link"
          style={variant.regions.leftNav.visuals}
          onClick={() => runQuickAction('visuals')}
          aria-label="Visuals"
        />
        <button
          type="button"
          className="sp-entrance-v2__nav-link"
          style={variant.regions.leftNav.transmissions}
          onClick={() => runQuickAction('respond')}
          aria-label="Transmissions"
        />

        <form className="sp-entrance-v2__auth-form" onSubmit={handleSubmit}>
          <label className="sp-entrance-v2__sr-label" htmlFor="artist-email">
            Artist email
          </label>
          <input
            id="artist-email"
            className="sp-entrance-v2__email"
            style={variant.regions.email}
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (state.kind === 'invalid' || state.kind === 'network-error' || state.kind === 'denied') setState({ kind: 'idle' });
            }}
            aria-invalid={state.kind === 'invalid'}
            aria-describedby={state.kind === 'invalid' ? 'artist-email-error' : undefined}
            disabled={state.kind === 'sending'}
            // A signed-in user needs no email to enter — the session decides.
            required={authStatus !== 'signed-in'}
          />

          <button
            type="submit"
            className="sp-entrance-v2__access-portal"
            style={variant.regions.accessPortal}
            disabled={state.kind === 'sending'}
            aria-busy={state.kind === 'sending' || state.kind === 'checking-session'}
            aria-label={state.kind === 'sending' ? 'Sending access request' : 'Access Portal — request Signal Portal access'}
          />

          <button
            type="submit"
            className="sp-entrance-v2__fingerprint"
            style={variant.regions.fingerprint}
            disabled={state.kind === 'sending'}
            aria-busy={state.kind === 'sending' || state.kind === 'checking-session'}
            aria-label="Authenticate with your artist email (illustrated as a fingerprint scanner — no biometric data is read or stored)"
          />
        </form>

        {QUICK_PANELS.map((panel) => (
          <button
            key={panel.id}
            type="button"
            className="sp-entrance-v2__panel"
            style={variant.regions.panels[panel.region]}
            onClick={() => runQuickAction(panel.id)}
            aria-label={panel.srLabel}
          />
        ))}
      </div>

      <div className="sp-entrance-v2__status-dock" role="status" aria-live="polite">
        {state.kind === 'sending' && <p className="sp-entrance-v2__status-msg">Sending your secure sign-in request…</p>}
        {state.kind === 'checking-session' && <p className="sp-entrance-v2__status-msg">{ACCESS_MESSAGES.checkingSession}</p>}
        {state.kind === 'submitted' && <p className="sp-entrance-v2__status-msg" data-testid="access-submitted">{ACCESS_MESSAGES.submitted}</p>}
        {state.kind === 'cooldown' && (
          <p className="sp-entrance-v2__status-msg" data-testid="access-cooldown">
            A sign-in link was sent moments ago. Check your inbox (and spam) — you can request another in {state.seconds}s.
          </p>
        )}
        {state.kind === 'invalid' && (
          <p className="sp-entrance-v2__status-msg sp-entrance-v2__status-msg--error" id="artist-email-error" role="alert">
            {state.message}
          </p>
        )}
        {state.kind === 'denied' && (
          <p className="sp-entrance-v2__status-msg sp-entrance-v2__status-msg--error" role="alert" data-testid="access-denied">
            {state.message}
          </p>
        )}
        {state.kind === 'network-error' && (
          <p className="sp-entrance-v2__status-msg sp-entrance-v2__status-msg--error" role="alert" data-testid="access-error">
            {state.message}
          </p>
        )}
        {state.kind === 'idle' && !choicePrompt && actionMessage && <p className="sp-entrance-v2__status-msg">{actionMessage}</p>}

        {choicePrompt && (
          <div className="sp-entrance-v2__choice-prompt">
            <p className="sp-entrance-v2__status-msg">{choicePrompt.text}</p>
            <div className="sp-entrance-v2__choice-buttons">
              {choicePrompt.choices.map((choice) => (
                <button key={choice.collaborationId} type="button" onClick={() => chooseProject(choice.collaborationId)}>
                  {choice.title}
                </button>
              ))}
            </div>
          </div>
        )}

        <p className="sp-entrance-v2__legal-notice">
          Invitation-only. Submitting an email never grants access by itself — every request is reviewed against an
          invitation list before anything is sent.
        </p>
        <a className="sp-entrance-v2__return" href="/package-resume/">
          ← Return to Artist Package
        </a>
      </div>
    </main>
  );
}
