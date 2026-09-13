import { useEffect, useRef, useState } from 'react';
import type { MoonRacerTrack } from '../data/tracks';

export type VoteButtonState = 'idle' | 'submitting' | 'voted-today';

type Props = {
  track: MoonRacerTrack;
  trackNumber: number;
  totalTracks: number;
  onPrev: () => void;
  onNext: () => void;
  voteState: VoteButtonState;
  votedTrackTitle?: string;
  onVote: () => void;
  onViewResults: () => void;
};

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const mm = Math.floor(seconds / 60);
  const ss = Math.floor(seconds % 60)
    .toString()
    .padStart(2, '0');
  return `${mm}:${ss}`;
}

export function AudioPlayer({
  track,
  trackNumber,
  totalTracks,
  onPrev,
  onNext,
  voteState,
  votedTrackTitle,
  onVote,
  onViewResults,
}: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const isFirstRender = useRef(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // Selection changed: pause and drop the old source before the new
  // track's metadata loads. No autoplay — playback always starts paused.
  // Skip this on the very first mount — the <audio> element's own
  // src+preload attributes already start that fetch; calling load()
  // again immediately would just abort and re-request it for nothing.
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    audio.load();
  }, [track.audioSrc]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio.play().catch(() => setIsPlaying(false));
    } else {
      audio.pause();
    }
  };

  const seek = (value: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = value;
    setCurrentTime(value);
  };

  const voteLabel =
    voteState === 'submitting' ? 'TRANSMITTING…' : 'VOTE FOR THIS TRACK';

  return (
    <div className="player">
      <audio
        ref={audioRef}
        src={track.audioSrc}
        preload="metadata"
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
      />

      <div className="player__meta">
        <span className="player__index">{String(trackNumber).padStart(2, '0')} / {totalTracks}</span>
        <h2 className="player__title">{track.title}</h2>
        <span className="player__artist">{track.artist}</span>
      </div>

      <div className="player__transport">
        <button type="button" className="player__skip" onClick={onPrev} aria-label="Previous track">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6h2v12H6zm3.5 6 10-6v12z" /></svg>
        </button>
        <button
          type="button"
          className="player__play"
          onClick={togglePlay}
          aria-label={isPlaying ? `Pause ${track.title}` : `Play ${track.title}`}
        >
          {isPlaying ? (
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5h4v14H6zm8 0h4v14h-4z" /></svg>
          ) : (
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5v14l12-7z" /></svg>
          )}
        </button>
        <button type="button" className="player__skip" onClick={onNext} aria-label="Next track">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 6h2v12h-2zM4.5 6l10 6-10 6z" /></svg>
        </button>
      </div>

      <div className="player__progress">
        <span className="player__time" aria-hidden="true">{formatTime(currentTime)}</span>
        <input
          type="range"
          className="player__seek"
          min={0}
          max={duration || 0}
          step={0.1}
          value={Math.min(currentTime, duration || 0)}
          onChange={(e) => seek(Number(e.target.value))}
          aria-label={`Seek within ${track.title}`}
        />
        <span className="player__time" aria-hidden="true">{formatTime(duration)}</span>
      </div>

      <div className="player__vote">
        {voteState === 'voted-today' && (
          <p className="player__voted-status">
            YOU VOTED FOR <strong>{votedTrackTitle}</strong> TODAY
          </p>
        )}
        <div className="player__vote-actions">
          <button
            type="button"
            className="btn-primary player__vote-btn"
            onClick={onVote}
            disabled={voteState === 'submitting'}
          >
            {voteLabel}
          </button>
          {voteState === 'voted-today' && (
            <button type="button" className="btn-outline" onClick={onViewResults}>
              VIEW LIVE RESULTS
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
