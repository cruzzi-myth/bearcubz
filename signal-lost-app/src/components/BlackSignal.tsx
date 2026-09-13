// Reusable Black Signal interruption. Renders as a full-screen overlay
// (mode="overlay", used from /vote/ without touching audio playback) or
// as the entire page (mode="page", used by the standalone /signal-lost/
// app). No animation library is installed in this repo, so entrance
// motion is done with plain CSS keyframes in BlackSignal.css — see that
// file's comment before changing timings.
//
// NOTE: this file and BlackSignal.css are duplicated verbatim into
// signal-lost-app/src/components/ (the two apps build independently, the
// same way network-app's tokens.css is a verbatim copy of Classic's
// :root). Keep both copies in sync by hand.
import { useEffect, useMemo, useState } from 'react';
import './BlackSignal.css';

export type BlackSignalReason =
  | 'already-voted'
  | 'unmapped'
  | 'erased'
  | 'offline'
  | 'error'
  | 'not-found';

type Copy = { code: string; title: string; body: string };

const copy: Record<BlackSignalReason, Copy> = {
  'already-voted': {
    code: 'MR-VOTE-156',
    title: 'SIGNAL ALREADY TRANSMITTED',
    body: 'This device has cast today’s vote. Connection restores at midnight Pacific Time.',
  },
  unmapped: {
    code: 'MR-SECTOR-000',
    title: 'SECTOR UNMAPPED',
    body: 'These coordinates have not yet entered the Signal.',
  },
  erased: {
    code: 'MR-VOID-404',
    title: 'DESTINATION ERASED',
    body: 'No active transmission exists at these coordinates.',
  },
  offline: {
    code: 'MR-NET-503',
    title: 'CONNECTION SEVERED',
    body: 'The Black Signal has interrupted the network.',
  },
  error: {
    code: 'MR-SYS-500',
    title: 'SIGNAL LOST',
    body: 'The requested transmission could not be recovered.',
  },
  'not-found': {
    code: 'MR-COORD-404',
    title: 'COORDINATES VOID',
    body: 'Nothing remains at this location.',
  },
};

type Props = {
  open?: boolean;
  mode?: 'overlay' | 'page';
  reason: BlackSignalReason;
  resetAt?: string;
  votedTrackTitle?: string;
  onClose?: () => void;
  onViewResults?: () => void;
  networkHref?: string;
};

function useCountdown(resetAt?: string) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!resetAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [resetAt]);

  return useMemo(() => {
    if (!resetAt) return null;
    const seconds = Math.max(0, Math.floor((new Date(resetAt).getTime() - now) / 1000));
    const hh = String(Math.floor(seconds / 3600)).padStart(2, '0');
    const mm = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
    const ss = String(seconds % 60).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  }, [now, resetAt]);
}

export function BlackSignal({
  open = true,
  mode = 'overlay',
  reason,
  resetAt,
  votedTrackTitle,
  onClose,
  onViewResults,
  networkHref = 'https://cruzzi-myth.github.io/bearcubz/universe/',
}: Props) {
  const message = copy[reason];
  const countdown = useCountdown(resetAt);

  useEffect(() => {
    if (mode !== 'overlay' || !open) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && onClose) onClose();
    };
    document.body.classList.add('modal-open');
    window.addEventListener('keydown', close);
    return () => {
      document.body.classList.remove('modal-open');
      window.removeEventListener('keydown', close);
    };
  }, [mode, open, onClose]);

  if (!open) return null;

  return (
    <section
      className={`black-signal black-signal--${mode}`}
      role={mode === 'overlay' ? 'dialog' : 'main'}
      aria-modal={mode === 'overlay' || undefined}
      aria-labelledby="black-signal-title"
    >
      <div className="black-signal__noise" aria-hidden="true" />
      <div className="black-signal__entity" aria-hidden="true">
        {/* The character's own two voids and halo are part of the source
            artwork — no separate decorative glow circle is layered on
            top, since it would need to precisely track the image's
            internal geometry across every viewport size to line up. */}
        {/* Two color-shifted ghost copies (screen-blended, hue-rotated,
            briefly offset) create the chromatic-split glitch; the base
            image underneath is never hidden or blend-tricked — its
            transparency is real, straight from the source SVG. */}
        <img
          className="black-signal__character black-signal__character--ghost black-signal__character--cyan"
          src={`${import.meta.env.BASE_URL}images/black-signal-156.svg`}
          alt=""
        />
        <img
          className="black-signal__character black-signal__character--ghost black-signal__character--magenta"
          src={`${import.meta.env.BASE_URL}images/black-signal-156.svg`}
          alt=""
        />
        <img
          className="black-signal__character"
          src={`${import.meta.env.BASE_URL}images/black-signal-156.svg`}
          alt=""
        />
        <span className="black-signal__corruption" />
      </div>

      <div className="black-signal__panel">
        <p className="black-signal__eyebrow">THE BLACK SIGNAL · #156</p>
        <p className="black-signal__code">{message.code}</p>
        <h1 id="black-signal-title" data-text={message.title}>{message.title}</h1>
        <p>{message.body}</p>
        {votedTrackTitle && <p className="black-signal__receipt">TODAY&rsquo;S SIGNAL: {votedTrackTitle}</p>}
        {countdown && <p className="black-signal__countdown">NEXT TRANSMISSION IN {countdown}</p>}

        <div className="black-signal__actions">
          {onClose && <button type="button" onClick={onClose}>RETURN TO ALBUM</button>}
          {onViewResults && <button type="button" onClick={onViewResults}>VIEW LIVE RESULTS</button>}
          <a href={networkHref}>ENTER MOON RACER NETWORK</a>
        </div>
      </div>
    </section>
  );
}
