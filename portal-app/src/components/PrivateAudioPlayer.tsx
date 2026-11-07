import { useRef, useState } from 'react';
import type { CollaborationAsset } from '../hooks/useAuthorizedCollaboration';
import { useSignedAssetUrl } from '../hooks/useSignedAssetUrl';
import { useAudioAnalyser } from '../hooks/useAudioAnalyser';
import { AudioReactiveVisualizer } from './AudioReactiveVisualizer';
import './private-audio-player.css';

type Props = { asset: CollaborationAsset };

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) seconds = 0;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

/**
 * Plays directly from a short-lived signed URL — the underlying
 * private Storage path is never rendered anywhere in this component,
 * only the ephemeral signed URL the browser's own <audio> element
 * requests. No download control, no public sharing affordance; the
 * signed URL itself is the only thing ever exposed, and it expires
 * in 5 minutes regardless of whether playback is still in progress.
 */
export function PrivateAudioPlayer({ asset }: Props) {
  const signed = useSignedAssetUrl(asset.id, 'full');
  const audioRef = useRef<HTMLAudioElement>(null);
  // A plain ref doesn't re-render when the <audio> element mounts, and
  // the analyser hook needs the real element to build the Web Audio
  // graph -- mirroring it into state via the ref callback below is
  // what actually triggers that on first mount (and again whenever
  // the element remounts on signed-URL renewal, since `key={signed.url}`
  // forces a fresh DOM node each time).
  const [audioEl, setAudioEl] = useState<HTMLAudioElement | null>(null);
  const analyser = useAudioAnalyser(audioEl);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [renewing, setRenewing] = useState(false);
  const [failed, setFailed] = useState(false);

  function handlePlayPause() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) audio.play().catch(() => {});
    else audio.pause();
  }

  function handleSeek(e: React.ChangeEvent<HTMLInputElement>) {
    const audio = audioRef.current;
    if (!audio) return;
    const next = Number(e.target.value);
    audio.currentTime = next;
    setCurrent(next);
  }

  // The signed URL's 5-minute window can lapse mid-session on a long
  // full-length track. Rather than guess when to pre-emptively
  // refresh, this renews on the browser's own playback error and
  // resumes from where it left off — the one piece of state that
  // survives the swap. If the renewal itself fails (signed.refresh()
  // settles to 'unavailable'), `failed` surfaces a manual retry
  // affordance instead of the player silently collapsing to a dead
  // end with no way forward.
  function handleError() {
    if (renewing) return;
    setRenewing(true);
    signed.refresh();
  }

  if (signed.status === 'loading' || signed.status === 'idle') {
    return <p className="sp-player__status">Requesting secure playback access…</p>;
  }
  if (signed.status === 'unavailable') {
    return (
      <div className="sp-player__status-row">
        <p className="sp-player__status">
          {failed ? "Playback failed and couldn't be recovered." : "Couldn't authorize playback right now."}
        </p>
        <button
          type="button"
          className="sp-player__retry"
          onClick={() => {
            setFailed(true);
            setRenewing(false);
            signed.refresh();
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="sp-player">
      <div className="sp-player__row">
        <audio
          ref={(el) => {
            audioRef.current = el;
            setAudioEl(el);
          }}
          key={signed.url}
          src={signed.url}
          preload="none"
          crossOrigin="anonymous"
          onPlay={() => {
            setPlaying(true);
            setRenewing(false);
            setFailed(false);
          }}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => {
            setDuration(e.currentTarget.duration);
            if (renewing && audioRef.current) {
              audioRef.current.currentTime = current;
              audioRef.current.play().catch(() => {});
            }
          }}
          onError={handleError}
        />
        <button type="button" className="sp-player__play" onClick={handlePlayPause} aria-label={playing ? 'Pause' : 'Play'}>
          {playing ? '❚❚' : '▶'}
        </button>
        <div className="sp-player__controls">
          <input
            type="range"
            className="sp-player__seek"
            min={0}
            max={isFinite(duration) && duration > 0 ? duration : 0}
            step={0.1}
            value={Math.min(current, duration || 0)}
            onChange={handleSeek}
            aria-label={`Seek within ${asset.displayLabel}`}
            disabled={!isFinite(duration) || duration === 0}
          />
          <div className="sp-player__times">
            <span>{formatTime(current)}</span>
            <span>{isFinite(duration) ? formatTime(duration) : '—:—'}</span>
          </div>
        </div>
      </div>
      <AudioReactiveVisualizer analyser={analyser} playing={playing} />
    </div>
  );
}
