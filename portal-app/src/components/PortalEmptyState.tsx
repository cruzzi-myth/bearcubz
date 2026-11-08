import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import './portal-empty-state.css';

type Props = {
  message: ReactNode;
  showReturnLink?: boolean;
  /** Stage K1.6A: lets the admin-preview empty state point at the
   * Command Center instead of the public landing page, without
   * changing the default for every other caller. */
  returnLinkTo?: string;
  returnLinkLabel?: string;
};

/**
 * Honest "not live yet" state for every authenticated-area page.
 * None of these routes have a real backend behind them yet — this
 * says so plainly instead of faking a signed-in view or sample data.
 */
export function PortalEmptyState({
  message,
  showReturnLink = true,
  returnLinkTo = '/',
  returnLinkLabel = '← Return to Signal Portal',
}: Props) {
  return (
    <div className="sp-empty">
      <p className="sp-empty__message">{message}</p>
      {showReturnLink && (
        <Link to={returnLinkTo} className="sp-empty__link">
          {returnLinkLabel}
        </Link>
      )}
    </div>
  );
}
