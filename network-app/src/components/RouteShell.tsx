import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import './route-shell.css';

interface RouteShellProps {
  eyebrow: string;
  title: string;
  description: string;
  /** Shown when this route has no real functionality yet. */
  placeholder?: boolean;
  children?: ReactNode;
}

/**
 * Shared shell for every RPG route stub. Keeps the 16 Phase 1 routes
 * visually consistent and DRY instead of hand-building 16 one-off
 * pages. Pages with real sample content (Galaxy, World, Location)
 * pass `children`; pure placeholders don't need to.
 */
export function RouteShell({ eyebrow, title, description, placeholder = true, children }: RouteShellProps) {
  useDocumentTitle(title);

  return (
    <section className="route-shell">
      <div className="route-shell__card">
        <div className="route-shell__corner route-shell__corner--tl" />
        <div className="route-shell__corner route-shell__corner--br" />
        <div className="route-shell__eyebrow">{eyebrow}</div>
        <h1 className="route-shell__title">{title}</h1>
        <p className="route-shell__desc">{description}</p>
        {placeholder && (
          <div className="route-shell__badge">Shell ready · gameplay arrives in a future phase</div>
        )}
        {children && <div className="route-shell__content">{children}</div>}
        {/* Router basename is "/bearcubz/network" — "/" here means the
            network hub, not the classic site root. */}
        <Link to="/" className="route-shell__back">
          ← Return to Network Hub
        </Link>
      </div>
    </section>
  );
}
