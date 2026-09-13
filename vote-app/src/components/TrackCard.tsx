import type { MoonRacerTrack } from '../data/tracks';

type Props = {
  track: MoonRacerTrack;
  trackNumber: number;
  offset: number;
  onSelect: () => void;
};

// Pure presentation — all positioning transforms live here so
// AlbumCarousel only has to hand each card its distance from center.
export function TrackCard({ track, trackNumber, offset, onSelect }: Props) {
  const distance = Math.abs(offset);
  const isSelected = offset === 0;
  const scale = distance === 0 ? 1 : distance === 1 ? 0.78 : 0.62;
  const opacity = distance === 0 ? 1 : distance === 1 ? 0.7 : 0.35;
  const translateX = offset * 62;

  return (
    <button
      type="button"
      className={`track-card${isSelected ? ' track-card--selected' : ''}`}
      style={{
        transform: `translate(-50%, -50%) translateX(${translateX}%) scale(${scale})`,
        opacity,
        zIndex: 100 - distance,
        pointerEvents: distance > 2 ? 'none' : 'auto',
      }}
      onClick={onSelect}
      aria-current={isSelected || undefined}
      aria-label={`${track.title} — track ${trackNumber} of 22${isSelected ? ', currently selected' : ''}`}
      tabIndex={distance > 2 ? -1 : 0}
    >
      <span className="track-card__frame">
        {track.artworkSrc && <img src={track.artworkSrc} alt="" loading="lazy" />}
        <span className="track-card__number">{String(trackNumber).padStart(2, '0')}</span>
      </span>
      {isSelected && <span className="track-card__title">{track.title}</span>}
    </button>
  );
}
