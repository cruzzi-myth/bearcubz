import { createContext, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

// ============================================================
// Moon Racer Radio — architecture only in Phase 1.
//
// The one requirement that matters structurally: audio must not
// restart when React Router changes routes. We satisfy that by
// mounting a single <audio> element here, in a provider that sits
// ABOVE <Routes> in the tree (see App.tsx) — route changes swap
// page content in an <Outlet>, they never unmount this provider,
// so a real track would keep playing across every /network/* route.
//
// No track is wired up yet (no stable audio asset exists to point
// at outside the Classic site's embedded base64 audio). This is
// intentionally inert until Moon Racer Radio is scoped for real.
// ============================================================

interface AudioState {
  isPlaying: boolean;
  trackTitle: string | null;
  play: (src: string, title: string) => void;
  pause: () => void;
  toggle: () => void;
}

const AudioContext = createContext<AudioState | null>(null);

export function AudioProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [trackTitle, setTrackTitle] = useState<string | null>(null);

  const value = useMemo<AudioState>(
    () => ({
      isPlaying,
      trackTitle,
      play: (src: string, title: string) => {
        const el = audioRef.current;
        if (!el) return;
        if (el.src !== src) el.src = src;
        void el.play();
        setIsPlaying(true);
        setTrackTitle(title);
      },
      pause: () => {
        audioRef.current?.pause();
        setIsPlaying(false);
      },
      toggle: () => {
        const el = audioRef.current;
        if (!el || !el.src) return;
        if (el.paused) {
          void el.play();
          setIsPlaying(true);
        } else {
          el.pause();
          setIsPlaying(false);
        }
      },
    }),
    [isPlaying, trackTitle],
  );

  return (
    <AudioContext.Provider value={value}>
      {children}
      {/* eslint-disable-next-line jsx-a11y/media-has-caption -- instrumental radio stream, no captionable dialogue */}
      <audio ref={audioRef} preload="none" />
    </AudioContext.Provider>
  );
}

export function useAudio(): AudioState {
  const ctx = useContext(AudioContext);
  if (!ctx) throw new Error('useAudio must be used within AudioProvider');
  return ctx;
}
