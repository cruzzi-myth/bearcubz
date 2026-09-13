import { useEffect, useMemo, useRef, useState } from 'react';
import './MoonRacerBackground.css';

const BASE = import.meta.env.BASE_URL;
const HERO_SRC = `${BASE}images/backgrounds/moon-racer-album-hero.webp`;
const TRACKLIST_SRC = `${BASE}images/backgrounds/moon-racer-tracklist.webp`;
const SIGNAL_OVERLAY_SRC = `${BASE}images/backgrounds/moon-racer-signal-overlay.webp`;

type Props = {
  selectedTrackId: number;
  selectedArtworkSrc: string;
  /** Non-essential background motion (orbits, particles, sweep, idle
   *  pulse, parallax) pauses while true — a modal/overlay is open, or
   *  the tab isn't visible. Transmission Decoding and Black Signal stay
   *  the strongest motion on the page either way. */
  suspend?: boolean;
};

type ArtLayer = { key: number; src: string; entering: boolean };

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

function usePageHidden() {
  const [hidden, setHidden] = useState(() => typeof document !== 'undefined' && document.hidden);
  useEffect(() => {
    const onChange = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);
  return hidden;
}

// A handful of fixed, decorative telemetry strings — flavor only, never
// derived from real vote data, and never rendered as anything but
// aria-hidden background texture.
const TELEMETRY_LINES = [
  'MR-04.19.226', 'SIG-22.014', 'V:0.62c', 'ORBIT Δ118°', 'COORD 07:31:59',
  'LOCK 99.2%', 'REL-MR-156', 'TRK Δ0.4au',
];

export function MoonRacerBackground({ selectedTrackId, selectedArtworkSrc, suspend = false }: Props) {
  const reducedMotion = usePrefersReducedMotion();
  const pageHidden = usePageHidden();
  const paused = suspend || pageHidden;

  // Crossfade: keep only the current and (briefly) the outgoing artwork.
  // No unbounded stack — the outgoing layer is dropped once its fade
  // finishes.
  const [layers, setLayers] = useState<ArtLayer[]>(() => [
    { key: selectedTrackId, src: selectedArtworkSrc, entering: false },
  ]);
  const prevSrc = useRef(selectedArtworkSrc);

  useEffect(() => {
    if (selectedArtworkSrc === prevSrc.current) return;
    prevSrc.current = selectedArtworkSrc;
    const nextKey = selectedTrackId;
    setLayers((current) => [
      ...current.map((l) => ({ ...l, entering: false })),
      { key: nextKey, src: selectedArtworkSrc, entering: true },
    ]);
    const timer = window.setTimeout(() => {
      setLayers((current) => current.filter((l) => l.key === nextKey));
    }, 560);
    return () => window.clearTimeout(timer);
  }, [selectedArtworkSrc, selectedTrackId]);

  // Restrained pointer parallax — fine-pointer desktop only, off for
  // reduced motion. Only CSS custom properties are touched per frame.
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (reducedMotion) return;
    if (!window.matchMedia('(pointer: fine)').matches) return;
    let raf = 0;
    const onMove = (event: PointerEvent) => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const root = rootRef.current;
        if (!root) return;
        const nx = event.clientX / window.innerWidth - 0.5;
        const ny = event.clientY / window.innerHeight - 0.5;
        root.style.setProperty('--parallax-x', nx.toFixed(4));
        root.style.setProperty('--parallax-y', ny.toFixed(4));
      });
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [reducedMotion]);

  const particleCount = 18;
  const particles = useMemo(
    () =>
      Array.from({ length: particleCount }, (_, i) => ({
        left: `${((i * 53.7) % 100).toFixed(1)}%`,
        delay: `${(i * 0.71) % 9}s`,
        duration: `${9 + ((i * 3.3) % 7)}s`,
        hue: i % 5 === 0 ? 'magenta' : i % 2 === 0 ? 'cyan' : 'violet',
      })),
    [],
  );

  return (
    <div
      ref={rootRef}
      className={`vote-bg${reducedMotion ? ' vote-bg--reduced-motion' : ''}${paused ? ' vote-bg--paused' : ''}`}
      aria-hidden="true"
    >
      <div className="vote-bg__base" />

      {layers.map((layer) => (
        <img
          key={layer.key}
          className={`vote-bg__track-art${layer.entering ? ' vote-bg__track-art--entering' : ''}`}
          src={layer.src}
          alt=""
          draggable={false}
        />
      ))}

      <img className="vote-bg__hero" src={HERO_SRC} alt="" draggable={false} />
      <img className="vote-bg__tracklist" src={TRACKLIST_SRC} alt="" draggable={false} />

      <svg className="vote-bg__orbital" viewBox="0 0 1000 1000" role="presentation">
        <g className="vote-bg__ring vote-bg__ring--a">
          <circle cx="500" cy="500" r="330" />
          <circle className="vote-bg__node" cx="830" cy="500" r="4" />
          <circle className="vote-bg__node" cx="500" cy="170" r="3" />
        </g>
        <g className="vote-bg__ring vote-bg__ring--b">
          <circle cx="500" cy="500" r="410" />
          <circle className="vote-bg__node" cx="500" cy="90" r="3.5" />
          <circle className="vote-bg__node" cx="145" cy="640" r="3" />
        </g>
        <g className="vote-bg__ring vote-bg__ring--c">
          <circle cx="500" cy="500" r="230" />
          <circle className="vote-bg__node" cx="270" cy="500" r="3" />
        </g>
      </svg>
      <img className="vote-bg__signal-overlay" src={SIGNAL_OVERLAY_SRC} alt="" draggable={false} />

      <svg className="vote-bg__telemetry" viewBox="0 0 1000 1000" role="presentation">
        <line x1="60" y1="0" x2="60" y2="1000" />
        <line x1="940" y1="0" x2="940" y2="1000" />
        <line x1="0" y1="120" x2="1000" y2="120" />
        <line x1="0" y1="880" x2="1000" y2="880" />
        {TELEMETRY_LINES.map((text, i) => (
          <text
            key={text}
            x={i % 2 === 0 ? 24 : 976}
            y={200 + i * 92}
            textAnchor={i % 2 === 0 ? 'start' : 'end'}
          >
            {text}
          </text>
        ))}
      </svg>

      <div className="vote-bg__particles">
        {particles.map((p, i) => (
          <span
            key={i}
            className={`vote-bg__particle vote-bg__particle--${p.hue}`}
            style={{ left: p.left, animationDelay: p.delay, animationDuration: p.duration } as React.CSSProperties}
          />
        ))}
      </div>

      <div className="vote-bg__vignette" />
    </div>
  );
}
