import { useRef, useState } from 'react';
import type { MoonRacerTrack } from '../data/tracks';
import { TrackCard } from './TrackCard';

type Props = {
  tracks: MoonRacerTrack[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  suspend?: boolean;
};

const SWIPE_THRESHOLD_PX = 44;

export function AlbumCarousel({ tracks, selectedIndex, onSelect, suspend = false }: Props) {
  // dragXRef is the source of truth read at release time; dragX (state)
  // only drives the live visual offset. Several pointermove events can
  // land in one synchronous batch (a fast flick, or events dispatched
  // back-to-back), and React only re-renders once that batch settles —
  // so a plain state closure read inside endDrag can still see the
  // value from *before* the drag started. A ref is always current.
  const [dragX, setDragX] = useState(0);
  const dragXRef = useRef(0);
  const dragStartX = useRef<number | null>(null);

  const clamp = (index: number) => Math.max(0, Math.min(tracks.length - 1, index));

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    dragStartX.current = event.clientX;
    dragXRef.current = 0;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragStartX.current === null) return;
    const delta = event.clientX - dragStartX.current;
    dragXRef.current = delta;
    setDragX(delta);
  };

  const endDrag = () => {
    if (dragStartX.current === null) return;
    const delta = dragXRef.current;
    if (delta <= -SWIPE_THRESHOLD_PX) onSelect(clamp(selectedIndex + 1));
    else if (delta >= SWIPE_THRESHOLD_PX) onSelect(clamp(selectedIndex - 1));
    dragStartX.current = null;
    dragXRef.current = 0;
    setDragX(0);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      onSelect(clamp(selectedIndex - 1));
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      onSelect(clamp(selectedIndex + 1));
    }
  };

  // Convert the live drag distance into a fraction of a card-slot so
  // the whole strip tracks the pointer/finger before snapping on release.
  const dragOffset = dragStartX.current !== null ? dragX / 3.2 : 0;

  return (
    <div className="album-carousel">
      <button
        type="button"
        className="carousel__arrow carousel__arrow--prev"
        onClick={() => onSelect(clamp(selectedIndex - 1))}
        aria-label="Previous track"
        disabled={selectedIndex === 0}
      >
        ‹
      </button>

      <div
        className="carousel"
        role="listbox"
        aria-label="Album tracks"
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div className="carousel__shell">
          <div className="carousel__viewport">
            <div className="carousel__track" style={{ transform: `translateX(${dragOffset}%)` }}>
              {tracks.map((track, index) => (
                <TrackCard
                  key={track.id}
                  track={track}
                  trackNumber={index + 1}
                  offset={index - selectedIndex}
                  onSelect={() => onSelect(index)}
                  suspend={suspend}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      <button
        type="button"
        className="carousel__arrow carousel__arrow--next"
        onClick={() => onSelect(clamp(selectedIndex + 1))}
        aria-label="Next track"
        disabled={selectedIndex === tracks.length - 1}
      >
        ›
      </button>
    </div>
  );
}
