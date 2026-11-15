import { useState, type CSSProperties } from 'react';
import './collaboration-artwork.css';

export type ArtworkVariant = 'static' | 'interactive';

type Props = {
  collaborationId: string;
  /** Already-resolved signed URL, or null when no approved cover
   * exists (or it hasn't been authorized for this viewer). This
   * component never fetches anything itself — see PrivateCoverArt
   * (artist-facing) and AdminCollaborationArtwork (administrator
   * preview) for the two authorization-aware wrappers that resolve
   * this before handing it here. Keeping the fetch and the render
   * separate is what let one component serve both contexts without
   * either one's signed-URL function having to change. */
  artworkUrl: string | null;
  title: string;
  /** Square side length in px. */
  size: number;
  /** 'interactive' adds the hover/focus glow — use it only for a
   * clickable target (a card, a selector row); 'static' (default)
   * is for a purely decorative display, e.g. beside the audio
   * player, where no hover affordance would make sense. */
  variant?: ArtworkVariant;
  loading?: boolean;
};

/**
 * Stage K1.6T — the one shared cover-art presentation used
 * throughout the portal (Command Center's collaboration selector,
 * the Artist Portal's project cards, the Listening Chamber, the
 * Collaboration Briefing, and the Visual Gallery's primary tile) —
 * replacing several near-identical "image or diamond"
 * implementations that had drifted into slightly different fallback
 * treatments. Per its own brief: the fallback shows the real project
 * title, not just a bare glyph, so a title-less diamond is never the
 * only information offered when no approved cover exists yet.
 */
export function CollaborationArtwork({ collaborationId, artworkUrl, title, size, variant = 'static', loading = false }: Props) {
  // A CSS custom property, not a literal inline width/height — lets
  // a call site's own responsive CSS (a media query targeting this
  // component inside its particular layout) override the rendered
  // size for narrower viewports without this component needing its
  // own breakpoint logic. collaboration-artwork.css reads it as
  // `width/height: var(--sp-cover-size)`.
  const style = { '--sp-cover-size': `${size}px` } as CSSProperties;
  // At the Command Center's 48-56px selector-row size, a title
  // caption would be illegible noise -- the glyph alone is the
  // right amount of information there. Larger contexts (cards, the
  // Briefing, the Listening Chamber) keep the title visible,
  // honoring the brief's own "fallback using the project title"
  // requirement where there's actually room to show it.
  const compact = size < 64;
  const base = `sp-cover-art sp-cover-art--${variant}${compact ? ' sp-cover-art--compact' : ''}`;
  // A signed URL that resolved but whose image then genuinely fails
  // to load (a transient network error, most likely, since the URL
  // itself was already authorized) falls back to the same
  // placeholder rather than a broken-image icon.
  const [loadFailed, setLoadFailed] = useState(false);

  if (loading) {
    return <div className={`${base} sp-cover-art--loading`} style={style} aria-hidden="true" data-collaboration-id={collaborationId} />;
  }
  if (!artworkUrl || loadFailed) {
    return (
      <div className={`${base} sp-cover-art--placeholder`} style={style} aria-hidden="true" data-collaboration-id={collaborationId}>
        <span className="sp-cover-art__glyph">◈</span>
        {!compact && <span className="sp-cover-art__fallback-title">{title}</span>}
      </div>
    );
  }
  return (
    <div className={base} style={style} data-collaboration-id={collaborationId}>
      <img src={artworkUrl} alt="" loading="lazy" onError={() => setLoadFailed(true)} />
    </div>
  );
}
