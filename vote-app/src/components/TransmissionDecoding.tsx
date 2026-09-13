import { useEffect, useRef, useState } from 'react';
import type { VoteResult } from '../lib/voteApi';
import { getTrackById } from '../data/tracks';
import { Leaderboard } from './Leaderboard';

type Props = {
  trackId: number;
  results: VoteResult[];
  resetAt: string;
  /** Render already at the final stage — used when a returning voter opens
   *  results without casting a new vote, so no intro replays. */
  skipIntro?: boolean;
  /** Fires once, when the intro sequence reaches its final stage. */
  onDone?: () => void;
  onReturn: () => void;
};

const HOME = 'https://cruzzi-myth.github.io/bearcubz/';
const UNIVERSE = 'https://cruzzi-myth.github.io/bearcubz/universe/';
const EVENTS = 'https://cruzzi-myth.github.io/bearcubz/events/';
const PACKAGE = 'https://cruzzi-myth.github.io/bearcubz/package-resume/';

export function TransmissionDecoding({ trackId, results, resetAt, skipIntro = false, onDone, onReturn }: Props) {
  const track = getTrackById(trackId);
  const [copied, setCopied] = useState(false);
  const doneRef = useRef(false);

  const prefersReducedMotion =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const instant = skipIntro || prefersReducedMotion;

  const [stage, setStage] = useState(instant ? 3 : 0);

  useEffect(() => {
    if (instant) {
      if (!doneRef.current) {
        doneRef.current = true;
        onDone?.();
      }
      return;
    }
    const timers = [
      window.setTimeout(() => setStage(1), 250),
      window.setTimeout(() => setStage(2), 600),
      window.setTimeout(() => setStage(3), 900),
      window.setTimeout(() => {
        if (!doneRef.current) {
          doneRef.current = true;
          onDone?.();
        }
      }, 1500),
    ];
    return () => timers.forEach(window.clearTimeout);
    // Runs once per mount — App mounts a fresh instance for the
    // decoding -> results handoff, so this never needs to re-arm.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const shareUrl = `${window.location.origin}${import.meta.env.BASE_URL}?track=${track?.slug ?? trackId}`;

  const handleShare = async () => {
    const shareData = {
      title: 'Moon Racer',
      text: `I voted for "${track?.title ?? 'a track'}" on the Moon Racer album vote.`,
      url: shareUrl,
    };
    if (navigator.share) {
      try {
        await navigator.share(shareData);
        return;
      } catch {
        // fall through to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section className="decode" role="status" aria-live="polite" aria-label="Vote transmission">
      {stage < 3 && (
        <div className="decode__streams" aria-hidden="true">
          {Array.from({ length: 14 }, (_, i) => (
            <span key={i} style={{ '--i': i } as React.CSSProperties} />
          ))}
        </div>
      )}

      <div className="decode__panel">
        {stage >= 1 && stage < 3 && (
          <div className="decode__readout" aria-hidden="true">
            <span>SECTOR {String(trackId).padStart(2, '0')}-MR</span>
            <span>SIGNAL {(trackId * 17.3).toFixed(2)}Hz</span>
            <span>VOTES LOGGED {results.reduce((sum, r) => sum + r.votes, 0)}</span>
          </div>
        )}

        {stage >= 2 && stage < 3 && track && (
          <div className="decode__lock">
            {track.artworkSrc && <img src={track.artworkSrc} alt="" />}
            <p className="decode__lock-title">{track.title}</p>
            <p className="decode__lock-status">VOTE TRANSMITTED</p>
          </div>
        )}

        {stage >= 3 && (
          <div className="decode__results">
            <p className="decode__eyebrow">TRANSMISSION RECEIVED</p>
            <h2>VOTE LOGGED FOR {track?.title.toUpperCase() ?? 'YOUR TRACK'}</h2>
            <Leaderboard results={results} highlightTrackId={trackId} animate />
            <p className="decode__reset">Results reset at midnight Pacific — next vote unlocks then.</p>

            <div className="decode__actions">
              <button type="button" className="btn-primary" onClick={onReturn}>RETURN TO TRACKS</button>
              <button type="button" className="btn-outline" onClick={handleShare}>
                {copied ? 'LINK COPIED' : 'SHARE MY VOTE'}
              </button>
            </div>
            <nav className="decode__links" aria-label="Explore more BEλR CUBZ">
              <a href={HOME}>BEλR CUBZ Home</a>
              <a href={UNIVERSE}>Moon Racer Universe</a>
              <a href={EVENTS}>Events</a>
              <a href={PACKAGE}>Industry Package</a>
            </nav>
          </div>
        )}
      </div>
      <span className="decode__reset-at" hidden>{resetAt}</span>
    </section>
  );
}
