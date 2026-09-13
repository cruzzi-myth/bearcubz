import { useEffect, useRef } from 'react';
import type { MoonRacerTrack } from '../data/tracks';

type Props = {
  track: MoonRacerTrack;
  trackNumber: number;
  offset: number;
  onSelect: () => void;
  /** True while a modal/overlay owns attention (Transmission Decoding,
   *  results, Black Signal) — pauses the idle pulse/chrome sweep so
   *  nothing on the card competes with it. */
  suspend?: boolean;
  /** True mid-drag — pointer tilt disables so it doesn't fight the
   *  finger/pointer that's actively swiping the strip. */
  dragging?: boolean;
};

// Pure presentation — all positioning transforms live here so
// AlbumCarousel only has to hand each card its distance from center.
//
// `.track-card` owns position + carousel translation (offset *
// --carousel-card-step, a real pixel distance — see styles.css) + the
// per-distance "position scale". `.track-card__surface` owns the
// *selected* card's extra enlargement, lift, glow and the holographic
// treatment — kept on a separate element per the "don't scale the same
// element that translates" rule.
export function TrackCard({ track, trackNumber, offset, onSelect, suspend = false, dragging = false }: Props) {
  const distance = Math.abs(offset);
  const isSelected = offset === 0;
  const isNeighbor = distance === 1;
  const positionScale =
    distance === 0 ? '1' : distance === 1 ? 'var(--neighbor-card-scale)' : distance === 2 ? 'var(--distant-card-scale)' : 'var(--far-card-scale)';
  const opacity = distance === 0 ? 1 : distance === 1 ? 0.82 : distance === 2 ? 0.5 : 0.3;

  // Restrained pointer-based holographic tilt — selected card, desktop
  // fine-pointer only, off while dragging/suspended/reduced-motion.
  const surfaceRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!isSelected || dragging || suspend) return;
    if (typeof window === 'undefined') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (!window.matchMedia('(pointer: fine)').matches) return;
    const surface = surfaceRef.current;
    if (!surface) return;

    let raf = 0;
    const onMove = (event: PointerEvent) => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const rect = surface.getBoundingClientRect();
        const nx = (event.clientX - rect.left) / rect.width - 0.5; // -0.5..0.5
        const ny = (event.clientY - rect.top) / rect.height - 0.5;
        surface.style.setProperty('--holo-rotate-y', `${(nx * 5).toFixed(2)}deg`); // max 2.5deg
        surface.style.setProperty('--holo-rotate-x', `${(-ny * 4).toFixed(2)}deg`); // max 2deg
        surface.style.setProperty('--holo-pointer-x', `${(nx * 24).toFixed(1)}px`); // max 12px
      });
    };
    const onLeave = () => {
      surface.style.setProperty('--holo-rotate-x', '0deg');
      surface.style.setProperty('--holo-rotate-y', '0deg');
      surface.style.setProperty('--holo-pointer-x', '0px');
    };
    surface.addEventListener('pointermove', onMove);
    surface.addEventListener('pointerleave', onLeave);
    return () => {
      surface.removeEventListener('pointermove', onMove);
      surface.removeEventListener('pointerleave', onLeave);
      if (raf) cancelAnimationFrame(raf);
      onLeave();
    };
  }, [isSelected, dragging, suspend]);

  return (
    <button
      type="button"
      className={`track-card${isSelected ? ' track-card--selected' : ''}${suspend ? ' track-card--suspended' : ''}`}
      data-distance={Math.min(distance, 3)}
      style={
        {
          '--offset': offset,
          '--position-scale': positionScale,
          opacity,
          zIndex: isSelected ? 20 : 100 - distance,
          pointerEvents: distance > 2 ? 'none' : 'auto',
        } as React.CSSProperties
      }
      onClick={onSelect}
      aria-current={isSelected || undefined}
      aria-label={`${track.title} — track ${trackNumber} of 22${isSelected ? ', currently selected' : ''}`}
      tabIndex={distance > 2 ? -1 : 0}
    >
      <span className="track-card__surface" ref={surfaceRef}>
        <span className="track-card__frame">
          {track.artworkSrc && <img src={track.artworkSrc} alt="" loading="lazy" draggable={false} />}
          <span className="track-card__number">{String(trackNumber).padStart(2, '0')}</span>
        </span>
        {/* Holographic sheen: selected + immediate neighbor only — kept
            off distant cards entirely for paint/perf cost, not just
            hidden via opacity. */}
        {(isSelected || isNeighbor) && <span className="track-card__hologram" aria-hidden="true" />}
        {/* Neon streak pass: selected card only. */}
        {isSelected && <span className="track-card__streaks" aria-hidden="true" />}
        {isSelected && (
          // Remounts fresh every time selection lands on THIS card — a
          // new element each time, so the one-shot expand animation
          // always replays without any JS timer.
          <span key={track.id} className="track-card__wave" aria-hidden="true" />
        )}
      </span>
      {isSelected && (
        <>
          <span className="track-card__active-tag">
            <i aria-hidden="true" />
            ACTIVE SIGNAL
          </span>
          <span className="track-card__title">{track.title}</span>
        </>
      )}
    </button>
  );
}
