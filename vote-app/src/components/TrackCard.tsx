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
};

// Pure presentation — all positioning transforms live here so
// AlbumCarousel only has to hand each card its distance from center.
//
// `.track-card` owns position + carousel translation + the per-distance
// "position scale" (driven by the --neighbor/--distant/--far-card-scale
// tokens in styles.css, which respond to the responsive media queries
// there). `.track-card__surface` owns the *selected* card's extra
// enlargement, lift and glow — kept on a separate element per the
// "don't scale the same element that translates" rule, so the carousel's
// translateX and the selection scale never fight over one transform.
export function TrackCard({ track, trackNumber, offset, onSelect, suspend = false }: Props) {
  const distance = Math.abs(offset);
  const isSelected = offset === 0;
  const positionScale =
    distance === 0 ? '1' : distance === 1 ? 'var(--neighbor-card-scale)' : distance === 2 ? 'var(--distant-card-scale)' : 'var(--far-card-scale)';
  const opacity = distance === 0 ? 1 : distance === 1 ? 0.82 : distance === 2 ? 0.5 : 0.3;
  const translateX = offset * 62;

  return (
    <button
      type="button"
      className={`track-card${isSelected ? ' track-card--selected' : ''}${suspend ? ' track-card--suspended' : ''}`}
      style={
        {
          '--track-x': `${translateX}%`,
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
      <span className="track-card__surface">
        <span className="track-card__frame">
          {track.artworkSrc && <img src={track.artworkSrc} alt="" loading="lazy" draggable={false} />}
          <span className="track-card__number">{String(trackNumber).padStart(2, '0')}</span>
        </span>
        {isSelected && (
          <>
            {/* Remounts fresh every time selection lands on THIS card —
                a new element each time, so the one-shot expand animation
                always replays without any JS timer. */}
            <span key={track.id} className="track-card__wave" aria-hidden="true" />
            <span className="track-card__active-tag">
              <i aria-hidden="true" />
              ACTIVE SIGNAL
            </span>
            <span className="track-card__title">{track.title}</span>
          </>
        )}
      </span>
    </button>
  );
}
