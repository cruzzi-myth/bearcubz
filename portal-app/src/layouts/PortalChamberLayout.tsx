import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { portalAsset } from '../lib/assetPath';
import './portal-chamber-layout.css';

type Props = {
  /** Path under /portal/assets/signal-portal/, e.g. "artist-dashboard.webp" */
  background: string;
  /** Stage J: when set, overrides `background` entirely with a full
   * URL (e.g. a signed Storage URL for this collaboration's own
   * primary cover art) — lets the Listening Chamber feel like THIS
   * artist's work rather than a generic shared environment, without
   * changing anything about how the other six environments render. */
  backgroundUrl?: string;
  backgroundAlt: string;
  eyebrow: string;
  title: string;
  children: ReactNode;
};

/**
 * Shared full-bleed environment layout for every authenticated-area
 * page (Dashboard, Admin, the four collaboration chambers). Each page
 * supplies its own approved background image and content — this only
 * owns the backdrop, scrim, and the consistent chrome around it so
 * the seven environments read as one continuous system.
 */
export function PortalChamberLayout({ background, backgroundUrl, backgroundAlt, eyebrow, title, children }: Props) {
  return (
    <div className="sp-chamber">
      {/* Stage I2G: decorative ambient art, not content — aria-hidden so
          axe's "content must be in a landmark" region check (and any
          screen reader) correctly treats it as pure atmosphere. */}
      <img
        className="sp-chamber__bg"
        src={backgroundUrl ?? portalAsset(`assets/signal-portal/${background}`)}
        alt={backgroundAlt}
        aria-hidden="true"
      />
      <div className="sp-chamber__scrim" aria-hidden="true" />
      <header className="sp-chamber__head">
        <Link to="/" className="sp-chamber__brand">
          BE<span>λ</span>R CUBZ <span aria-hidden="true">·</span> SIGNAL PORTAL
        </Link>
      </header>
      <main className="sp-chamber__stage">
        <p className="sp-chamber__eyebrow">{eyebrow}</p>
        <h1 className="sp-chamber__title">{title}</h1>
        <div className="sp-chamber__panel">{children}</div>
      </main>
    </div>
  );
}
